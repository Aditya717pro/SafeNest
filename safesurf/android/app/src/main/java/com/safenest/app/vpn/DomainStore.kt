package com.safenest.app.vpn

import android.content.Context

/**
 * In-memory adult-domain blocklist.
 *
 * The asset is produced by scripts/build-blocklist.js and has the layout:
 *
 *   "SNBL"            4 bytes   magic
 *   version           4 bytes   little-endian int
 *   count             4 bytes   little-endian int (number of domains)
 *   offsets           (count+1) x 4 bytes little-endian int, byte offset of each
 *                     domain inside the names blob (offsets[count] = blob length)
 *   names             concatenated US-ASCII hostnames, sorted ascending
 *
 * Keeping every name in one flat byte array plus an offset table costs ~4 bytes per
 * domain of overhead, so ~990k domains fit in roughly 25 MB resident memory and can
 * be searched with a binary search - far cheaper than a HashSet<String>.
 */
class DomainStore private constructor(
    private val data: ByteArray,
    private val count: Int,
    private val offsetsBase: Int,
    private val namesBase: Int
) {

    /** True when [domain] or any of its parent domains is in the blocklist. */
    fun contains(domain: String): Boolean {
        var name = domain.lowercase().trim('.')
        while (true) {
            if (search(name)) return true
            val dot = name.indexOf('.')
            if (dot < 0) return false
            name = name.substring(dot + 1)
            // Never match a bare TLD such as "com"; require at least one label and a dot.
            if (!name.contains('.')) return false
        }
    }

    private fun search(key: String): Boolean {
        val needle = key.toByteArray(Charsets.US_ASCII)
        var low = 0
        var high = count - 1
        while (low <= high) {
            val mid = (low + high) ushr 1
            val comparison = compareEntry(mid, needle)
            when {
                comparison == 0 -> return true
                comparison < 0 -> low = mid + 1
                else -> high = mid - 1
            }
        }
        return false
    }

    /** Unsigned byte comparison of blocklist entry [index] against [needle]. */
    private fun compareEntry(index: Int, needle: ByteArray): Int {
        val start = namesBase + readInt(offsetsBase + index * 4)
        val end = namesBase + readInt(offsetsBase + (index + 1) * 4)
        val common = minOf(end - start, needle.size)
        for (i in 0 until common) {
            val a = data[start + i].toInt() and 0xFF
            val b = needle[i].toInt() and 0xFF
            if (a != b) return a - b
        }
        return (end - start) - needle.size
    }

    private fun readInt(offset: Int): Int =
        (data[offset].toInt() and 0xFF) or
            ((data[offset + 1].toInt() and 0xFF) shl 8) or
            ((data[offset + 2].toInt() and 0xFF) shl 16) or
            ((data[offset + 3].toInt() and 0xFF) shl 24)

    companion object {
        const val ASSET_NAME = "blocklist.bin"

        /** Loads the blocklist asset, or null when it is missing for this build. */
        fun load(context: Context, assetName: String = ASSET_NAME): DomainStore? {
            val bytes = try {
                context.assets.open(assetName).use { it.readBytes() }
            } catch (e: Exception) {
                return null
            }
            if (bytes.size < 16) return null
            if (bytes[0] != 'S'.code.toByte() || bytes[1] != 'N'.code.toByte() ||
                bytes[2] != 'B'.code.toByte() || bytes[3] != 'L'.code.toByte()
            ) return null

            val count = littleEndianInt(bytes, 8)
            if (count <= 0) return null
            val offsetsBase = 12
            val namesBase = 12 + (count + 1) * 4
            if (namesBase > bytes.size) return null
            return DomainStore(bytes, count, offsetsBase, namesBase)
        }

        private fun littleEndianInt(bytes: ByteArray, offset: Int): Int =
            (bytes[offset].toInt() and 0xFF) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 16) or
                ((bytes[offset + 3].toInt() and 0xFF) shl 24)
    }
}
