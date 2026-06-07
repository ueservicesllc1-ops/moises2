package com.juditht.ai.ui.results

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.juditht.ai.data.model.StemItem
import com.juditht.ai.ui.components.*
import com.juditht.ai.ui.theme.*

@Composable
fun ResultsScreen(
    taskId: String,
    onBack: () -> Unit,
    onNavigateToPaywall: () -> Unit,
    viewModel: ResultsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    if (state.showPreviewLock) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissPreviewLock() },
            title = {
                Text(
                    text = "Límite de Vista Previa",
                    style = MaterialTheme.typography.titleLarge,
                    color = SonicOnSurface
                )
            },
            text = {
                Text(
                    text = "Has alcanzado los 40 segundos de la vista previa gratuita. Actualiza a un plan Premium para escuchar el audio completo y poder descargarlo.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SonicOnSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.dismissPreviewLock()
                        onNavigateToPaywall()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SonicPrimary)
                ) {
                    Text("Hacerse Premium", color = SonicOnPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissPreviewLock() }) {
                    Text("Cerrar", color = SonicOutline)
                }
            },
            containerColor = SonicSurfaceContainerHigh,
            shape = RoundedCornerShape(16.dp)
        )
    }

    if (state.showTokensLow) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissTokensLow() },
            title = {
                Text(
                    text = "⚡ Tokens Insuficientes",
                    style = MaterialTheme.typography.titleLarge,
                    color = SonicOnSurface
                )
            },
            text = {
                Text(
                    text = "Necesitas al menos 20 tokens para descargar una pista. Tu balance actual es de ${state.tokenBalance} tokens. Actualiza tu plan para obtener más tokens.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SonicOnSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.dismissTokensLow()
                        onNavigateToPaywall()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SonicPrimary)
                ) {
                    Text("Mejorar Plan", color = SonicOnPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissTokensLow() }) {
                    Text("Cerrar", color = SonicOutline)
                }
            },
            containerColor = SonicSurfaceContainerHigh,
            shape = RoundedCornerShape(16.dp)
        )
    }

    // Initialize ExoPlayer and start polling
    LaunchedEffect(taskId) {
        viewModel.initPlayer()
        viewModel.startPolling(taskId)
    }

    Scaffold(
        containerColor = SonicBackground,
        topBar = {
            SonicTopBar(title = "Judit", onBack = onBack)
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Animated background gradient
            val infiniteTransition = rememberInfiniteTransition()
            val alpha by infiniteTransition.animateFloat(
                initialValue = 0.03f, targetValue = 0.08f,
                animationSpec = infiniteRepeatable(tween(2000), RepeatMode.Reverse)
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(SonicSecondaryContainer.copy(alpha = alpha), Color.Transparent),
                            radius = 600f
                        )
                    )
            )

            AnimatedContent(
                targetState = state.status,
                transitionSpec = { fadeIn(tween(400)) togetherWith fadeOut(tween(400)) }
            ) { status ->
                when (status) {
                    "completed" -> CompletedView(state = state, viewModel = viewModel)
                    "failed"    -> FailedView(error = state.error ?: "Processing failed", onBack = onBack)
                    else        -> ProcessingView(state = state)
                }
            }
        }
    }
}

// ── Processing View ────────────────────────────────────────────────────────────

