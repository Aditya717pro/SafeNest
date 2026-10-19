package com.safenest.app.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import com.safenest.app.data.AppPrefs
import com.safenest.app.vpn.SafeNestVpnService

/**
 * Restores protection after a reboot when the user left the switch on.
 *
 * BOOT_COMPLETED is one of the broadcasts allowed to start a foreground service
 * from the background, so no user interaction is required - provided the app has
 * been opened at least once since installation and VPN consent is still granted.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, ACTION_QUICKBOOT -> Unit
            else -> return
        }

        val prefs = AppPrefs(context)
        if (!prefs.protectionEnabled) return

        if (VpnService.prepare(context) != null) {
            // Consent was revoked while the device was off; we cannot show the dialog
            // from here, so record the switch as off to keep the UI honest.
            prefs.protectionEnabled = false
            return
        }
        SafeNestVpnService.start(context)
    }

    private companion object {
        const val ACTION_QUICKBOOT = "android.intent.action.QUICKBOOT_POWERON"
    }
}
