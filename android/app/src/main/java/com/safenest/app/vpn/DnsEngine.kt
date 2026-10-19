package com.safenest.app.vpn

import com.safenest.app.util.AppLog
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
 *   4. bundled blocklist ........ NXDOMAIN (falls back to tiny seed if asset missing)
 *   5. search engines ........... CNAME rewrite to the SafeSearch host
 *   6. everything else .......... forwarded to a public resolver
 *
 * Upstream traffic leaves through [socket], which the VpnService protects so it
 * does not get routed back into the tunnel.
 */
class DnsEngine(
    private val policy: FilterPolicy,
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
        val question = DnsMessage.parseQuestion(query) ?: run {
            AppLog.d("DNS malformed query -> DROPPED (malformed)")
            return null
        }
        val host = question.name.trim().trim('.').lowercase()
        if (host.isEmpty()) {
            AppLog.d("DNS empty host -> DROPPED (malformed)")
            return null
        }

        return when (val decision = policy.classify(host)) {
            FilterDecision.Dropped -> {
                AppLog.d("DNS $host -> DROPPED (malformed)")
                null
            }

            FilterDecision.Allowed -> {
                AppLog.d("DNS $host -> ALLOWED")
                forward(query)
            }

            is FilterDecision.Blocked -> {
                blockedCount++
                AppLog.d("DNS $host -> ${decision.describe()}")
                DnsMessage.buildNxdomain(query, question)
            }

            is FilterDecision.Rewritten -> {
                AppLog.d("DNS $host -> ${decision.describe()}")
                val answer = resolveSafeSearch(query, question, decision.target)
                if (answer == null) {
                    AppLog.d("DNS SafeSearch fallback for $host -> forwarding to upstream")
                    forward(query)
                } else {
                    answer
                }
            }
        }
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

    private companion object {
        const val DNS_PORT = 53
        const val MAX_DNS_RESPONSE = 4096
        const val UPSTREAM_PRIMARY = "1.1.1.1"
        const val UPSTREAM_FALLBACK = "9.9.9.9"
    }
}
