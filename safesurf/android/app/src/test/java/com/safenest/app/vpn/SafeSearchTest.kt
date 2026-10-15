package com.safenest.app.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SafeSearchTest {

    @Test
    fun googleCases() {
        assertEquals("forcesafesearch.google.com", SafeSearch.targetFor("google.com"))
        assertEquals("forcesafesearch.google.com", SafeSearch.targetFor("www.google.co.uk"))
        assertEquals("forcesafesearch.google.com", SafeSearch.targetFor("www.google.com"))
    }

    @Test
    fun youtubeCases() {
        assertEquals("restrict.youtube.com", SafeSearch.targetFor("youtube.com"))
        assertEquals("restrict.youtube.com", SafeSearch.targetFor("m.youtube.com"))
        assertEquals("restrict.youtube.com", SafeSearch.targetFor("youtu.be"))
        assertEquals("restrict.youtube.com", SafeSearch.targetFor("youtubei.googleapis.com"))
    }

    @Test
    fun others() {
        assertEquals("strict.bing.com", SafeSearch.targetFor("bing.com"))
        assertEquals("safe.duckduckgo.com", SafeSearch.targetFor("duckduckgo.com"))
        assertTrue(SafeSearch.targetFor("example.com") == null)
        assertTrue(SafeSearch.targetFor("googleusercontent.com") == null)
    }
}
