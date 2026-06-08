package com.juditht.ai.data.repository

import android.content.Context
import android.net.Uri
import com.google.gson.Gson
import com.juditht.ai.data.api.SonicSplitApiService
import com.juditht.ai.data.db.SeparationJobDao
import com.juditht.ai.data.model.SeparationJobEntity
import com.juditht.ai.data.model.SeparateResponse
import com.juditht.ai.data.model.StatusResponse
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val message: String, val code: Int? = null) : ApiResult<Nothing>()
    object Loading : ApiResult<Nothing>()
}

@Singleton
class SeparationRepository @Inject constructor(
    private val api: SonicSplitApiService,
    private val dao: SeparationJobDao,
    private val gson: Gson,
    @ApplicationContext private val context: Context
) {

    // ── Job History ───────────────────────────────────────────────────────────

    fun getAllJobs(): Flow<List<SeparationJobEntity>> = dao.getAllJobs()

    suspend fun getJobById(taskId: String): SeparationJobEntity? = dao.getJobById(taskId)

    suspend fun deleteJob(taskId: String) = dao.deleteJobById(taskId)

    // ── Upload & Separate ─────────────────────────────────────────────────────

    suspend fun startSeparation(
        audioUri: Uri,
        separationType: String,   // "vocals-instrumental" | "vocals-drums-bass-other" | "custom"
        hiFi: Boolean,
        userId: String,
        separationOptionsJson: String?
    ): ApiResult<SeparateResponse> {
        return try {
            // Copy Uri to temp file for multipart upload
            val contentResolver = context.contentResolver
            val mimeType = contentResolver.getType(audioUri) ?: "audio/mpeg"
            val ext = when {
                mimeType.contains("wav")  -> "wav"
                mimeType.contains("flac") -> "flac"
                mimeType.contains("mp4") || mimeType.contains("m4a") -> "m4a"
                else -> "mp3"
            }

            val displayName = contentResolver.query(audioUri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                cursor.moveToFirst()
                if (idx >= 0) cursor.getString(idx) else "audio.$ext"
            } ?: "audio.$ext"

            val tempFile = File(context.cacheDir, "upload_${System.currentTimeMillis()}.$ext")
            contentResolver.openInputStream(audioUri)?.use { input ->
                FileOutputStream(tempFile).use { output -> input.copyTo(output) }
            }

            val filePart = MultipartBody.Part.createFormData(
                "file", displayName,
                tempFile.asRequestBody((if (mimeType.startsWith("audio/")) mimeType else "audio/mpeg").toMediaType())
            )
            val profile = if (hiFi) "hifi" else "pro_balanced"
            val optionsPart = separationOptionsJson?.toRequestBody("text/plain".toMediaType())

            val response = api.separateAudio(
                file            = filePart,
                separationType  = separationType.toRequestBody("text/plain".toMediaType()),
                hiFi            = hiFi.toString().toRequestBody("text/plain".toMediaType()),
                qualityProfile  = profile.toRequestBody("text/plain".toMediaType()),
                generateClick   = "false".toRequestBody("text/plain".toMediaType()),
                userId          = userId.toRequestBody("text/plain".toMediaType()),
                separationOptions = optionsPart
            )

            tempFile.delete()

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                // Save initial job to local DB
                val taskId = body.data?.taskId ?: return ApiResult.Error("No task ID in response")
                dao.upsertJob(
                    SeparationJobEntity(
                        taskId           = taskId,
                        originalFilename = displayName,
                        separationType   = separationType,
                        status           = "processing",
                        progress         = 0,
                        stemsJson        = null,
                        bpm              = null,
                        key              = null,
                        duration         = null
                    )
                )
                ApiResult.Success(body)
            } else {
                ApiResult.Error(parseErrorMessage(response.errorBody()?.string()), response.code())
            }
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Unknown error")
        }
    }

    // ── Poll Status ───────────────────────────────────────────────────────────

    suspend fun getStatus(taskId: String): ApiResult<StatusResponse> {
        return try {
            val response = api.getStatus(taskId)
            if (response.isSuccessful && response.body() != null) {
                val status = response.body()!!
                // Update local DB
                val existing = dao.getJobById(taskId)
                if (existing != null) {
                    dao.upsertJob(
                        existing.copy(
                            status   = status.status,
                            progress = status.progress,
                            stemsJson = if (status.stems != null) gson.toJson(status.stems) else existing.stemsJson,
                            bpm      = status.bpm,
                            key      = status.key,
                            duration = status.duration
                        )
                    )
                }
                ApiResult.Success(status)
            } else {
                ApiResult.Error(parseErrorMessage(response.errorBody()?.string()), response.code())
            }
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Network error")
        }
    }

    /**
     * Polls the status endpoint every 2 seconds until the job is completed or failed.
     * Emits ApiResult.Loading while in progress.
     */
    fun pollUntilComplete(taskId: String): Flow<ApiResult<StatusResponse>> = flow {
        emit(ApiResult.Loading)
        while (true) {
            val result = getStatus(taskId)
            emit(result)
            when {
                result is ApiResult.Success && result.data.status == "completed" -> break
                result is ApiResult.Success && result.data.status == "failed"    -> break
                // En errores, NO rompemos el flow — el ViewModel decide cuándo rendirse
                else -> delay(2_500)
            }
        }
    }

    // ── Stems JSON helper ─────────────────────────────────────────────────────

    fun stemsFromJson(json: String?): Map<String, String> {
        if (json == null) return emptyMap()
        return try {
            gson.fromJson(json, Map::class.java) as Map<String, String>
        } catch (e: Exception) {
            emptyMap()
        }
    }

    private fun parseErrorMessage(errorBody: String?): String {
        if (errorBody == null) return "Error en la solicitud"
        return try {
            val map = gson.fromJson(errorBody, Map::class.java)
            val detail = map["detail"]
            if (detail is Map<*, *>) {
                (detail["message"] as? String) ?: errorBody
            } else {
                (detail as? String) ?: (map["error"] as? String) ?: (map["message"] as? String) ?: errorBody
            }
        } catch (e: Exception) {
            errorBody
        }
    }
}
