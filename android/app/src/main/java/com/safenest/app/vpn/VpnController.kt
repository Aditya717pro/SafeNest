package com.safenest.app.vpn

import android.content.Context
import android.content.Intent
import android.net.VpnService
import com.safenest.app.data.AppPrefs
import kotlinx.coroutines.flow.StateFlow

/**
 * Façade the UI uses to control protection.
 *
 * Android requires the user to approve a VPN once per app. [consentIntent] returns
 * the intent that shows that dialog, or null when consent has already been granted.
 */
object VpnController {

    val running: StateFlow<Boolean> = SafeNestVpnService.running
    val blockedCount: StateFlow<Long> = SafeNestVpnService.blockedCount

    /** @return a consent intent to launch, or null when permission is already held. */
    fun consentIntent(context: Context): Intent? = VpnService.prepare(context)

    fun start(context: Context) {
        AppPrefs(context).protectionEnabled = true
        SafeNestVpnService.start(context)
    }

    fun stop(context: Context) {
        AppPrefs(context).protectionEnabled = false
        SafeNestVpnService.stop(context)
    }
}
