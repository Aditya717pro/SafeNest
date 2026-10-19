package com.safenest.app.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FilterPolicyTest {

    private val adult = setOf("pornhub.com", "xvideos.com", "nhentai.net")
    private val policy = FilterPolicy(DomainStore.fromDomains(adult), emptySet(), emptySet())

    @Test
    fun adultDomainBlocked() {
        assertTrue(policy.classify("pornhub.com") is FilterDecision.Blocked)
        val d = policy.classify("pornhub.com")
        assertEquals(FilterDecision.Blocked(BlockReason.ADULT_LIST), d)
    }

    @Test
    fun adultSubdomainBlocked() {
        assertEquals(FilterDecision.Blocked(BlockReason.ADULT_LIST), policy.classify("www.pornhub.com"))
        assertEquals(FilterDecision.Blocked(BlockReason.ADULT_LIST), policy.classify("a.b.pornhub.com"))
        assertEquals(FilterDecision.Blocked(BlockReason.ADULT_LIST), policy.classify("xnxx.com"))
        assertEquals(FilterDecision.Blocked(BlockReason.ADULT_LIST), policy.classify("m.xvideos.com"))
    }

    @Test
    fun notPornhubNotBlocked() {
        assertEquals(FilterDecision.Allowed, policy.classify("notpornhub.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("pornhubx.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("xpornhub.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("pornhub.com.evil.com"))
    }

    @Test
    fun wordInDomainNotBlocked() {
        assertEquals(FilterDecision.Allowed, policy.classify("pornhub.example.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("pornhuborg.org"))
    }

    @Test
    fun googleRewritten() {
        val d = policy.classify("google.com")
        assertTrue(d is FilterDecision.Rewritten)
        assertEquals("forcesafesearch.google.com", (d as FilterDecision.Rewritten).target)

        assertEquals(FilterDecision.Rewritten("forcesafesearch.google.com"), policy.classify("www.google.com"))
        assertEquals(FilterDecision.Rewritten("forcesafesearch.google.com"), policy.classify("www.google.co.in"))
        assertEquals(FilterDecision.Rewritten("forcesafesearch.google.com"), policy.classify("google.de"))
    }

    @Test
    fun googleusercontentNotRewritten() {
        assertEquals(FilterDecision.Allowed, policy.classify("googleusercontent.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("www.googleusercontent.com"))
    }

    @Test
    fun bingRewritten() {
        assertEquals(FilterDecision.Rewritten("strict.bing.com"), policy.classify("bing.com"))
        assertEquals(FilterDecision.Rewritten("strict.bing.com"), policy.classify("www.bing.com"))
    }

    @Test
    fun ddgRewritten() {
        assertEquals(FilterDecision.Rewritten("safe.duckduckgo.com"), policy.classify("duckduckgo.com"))
        assertEquals(FilterDecision.Rewritten("safe.duckduckgo.com"), policy.classify("www.duckduckgo.com"))
    }

    @Test
    fun youtubeRewritten() {
        assertEquals(FilterDecision.Rewritten("restrict.youtube.com"), policy.classify("youtube.com"))
        assertEquals(FilterDecision.Rewritten("restrict.youtube.com"), policy.classify("m.youtube.com"))
        assertEquals(FilterDecision.Rewritten("restrict.youtube.com"), policy.classify("youtubei.googleapis.com"))
        assertEquals(FilterDecision.Rewritten("restrict.youtube.com"), policy.classify("youtu.be"))
    }

    @Test
    fun dohEndpointsBlocked() {
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("dns.google"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("cloudflare-dns.com"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("mozilla.cloudflare-dns.com"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("one.one.one.one"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("doh.opendns.com"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("dns.quad9.net"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("foo.dns.google"))
        assertEquals(FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS), policy.classify("cdn.cloudflare-dns.com")) // subdomain
    }

    @Test
    fun normalDomainsAllowed() {
        assertEquals(FilterDecision.Allowed, policy.classify("wikipedia.org"))
        assertEquals(FilterDecision.Allowed, policy.classify("github.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("example.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("stackoverflow.com"))
    }

    @Test
    fun emptyDropped() {
        assertEquals(FilterDecision.Dropped, policy.classify(""))
        assertEquals(FilterDecision.Dropped, policy.classify("."))
        assertEquals(FilterDecision.Dropped, policy.classify("   "))
    }

    @Test
    fun caseInsensitivity() {
        assertEquals(FilterDecision.Blocked(BlockReason.ADULT_LIST), policy.classify("PORNHub.com"))
        assertEquals(FilterDecision.Allowed, policy.classify("Example.COM"))
        assertEquals(FilterDecision.Rewritten("forcesafesearch.google.com"), policy.classify("GOOGLE.COM."))
    }

    @Test
    fun whitelistOverridesAdult() {
        val p = FilterPolicy(
            adultDomains = DomainStore.fromDomains(setOf("example.com")),
            whitelist = setOf("example.com"),
            blacklist = emptySet()
        )
        assertEquals(FilterDecision.Allowed, p.classify("example.com"))
        assertEquals(FilterDecision.Allowed, p.classify("www.example.com"))
    }

    @Test
    fun whitelistOverridesAdultDirect() {
        val p = FilterPolicy(
            adultDomains = DomainStore.fromDomains(setOf("pornhub.com")),
            whitelist = setOf("pornhub.com"),
            blacklist = emptySet()
        )
        assertEquals(FilterDecision.Allowed, p.classify("pornhub.com"))
    }

    @Test
    fun customBlacklistBlocks() {
        val p = FilterPolicy(
            adultDomains = DomainStore.fromDomains(emptySet()),
            whitelist = emptySet(),
            blacklist = setOf("badsite.example")
        )
        assertEquals(FilterDecision.Blocked(BlockReason.CUSTOM_BLACKLIST), p.classify("badsite.example"))
        assertEquals(FilterDecision.Blocked(BlockReason.CUSTOM_BLACKLIST), p.classify("www.badsite.example"))
    }

    @Test
    fun customBlacklistHigherPriority() {
        val p = FilterPolicy(
            adultDomains = DomainStore.fromDomains(setOf("override.com")),
            whitelist = emptySet(),
            blacklist = setOf("override.com")
        )
        assertEquals(FilterDecision.Blocked(BlockReason.CUSTOM_BLACKLIST), p.classify("override.com"))
    }
}
