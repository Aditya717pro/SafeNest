package com.safenest.app.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainStoreTest {

    @Test
    fun fromDomains_exactAndSubdomain() {
        val store = DomainStore.fromDomains(setOf("pornhub.com", "xvideos.com"))
        assertTrue(store.contains("pornhub.com"))
        assertTrue(store.contains("www.pornhub.com"))
        assertTrue(store.contains("a.b.pornhub.com"))
        assertTrue(store.contains("xvideos.com"))
        assertTrue(store.contains("m.xvideos.com"))
    }

    @Test
    fun fromDomains_falsePositive() {
        val store = DomainStore.fromDomains(setOf("pornhub.com"))
        assertFalse(store.contains("notpornhub.com"))
        assertFalse(store.contains("pornhubx.com"))
        assertFalse(store.contains("pornhub.com.evil.com"))
        assertFalse(store.contains("pornhuborg.com"))
    }

    @Test
    fun fromDomains_caseInsensitivity() {
        val store = DomainStore.fromDomains(setOf("PornHub.com", "XVIDEOS.COM"))
        assertTrue(store.contains("pornhub.com"))
        assertTrue(store.contains("PORNHUB.COM."))
        assertTrue(store.contains("www.Xvideos.com"))
    }

    @Test
    fun fromDomains_empty() {
        val store = DomainStore.fromDomains(emptySet())
        assertFalse(store.contains("example.com"))
        assertFalse(store.contains(""))
    }

    @Test
    fun fromDomains_distinctAndSorted() {
        val store = DomainStore.fromDomains(listOf("x.com", "a.com", "a.com", "b.com"))
        assertEquals(3, store.size)
        assertTrue(store.contains("x.com"))
        assertTrue(store.contains("a.com"))
        assertTrue(store.contains("b.com"))
    }

    @Test
    fun fromBytes_zeroCount() {
        // Build minimal zero-count blob
        val bytes = ByteArray(16)
        bytes[0]='S'.code.toByte(); bytes[1]='N'.code.toByte(); bytes[2]='B'.code.toByte(); bytes[3]='L'.code.toByte()
        // version 1 at offset 4
        bytes[4]=1; bytes[5]=0; bytes[6]=0; bytes[7]=0
        // count 0 at offset 8
        bytes[8]=0; bytes[9]=0; bytes[10]=0; bytes[11]=0
        // offsetsBase 12, namesBase 16; namesBase=16 > bytes.size (16)? namesBase is 12+(0+1)*4=16, bytes.size=16, so namesBase == bytes.size is allowed? check: namesBase > bytes.size means invalid. 16 > 16 is false. valid.
        val store = DomainStore.fromBytes(bytes)
        assertTrue(store != null)
        assertEquals(0, store!!.size)
        assertFalse(store.contains("example.com"))
    }
}
