package com.safenest.app.vpn

import java.io.ByteArrayOutputStream

/**
 * Minimal DNS wire-format reader/builder.
 *
 * Only what a stub resolver needs: read a question, refuse it (NXDOMAIN),
 * rewrite it to a SafeSearch host (CNAME), or build a query for the upstream.
 * Names are always re-encoded uncompressed, so no compression pointers are
 * emitted; incoming pointers are followed defensively (loop-guarded).
 */
internal object DnsMessage {

    const val TYPE_A = 1
    const val TYPE_CNAME = 5
    const val TYPE_AAAA = 28
    const val CLASS_IN = 1

    /** A parsed DNS question (the only section this app interprets). */
    class Question(
        val id: Int,
        val flags: Int,
        val name: String,
        val type: Int,
        val classType: Int,
        /** Offset in the packet just past the question section, used to echo it back. */
        val endOffset: Int
    )

    class Record(val type: Int, val ttl: Int, val rdata: ByteArray)

    /**
     * Parses the first question of a DNS message.
     * @return the question, or null when the packet is malformed.
     */
    fun parseQuestion(packet: ByteArray): Question? {
        if (packet.size < 12) return null
        val id = readU16(packet, 0)
        val flags = readU16(packet, 2)
        val questionCount = readU16(packet, 4)
        if (questionCount < 1) return null

        val (name, afterName) = readName(packet, 12) ?: return null
        if (afterName + 4 > packet.size) return null
        val type = readU16(packet, afterName)
        val classType = readU16(packet, afterName + 2)
        return Question(id, flags, name, type, classType, afterName + 4)
    }

    /**
     * Reads a domain name starting at [offset], following compression pointers.
     * @return the decoded name and the offset just past the name in the original stream.
     */
    fun readName(packet: ByteArray, offset: Int): Pair<String, Int>? {
        val builder = StringBuilder()
        var position = offset
        var afterName = -1
        var jumps = 0

        while (true) {
            if (position >= packet.size) return null
            val length = packet[position].toInt() and 0xFF

            when {
                length == 0 -> {
                    position += 1
                    if (afterName < 0) afterName = position
                    return builder.toString() to afterName
                }

                length and 0xC0 == 0xC0 -> {
                    if (position + 1 >= packet.size) return null
                    val pointer = ((length and 0x3F) shl 8) or (packet[position + 1].toInt() and 0xFF)
                    if (afterName < 0) afterName = position + 2
                    if (++jumps > 16) return null // guard against pointer loops
                    position = pointer
                }

                else -> {
                    if (length > 63 || position + 1 + length > packet.size) return null
                    if (builder.isNotEmpty()) builder.append('.')
                    for (i in 0 until length) {
                        builder.append((packet[position + 1 + i].toInt() and 0xFF).toChar())
                    }
                    position += 1 + length
                }
            }
        }
    }

    /** Encodes a hostname into DNS label format. */
    fun encodeName(name: String): ByteArray {
        val out = ByteArrayOutputStream()
        val trimmed = name.trim('.')
        if (trimmed.isNotEmpty()) {
            for (label in trimmed.split('.')) {
                val bytes = label.toByteArray(Charsets.US_ASCII)
                out.write(bytes.size and 0xFF)
                out.write(bytes, 0, bytes.size)
            }
        }
        out.write(0)
        return out.toByteArray()
    }

    /** Builds an NXDOMAIN reply for [query], echoing its question section verbatim. */
    fun buildNxdomain(query: ByteArray, question: Question): ByteArray {
        val end = minOf(question.endOffset, query.size)
        val reply = query.copyOf(end)

        // QR=1, same opcode, RD copied, RA=1, RCODE=3 (name error).
        val flags = 0x8000 or (question.flags and 0x7800) or
            (question.flags and 0x0100) or 0x0080 or 0x0003
        writeU16(reply, 2, flags)
        writeU16(reply, 6, 0) // ANCOUNT
        writeU16(reply, 8, 0) // NSCOUNT
        writeU16(reply, 10, 0) // ARCOUNT
        return reply
    }

