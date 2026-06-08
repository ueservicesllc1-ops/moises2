package com.juditht.ai

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

@HiltAndroidApp
class SonicSplitApp : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Separación de Audio"
            val descriptionText = "Notificaciones sobre el progreso y finalización de separaciones de audio"
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel("separation_channel", name, importance).apply {
                description = descriptionText
            }
            val notificationManager: NotificationManager =
                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
