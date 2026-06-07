package com.juditht.ai.data.model

import com.google.gson.annotations.SerializedName
import androidx.room.Entity
import androidx.room.PrimaryKey

// ── Upload / Separate ─────────────────────────────────────────────────────────

data class SeparateResponse(
    val success: Boolean,
    val data: SeparateData?
)

data class SeparateData(
    @SerializedName("task_id")   val taskId: String,
    val status: String,
    val message: String?,
    @SerializedName("queue_position") val queuePosition: Int = 0,
    @SerializedName("cache_hit") val cacheHit: Boolean = false,
    val filename: String?
)

// ── Status / Results ──────────────────────────────────────────────────────────

data class StatusResponse(
    @SerializedName("task_id")    val taskId: String,
    val status: String,           // "queued" | "processing" | "completed" | "failed"
    val progress: Int,
    val stems: Map<String, String>?,
    val error: String?,
    val bpm: Float?,
    val key: String?,
    @SerializedName("timeSignature") val timeSignature: String?,
    val duration: Float?,
    val chords: List<ChordData>?,
    @SerializedName("queue_position") val queuePosition: Int = 0,
    @SerializedName("is_real_queue")  val isRealQueue: Boolean = false,
    val message: String?,
    @SerializedName("quality_profile") val qualityProfile: String?,
    @SerializedName("cache_hit")       val cacheHit: Boolean = false,
)

data class ChordData(
    val chord: String,
    val confidence: Float,
    @SerializedName("start_time") val startTime: Float,
    @SerializedName("end_time")   val endTime: Float,
    @SerializedName("root_note")  val rootNote: String?,
    @SerializedName("chord_type") val chordType: String?
)

// ── Stem display model ────────────────────────────────────────────────────────

data class StemItem(
    val name: String,       // "vocals", "drums", "bass", "guitar", "piano", "other"
    val url: String,
    val displayName: String = name.replaceFirstChar { it.uppercase() },
    val emoji: String = stemEmoji(name),
    var isPlaying: Boolean = false,
    var downloadProgress: Int = -1  // -1 = not started, 0-100 = downloading, 101 = done
)

fun stemEmoji(name: String): String = when {
    name.startsWith("vocal")        -> "🎤"
    name.startsWith("drum")         -> "🥁"
    name.startsWith("bass")         -> "🎸"
    name.startsWith("guitar")       -> "🎸"
    name.startsWith("piano")        -> "🎹"
    name.startsWith("click")        -> "🎵"
    name.startsWith("instrumental") -> "🎼"
    else                            -> "🎶"
}

// ── Room entity for local job history ─────────────────────────────────────────



@Entity(tableName = "separation_jobs")
data class SeparationJobEntity(
    @PrimaryKey val taskId: String,
    val originalFilename: String,
    val separationType: String,
    val status: String,
    val progress: Int,
    val stemsJson: String?,   // JSON of Map<String, String>
    val bpm: Float?,
    val key: String?,
    val duration: Float?,
    val createdAt: Long = System.currentTimeMillis()
)
