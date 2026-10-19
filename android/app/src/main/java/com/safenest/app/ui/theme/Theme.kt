package com.safenest.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Green = Color(0xFF2E7D32)
private val GreenLight = Color(0xFF60AD5E)
private val GreenDark = Color(0xFF005005)
private val Danger = Color(0xFFC62828)

private val LightColors = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFB7EFB4),
    onPrimaryContainer = GreenDark,
    secondary = Color(0xFF52634F),
    error = Danger,
    surface = Color(0xFFFBFDF8),
    background = Color(0xFFFBFDF8)
)

private val DarkColors = darkColorScheme(
    primary = GreenLight,
    onPrimary = Color(0xFF00390A),
    primaryContainer = GreenDark,
    onPrimaryContainer = Color(0xFFB7EFB4),
    secondary = Color(0xFFB9CCB4),
    error = Color(0xFFFFB4AB),
    surface = Color(0xFF101510),
    background = Color(0xFF101510)
)

@Composable
fun SafeNestTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
