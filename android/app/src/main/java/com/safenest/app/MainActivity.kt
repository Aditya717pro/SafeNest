package com.safenest.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.safenest.app.data.AppPrefs
import com.safenest.app.ui.HomeScreen
import com.safenest.app.ui.theme.SafeNestTheme

/** Single-screen entry point. The VPN itself lives in [com.safenest.app.vpn.SafeNestVpnService]. */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = AppPrefs(this)
        setContent {
            SafeNestTheme {
                HomeScreen(prefs = prefs)
            }
        }
    }
}
