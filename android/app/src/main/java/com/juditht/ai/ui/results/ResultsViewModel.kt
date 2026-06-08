package com.juditht.ai.ui.results

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.juditht.ai.data.model.StemItem
import com.juditht.ai.data.model.stemEmoji
import com.juditht.ai.data.repository.ApiResult
import com.juditht.ai.data.repository.SeparationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject

data class ResultsState(
    val status: String = "processing",   // "queued" | "processing" | "completed" | "failed"
    val progress: Int = 0,
    val progressMessage: String = "Initializing...",
    val stems: List<StemItem> = emptyList(),
    val bpm: Float? = null,
    val key: String? = null,
    val duration: Float? = null,
    val error: String? = null,
    val queuePosition: Int = 0,
    val isPlayingAll: Boolean = false,
    val currentlyPlayingUrl: String? = null,
    val downloadStatuses: Map<String, DownloadStatus> = emptyMap(),
    val planId: String = "free",
    val tokenBalance: Int = 0,
    val showPreviewLock: Boolean = false,
    val showTokensLow: Boolean = false,    // dialog when tokens insufficient for download
    // Mixer states
    val volumes: Map<String, Float> = emptyMap(), // stemName -> volume (0f to 1f)
    val mutes: Map<String, Boolean> = emptyMap(),   // stemName -> isMuted
    val solos: Map<String, Boolean> = emptyMap(),   // stemName -> isSolo
    val playbackPositionMs: Long = 0L,
    val playbackDurationMs: Long = 0L,
    val masterVolume: Float = 0.8f
)

sealed class DownloadStatus {
    object Idle : DownloadStatus()
    data class InProgress(val percent: Int) : DownloadStatus()
    object Done : DownloadStatus()
    data class Failed(val reason: String) : DownloadStatus()
}

