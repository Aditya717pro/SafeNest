package com.safenest.app.data

import android.content.Context

/**
 * Small synchronous preference store.
 *
 * SharedPreferences (instead of DataStore) is used deliberately: the boot receiver
 * and the VPN service both need to read the protection flag synchronously during
 * onReceive()/onStartCommand(), where suspending APIs would add needless complexity.
 */
class AppPrefs(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Master switch. Mirrors the toggle on the home screen. */
    var protectionEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    /** Domains that are always allowed (override every block rule). */
    var whitelist: Set<String>
        get() = prefs.getStringSet(KEY_WHITELIST, emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet(KEY_WHITELIST, value).apply()

    /** Extra domains blocked on top of the bundled list. */
    var blacklist: Set<String>
        get() = prefs.getStringSet(KEY_BLACKLIST, emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet(KEY_BLACKLIST, value).apply()

    var pinEnabled: Boolean
        get() = prefs.getBoolean(KEY_PIN_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_PIN_ENABLED, value).apply()

    var pinHash: String?
        get() = prefs.getString(KEY_PIN_HASH, null)
        set(value) = prefs.edit().putString(KEY_PIN_HASH, value).apply()

    var pinSalt: String?
        get() = prefs.getString(KEY_PIN_SALT, null)
        set(value) = prefs.edit().putString(KEY_PIN_SALT, value).apply()

    private companion object {
        const val PREFS_NAME = "safenest_prefs"
        const val KEY_ENABLED = "protection_enabled"
        const val KEY_WHITELIST = "whitelist"
        const val KEY_BLACKLIST = "blacklist"
        const val KEY_PIN_ENABLED = "pin_enabled"
        const val KEY_PIN_HASH = "pin_hash"
        const val KEY_PIN_SALT = "pin_salt"
    }
}
