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
    val taskId: String? = null
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
    private val repository: SeparationRepository
) : ViewModel() {

    private val _state = MutableStateFlow(UploadState())
    val state: StateFlow<UploadState> = _state.asStateFlow()

    fun onFileSelected(uri: Uri, fileName: String) {
        _state.update { it.copy(selectedUri = uri, selectedFileName = fileName, error = null) }
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
            _state.update { it.copy(isUploading = true, error = null) }
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
                    _state.update { it.copy(isUploading = false, error = result.message) }
                }
                else -> {}
            }
        }
    }

    fun clearTaskId() { _state.update { it.copy(taskId = null) } }
}