@HiltViewModel
class ResultsViewModel @Inject constructor(
    private val repository: SeparationRepository,
    private val okHttpClient: OkHttpClient,
    private val tokenRepository: com.juditht.ai.data.repository.TokenRepository,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _state = MutableStateFlow(ResultsState())
    val state: StateFlow<ResultsState> = _state.asStateFlow()

    var player: ExoPlayer? = null
        private set

    private val playersMap = mutableMapOf<String, ExoPlayer>()
    private var previewLimiterJob: kotlinx.coroutines.Job? = null
    private var positionTrackerJob: kotlinx.coroutines.Job? = null

    fun initPlayer() {
        if (player == null) {
            player = ExoPlayer.Builder(context).build()
        }
    }

    private fun initPlayersForStems(stemsList: List<StemItem>) {
        stemsList.forEach { stem ->
            if (!playersMap.containsKey(stem.name)) {
                val playerInstance = ExoPlayer.Builder(context).build().apply {
                    setMediaItem(MediaItem.fromUri(stem.url))
                    prepare()
                    repeatMode = ExoPlayer.REPEAT_MODE_OFF
                }
                playersMap[stem.name] = playerInstance
                _state.update { prev ->
                    prev.copy(
                        volumes = prev.volumes + (stem.name to 1f),
                        mutes = prev.mutes + (stem.name to false),
                        solos = prev.solos + (stem.name to false)
                    )
                }
            }
        }
        updateEffectiveVolumes()
    }

    fun setStemVolume(stemName: String, volume: Float) {
        _state.update { prev ->
            prev.copy(volumes = prev.volumes + (stemName to volume))
        }
        updateEffectiveVolumes()
    }

    fun toggleStemMute(stemName: String) {
        _state.update { prev ->
            val current = prev.mutes[stemName] ?: false
            prev.copy(mutes = prev.mutes + (stemName to !current))
        }
        updateEffectiveVolumes()
    }

    fun toggleStemSolo(stemName: String) {
        _state.update { prev ->
            val current = prev.solos[stemName] ?: false
            prev.copy(solos = prev.solos + (stemName to !current))
        }
        updateEffectiveVolumes()
    }

    fun setMasterVolume(volume: Float) {
        _state.update { prev ->
            prev.copy(masterVolume = volume)
        }
        updateEffectiveVolumes()
    }

    private fun updateEffectiveVolumes() {
        val currentState = _state.value
        val hasSolo = currentState.solos.values.any { it }
        val masterVol = currentState.masterVolume
        playersMap.forEach { (name, playerInstance) ->
            val isMuted = currentState.mutes[name] ?: false
            val isSoloed = currentState.solos[name] ?: false
            val baseVolume = currentState.volumes[name] ?: 1f
            val effectiveVolume = when {
                isMuted -> 0f
                hasSolo && !isSoloed -> 0f
                else -> baseVolume
            }
            playerInstance.volume = effectiveVolume * masterVol
        }
    }

    fun seekAllTo(positionMs: Long) {
        playersMap.values.forEach { playerInstance ->
            playerInstance.seekTo(positionMs)
        }
        _state.update { it.copy(playbackPositionMs = positionMs) }
    }

    fun startPolling(taskId: String) {
        val uid = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid
        if (uid != null) {
            viewModelScope.launch {
                val tokenRes = tokenRepository.getTokenStatus(uid)
                if (tokenRes is ApiResult.Success) {
                    _state.update { it.copy(
                        planId = tokenRes.data.planId,
                        tokenBalance = tokenRes.data.tokenBalance
                    ) }
                }
            }
        }

        viewModelScope.launch {
            var consecutiveErrors = 0
            repository.pollUntilComplete(taskId).collect { result ->
                when (result) {
                    is ApiResult.Loading -> {
                        _state.update { it.copy(status = "processing", progress = 5, progressMessage = "Connecting...") }
                    }
                    is ApiResult.Success -> {
                        consecutiveErrors = 0  // reset error counter on success
                        val s = result.data
                        val message = when {
                            s.status == "queued"     -> "In queue (position ${s.queuePosition})..."
                            s.progress < 30          -> "Uploading to AI GPU..."
                            s.progress < 55          -> "Processing with Demucs AI..."
                            s.progress < 85          -> "Extracting stems..."
                            s.progress < 95          -> "Uploading to cloud..."
                            s.status == "completed"  -> "Done! Your stems are ready."
                            else                     -> "Processing... ${s.progress}%"
                        }
                        val stems = s.stems?.entries
                            ?.filter { !it.key.startsWith("click") }  // skip click track
                            ?.map { (name, url) ->
                                StemItem(
                                    name = name,
                                    url  = url,
                                    displayName = stemDisplayName(name),
                                    emoji = stemEmoji(name)
                                )
                            } ?: emptyList()

                        _state.update { prev ->
                            prev.copy(
                                status          = s.status,
                                progress        = s.progress,
                                progressMessage = message,
                                stems           = stems,
                                bpm             = s.bpm,
                                key             = s.key,
                                duration        = s.duration,
                                error           = if (s.status == "failed") (s.error ?: "Processing failed") else null,
                                queuePosition   = s.queuePosition
                            )
                        }

                        if (s.status == "completed" && stems.isNotEmpty()) {
                            initPlayersForStems(stems)
                        }
                    }
                    is ApiResult.Error -> {
                        consecutiveErrors++
                        // Solo marcar como fallido después de 5 errores consecutivos.
                        // Errores transitorios (servidor reiniciando, red temporal) se ignoran.
                        if (consecutiveErrors >= 5) {
                            _state.update { it.copy(error = result.message, status = "failed") }
                        } else {
                            println("[POLL] Error temporal #$consecutiveErrors: ${result.message} — reintentando...")
                        }
                    }
                }
            }
        }
    }

    fun togglePlayPauseAll() {
        val isPlaying = _state.value.isPlayingAll
        if (isPlaying) {
            playersMap.values.forEach { it.pause() }
            previewLimiterJob?.cancel()
            positionTrackerJob?.cancel()
            _state.update { it.copy(isPlayingAll = false) }
        } else {
            val firstPlayer = playersMap.values.firstOrNull()
            val syncPosition = firstPlayer?.currentPosition ?: 0L
            playersMap.values.forEach { playerInstance ->
                playerInstance.seekTo(syncPosition)
                playerInstance.play()
            }
            _state.update { it.copy(isPlayingAll = true) }
            startPreviewLimiterAll()
            startPositionTracker()
        }
    }

    private fun startPreviewLimiterAll() {
        previewLimiterJob?.cancel()
        if (_state.value.planId != "free") return
        previewLimiterJob = viewModelScope.launch {
            val firstPlayer = playersMap.values.firstOrNull() ?: return@launch
            while (_state.value.isPlayingAll) {
                if (firstPlayer.currentPosition >= 40000) {
                    playersMap.values.forEach { it.pause() }
                    playersMap.values.forEach { it.seekTo(40000) }
                    _state.update { it.copy(isPlayingAll = false, showPreviewLock = true, playbackPositionMs = 40000) }
                    break
                }
                kotlinx.coroutines.delay(200)
            }
        }
    }

    private fun startPositionTracker() {
        positionTrackerJob?.cancel()
        positionTrackerJob = viewModelScope.launch {
            val firstPlayer = playersMap.values.firstOrNull() ?: return@launch
            while (_state.value.isPlayingAll) {
                val currentPos = firstPlayer.currentPosition
                val duration = firstPlayer.duration
                _state.update { prev ->
                    prev.copy(
                        playbackPositionMs = currentPos,
                        playbackDurationMs = if (duration > 0) duration else prev.playbackDurationMs
                    )
                }
                kotlinx.coroutines.delay(250)
            }
        }
    }

    fun dismissPreviewLock() {
        _state.update { it.copy(showPreviewLock = false) }
    }

    fun dismissTokensLow() {
        _state.update { it.copy(showTokensLow = false) }
    }

    companion object {
        const val DOWNLOAD_TOKEN_COST = 20
    }

    fun downloadStem(stemName: String, stemUrl: String, format: String) {
        val currentPlan = _state.value.planId
        if (currentPlan == "free" || currentPlan == "starter") {
            _state.update { it.copy(downloadStatuses = it.downloadStatuses + (stemName to DownloadStatus.Failed("Las descargas están limitadas a planes Premium"))) }
            return
        }

        val currentBalance = _state.value.tokenBalance
        if (currentBalance < DOWNLOAD_TOKEN_COST) {
            _state.update { it.copy(showTokensLow = true) }
            return
        }

        viewModelScope.launch {
            // Deduct 20 tokens in Firestore before downloading
            val uid = FirebaseAuth.getInstance().currentUser?.uid
            if (uid != null) {
                try {
                    val db = FirebaseFirestore.getInstance()
                    val batch = db.batch()
                    val userRef = db.collection("users").document(uid)
                    batch.update(userRef, "tokenBalance", FieldValue.increment(-DOWNLOAD_TOKEN_COST.toLong()))
                    
                    val historyRef = userRef.collection("token_history").document()
                    val historyData = hashMapOf(
                        "amount" to -DOWNLOAD_TOKEN_COST,
                        "type" to "download",
                        "description" to "Descarga de pista $stemName ($format)",
                        "timestamp" to FieldValue.serverTimestamp()
                    )
                    batch.set(historyRef, historyData)
                    batch.commit().await()
                    
                    // Reflect new balance in state
                    _state.update { it.copy(tokenBalance = it.tokenBalance - DOWNLOAD_TOKEN_COST) }
                } catch (e: Exception) {
                    // If deduction fails, block the download
                    _state.update { it.copy(downloadStatuses = it.downloadStatuses + (stemName to DownloadStatus.Failed("Error al descontar tokens"))) }
                    return@launch
                }
            }
            _state.update { it.copy(downloadStatuses = it.downloadStatuses + (stemName to DownloadStatus.InProgress(0))) }
            try {
                withContext(Dispatchers.IO) {
                    val request = if (stemName == "master") {
                        val stemsList = _state.value.stems.map { stem ->
                            val vol = _state.value.volumes[stem.name] ?: 1.0f
                            val isMuted = _state.value.mutes[stem.name] ?: false
                            val isSoloed = _state.value.solos[stem.name] ?: false
                            """{"url":"${stem.url}","volume":$vol,"isMuted":$isMuted,"isSoloed":$isSoloed}"""
                        }
                        val stemsJsonString = "[" + stemsList.joinToString(",") + "]"
                        val formBody = FormBody.Builder()
                            .add("stems_json", stemsJsonString)
                            .add("export_format", format.lowercase())
                            .add("filename", "mix_" + System.currentTimeMillis())
                            .build()
                        Request.Builder()
                            .url("${com.juditht.ai.BuildConfig.API_BASE_URL}/api/export-mix")
                            .post(formBody)
                            .build()
                    } else if (format.lowercase() == "wav") {
                        Request.Builder().url(stemUrl).build()
                    } else {
                        val json = """
                            {
                                "trackUrl": "$stemUrl",
                                "format": "$format",
                                "trackName": "${stemName}_${System.currentTimeMillis()}"
                            }
                        """.trimIndent()
                        val mediaType = "application/json; charset=utf-8".toMediaType()
                        val requestBody = json.toRequestBody(mediaType)
                        val apiUrl = "${com.juditht.ai.BuildConfig.API_BASE_URL}/api/download-track"
                        Request.Builder().url(apiUrl).post(requestBody).build()
                    }
                    val response = okHttpClient.newCall(request).execute()
                    if (!response.isSuccessful) throw Exception("Server returned code ${response.code}")
                    val body = response.body ?: throw Exception("Empty response")
                    val totalBytes = body.contentLength()
                    val fileName = "${stemName}_${System.currentTimeMillis()}.${format.lowercase()}"
                    val mimeType = if (format.lowercase() == "mp3") "audio/mpeg" else "audio/wav"

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply {
                            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                            put(MediaStore.Downloads.MIME_TYPE, mimeType)
                            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SonicSplitAI")
                        }
                        val uri: Uri = context.contentResolver.insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
                        ) ?: throw Exception("Could not create file")
                        context.contentResolver.openOutputStream(uri)?.use { out ->
                            body.byteStream().use { input ->
                                val buffer = ByteArray(8192)
                                var downloaded = 0L
                                var bytes: Int
                                while (input.read(buffer).also { bytes = it } != -1) {
                                    out.write(buffer, 0, bytes)
                                    downloaded += bytes
                                    if (totalBytes > 0) {
                                        val pct = (downloaded * 100 / totalBytes).toInt()
                                        _state.update { st -> st.copy(downloadStatuses = st.downloadStatuses + (stemName to DownloadStatus.InProgress(pct))) }
                                    }
                                }
                            }
                        }
                    } else {
                        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SonicSplitAI")
                        dir.mkdirs()
                        val file = File(dir, fileName)
                        FileOutputStream(file).use { out ->
                            body.byteStream().use { input ->
                                val buffer = ByteArray(8192)
                                var downloaded = 0L
                                var bytes: Int
                                while (input.read(buffer).also { bytes = it } != -1) {
                                    out.write(buffer, 0, bytes)
                                    downloaded += bytes
                                    if (totalBytes > 0) {
                                        val pct = (downloaded * 100 / totalBytes).toInt()
                                        _state.update { st -> st.copy(downloadStatuses = st.downloadStatuses + (stemName to DownloadStatus.InProgress(pct))) }
                                    }
                                }
                            }
                        }
                    }
                    _state.update { it.copy(downloadStatuses = it.downloadStatuses + (stemName to DownloadStatus.Done)) }
                }
            } catch (e: Exception) {
                _state.update { it.copy(downloadStatuses = it.downloadStatuses + (stemName to DownloadStatus.Failed(e.message ?: "Download failed"))) }
            }
        }
    }

    private fun stemDisplayName(key: String) = when {
        key.startsWith("vocal")  -> "Vocals"
        key.startsWith("drum")   -> "Drums"
        key.startsWith("bass")   -> "Bass"
        key.startsWith("guitar") -> "Guitar"
        key.startsWith("piano")  -> "Piano"
        key.startsWith("other")  -> "Other"
        key.startsWith("instrumental") -> "Instrumental"
        else -> key.replaceFirstChar { it.uppercase() }
    }

    override fun onCleared() {
        super.onCleared()
        previewLimiterJob?.cancel()
        positionTrackerJob?.cancel()
        player?.release()
        player = null
        playersMap.values.forEach { it.release() }
        playersMap.clear()
    }
}
