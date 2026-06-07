package com.juditht.ai.ui.upload

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.juditht.ai.ui.auth.AuthViewModel
import com.juditht.ai.ui.components.*
import com.juditht.ai.ui.theme.*

@Composable
fun UploadScreen(
    onBack: () -> Unit,
    onJobStarted: (String) -> Unit,
    viewModel: UploadViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val state   by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Navegar cuando el trabajo empieza
    LaunchedEffect(state.taskId) {
        state.taskId?.let { id ->
            viewModel.clearTaskId()
            onJobStarted(id)
        }
    }

    // Selector de archivos de audio
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            val cursor = context.contentResolver.query(uri, null, null, null, null)
            val name = cursor?.use {
                val idx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                it.moveToFirst()
                if (idx >= 0) it.getString(idx) else "audio_file"
            } ?: "audio_file"
            cursor?.close()
            viewModel.onFileSelected(uri, name)
        }
    }

    Scaffold(
        containerColor = SonicBackground,
        topBar = {
            SonicTopBar(title = "Judit", onBack = onBack)
        },
        bottomBar = {
            SonicUploadBottomNav(onLibraryClick = onBack)
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Spacer(Modifier.height(8.dp))

            // ── Zona de subida de archivo ──────────────────────────────────────
            val hasFile = state.selectedFileName != null
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(GlassWhite03)
                    .border(
                        width = 2.dp,
                        brush = Brush.linearGradient(
                            if (hasFile) listOf(SonicPrimary, SonicPrimaryContainer)
                            else listOf(SonicPrimary.copy(alpha = 0.2f), SonicSecondaryContainer.copy(alpha = 0.2f))
                        ),
                        shape = RoundedCornerShape(16.dp)
                    )
                    .clickable { filePicker.launch("audio/*") },
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(RoundedCornerShape(50))
                            .background(SonicPrimary.copy(alpha = 0.1f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (hasFile) Icons.Default.AudioFile else Icons.Default.CloudUpload,
                            contentDescription = null,
                            tint = SonicPrimary,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                    if (hasFile) {
                        Text(
                            text  = state.selectedFileName ?: "",
                            style = MaterialTheme.typography.titleMedium,
                            color = SonicPrimary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )
                        Text("Toca para cambiar el archivo", style = MaterialTheme.typography.bodySmall, color = SonicOnSurfaceVariant)
                    } else {
                        Text("Subir Archivo", style = MaterialTheme.typography.titleLarge, color = SonicPrimary)
                        Text(
                            "Toca para explorar (MP3, WAV, FLAC, M4A)",
                            style = MaterialTheme.typography.bodyMedium,
                            color = SonicOnSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 24.dp)
                        )
                    }
                }
            }

            // ── Selector de modo de separación ────────────────────────────────
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionLabel("MODO DE SEPARACIÓN")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SeparationMode.values().forEach { mode ->
                        val selected = state.mode == mode
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (selected) SonicPrimaryContainer.copy(alpha = 0.3f) else GlassWhite03,
                            modifier = Modifier
                                .weight(1f)
                                .border(
                                    width = 1.5.dp,
                                    color = if (selected) SonicPrimary.copy(alpha = 0.6f) else GlassWhite10,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable { viewModel.onModeChanged(mode) }
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(mode.emoji, fontSize = 22.sp)
                                Text(
                                    text = mode.displayName,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (selected) SonicPrimary else SonicOnSurface,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }
                }

                // Descripción del modo
                Text(
                    text = state.mode.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = SonicOnSurfaceVariant
                )
            }

            // ── Selector de instrumentos (solo en modo Personalizado) ──────────
            AnimatedVisibility(visible = state.mode == SeparationMode.Custom) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("INSTRUMENTOS A SEPARAR")

                    val stemOptions = listOf(
                        Triple("vocals", "🎤", "Voz"),
                        Triple("drums",  "🥁", "Batería"),
                        Triple("bass",   "🎸", "Bajo"),
                        Triple("guitar", "🎸", "Guitarra"),
                        Triple("piano",  "🎹", "Piano"),
                        Triple("other",  "🎶", "Otros")
                    )

                    // Grid de 3 columnas
                    val rows = stemOptions.chunked(3)
                    rows.forEach { row ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            row.forEach { (key, emoji, label) ->
                                val isSelected = when (key) {
                                    "vocals" -> state.stems.vocals
                                    "drums"  -> state.stems.drums
                                    "bass"   -> state.stems.bass
                                    "guitar" -> state.stems.guitar
                                    "piano"  -> state.stems.piano
                                    "other"  -> state.stems.other
                                    else -> false
                                }
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (isSelected) SonicPrimary.copy(alpha = 0.15f) else GlassWhite03,
                                    modifier = Modifier
                                        .weight(1f)
                                        .border(
                                            width = 1.5.dp,
                                            color = if (isSelected) SonicPrimary.copy(alpha = 0.7f) else GlassWhite10,
                                            shape = RoundedCornerShape(12.dp)
                                        )
                                        .clickable { viewModel.onStemToggled(key) }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 12.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(emoji, fontSize = 24.sp)
                                        Text(
                                            text = label,
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (isSelected) SonicPrimary else SonicOnSurface
                                        )
                                        if (isSelected) {
                                            Box(
                                                modifier = Modifier
                                                    .size(6.dp)
                                                    .clip(RoundedCornerShape(50))
                                                    .background(SonicPrimary)
                                            )
                                        }
                                    }
                                }
                            }
                            // Rellenar si la fila tiene menos de 3
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }

            // ── Calidad de procesamiento ───────────────────────────────────────
            GlassCard(modifier = Modifier.fillMaxWidth(), cornerRadius = 16.dp) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Calidad de Procesamiento", style = MaterialTheme.typography.titleMedium, color = SonicOnSurface)
                        Text("Motor neuronal de alta fidelidad", style = MaterialTheme.typography.bodySmall, color = SonicOnSurfaceVariant)
                    }
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(SonicSurfaceContainerHighest)
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        listOf(false to "Normal", true to "HiFi").forEach { (isHifi, label) ->
                            val active = state.hiFi == isHifi
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (active) SonicPrimaryContainer else androidx.compose.ui.graphics.Color.Transparent,
                                modifier = Modifier.clickable { viewModel.onHiFiToggle(isHifi) }
                            ) {
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = if (active) SonicOnPrimaryContainer else SonicOnSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                                )
                            }
                        }
                    }
                }
            }

            // ── Error ─────────────────────────────────────────────────────────
            if (state.error != null) {
                Text(state.error!!, color = SonicError, style = MaterialTheme.typography.bodyMedium)
            }

            // ── Botón de inicio ───────────────────────────────────────────────
            val canStart = state.selectedUri != null &&
                (state.mode != SeparationMode.Custom || state.stems.hasAny())
            SonicPrimaryButton(
                text = "⚡ Iniciar Separación con IA",
                isLoading = state.isUploading,
                enabled = canStart,
                onClick = { authViewModel.state.value.currentUser?.uid?.let { viewModel.startSeparation(it) } },
                modifier = Modifier.fillMaxWidth().height(60.dp)
            )
            if (state.mode == SeparationMode.Custom && !state.stems.hasAny()) {
                Text(
                    "Selecciona al menos un instrumento",
                    style = MaterialTheme.typography.bodySmall,
                    color = SonicOutline,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            }

            Spacer(Modifier.height(80.dp))
        }
    }
}

@Composable
private fun SonicUploadBottomNav(onLibraryClick: () -> Unit) {
    NavigationBar(
        containerColor = SonicSurface.copy(alpha = 0.6f),
        tonalElevation = 0.dp
    ) {
        NavigationBarItem(
            selected = false,
            onClick  = onLibraryClick,
            icon     = { Icon(Icons.Default.LibraryMusic, contentDescription = "Librería") },
            label    = { Text("Librería") },
            colors   = NavigationBarItemDefaults.colors(
                unselectedIconColor = SonicOnSurfaceVariant,
                unselectedTextColor = SonicOnSurfaceVariant,
                indicatorColor      = SonicPrimary.copy(alpha = 0.15f)
            )
        )
        NavigationBarItem(
            selected = true,
            onClick  = {},
            icon     = { Icon(Icons.Default.CloudUpload, contentDescription = "Subir") },
            label    = { Text("Subir") },
            colors   = NavigationBarItemDefaults.colors(
                selectedIconColor   = SonicPrimary,
                selectedTextColor   = SonicPrimary,
                indicatorColor      = SonicPrimary.copy(alpha = 0.15f)
            )
        )
    }
}
