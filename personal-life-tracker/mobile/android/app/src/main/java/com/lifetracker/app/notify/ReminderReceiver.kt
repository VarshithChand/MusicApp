package com.lifetracker.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Shows one reminder when its alarm fires. Tapping it opens the app. */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    val title = intent.getStringExtra("title") ?: return
    val text = intent.getStringExtra("text") ?: ""

    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Money reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "EMI due dates and salary day"
      })
    }
    val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    val tap = open?.let { PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val n = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setContentIntent(tap)
      .build()
    try {
      val compat = NotificationManagerCompat.from(ctx)
      if (compat.areNotificationsEnabled()) compat.notify(id.hashCode(), n)
    } catch (_: SecurityException) {
      // Notification permission was withdrawn; nothing to show.
    }
  }

  companion object {
    const val CHANNEL = "money_reminders"
  }
}
