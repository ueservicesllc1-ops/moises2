package com.juditht.ai.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val SonicColorScheme = darkColorScheme(
    primary              = SonicPrimary,
    onPrimary            = SonicOnPrimary,
    primaryContainer     = SonicPrimaryContainer,
    onPrimaryContainer   = SonicOnPrimaryContainer,
    inversePrimary       = SonicInversePrimary,

    secondary            = SonicSecondary,
    onSecondary          = SonicOnSecondary,
    secondaryContainer   = SonicSecondaryContainer,
    onSecondaryContainer = SonicOnSecondaryContainer,

    tertiary             = SonicTertiary,
    onTertiary           = SonicOnTertiary,
    tertiaryContainer    = SonicTertiaryContainer,
    onTertiaryContainer  = SonicOnTertiaryContainer,

    error                = SonicError,
    onError              = SonicOnError,
    errorContainer       = SonicErrorContainer,

    background           = SonicBackground,
    onBackground         = SonicOnSurface,
    surface              = SonicSurface,
    onSurface            = SonicOnSurface,
    onSurfaceVariant     = SonicOnSurfaceVariant,
    surfaceVariant       = SonicSurfaceContainerHighest,
    surfaceContainer     = SonicSurfaceContainer,
    surfaceContainerHigh = SonicSurfaceContainerHigh,
    surfaceContainerLow  = SonicSurfaceContainerLow,

    outline              = SonicOutline,
    outlineVariant       = SonicOutlineVariant,
)

@Composable
fun SonicSplitTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = SonicColorScheme,
        typography  = SonicTypography,
        content     = content
    )
}
