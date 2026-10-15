package com.safenest.app.vpn

/**
 * Tiny always-available blocklist used when the generated asset is absent
 * (for example when the app is built before running scripts/build-blocklist.js).
 *
 * It mirrors the seed list in scripts/clean-domains.js so a debug build still
 * demonstrates end-to-end blocking.
 */
internal object FallbackBlocklist {

    val DOMAINS: Set<String> = setOf(
        "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "youporn.com",
        "redtube.com", "tube8.com", "chaturbate.com", "stripchat.com", "livejasmin.com",
        "camsoda.com", "bongacams.com", "cam4.com", "myfreecams.com", "flirt4free.com",
        "brazzers.com", "naughtyamerica.com", "realitykings.com", "bangbros.com",
        "adultfriendfinder.com", "fetlife.com", "beeg.com", "spankbang.com",
        "eporner.com", "hqporner.com", "tnaflix.com", "daftsex.com", "pornone.com",
        "motherless.com", "heavy-r.com", "hentaihaven.xxx", "hanime.tv", "nhentai.net",
        "hitomi.la", "multporn.net", "fakku.net", "tsumino.com", "e-hentai.org",
        "exhentai.org", "fapello.com", "erome.com", "onlyfans.com", "fansly.com",
        "manyvids.com", "porntrex.com", "sunporno.com", "missav.com", "jable.tv",
        "spankbang.com", "thumbzilla.com", "pornerbros.com", "spankwire.com",
        "xhamster.com", "nuvid.com", "empflix.com", "extremetube.com"
    )

    /** Suffix-aware check matching DomainStore.contains(). */
    fun contains(domain: String): Boolean {
        var name = domain.lowercase().trim('.')
        while (true) {
            if (name in DOMAINS) return true
            val dot = name.indexOf('.')
            if (dot < 0) return false
            name = name.substring(dot + 1)
            if (!name.contains('.')) return false
        }
    }
}
