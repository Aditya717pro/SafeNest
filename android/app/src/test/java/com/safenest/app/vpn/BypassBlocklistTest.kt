package com.safenest.app.vpn

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BypassBlocklistTest {

    @Test
    fun dohHostsBlocked() {
        assertTrue(BypassBlocklist.isBlockedHost("dns.google"))
        assertTrue(BypassBlocklist.isBlockedHost("foo.dns.google"))
        assertTrue(BypassBlocklist.isBlockedHost("cloudflare-dns.com"))
        assertTrue(BypassBlocklist.isBlockedHost("mozilla.cloudflare-dns.com"))
        assertTrue(BypassBlocklist.isBlockedHost("doh.opendns.com"))
        assertTrue(BypassBlocklist.isBlockedHost("dns.quad9.net"))
    }

    @Test
    fun normalHostsNotBlocked() {
        assertFalse(BypassBlocklist.isBlockedHost("example.com"))
        assertFalse(BypassBlocklist.isBlockedHost("dns.example.com"))
    }
}
