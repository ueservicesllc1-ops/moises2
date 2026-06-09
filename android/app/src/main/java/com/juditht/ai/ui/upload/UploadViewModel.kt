package com.juditht.ai.ui.upload

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.juditht.ai.data.repository.ApiResult
import com.juditht.ai.data.repository.SeparationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

import android.content.Context
import android.media.MediaMetadataRetriever
import dagger.hilt.android.qualifiers.ApplicationContext

// ── Stem individual seleccionable ─────────────────────────────────────────────

data class StemSelection(
    val vocals: Boolean = false,
    val drums: Boolean = false,
    val bass: Boolean = false,
    val guitar: Boolean = false,
    val piano: Boolean = false,
    val other: Boolean = false
) {
    fun hasAny() = vocals || drums || bass || guitar || piano || other

    fun toApiValue(): String {
        if (!hasAny()) return "vocals-instrumental"
        return buildList {
            if (vocals) add("vocals")
            if (drums) add("drums")
            if (bass) add("bass")
            if (guitar) add("guitar")
            if (piano) add("piano")
            if (other) add("other")
        }.joinToString("-")
    }
}

// ── Modo de separación (pestañas superiores) ──────────────────────────────────

enum class SeparationMode(val displayName: String, val emoji: String, val description: String) {
    VocalInstrumental("Voz / Pista", "🎤", "Separa la voz del instrumental"),
    FullMultitrack("Todos los tracks", "🎚️", "Voz, Batería, Bajo, Guitarra, Piano, Otros"),
    Custom("Personalizado", "✨", "Elige exactamente qué instrumentos separar")
}

data class UploadState(
    val selectedUri: Uri? = null,
    val selectedFileName: String? = null,
    val mode: SeparationMode = SeparationMode.VocalInstrumental,
    val stems: StemSelection = StemSelection(),
    val hiFi: Boolean = true,
    val isUploading: Boolean = false,
    val error: String? = null,
    val taskId: String? = null,
    val needsPaywall: Boolean = false,
    val paywallReason: String? = null,
    val estimatedDurationSeconds: Double = 0.0,
    val estimatedTokensCost: Int = 0
) {
    fun getSeparationType(): String = when (mode) {
        SeparationMode.VocalInstrumental -> "vocals-instrumental"
        SeparationMode.FullMultitrack    -> "vocals-drums-bass-other"
        SeparationMode.Custom            -> "custom"
    }

    fun getSeparationOptionsJson(): String? = if (mode == SeparationMode.Custom) {
        val s = stems
        """{"vocals":${s.vocals},"drums":${s.drums},"bass":${s.bass},"guitar":${s.guitar},"piano":${s.piano},"other":${s.other}}"""
    } else {
        null
    }
}

// ── ViewModel ─────────────────────────────────────────────────────────────────

@HiltViewModel
class UploadViewModel @Inject constructor(
    private val repository: SeparationRepository,
    private val tokenRepository: com.juditht.ai.data.repository.TokenRepository,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _state = MutableStateFlow(UploadState())
    val state: StateFlow<UploadState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.wakeUpServer()
        }
    }

    fun onFileSelected(uri: Uri, fileName: String) {
        var durationMs = 0L
        try {
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(context, uri)
            val time = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            durationMs = time?.toLongOrNull() ?: 0L
            retriever.release()
        } catch (e: Exception) {
            e.printStackTrace()
        }

        val durationSeconds = durationMs / 1000.0
        val tokensCost = Math.ceil((durationSeconds / 60.0) * 33.0).toInt() // TOKENS_PER_MINUTE = 33

        _state.update {
            it.copy(
                selectedUri = uri,
                selectedFileName = fileName,
                error = null,
                estimatedDurationSeconds = durationSeconds,
                estimatedTokensCost = tokensCost
            )
        }
    }

    fun onModeChanged(mode: SeparationMode) {
        _state.update { it.copy(mode = mode) }
    }

    fun onStemToggled(stem: String) {
        _state.update { current ->
            val s = current.stems
            val newStems = when (stem) {
                "vocals" -> s.copy(vocals = !s.vocals)
                "drums"  -> s.copy(drums  = !s.drums)
                "bass"   -> s.copy(bass   = !s.bass)
                "guitar" -> s.copy(guitar = !s.guitar)
                "piano"  -> s.copy(piano  = !s.piano)
                "other"  -> s.copy(other  = !s.other)
                else -> s
            }
            current.copy(stems = newStems)
        }
    }

    fun onHiFiToggle(hiFi: Boolean) {
        _state.update { it.copy(hiFi = hiFi) }
    }

    fun startSeparation(userId: String) {
        val uri = _state.value.selectedUri ?: run {
            _state.update { it.copy(error = "Selecciona un archivo de audio primero") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isUploading = true, error = null, needsPaywall = false, paywallReason = null) }
            
            // ── Token system check before uploading ──────────────────
            val tokenCheck = tokenRepository.getTokenStatus(userId)
            if (tokenCheck is ApiResult.Success) {
                val status = tokenCheck.data
                if (!status.canSeparate) {
                    _state.update { it.copy(
                        isUploading = false,
                        needsPaywall = true,
                        paywallReason = status.reason ?: "no_tokens"
                    ) }
                    return@launch
                }
            } else if (tokenCheck is ApiResult.Error) {
                // Si falla la verificación de tokens (red, servidor caído, etc.),
                // solo bloqueamos si el código es 403 (explícitamente sin permisos).
                // Para cualquier otro error (404, 500, red) continuamos normalmente.
                if (tokenCheck.code == 403) {
                    _state.update { it.copy(
                        isUploading = false,
                        needsPaywall = true,
                        paywallReason = "no_tokens"
                    ) }
                    return@launch
                }
                // Error de red o temporal: continuar sin bloquear al usuario
                println("[TOKENS] Check-tokens error (${tokenCheck.code}): ${tokenCheck.message} — continuando de todas formas")
            }

            val result = repository.startSeparation(
                audioUri              = uri,
                separationType        = _state.value.getSeparationType(),
                hiFi                  = _state.value.hiFi,
                userId                = userId,
                separationOptionsJson = _state.value.getSeparationOptionsJson()
            )
            when (result) {
                is ApiResult.Success -> {
                    _state.update { it.copy(isUploading = false, taskId = result.data.data?.taskId) }
                }
                is ApiResult.Error -> {
                    val msg = result.message.lowercase()
                    if (result.code == 403 || msg.contains("token") || msg.contains("insufficient") || msg.contains("exhausted") || msg.contains("limit")) {
                        _state.update { it.copy(
                            isUploading = false,
                            needsPaywall = true,
                            paywallReason = "no_tokens"
                        ) }
                    } else {
                        // Clean up extremely long stack trace strings
                        val cleanMessage = if (result.message.length > 150 || result.message.contains("Exception") || result.message.contains("at ")) {
                            "Error del servidor al procesar el audio. Por favor, intenta de nuevo."
                        } else {
                            result.message
                        }
                        _state.update { it.copy(isUploading = false, error = cleanMessage) }
                    }
                }
                else -> {}
            }
        }
    }

    fun clearPaywallTrigger() {
        _state.update { it.copy(needsPaywall = false, paywallReason = null) }
    }

    fun clearError() { _state.update { it.copy(error = null) } }

    fun clearTaskId() { _state.update { it.copy(taskId = null) } }
}