    /** Extracts the A/AAAA records from an upstream response. */
    fun extractAddressRecords(packet: ByteArray): List<Record> {
        if (packet.size < 12) return emptyList()
        val questionCount = readU16(packet, 4)
        val answerCount = readU16(packet, 6)

        var position = 12
        repeat(questionCount) {
            val (_, afterName) = readName(packet, position) ?: return emptyList()
            position = afterName + 4
        }

        val records = ArrayList<Record>(answerCount)
        repeat(answerCount) {
            val (_, afterName) = readName(packet, position) ?: return records
            if (afterName + 10 > packet.size) return records
            val type = readU16(packet, afterName)
            val ttl = readU32(packet, afterName + 4)
            val dataLength = readU16(packet, afterName + 8)
            val dataStart = afterName + 10
            if (dataStart + dataLength > packet.size) return records

            if ((type == TYPE_A && dataLength == 4) || (type == TYPE_AAAA && dataLength == 16)) {
                records.add(Record(type, ttl, packet.copyOfRange(dataStart, dataStart + dataLength)))
            }
            position = dataStart + dataLength
        }
        return records
    }

    /**
     * Builds the SafeSearch reply: the original question, a CNAME answer pointing
     * at [target], and the A/AAAA answers resolved for that target.
     *
     * This is the standard DNS-level SafeSearch trick: the client connects to the
     * IP of e.g. forcesafesearch.google.com, which serves filtered results for any
     * Google hostname.
     */
    fun buildSafeSearchAnswer(
        query: ByteArray,
        question: Question,
        target: String,
        records: List<Record>
    ): ByteArray {
        val out = ByteArrayOutputStream()
        writeU16(out, question.id)
        val flags = 0x8000 or (question.flags and 0x7800) or (question.flags and 0x0100) or 0x0080
        writeU16(out, flags)
        writeU16(out, 1) // QDCOUNT
        writeU16(out, 1 + records.size) // ANCOUNT: CNAME + addresses
        writeU16(out, 0)
        writeU16(out, 0)
        out.write(query, 12, question.endOffset - 12) // echo the question section

        val questionName = question.name.trim('.').lowercase()
        val encodedTarget = encodeName(target)

        // CNAME <question> -> <target>
        out.write(encodeName(questionName))
        writeU16(out, TYPE_CNAME)
        writeU16(out, CLASS_IN)
        writeU32(out, 60)
        writeU16(out, encodedTarget.size)
        out.write(encodedTarget, 0, encodedTarget.size)

        // A/AAAA records for the target host.
        for (record in records) {
            out.write(encodeName(target))
            writeU16(out, record.type)
            writeU16(out, CLASS_IN)
            writeU32(out, if (record.ttl in 30..600) record.ttl else 60)
            writeU16(out, record.rdata.size)
            out.write(record.rdata, 0, record.rdata.size)
        }
        return out.toByteArray()
    }

    /** Builds a fresh recursive query used when resolving the SafeSearch target. */
    fun buildQuery(id: Int, name: String, type: Int): ByteArray {
        val out = ByteArrayOutputStream()
        writeU16(out, id)
        writeU16(out, 0x0100) // RD
        writeU16(out, 1)
        writeU16(out, 0)
        writeU16(out, 0)
        writeU16(out, 0)
        val encoded = encodeName(name)
        out.write(encoded, 0, encoded.size)
        writeU16(out, type)
        writeU16(out, CLASS_IN)
        return out.toByteArray()
    }

    private fun readU16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xFF) shl 8) or (bytes[offset + 1].toInt() and 0xFF)

    private fun readU32(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xFF) shl 24) or
            ((bytes[offset + 1].toInt() and 0xFF) shl 16) or
            ((bytes[offset + 2].toInt() and 0xFF) shl 8) or
            (bytes[offset + 3].toInt() and 0xFF)

    private fun writeU16(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = ((value ushr 8) and 0xFF).toByte()
        bytes[offset + 1] = (value and 0xFF).toByte()
    }

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xFF)
        out.write(value and 0xFF)
    }

    private fun writeU32(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 24) and 0xFF)
        out.write((value ushr 16) and 0xFF)
        out.write((value ushr 8) and 0xFF)
        out.write(value and 0xFF)
    }
}
