package com.safenest.app.vpn

/**
 * DNS-level SafeSearch enforcement.
 *
 * SafeSearch over DNS works by answering a query for e.g. google.com with a CNAME
 * to forcesafesearch.google.com. The resolver then connects to the IP that Google
 * reserves for filtered traffic, so every request is filtered regardless of the
 * browser, its settings, or incognito mode.
 */
object SafeSearch {

    private const val GOOGLE = "forcesafesearch.google.com"
    private const val BING = "strict.bing.com"
    private const val DUCKDUCKGO = "safe.duckduckgo.com"
    private const val YOUTUBE = "restrict.youtube.com"

    /** google.com, google.co.in, www.google.de, ... but not googleusercontent.com. */
    private val googleHost = Regex("^(www\\.)?google\\.[a-z]{2,}(\\.[a-z]{2,})?$")

    private val youtubeHosts = setOf(
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "youtubei.googleapis.com",
        "youtube.googleapis.com",
        "www.youtube-nocookie.com",
        "youtube-nocookie.com"
    )

    private val bingHosts = setOf("bing.com", "www.bing.com")
    private val duckDuckGoHosts = setOf("duckduckgo.com", "www.duckduckgo.com")

    /**
     * Returns the SafeSearch target host for [host], or null when [host] is not a
     * search engine covered by SafeSearch.
     */
    fun targetFor(host: String): String? {
        val h = host.lowercase().trim('.')
        return when {
            h in youtubeHosts -> YOUTUBE
            h in bingHosts -> BING
            h in duckDuckGoHosts -> DUCKDUCKGO
            googleHost.matches(h) -> GOOGLE
            else -> null
        }
    }
}
