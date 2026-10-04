package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val MonochromeColorScheme = darkColorScheme(
  primary = PureWhite,
  onPrimary = PureBlack,
  secondary = PureWhite,
  onSecondary = PureBlack,
  tertiary = TextSubtle,
  background = PureBlack,
  onBackground = PureWhite,
  surface = SurfaceDark,
  onSurface = PureWhite,
  surfaceVariant = SurfaceSubtle,
  onSurfaceVariant = TextSubtle,
  outline = BorderMedium,
  outlineVariant = BorderSubtle
)

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = true,
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  MaterialTheme(
    colorScheme = MonochromeColorScheme,
    typography = Typography,
    content = content
  )
}
