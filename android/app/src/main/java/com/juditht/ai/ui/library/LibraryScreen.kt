package com.juditht.ai.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.juditht.ai.data.model.SeparationJobEntity
import com.juditht.ai.ui.auth.AuthViewModel
import com.juditht.ai.ui.components.*
import com.juditht.ai.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun LibraryScreen(
    onUploadClick: () -> Unit,
    onProfileClick: () -> Unit,
    onJobClick: (String) -> Unit,
    viewModel: LibraryViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var jobToDelete by remember { mutableStateOf<SeparationJobEntity?>(null) }

    if (jobToDelete != null) {
        val job = jobToDelete!!
        AlertDialog(
            onDismissRequest = { jobToDelete = null },
            title = {
                Text(
                    text = "Eliminar canción",
                    style = MaterialTheme.typography.titleLarge,
                    color = SonicOnSurface
                )
            },
            text = {
                Text(
                    text = "¿Estás seguro de que deseas eliminar la canción \"${job.originalFilename.substringBeforeLast('.')}\"? Esta acción no se puede deshacer.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SonicOnSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteJob(job.taskId)
                        jobToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F)) // Safe red color
                ) {
                    Text("Eliminar", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { jobToDelete = null }) {
                    Text("Cancelar", color = SonicOutline)
                }
            },
            containerColor = SonicSurfaceContainerHigh,
            shape = RoundedCornerShape(16.dp)
        )
    }

    Scaffold(
        containerColor = SonicBackground,
        topBar = {
            SonicTopBar(
                title = "Judit",
                actions = {
                    IconButton(onClick = { authViewModel.signOut() }) {
                        Icon(Icons.Default.Logout, contentDescription = "Sign Out", tint = SonicOnSurfaceVariant)
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onUploadClick,
                shape = RoundedCornerShape(16.dp),
                containerColor = SonicPrimary,
                contentColor = SonicOnPrimary,
                modifier = Modifier.size(60.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = "New Separation", modifier = Modifier.size(28.dp))
            }
        },
        bottomBar = {
            SonicBottomNav(activeTab = 0, onLibraryClick = {}, onUploadClick = onUploadClick, onProfileClick = onProfileClick)
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp)
        ) {
            Spacer(Modifier.height(12.dp))

            // ── Search ────────────────────────────────────────────────────────
            GlassCard(modifier = Modifier.fillMaxWidth(), cornerRadius = 14.dp) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Search, contentDescription = null, tint = SonicOutline)
                    Spacer(Modifier.width(8.dp))
                    TextField(
                        value = state.searchQuery,
                        onValueChange = viewModel::setSearchQuery,
                        placeholder = {
                            Text("Search your library...", color = SonicOutline, style = MaterialTheme.typography.bodyLarge)
                        },
                        singleLine = true,
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor   = androidx.compose.ui.graphics.Color.Transparent,
                            unfocusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                            focusedIndicatorColor   = androidx.compose.ui.graphics.Color.Transparent,
                            unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                            cursorColor             = SonicPrimary,
                            focusedTextColor        = SonicOnSurface,
                            unfocusedTextColor      = SonicOnSurface,
                        ),
                        modifier = Modifier.weight(1f),
                        textStyle = MaterialTheme.typography.bodyLarge
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // ── Filter Chips ──────────────────────────────────────────────────
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(LibraryFilter.values()) { filter ->
                    val isActive = state.filter == filter
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = if (isActive) SonicPrimary.copy(alpha = 0.15f) else SonicSurfaceContainerHigh,
                        border = if (isActive) BorderStroke(1.dp, SonicPrimary.copy(alpha = 0.4f)) else null,
                        modifier = Modifier.clickable { viewModel.setFilter(filter) }
                    ) {
                        Text(
                            text = filter.label,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (isActive) SonicPrimary else SonicOnSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // ── Jobs List ─────────────────────────────────────────────────────
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Recent Projects", style = MaterialTheme.typography.titleLarge, color = SonicOnSurface)
                Spacer(Modifier.width(8.dp))
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = SonicPrimary.copy(alpha = 0.1f)
                ) {
                    Text(
                        text = "${state.jobs.size} Songs",
                        style = MaterialTheme.typography.labelSmall,
                        color = SonicPrimary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            if (state.jobs.isEmpty()) {
                EmptyLibraryState(onUploadClick = onUploadClick)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.jobs, key = { it.taskId }) { job ->
                        JobCard(
                            job = job,
                            onClick = { onJobClick(job.taskId) },
                            onDelete = { jobToDelete = job }
                        )
                    }
                    item { Spacer(Modifier.height(80.dp)) }
                }
            }
        }
    }
}

@Composable
private fun JobCard(
    job: SeparationJobEntity,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    GlassCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Album art placeholder
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(SonicPrimaryContainer.copy(alpha = 0.3f), SonicSecondaryContainer.copy(alpha = 0.3f))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = when {
                        job.separationType.contains("vocal") -> "🎤"
                        else -> "🎵"
                    },
                    fontSize = 28.sp
                )
                if (job.status == "processing" || job.status == "queued") {
                    CircularProgressIndicator(
                        modifier = Modifier.size(56.dp),
                        color = SonicPrimary,
                        strokeWidth = 2.dp,
                        progress = { job.progress / 100f }
                    )
                }
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = job.originalFilename.substringBeforeLast('.'),
                    style = MaterialTheme.typography.titleMedium,
                    color = SonicOnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = when (job.separationType) {
                        "vocals-instrumental" -> "Vocal / Instrumental"
                        else -> "Full Multitrack"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = SonicOnSurfaceVariant
                )
                Spacer(Modifier.height(6.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    StatusChip(status = job.status)
                    if (job.bpm != null) {
                        Text("${job.bpm.toInt()} BPM", style = MaterialTheme.typography.labelSmall, color = SonicOutline)
                    }
                }
            }

            // Right side date and delete action
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val sdf = SimpleDateFormat("MMM d", Locale.getDefault())
                Text(
                    text = sdf.format(Date(job.createdAt)),
                    style = MaterialTheme.typography.labelSmall,
                    color = SonicOutline
                )
                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete",
                        tint = SonicOutline.copy(alpha = 0.8f),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyLibraryState(onUploadClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("🎵", fontSize = 64.sp)
        Text("No projects yet", style = MaterialTheme.typography.titleLarge, color = SonicOnSurface)
        Text(
            "Upload your first audio file to start separating stems.",
            style = MaterialTheme.typography.bodyMedium,
            color = SonicOnSurfaceVariant,
            modifier = Modifier.padding(horizontal = 32.dp)
        )
        SonicPrimaryButton(
            text = "Upload Audio",
            onClick = onUploadClick,
            modifier = Modifier.width(200.dp)
        )
    }
}