@Composable
private fun ProcessingView(state: ResultsState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Animated waveform
        WaveformPlaceholder(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
        )

        Spacer(Modifier.height(40.dp))

        // Progress ring
        Box(contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                progress = { state.progress / 100f },
                modifier = Modifier.size(120.dp),
                color    = SonicPrimary,
                strokeWidth = 6.dp,
                trackColor  = SonicSurfaceContainerHigh
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text  = "${state.progress}%",
                    style = MaterialTheme.typography.displaySmall,
                    color = SonicPrimary
                )
                if (state.status == "queued") {
                    Text(
                        text  = "#${state.queuePosition}",
                        style = MaterialTheme.typography.bodySmall,
                        color = SonicSecondary
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        Text(
            text  = state.progressMessage,
            style = MaterialTheme.typography.bodyLarge,
            color = SonicOnSurfaceVariant,
            textAlign = TextAlign.Center
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text  = "Please keep the app open while processing.",
            style = MaterialTheme.typography.bodySmall,
            color = SonicOutline,
            textAlign = TextAlign.Center
        )

        Spacer(Modifier.height(40.dp))

        // Processing steps
        ProcessingSteps(progress = state.progress)
    }
}

@Composable
private fun ProcessingSteps(progress: Int) {
    val steps = listOf(
        Triple("Uploading audio", 0, 30),
        Triple("AI processing (GPU)", 30, 80),
        Triple("Preparing stems", 80, 95),
        Triple("Ready!", 95, 100),
    )
    GlassCard(modifier = Modifier.fillMaxWidth(), cornerRadius = 16.dp) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            steps.forEach { (label, from, to) ->
                val isDone    = progress >= to
                val isActive  = progress in from until to
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(RoundedCornerShape(50))
                            .background(
                                when {
                                    isDone   -> SonicTertiary.copy(alpha = 0.2f)
                                    isActive -> SonicPrimary.copy(alpha = 0.2f)
                                    else     -> SonicSurfaceContainerHigh
                                }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        if (isDone) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = SonicTertiary, modifier = Modifier.size(14.dp))
                        } else if (isActive) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), color = SonicPrimary, strokeWidth = 2.dp)
                        }
                    }
                    Text(
                        text  = label,
                        style = MaterialTheme.typography.bodyMedium,
                        color = when {
                            isDone   -> SonicTertiary
                            isActive -> SonicPrimary
                            else     -> SonicOutline
                        }
                    )
                }
            }
        }
    }
}

// ── Completed View ─────────────────────────────────────────────────────────────

