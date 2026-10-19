package com.safenest.app.ui

import android.content.Context
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.safenest.app.BuildConfig
import com.safenest.app.data.AppPrefs
import com.safenest.app.util.AppLog
import com.safenest.app.vpn.DomainStore
import com.safenest.app.vpn.FallbackBlocklist
import com.safenest.app.vpn.FilterPolicy

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DebugScreen(prefs: AppPrefs, onBack: () -> Unit) {
    val context = LocalContext.current
    var domain by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<String?>(null) }

    val storeAndInfo = remember {
        val store = DomainStore.load(context)
        val info = if (store != null) {
            "Adult list loaded: ${store.size} domains (asset blocklist.bin)"
        } else {
            "Adult list missing - using fallback: ${FallbackBlocklist.DOMAINS.size} domains"
        }
        store to info
    }

    val policy = remember(storeAndInfo.first) {
        FilterPolicy(storeAndInfo.first, prefs.whitelist, prefs.blacklist)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Debug: filter tester") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                ),
                navigationIcon = {
                    OutlinedButton(onClick = onBack, modifier = Modifier.padding(start = 12.dp)) {
                        Text("Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Offline check. No network used. This screen is only visible in debug builds.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text(storeAndInfo.second)

            OutlinedTextField(
                value = domain,
                onValueChange = { domain = it },
                label = { Text("Domain to test") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = {
                    val normalized = domain.trim().trim('.').lowercase()
                    val decision = if (normalized.isEmpty()) {
                        com.safenest.app.vpn.FilterDecision.Dropped
                    } else {
                        policy.classify(normalized)
                    }
                    result = "$normalized -> ${decision.describe()}"
                    AppLog.d("DEBUG filter check: $result")
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Check")
            }

            if (result != null) {
                Text(
                    text = result!!,
                    style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace)
                )
            }

            Text(
                text = "Covers: whitelist, DoH/DoT endpoints, custom blacklist, adult blocklist (subdomains), SafeSearch, normal domains.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
