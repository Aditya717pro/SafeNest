package com.safenest.app.util

import android.util.Log
import com.safenest.app.BuildConfig

/**
 * Debug-only logging.
 *
 * Every message uses the single tag required for manual testing:
 *
 *     adb logcat -s SafeNest
 *
 * Messages are compiled in but suppressed in release builds (BuildConfig.DEBUG is
 * false), so shipping the app does not leak the user's browsing domains to Logcat.
 */
object AppLog {

    const val TAG = "SafeNest"

    fun d(message: String) {
        if (BuildConfig.DEBUG) Log.d(TAG, message)
    }

    fun w(message: String) {
        if (BuildConfig.DEBUG) Log.w(TAG, message)
    }

    fun e(message: String, throwable: Throwable? = null) {
        if (!BuildConfig.DEBUG) return
        if (throwable == null) Log.e(TAG, message) else Log.e(TAG, message, throwable)
    }
}