@Composable
private fun CompletedView(state: ResultsState, viewModel: ResultsViewModel) {
    val scrollState = rememberScrollState()
    var downloadStemTarget by remember { mutableStateOf<StemItem?>(null) }

    if (downloadStemTarget != null) {
        val target = downloadStemTarget!!
        AlertDialog(
            onDismissRequest = { downloadStemTarget = null },
            title = {
                Text(
                    text = "Exportar Pista",
                    style = MaterialTheme.typography.titleMedium,
                    color = SonicOnSurface
                )
            },
            text = {
                Text(
                    text = "Selecciona el formato de audio para guardar \"${target.displayName}\":",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SonicOnSurfaceVariant
                )
            },
            confirmButton = {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = {
                            viewModel.downloadStem(target.name, target.url, "mp3")
                            downloadStemTarget = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = SonicPrimary),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("MP3", color = SonicOnPrimary, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                    }

                    Button(
                        onClick = {
                            viewModel.downloadStem(target.name, target.url, "wav")
                            downloadStemTarget = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = SonicSecondary),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("WAV", color = Color.White, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { downloadStemTarget = null },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Cancelar", color = SonicOutline, textAlign = TextAlign.Center)
                }
            },
            containerColor = SonicSurfaceContainerHigh,
            shape = RoundedCornerShape(16.dp)
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        // Metadata card
        MetadataCard(bpm = state.bpm, key = state.key, duration = state.duration)
        Spacer(Modifier.height(16.dp))

        // Master Transport Card
        MasterTransportCard(
            isPlaying = state.isPlayingAll,
            positionMs = state.playbackPositionMs,
            durationMs = if (state.playbackDurationMs > 0) state.playbackDurationMs else ((state.duration ?: 0f) * 1000).toLong(),
            onPlayPause = { viewModel.togglePlayPauseAll() },
            onSeek = { viewModel.seekAllTo(it) }
        )

        Spacer(Modifier.height(12.dp))
        SectionLabel("STUDIO MIXER DECK")
        Spacer(Modifier.height(8.dp))

        // Horizontally scrollable mixer console
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(bottom = 24.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .horizontalScroll(scrollState),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val hasSolo = state.solos.values.any { it }

                state.stems.forEach { stem ->
                    val volume = state.volumes[stem.name] ?: 1f
                    val isMuted = state.mutes[stem.name] ?: false
                    val isSoloed = state.solos[stem.name] ?: false
                    val downloadStatus = state.downloadStatuses[stem.name] ?: DownloadStatus.Idle
                    val isSounding = state.isPlayingAll && !isMuted && (!hasSolo || isSoloed) && volume > 0f

                    ChannelStrip(
                        stem = stem,
                        volume = volume,
                        isMuted = isMuted,
                        isSoloed = isSoloed,
                        isSounding = isSounding,
                        downloadStatus = downloadStatus,
                        onVolumeChange = { viewModel.setStemVolume(stem.name, it) },
                        onMuteToggle = { viewModel.toggleStemMute(stem.name) },
                        onSoloToggle = { viewModel.toggleStemSolo(stem.name) },
                        onDownload = { downloadStemTarget = stem }
                    )
                }

                val isMasterSounding = state.isPlayingAll && state.masterVolume > 0f && state.stems.any { stem ->
                    val vol = state.volumes[stem.name] ?: 1f
                    val m = state.mutes[stem.name] ?: false
                    val s = state.solos[stem.name] ?: false
                    !m && (!hasSolo || s) && vol > 0f
                }

                // Master Channel Strip
                MasterChannelStrip(
                    isPlaying = state.isPlayingAll,
                    isSounding = isMasterSounding,
                    masterVolume = state.masterVolume,
                    onMasterVolumeChange = { viewModel.setMasterVolume(it) }
                )
            }
        }
    }
}

@Composable
private fun MasterTransportCard(
    isPlaying: Boolean,
    positionMs: Long,
    durationMs: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit
) {
    GlassCard(
        modifier = Modifier.fillMaxWidth(),
        cornerRadius = 16.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Play/Pause button
                IconButton(
                    onClick = onPlayPause,
                    modifier = Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(50))
                        .background(SonicPrimaryContainer.copy(alpha = 0.25f))
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = SonicPrimary,
                        modifier = Modifier.size(28.dp)
                    )
                }

                // Time tracking info
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Master Mix",
                        style = MaterialTheme.typography.titleMedium,
                        color = SonicOnSurface
                    )
                    Text(
                        text = "${formatTime(positionMs)} / ${formatTime(durationMs)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = SonicOnSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Seek Bar
            Slider(
                value = if (durationMs > 0) positionMs.toFloat() else 0f,
                onValueChange = { onSeek(it.toLong()) },
                valueRange = 0f..(if (durationMs > 0) durationMs.toFloat() else 1f),
                colors = SliderDefaults.colors(
                    thumbColor = SonicPrimary,
                    activeTrackColor = SonicPrimary,
                    inactiveTrackColor = SonicSurfaceContainerHigh
                ),
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun ChannelStrip(
    stem: StemItem,
    volume: Float,
    isMuted: Boolean,
    isSoloed: Boolean,
    isSounding: Boolean,
    downloadStatus: DownloadStatus,
    onVolumeChange: (Float) -> Unit,
    onMuteToggle: () -> Unit,
    onSoloToggle: () -> Unit,
    onDownload: () -> Unit
) {
    val accentColor = when {
        stem.name.startsWith("vocal")  -> SonicSecondary
        stem.name.startsWith("drum")   -> SonicPrimary
        stem.name.startsWith("bass")   -> SonicTertiary
        stem.name.startsWith("guitar") -> Color(0xFFFFA726)
        stem.name.startsWith("piano")  -> Color(0xFF26C6DA)
        else                           -> SonicPrimaryContainer
    }

    // LED VU animation
    val infiniteTransition = rememberInfiniteTransition(label = "LEDGlow")
    val glowAlpha by if (isSounding) {
        infiniteTransition.animateFloat(
            initialValue = 0.4f,
            targetValue = 1.0f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 150, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse
            ),
            label = "VU"
        )
    } else {
        remember { mutableStateOf(0.0f) }
    }

    val ledColor = if (isSounding) {
        Color(0xFF39FF14).copy(alpha = glowAlpha) // Neon bright green
    } else {
        Color(0xFF1E351A) // Dark dim green
    }

    GlassCard(
        modifier = Modifier
            .width(110.dp)
            .fillMaxHeight(),
        cornerRadius = 16.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(vertical = 12.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // LED VU Dot & Icon
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(ledColor)
                        .border(
                            BorderStroke(
                                1.dp,
                                if (isSounding) Color(0xFF39FF14) else Color(0xFF374151)
                            ),
                            RoundedCornerShape(50)
                        )
                )
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(accentColor.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(stem.emoji, fontSize = 18.sp)
                }
            }

            // Title
            Text(
                text = stem.displayName,
                style = MaterialTheme.typography.bodySmall,
                color = SonicOnSurface,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 4.dp),
                maxLines = 1
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Fader (Vertical Volume Slider + Ticks)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 4.dp)
            ) {
                // Left ticks
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(6.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                    horizontalAlignment = Alignment.End
                ) {
                    for (i in 0..10) {
                        Box(
                            modifier = Modifier
                                .width(if (i % 5 == 0) 8.dp else 4.dp)
                                .height(1.dp)
                                .background(SonicOutline.copy(alpha = 0.35f))
                        )
                    }
                }

                // Rotated Volume Slider inside BoxWithConstraints using requiredWidth
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Slider(
                        value = volume,
                        onValueChange = onVolumeChange,
                        valueRange = 0f..1f,
                        modifier = Modifier
                            .graphicsLayer { rotationZ = -90f }
                            .requiredWidth(maxHeight)
                            .height(48.dp),
                        colors = SliderDefaults.colors(
                            thumbColor = if (isMuted) SonicOutline else accentColor,
                            activeTrackColor = if (isMuted) SonicOutline.copy(alpha = 0.2f) else accentColor.copy(alpha = 0.4f),
                            inactiveTrackColor = SonicSurfaceContainerHigh
                        )
                    )
                }

                // Right ticks
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(6.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                    horizontalAlignment = Alignment.Start
                ) {
                    for (i in 0..10) {
                        Box(
                            modifier = Modifier
                                .width(if (i % 5 == 0) 8.dp else 4.dp)
                                .height(1.dp)
                                .background(SonicOutline.copy(alpha = 0.35f))
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Value text
            Text(
                text = "${(volume * 100).toInt()}",
                style = MaterialTheme.typography.labelSmall,
                color = SonicOutline
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Mute / Solo Buttons
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mute (M)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isMuted) Color(0xFFE53935) else SonicSurfaceContainerHigh)
                        .clickable { onMuteToggle() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "M",
                        color = if (isMuted) Color.White else SonicOutline,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                }

                // Solo (S)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSoloed) Color(0xFFFDD835) else SonicSurfaceContainerHigh)
                        .clickable { onSoloToggle() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "S",
                        color = if (isSoloed) Color.Black else SonicOutline,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Download Icon / Retry / Loader
            Box(
                modifier = Modifier.height(32.dp),
                contentAlignment = Alignment.Center
            ) {
                when (downloadStatus) {
                    is DownloadStatus.Done -> {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = "Downloaded",
                            tint = SonicTertiary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    is DownloadStatus.InProgress -> {
                        CircularProgressIndicator(
                            progress = { downloadStatus.percent / 100f },
                            modifier = Modifier.size(20.dp),
                            color = SonicPrimary,
                            strokeWidth = 2.dp
                        )
                    }
                    is DownloadStatus.Failed -> {
                        IconButton(
                            onClick = onDownload,
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = "Failed, Retry",
                                tint = SonicError,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    else -> {
                        IconButton(
                            onClick = onDownload,
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Download,
                                contentDescription = "Download",
                                tint = SonicOnSurface,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MasterChannelStrip(
    isPlaying: Boolean,
    isSounding: Boolean,
    masterVolume: Float,
    onMasterVolumeChange: (Float) -> Unit
) {
    // LED VU animation
    val infiniteTransition = rememberInfiniteTransition(label = "MasterLEDGlow")
    val glowAlpha by if (isSounding) {
        infiniteTransition.animateFloat(
            initialValue = 0.4f,
            targetValue = 1.0f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 150, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse
            ),
            label = "MasterVU"
        )
    } else {
        remember { mutableStateOf(0.0f) }
    }

    val ledColor = if (isSounding) {
        Color(0xFF00FFCC).copy(alpha = glowAlpha) // Neon cyan for Master!
    } else {
        Color(0xFF0F322D) // Dark dim cyan
    }

    GlassCard(
        modifier = Modifier
            .width(80.dp)
            .fillMaxHeight()
            .border(1.dp, SonicPrimary.copy(alpha = 0.3f), RoundedCornerShape(16.dp)),
        cornerRadius = 16.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // LED VU Dot & Icon
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(ledColor)
                        .border(
                            BorderStroke(
                                1.dp,
                                if (isSounding) Color(0xFF00FFCC) else Color(0xFF374151)
                            ),
                            RoundedCornerShape(50)
                        )
                )
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(SonicPrimaryContainer.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Master",
                        tint = SonicPrimary,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Text(
                text = "MASTER",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                color = SonicPrimary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Master Volume Fader (adjustable)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 8.dp)
            ) {
                // Left Ticks
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(6.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                    horizontalAlignment = Alignment.End
                ) {
                    for (i in 0..10) {
                        Box(
                            modifier = Modifier
                                .width(if (i % 5 == 0) 8.dp else 4.dp)
                                .height(1.dp)
                                .background(SonicOutline.copy(alpha = 0.35f))
                        )
                    }
                }

                // Rotated Slider
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Slider(
                        value = masterVolume,
                        onValueChange = onMasterVolumeChange,
                        valueRange = 0f..1f,
                        enabled = true,
                        modifier = Modifier
                            .graphicsLayer { rotationZ = -90f }
                            .requiredWidth(maxHeight)
                            .height(48.dp),
                        colors = SliderDefaults.colors(
                            thumbColor = SonicTertiary,
                            activeTrackColor = SonicTertiary.copy(alpha = 0.4f),
                            inactiveTrackColor = SonicSurfaceContainerHigh
                        )
                    )
                }

                // Right Ticks
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(6.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                    horizontalAlignment = Alignment.Start
                ) {
                    for (i in 0..10) {
                        Box(
                            modifier = Modifier
                                .width(if (i % 5 == 0) 8.dp else 4.dp)
                                .height(1.dp)
                                .background(SonicOutline.copy(alpha = 0.35f))
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "${(masterVolume * 100).toInt()}",
                style = MaterialTheme.typography.labelSmall,
                color = if (isPlaying) SonicTertiary else SonicOutline
            )

            Spacer(modifier = Modifier.height(38.dp))
        }
    }
}

private fun formatTime(ms: Long): String {
    val totalSeconds = ms / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}

@Composable
private fun MetadataCard(bpm: Float?, key: String?, duration: Float?) {
    GlassCard(modifier = Modifier.fillMaxWidth(), cornerRadius = 16.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            MetaStat(label = "BPM", value = bpm?.toInt()?.toString() ?: "—", accent = SonicPrimary)
            Divider(modifier = Modifier.height(40.dp).width(1.dp), color = GlassWhite10)
            MetaStat(label = "KEY", value = key ?: "—", accent = SonicSecondary)
            Divider(modifier = Modifier.height(40.dp).width(1.dp), color = GlassWhite10)
            if (duration != null) {
                val min = (duration / 60).toInt()
                val sec = (duration % 60).toInt()
                MetaStat(label = "LENGTH", value = "%d:%02d".format(min, sec), accent = SonicTertiary)
            }
        }
    }
}

@Composable
private fun MetaStat(label: String, value: String, accent: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.displaySmall, color = accent)
        Text(label, style = MaterialTheme.typography.labelLarge, color = SonicOnSurfaceVariant)
    }
}

// ── Failed View ────────────────────────────────────────────────────────────────

@Composable
private fun FailedView(error: String, onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("❌", fontSize = 64.sp)
        Spacer(Modifier.height(20.dp))
        Text("Processing Failed", style = MaterialTheme.typography.headlineLarge, color = SonicError)
        Spacer(Modifier.height(8.dp))
        Text(error, style = MaterialTheme.typography.bodyMedium, color = SonicOnSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.height(32.dp))
        SonicPrimaryButton("Go Back", onClick = onBack, modifier = Modifier.width(200.dp))
    }
}
