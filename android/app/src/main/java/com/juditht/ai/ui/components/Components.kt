package com.juditht.ai.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.res.painterResource
import com.juditht.ai.R
import com.juditht.ai.ui.theme.*

/**
 * Glassmorphism card — background rgba(255,255,255,0.03) + subtle border on top/left.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 16.dp,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(GlassWhite03)
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(
                    colors = listOf(GlassWhite10, GlassWhite03),
                ),
                shape = RoundedCornerShape(cornerRadius)
            ),
        content = content
    )
}

/**
 * Primary action button with blue glow.
 */
@Composable
fun SonicPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false
) {
    Button(
        onClick = onClick,
        enabled = enabled && !isLoading,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = SonicPrimaryContainer,
            contentColor   = SonicOnPrimaryContainer,
            disabledContainerColor = SonicSurfaceContainerHigh,
            disabledContentColor   = SonicOutline
        ),
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 0.dp
        )
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = SonicOnPrimaryContainer,
                strokeWidth = 2.dp
            )
        } else {
            Text(
                text  = text,
                style = MaterialTheme.typography.titleLarge
            )
        }
    }
}

/**
 * Ghost / outlined button.
 */
@Composable
fun SonicOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: @Composable (() -> Unit)? = null
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = SonicOnSurface
        ),
        border = ButtonDefaults.outlinedButtonBorder.copy(
            brush = Brush.linearGradient(listOf(GlassWhite10, GlassWhite05))
        )
    ) {
        if (leadingIcon != null) {
            leadingIcon()
            Spacer(Modifier.width(8.dp))
        }
        Text(text = text, style = MaterialTheme.typography.bodyLarge)
    }
}

/**
 * Status chip: Completed / Processing / Failed / Queued
 */
@Composable
fun StatusChip(status: String) {
    val (bgColor, textColor, label) = when (status.lowercase()) {
        "completed" -> Triple(SonicTertiary.copy(alpha = 0.15f), SonicTertiary, "✓ Completed")
        "processing" -> Triple(SonicPrimary.copy(alpha = 0.12f), SonicPrimary, "⟳ Processing")
        "queued"    -> Triple(SonicSecondary.copy(alpha = 0.12f), SonicSecondary, "⏳ Queued")
        "failed"    -> Triple(SonicError.copy(alpha = 0.15f), SonicError, "✗ Failed")
        else        -> Triple(SonicSurfaceContainerHigh, SonicOutline, status)
    }
    Surface(
        shape = RoundedCornerShape(50),
        color = bgColor,
        modifier = Modifier.wrapContentSize()
    ) {
        Text(
            text  = label,
            style = MaterialTheme.typography.labelLarge,
            color = textColor,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}

/**
 * Animated waveform placeholder (simple bars) shown while processing.
 */
@Composable
fun WaveformPlaceholder(modifier: Modifier = Modifier) {
    val barCount = 24
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(barCount) { i ->
            val height = when (i % 4) {
                0 -> 32.dp; 1 -> 20.dp; 2 -> 44.dp; else -> 16.dp
            }
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(height)
                    .clip(RoundedCornerShape(2.dp))
                    .background(
                        Brush.verticalGradient(
                            listOf(SonicPrimaryContainer, SonicSecondaryContainer)
                        )
                    )
            )
        }
    }
}

/**
 * Section label in ALL CAPS with tracking — mimics the label-caps design token.
 */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text     = text.uppercase(),
        style    = MaterialTheme.typography.labelLarge,
        color    = SonicOnSurfaceVariant,
        modifier = modifier
    )
}

/**
 * Sonic Neural top app bar — muestra el logo de Judit en lugar de texto
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SonicTopBar(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {}
) {
    TopAppBar(
        title = {
            androidx.compose.foundation.Image(
                painter = painterResource(id = R.drawable.logo),
                contentDescription = "Judit",
                modifier = Modifier
                    .height(32.dp)
                    .widthIn(max = 160.dp)
            )
        },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector    = Icons.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint           = SonicPrimary
                    )
                }
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor         = SonicBackground.copy(alpha = 0.7f),
            titleContentColor      = SonicPrimary,
            navigationIconContentColor = SonicPrimary
        )
    )
}

/**
 * Shared bottom navigation bar for main tabs: Library, Upload, and Profile.
 */
@Composable
fun SonicBottomNav(
    activeTab: Int,
    onLibraryClick: () -> Unit,
    onUploadClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    NavigationBar(
        containerColor = SonicSurface.copy(alpha = 0.6f),
        tonalElevation = 0.dp
    ) {
        NavigationBarItem(
            selected = activeTab == 0,
            onClick = onLibraryClick,
            icon = { Icon(Icons.Default.LibraryMusic, contentDescription = "Librería") },
            label = { Text("Librería") },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor       = SonicPrimary,
                selectedTextColor       = SonicPrimary,
                unselectedIconColor     = SonicOnSurfaceVariant,
                unselectedTextColor     = SonicOnSurfaceVariant,
                indicatorColor          = SonicPrimary.copy(alpha = 0.15f)
            )
        )
        NavigationBarItem(
            selected = activeTab == 1,
            onClick = onUploadClick,
            icon = { Icon(Icons.Default.CloudUpload, contentDescription = "Subir") },
            label = { Text("Subir") },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor       = SonicPrimary,
                selectedTextColor       = SonicPrimary,
                unselectedIconColor     = SonicOnSurfaceVariant,
                unselectedTextColor     = SonicOnSurfaceVariant,
                indicatorColor          = SonicPrimary.copy(alpha = 0.15f)
            )
        )
        NavigationBarItem(
            selected = activeTab == 2,
            onClick = onProfileClick,
            icon = { Icon(Icons.Default.Person, contentDescription = "Perfil") },
            label = { Text("Perfil") },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor       = SonicPrimary,
                selectedTextColor       = SonicPrimary,
                unselectedIconColor     = SonicOnSurfaceVariant,
                unselectedTextColor     = SonicOnSurfaceVariant,
                indicatorColor          = SonicPrimary.copy(alpha = 0.15f)
            )
        )
    }
}
