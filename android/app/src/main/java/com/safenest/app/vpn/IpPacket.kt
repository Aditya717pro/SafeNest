package com.safenest.app.vpn

/**
 * Minimal IPv4/IPv6 + UDP packet handling, just enough to answer DNS queries
 * that the tunnel receives.
 *
 * The VPN only routes DNS traffic, so every packet read from the tun device is
 * either a DNS query (handled) or traffic addressed to a black-holed resolver
 * IP (dropped).
 */
internal object IpPacket {

    const val PROTO_UDP = 17

    class UdpPacket(
        val ipVersion: Int,
        val sourceAddress: ByteArray,
        val destinationAddress: ByteArray,
        val protocol: Int,
        val sourcePort: Int,
        val destinationPort: Int,
        val payload: ByteArray
    )

    /** Parses a raw IP packet; returns null for malformed or non-UDP packets. */
    fun parse(packet: ByteArray, length: Int): UdpPacket? {
        if (length < 20) return null
        return when ((packet[0].toInt() and 0xFF) ushr 4) {
            4 -> parseV4(packet, length)
            6 -> parseV6(packet, length)
            else -> null
        }
    }

    private fun parseV4(packet: ByteArray, length: Int): UdpPacket? {
        val headerLength = (packet[0].toInt() and 0x0F) * 4
        if (headerLength < 20 || length < headerLength + 8) return null

        val protocol = packet[9].toInt() and 0xFF
        val source = packet.copyOfRange(12, 16)
        val destination = packet.copyOfRange(16, 20)

        return buildUdpPacket(
            version = 4,
            packet = packet,
            length = length,
            udpOffset = headerLength,
            protocol = protocol,
            source = source,
            destination = destination
        )
    }

    private fun parseV6(packet: ByteArray, length: Int): UdpPacket? {
        if (length < 48) return null
        val nextHeader = packet[6].toInt() and 0xFF
        // Extension headers are not expected for DNS; treat them as unsupported.
        if (nextHeader != PROTO_UDP) return null

        val source = packet.copyOfRange(8, 24)
        val destination = packet.copyOfRange(24, 40)
        return buildUdpPacket(
            version = 6,
            packet = packet,
            length = length,
            udpOffset = 40,
            protocol = nextHeader,
            source = source,
            destination = destination
        )
    }

    private fun buildUdpPacket(
        version: Int,
        packet: ByteArray,
        length: Int,
        udpOffset: Int,
        protocol: Int,
        source: ByteArray,
        destination: ByteArray
    ): UdpPacket? {
        if (length < udpOffset + 8) return null
        val sourcePort = readU16(packet, udpOffset)
        val destinationPort = readU16(packet, udpOffset + 2)
        val udpLength = readU16(packet, udpOffset + 4)
        val payloadEnd = minOf(length, udpOffset + udpLength)
        if (payloadEnd <= udpOffset + 8) return null

        return UdpPacket(
            ipVersion = version,
            sourceAddress = source,
            destinationAddress = destination,
            protocol = protocol,
            sourcePort = sourcePort,
            destinationPort = destinationPort,
            payload = packet.copyOfRange(udpOffset + 8, payloadEnd)
        )
    }

    /** Builds the reply for [query]: addresses and ports swapped, carrying [dnsPayload]. */
    fun buildUdpReply(query: UdpPacket, dnsPayload: ByteArray): ByteArray =
        if (query.ipVersion == 4) buildV4(query, dnsPayload) else buildV6(query, dnsPayload)

    private fun buildV4(query: UdpPacket, dns: ByteArray): ByteArray {
        val udpLength = 8 + dns.size
        val totalLength = 20 + udpLength
        val packet = ByteArray(totalLength)

        packet[0] = 0x45
        writeU16(packet, 2, totalLength)
        writeU16(packet, 4, 0)      // identification
        writeU16(packet, 6, 0x4000) // don't fragment
        packet[8] = 64              // TTL
        packet[9] = PROTO_UDP.toByte()
        System.arraycopy(query.destinationAddress, 0, packet, 12, 4)
        System.arraycopy(query.sourceAddress, 0, packet, 16, 4)
        writeU16(packet, 10, foldChecksum(sumWords(packet, 0, 20)))

        writeU16(packet, 20, query.destinationPort)
        writeU16(packet, 22, query.sourcePort)
        writeU16(packet, 24, udpLength)
        writeU16(packet, 26, 0) // zero means "no checksum", legal for UDP over IPv4
        System.arraycopy(dns, 0, packet, 28, dns.size)
        return packet
    }

    private fun buildV6(query: UdpPacket, dns: ByteArray): ByteArray {
        val udpLength = 8 + dns.size
        val totalLength = 40 + udpLength
        val packet = ByteArray(totalLength)

        packet[0] = 0x60.toByte()
        writeU16(packet, 4, udpLength) // payload length
        packet[6] = PROTO_UDP.toByte()
        packet[7] = 64
        System.arraycopy(query.destinationAddress, 0, packet, 8, 16)
        System.arraycopy(query.sourceAddress, 0, packet, 24, 16)

        writeU16(packet, 40, query.destinationPort)
        writeU16(packet, 42, query.sourcePort)
        writeU16(packet, 44, udpLength)
        writeU16(packet, 46, 0) // placeholder, filled in below
        System.arraycopy(dns, 0, packet, 48, dns.size)

        // UDP checksum is mandatory over IPv6 and covers a pseudo-header.
        val pseudo = pseudoHeaderV6(
            source = query.destinationAddress,
            destination = query.sourceAddress,
            udpLength = udpLength
        )
        var checksum = foldChecksum(
            sumWords(pseudo, 0, pseudo.size) + sumWords(packet, 40, totalLength)
        )
        if (checksum == 0) checksum = 0xFFFF
        writeU16(packet, 46, checksum)
        return packet
    }

    private fun pseudoHeaderV6(source: ByteArray, destination: ByteArray, udpLength: Int): ByteArray {
        val header = ByteArray(40)
        System.arraycopy(source, 0, header, 0, 16)
        System.arraycopy(destination, 0, header, 16, 16)
        header[32] = ((udpLength ushr 24) and 0xFF).toByte()
        header[33] = ((udpLength ushr 16) and 0xFF).toByte()
        header[34] = ((udpLength ushr 8) and 0xFF).toByte()
        header[35] = (udpLength and 0xFF).toByte()
        header[39] = PROTO_UDP.toByte()
        return header
    }

    /** One's-complement sum of the 16-bit big-endian words in [bytes]. */
    private fun sumWords(bytes: ByteArray, from: Int, to: Int): Int {
        var sum = 0
        var index = from
        while (index + 1 < to) {
            sum += ((bytes[index].toInt() and 0xFF) shl 8) or (bytes[index + 1].toInt() and 0xFF)
            index += 2
        }
        if (index < to) sum += (bytes[index].toInt() and 0xFF) shl 8
        return sum
    }

    private fun foldChecksum(sum: Int): Int {
        var folded = sum
        while (folded ushr 16 != 0) folded = (folded and 0xFFFF) + (folded ushr 16)
        return folded.inv() and 0xFFFF
    }

    private fun readU16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xFF) shl 8) or (bytes[offset + 1].toInt() and 0xFF)

    private fun writeU16(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = ((value ushr 8) and 0xFF).toByte()
        bytes[offset + 1] = (value and 0xFF).toByte()
    }
}
