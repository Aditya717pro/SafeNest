package com.safenest.app.vpn

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.Random

/**
 * Applies the filtering policy to raw DNS payloads.
 *
 * Decision order:
 *   1. parent whitelist ......... forward untouched
 *   2. encrypted-DNS hostnames .. NXDOMAIN (blocks DoH/DoT bootstrapping)
 *   3. custom blacklist ......... NXDOMAIN
 *   4. bundled blocklist ........ NXDOMAIN
 *   5. search engines ........... CNAME rewrite to the SafeSearch host
 *   6. everything else .......... forwarded to a public resolver
 *
 * Upstream traffic leaves through [socket], which the VpnService protects so it
 * does not get routed back into the tunnel.
 */
class DnsEngine(
    private val store: DomainStore?,
    private val whitelist: Set<String>,
    private val blacklist: Set<String>,
    protectSocket: (DatagramSocket) -> Unit
) {

    private val socket = DatagramSocket().apply { soTimeout = 5000 }
    private val random = Random()
    private val upstream: InetAddress = InetAddress.getByName(UPSTREAM_PRIMARY)
    private val fallback: InetAddress = InetAddress.getByName(UPSTREAM_FALLBACK)

    /** Number of queries refused since the engine was created. */
    @Volatile
    var blockedCount: Long = 0
        private set

    init {
        protectSocket(socket)
    }

    fun close() {
        runCatching { socket.close() }
    }

    /**
     * @return the DNS reply payload, or null when the query must be dropped.
     */
    fun process(query: ByteArray): ByteArray? {
        val question = DnsMessage.parseQuestion(query) ?: return null
        val host = question.name.lowercase().trim('.')
        if (host.isEmpty()) return null

        if (matches(host, whitelist)) return forward(query)

        if (BypassBlocklist.isBlockedHost(host) ||
            matches(host, blacklist) ||
            store?.contains(host) == true ||
            (store == null && FallbackBlocklist.contains(host))
        ) {
            blockedCount++
            return DnsMessage.buildNxdomain(query, question)
        }

        val target = SafeSearch.targetFor(host)
        if (target != null) {
            resolveSafeSearch(query, question, target)?.let { return it }
            // If the safe host could not be resolved, fall back to a normal answer
            // rather than breaking the user's search entirely.
        }

        return forward(query)
    }

    private fun forward(query: ByteArray): ByteArray? =
        exchange(upstream, query) ?: exchange(fallback, query)

    /**
     * Resolves [target] and rewrites the reply so the client sees a CNAME from
     * [question] to the SafeSearch host plus that host's addresses.
     *
     * When the target has no address for the requested type we still return the
     * CNAME alone: the client then resolves the (already safe) target itself,
     * which is preferable to leaking an unfiltered answer.
     */
    private fun resolveSafeSearch(
        query: ByteArray,
        question: DnsMessage.Question,
        target: String
    ): ByteArray? {
        val wantsAddress = question.type == DnsMessage.TYPE_A || question.type == DnsMessage.TYPE_AAAA
        val probeType = if (wantsAddress) question.type else DnsMessage.TYPE_A

        val probe = DnsMessage.buildQuery(random.nextInt(0xFFFF), target, probeType)
        val response = exchange(upstream, probe) ?: exchange(fallback, probe) ?: return null

        val addresses = if (wantsAddress) DnsMessage.extractAddressRecords(response) else emptyList()
        return DnsMessage.buildSafeSearchAnswer(query, question, target, addresses)
    }

    /** Sends [payload] to [server] and returns the reply, or null on timeout/error. */
    private fun exchange(server: InetAddress, payload: ByteArray): ByteArray? {
        return try {
            socket.send(DatagramPacket(payload, payload.size, server, DNS_PORT))
            val buffer = ByteArray(MAX_DNS_RESPONSE)
            val reply = DatagramPacket(buffer, buffer.size)
            socket.receive(reply)
            buffer.copyOf(reply.length)
        } catch (e: Exception) {
            null
        }
    }

    /** True when [host] or one of its parent domains is present in [list]. */
    private fun matches(host: String, list: Set<String>): Boolean {
        if (list.isEmpty()) return false
        var name = host
        while (true) {
            if (name in list) return true
            val dot = name.indexOf('.')
            if (dot < 0) return false
            name = name.substring(dot + 1)
            if (!name.contains('.')) return false
        }
    }

    private companion object {
        const val DNS_PORT = 53
        const val MAX_DNS_RESPONSE = 4096
        const val UPSTREAM_PRIMARY = "1.1.1.1"
        const val UPSTREAM_FALLBACK = "9.9.9.9"
    }
}
