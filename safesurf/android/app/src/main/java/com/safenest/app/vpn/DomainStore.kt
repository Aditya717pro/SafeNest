package com.safenest.app.vpn

import android.content.Context
import com.safenest.app.BuildConfig
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.charset.Charset

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

    /** Number of domains stored in this blocklist. */
    val size: Int get() = count

    /** True when [domain] or any of its parent domains is in the blocklist. */
    fun contains(domain: String): Boolean {
        var name = domain.trim().trim('.').lowercase()
        if (name.isEmpty()) return false
        while (true) {
            if (search(name)) return true
            val dot = name.indexOf('.')
            if (dot < 0) return false
            name = name.substring(dot + 1)
            // Never match a bare TLD such as "com"; require at least one label and a dot.
            if (name.indexOf('.') < 0) return false
        }
    }

    private fun search(key: String): Boolean {
        val needle = key.toByteArray(Charset.forName("US-ASCII"))
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
        var i = 0
        while (i < common) {
            val a = data[start + i].toInt() and 0xFF
            val b = needle[i].toInt() and 0xFF
            if (a != b) return a - b
            i++
        }
        return (end - start) - needle.size
    }

    private fun readInt(offset: Int): Int =
        (data[offset].toInt() and 0xFF) or
            ((data[offset + 1].toInt() and 0xFF) shl 8) or
            ((data[offset + 2].toInt() and 0xFF) shl 16) or
            ((data[offset + 3].toInt() and 0xFF) shl 24)

    private fun writeLittleEndianInt(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = (value and 0xFF).toByte()
        bytes[offset + 1] = ((value shr 8) and 0xFF).toByte()
        bytes[offset + 2] = ((value shr 16) and 0xFF).toByte()
        bytes[offset + 3] = ((value shr 24) and 0xFF).toByte()
    }

    companion object {
        const val ASSET_NAME = "blocklist.bin"
        private const val MAGIC_0 = 'S'.code.toByte()
        private const val MAGIC_1 = 'N'.code.toByte()
        private const val MAGIC_2 = 'B'.code.toByte()
        private const val MAGIC_3 = 'L'.code.toByte()
        private const val FORMAT_VERSION = 1

        /** Loads the blocklist asset, or null when it is missing for this build. */
        fun load(context: Context, assetName: String = ASSET_NAME): DomainStore? {
            val bytes = try {
                context.assets.open(assetName).use { it.readBytes() }
            } catch (e: Exception) {
                return null
            }
            return fromBytes(bytes)
        }

        fun fromBytes(bytes: ByteArray?): DomainStore? {
            if (bytes == null || bytes.size < 16) return null
            if (bytes[0] != MAGIC_0 || bytes[1] != MAGIC_1 ||
                bytes[2] != MAGIC_2 || bytes[3] != MAGIC_3
            ) return null

            val version = littleEndianInt(bytes, 4)
            if (version != FORMAT_VERSION) return null
            val count = littleEndianInt(bytes, 8)
            if (count < 0) return null
            if (count == 0) {
                val offsetsBase = 12
                val namesBase = 12 + 4 // (0+1)*4
                if (namesBase > bytes.size) return null
                return DomainStore(bytes, 0, offsetsBase, namesBase)
            }
            val offsetsBase = 12
            val namesBase = 12 + (count + 1) * 4
            if (namesBase > bytes.size) return null
            return DomainStore(bytes, count, offsetsBase, namesBase)
        }

        /**
         * Builds an in-memory domain store from [domains].
         *
         * Used by unit tests and by the fallback path: it encodes the exact same binary
         * layout (sorted, distinct, ASCII lowercased names) and returns a DomainStore
         * that reuses the production binary-search code. No Android APIs are required.
         */
        fun fromDomains(domains: Collection<String>): DomainStore {
            val names = domains.asSequence()
                .map { it.trim().trim('.').lowercase() }
                .filter { it.isNotEmpty() }
                .distinct()
                .sorted()
                .toList()

            val encoded = Array(names.size) { index ->
                names[index].toByteArray(Charset.forName("US-ASCII"))
            }

            val offsetsBase = 12
            val namesBase = 12 + (names.size + 1) * 4
            val namesLength = encoded.sumOf { it.size }
            val bytes = ByteArray(namesBase + namesLength)

            bytes[0] = MAGIC_0
            bytes[1] = MAGIC_1
            bytes[2] = MAGIC_2
            bytes[3] = MAGIC_3
            writeLittleEndianInt(bytes, 4, FORMAT_VERSION)
            writeLittleEndianInt(bytes, 8, names.size)

            var cursor = 0
            var i = 0
            while (i < names.size) {
                writeLittleEndianInt(bytes, offsetsBase + i * 4, cursor)
                val arr = encoded[i]
                System.arraycopy(arr, 0, bytes, namesBase + cursor, arr.size)
                cursor += arr.size
                i++
            }
            writeLittleEndianInt(bytes, offsetsBase + names.size * 4, cursor)

            return DomainStore(bytes, names.size, offsetsBase, namesBase)
        }

        private fun littleEndianInt(bytes: ByteArray, offset: Int): Int =
            (bytes[offset].toInt() and 0xFF) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 16) or
                ((bytes[offset + 3].toInt() and 0xFF) shl 24)

        private fun writeLittleEndianInt(bytes: ByteArray, offset: Int, value: Int) {
            bytes[offset] = (value and 0xFF).toByte()
            bytes[offset + 1] = ((value shr 8) and 0xFF).toByte()
            bytes[offset + 2] = ((value shr 16) and 0xFF).toByte()
            bytes[offset + 3] = ((value shr 24) and 0xFF).toByte()
        }
    }
}
