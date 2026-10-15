package com.safenest.app.data

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Optional parental PIN.
 *
 * Only the hash (and a random per-install salt) is stored, never the PIN itself.
 * This is a deterrent for children, not cryptographic protection: a 4-digit PIN
 * has too little entropy to resist an offline brute force of the preferences file.
 */
object PinManager {

    private const val MIN_LENGTH = 4
    private const val MAX_LENGTH = 6

    fun isValidFormat(pin: String): Boolean =
        pin.length in MIN_LENGTH..MAX_LENGTH && pin.all { it.isDigit() }

    /** Stores a new PIN and enables the lock. */
    fun setPin(prefs: AppPrefs, pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.pinSalt = Base64.encodeToString(salt, Base64.NO_WRAP)
        prefs.pinHash = hash(pin, salt)
        prefs.pinEnabled = true
    }

    fun verify(prefs: AppPrefs, pin: String): Boolean {
        val saltText = prefs.pinSalt ?: return false
        val expected = prefs.pinHash ?: return false
        val salt = Base64.decode(saltText, Base64.NO_WRAP)
        return expected == hash(pin, salt)
    }

    fun clear(prefs: AppPrefs) {
        prefs.pinEnabled = false
        prefs.pinHash = null
        prefs.pinSalt = null
    }

    private fun hash(pin: String, salt: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(salt)
        digest.update(pin.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest.digest(), Base64.NO_WRAP)
    }
}
