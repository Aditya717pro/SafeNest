package com.safenest.app.ui

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.safenest.app.BuildConfig
import com.safenest.app.data.AppPrefs
import com.safenest.app.data.PinManager
import com.safenest.app.util.AppLog
import com.safenest.app.vpn.VpnController

/** What the PIN dialog is currently asking for. */
private sealed interface PinDialogMode {
    data object None : PinDialogMode
    data object SetPin : PinDialogMode
    data object ConfirmDisable : PinDialogMode
    data object DisablePin : PinDialogMode
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(prefs: AppPrefs) {
    var showDebug by remember { mutableStateOf(false) }
    if (showDebug && BuildConfig.DEBUG) {
        DebugScreen(prefs, onBack = { showDebug = false })
        return
    }

    val context = LocalContext.current
    val running by VpnController.running.collectAsStateWithLifecycle()
    val blocked by VpnController.blockedCount.collectAsStateWithLifecycle()

    // SharedPreferences changes do not recompose, so mirror the PIN flag in state.
    var pinEnabled by remember { mutableStateOf(prefs.pinEnabled) }
    var dialog by remember { mutableStateOf<PinDialogMode>(PinDialogMode.None) }

    // Ask for VPN consent, then turn protection on if the user approved.
    val consentLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            VpnController.start(context)
        }
    }

    // Android 13+ needs runtime permission to show the ongoing notification.
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* The service still runs if this is denied; only the notification is hidden. */ }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Reconcile a stored "on" flag with a service that is not running (e.g. after
    // the app was force-stopped). Consent must still be granted to restart silently.
    LaunchedEffect(Unit) {
        if (prefs.protectionEnabled && !VpnController.running.value) {
            if (VpnController.consentIntent(context) == null) {
                VpnController.start(context)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "SafeNest",
                        modifier = Modifier.pointerInput(Unit) {
                            detectTapGestures(
                                onLongPress = {
                                    if (BuildConfig.DEBUG) {
                                        showDebug = true
                                    }
                                }
                            )
                        }
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            ProtectionCard(
                running = running,
                blocked = blocked,
                onToggle = { wantOn ->
                    if (wantOn) {
                        val intent = VpnController.consentIntent(context)
                        if (intent != null) consentLauncher.launch(intent)
                        else VpnController.start(context)
                    } else if (pinEnabled) {
                        AppLog.d("PIN asked: turn protection OFF")
                        dialog = PinDialogMode.ConfirmDisable
                    } else {
                        VpnController.stop(context)
                    }
                }
            )

            Spacer(Modifier.height(24.dp))

            PinSection(
                pinEnabled = pinEnabled,
                onSetPin = {
                    AppLog.d("PIN dialog: set new PIN")
                    dialog = PinDialogMode.SetPin
                },
                onRemovePin = {
                    AppLog.d("PIN asked: remove PIN")
                    dialog = PinDialogMode.DisablePin
                }
            )

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Protection blocks a large list of adult domains and forces " +
                    "SafeSearch on Google, Bing, DuckDuckGo and YouTube for every app, " +
                    "including all browsers and private/incognito windows.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    when (dialog) {
        PinDialogMode.None -> Unit

        PinDialogMode.SetPin -> PinDialog(
            title = "Set parent PIN",
            message = "This PIN will be required to turn protection off.",
            confirmLabel = "Save",
            onConfirm = { pin ->
                PinManager.setPin(prefs, pin)
                pinEnabled = true
                dialog = PinDialogMode.None
            },
            onDismiss = { dialog = PinDialogMode.None }
        )

        PinDialogMode.DisablePin -> PinDialog(
            title = "Remove parent PIN",
            message = "Enter the current PIN to remove it.",
            confirmLabel = "Remove",
            verifyAgainst = prefs,
            onConfirm = {
                PinManager.clear(prefs)
                pinEnabled = false
                dialog = PinDialogMode.None
            },
            onDismiss = { dialog = PinDialogMode.None }
        )

        PinDialogMode.ConfirmDisable -> PinDialog(
            title = "Enter parent PIN",
            message = "A PIN is required to turn protection off.",
            confirmLabel = "Turn off",
            verifyAgainst = prefs,
            onConfirm = {
                VpnController.stop(context)
                dialog = PinDialogMode.None
            },
            onDismiss = { dialog = PinDialogMode.None }
        )
    }
}

@Composable
private fun ProtectionCard(
    running: Boolean,
    blocked: Long,
    onToggle: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (running) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = if (running) "Protection is ON" else "Protection is OFF",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = if (running) {
                    "Blocking adult sites device-wide until you turn it off"
                } else {
                    "Tap the switch to start blocking"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(20.dp))

            Switch(
                checked = running,
                onCheckedChange = onToggle,
                modifier = Modifier.width(64.dp)
            )

            if (running) {
                Spacer(Modifier.height(20.dp))
                Text(
                    text = "$blocked blocked since start",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
    }
}

@Composable
private fun PinSection(
    pinEnabled: Boolean,
    onSetPin: () -> Unit,
    onRemovePin: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text = "Parent PIN",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (pinEnabled) {
                    "A PIN is required to turn protection off."
                } else {
                    "Add a PIN so protection cannot be switched off casually."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (pinEnabled) {
                    OutlinedButton(onClick = onRemovePin) { Text("Remove PIN") }
                    Button(onClick = onSetPin) { Text("Change PIN") }
                } else {
                    Button(onClick = onSetPin) { Text("Set PIN") }
                }
            }
        }
    }
}

/**
 * Collects a 4-6 digit PIN. When [verifyAgainst] is provided the PIN is checked
 * before [onConfirm] runs, otherwise a new PIN is stored.
 */
@Composable
private fun PinDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
    verifyAgainst: AppPrefs? = null
) {
    var pin by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(message, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(12.dp))
                PinField(value = pin, label = "PIN", onValueChange = { pin = it })
                if (verifyAgainst == null) {
                    Spacer(Modifier.height(8.dp))
                    PinField(value = confirm, label = "Confirm PIN", onValueChange = { confirm = it })
                }
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = error!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                when {
                    !PinManager.isValidFormat(pin) ->
                        error = "Use 4 to 6 digits"

                    verifyAgainst != null && !PinManager.verify(verifyAgainst, pin) ->
                        error = "Incorrect PIN"

                    verifyAgainst == null && pin != confirm ->
                        error = "PINs do not match"

                    else -> onConfirm(pin)
                }
            }) { Text(confirmLabel) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun PinField(value: String, label: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { input -> onValueChange(input.filter { it.isDigit() }.take(6)) },
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
    )
}
