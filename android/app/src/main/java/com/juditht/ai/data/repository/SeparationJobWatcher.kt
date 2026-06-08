package com.juditht.ai.data.repository

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.juditht.ai.MainActivity
import com.juditht.ai.data.model.SeparationJobEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SeparationJobWatcher @Inject constructor(
    private val repository: SeparationRepository,
    @ApplicationContext private val context: Context
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var watchJob: Job? = null
    private val activeTasks = mutableSetOf<String>()

    fun startWatching() {
        if (watchJob != null) return
        watchJob = scope.launch {
            while (isActive) {
                try {
                    // Fetch all jobs from Local DB via repo
                    val jobs = repository.getAllJobs().first()
                    val unfinishedJobs = jobs.filter { it.status == "processing" || it.status == "queued" }

                    for (job in unfinishedJobs) {
                        if (job.taskId !in activeTasks) {
                            activeTasks.add(job.taskId)
                            launch {
                                pollJob(job)
                            }
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(10000) // check for new unfinished jobs every 10 seconds
            }
        }
    }

    private suspend fun pollJob(job: SeparationJobEntity) {
        val taskId = job.taskId
        var currentStatus = job.status
        while (currentStatus == "processing" || currentStatus == "queued") {
            delay(5000) // poll status every 5 seconds
            when (val statusResult = repository.getStatus(taskId)) {
                is ApiResult.Success -> {
                    val statusData = statusResult.data
                    currentStatus = statusData.status
                    if (currentStatus == "completed") {
                        showNotification(
                            taskId = taskId,
                            title = "Separación Completada",
                            message = "Tu canción \"${job.originalFilename.substringBeforeLast('.')}\" está lista para escuchar!"
                        )
                        activeTasks.remove(taskId)
                        break
                    } else if (currentStatus == "failed") {
                        showNotification(
                            taskId = taskId,
                            title = "Separación Fallida",
                            message = "Ocurrió un error al procesar \"${job.originalFilename.substringBeforeLast('.')}\"."
                        )
                        activeTasks.remove(taskId)
                        break
                    }
                }
                is ApiResult.Error -> {
                    // Keep trying if it's a transient network issue
                }
                else -> {}
            }
        }
    }

    private fun showNotification(taskId: String, title: String, message: String) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("taskId", taskId)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            taskId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, "separation_channel")
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        notificationManager.notify(taskId.hashCode(), builder.build())
    }
}
