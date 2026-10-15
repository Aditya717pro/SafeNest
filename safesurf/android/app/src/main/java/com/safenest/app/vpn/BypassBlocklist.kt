package com.safenest.app.vpn

/**
 * Encrypted-DNS (DoH/DoT) bypass list.
 *
 * Browsers and Android's Private DNS can talk to their own resolver over TLS,
 * which would skip this VPN's filter entirely. Because the VPN only routes DNS
 * plus the IPs listed here, adding a resolver's IP as a route pulls its traffic
 * into the tunnel where it is silently dropped, so the connection never completes.
 * Its discovery hostname additionally answers NXDOMAIN as a second layer.
 */
object BypassBlocklist {

    /** IPv4 prefixes pulled into the tunnel and dropped. */
    val IPV4_ROUTES = listOf(
        "1.1.1.1/32", "1.0.0.1/32", "1.1.1.2/32", "1.0.0.2/32",       // Cloudflare
        "8.8.8.8/32", "8.8.4.4/32",                                     // Google
        "9.9.9.9/32", "149.112.112.112/32",                             // Quad9
        "208.67.222.222/32", "208.67.220.220/32",                       // OpenDNS
        "94.140.14.14/32", "94.140.15.15/32",                           // AdGuard
        "45.90.28.0/24", "45.90.30.0/24",                               // NextDNS
        "185.228.168.9/32", "185.228.169.9/32",                         // CleanBrowsing
        "76.76.2.0/24", "76.76.19.0/24",                                // ControlD
        "162.159.36.0/24", "162.159.46.0/24"                            // Cloudflare DoH
    )

    /** IPv6 prefixes pulled into the tunnel and dropped. */
    val IPV6_ROUTES = listOf(
        "2606:4700:4700::1111/128", "2606:4700:4700::1001/128",         // Cloudflare
        "2001:4860:4860::8888/128", "2001:4860:4860::8844/128",         // Google
        "2620:fe::fe/128", "2620:fe::9/128",                            // Quad9
        "2620:119:35::35/128", "2620:119:53::53/128",                   // OpenDNS
        "2a10:50c0::ad1:ff/128", "2a10:50c0::ad2:ff/128",               // AdGuard
        "2a07:a8c0::/32", "2a07:a8c1::/32"                              // NextDNS
    )

    /** Resolver hostnames answered with NXDOMAIN. */
    private val HOSTS = setOf(
        "dns.google", "cloudflare-dns.com", "mozilla.cloudflare-dns.com",
        "one.one.one.one", "doh.opendns.com", "dns.quad9.net",
        "doh.dns.sb", "dns.adguard.com", "dns.adguard-dns.com", "adguard-dns.io",
        "dns.nextdns.io", "doh.cleanbrowsing.org", "dns.cleanbrowsing.org",
        "freedns.controld.com", "doh.controld.com", "chrome.cloudflare-dns.com",
        "doh.pub", "dot.pub", "dns.alidns.com", "dns.360.cn", "dns.comss.one",
        "doh.dnswarden.com", "dns.mullvad.net", "doh.mullvad.net",
        "dnsforge.de", "doh.libredns.gr"
    )

    /** True when [host] (or a subdomain of it) is a known encrypted-DNS endpoint. */
    fun isBlockedHost(host: String): Boolean {
        var name = host.lowercase().trim('.')
        while (true) {
            if (name in HOSTS) return true
            val dot = name.indexOf('.')
            if (dot < 0) return false
            name = name.substring(dot + 1)
            if (!name.contains('.')) return false
        }
    }
}
