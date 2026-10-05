package com.applocker.app.notifications

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.applocker.app.lock.LockManager

/**
 * Keeps the text of notifications from locked apps off the screen. When a locked app posts a notification, this removes
 * it and shows a plain one in its place ("New notification. Unlock to read it."). Tapping that opens the locked app,
 * which asks for the PIN or fingerprint as usual.
 *
 * Privacy: Android hands a notification listener every notification on the phone. This service looks only at the app's
 * package name, the category and the flags to decide. It never reads the title or text, never stores anything and
 * has no way to send anything out (the app has no internet permission).
 *
 * Needs "Notification access", which the user switches on in Android Settings. Without it nothing is touched.
 */
class LockedNotificationListener : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      LockManager.init(applicationContext)
      val pkg = sbn.packageName
      val settings = LockManager.settings
      val locked = LockManager.apps.isProtected(pkg) && LockManager.pin.isConfigured()
      if (!locked) return
      val canPost = NotificationManagerCompat.from(this).areNotificationsEnabled()
      val hide = NotificationPolicy.shouldHide(
        hideEnabled = settings.hideNotifications,
        canPostReplacement = canPost,
        appIsLocked = locked,
        isOwnNotification = pkg == packageName,
        category = sbn.notification.category,
        flags = sbn.notification.flags,
      )
      if (!hide) return
      NotificationHider.show(this, pkg)
      cancelNotification(sbn.key)
    } catch (_: Exception) {
      // Never let a failure here lose the user's notification: if anything goes wrong we leave the original alone.
    }
  }
}

/** The replacement notification: silent, no content from the original, one per locked app. */
object NotificationHider {
  private const val CHANNEL = "locked_notifications"
  private val counts = HashMap<String, Int>()

  @Synchronized
  fun show(ctx: Context, pkg: String) {
    val count = (counts[pkg] ?: 0) + 1
    counts[pkg] = count
    val pm = ctx.packageManager
    val label = try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }

    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Locked app notifications", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown instead of the text of notifications from apps you locked"
          setSound(null, null)
          enableVibration(false)
        },
      )
    }
    val launch = pm.getLaunchIntentForPackage(pkg)
    val tap = launch?.let { PendingIntent.getActivity(ctx, pkg.hashCode(), it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val n = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setContentTitle(label)
      .setContentText(NotificationPolicy.replacementText(count))
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setCategory(Notification.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(tap)
      .build()
    NotificationManagerCompat.from(ctx).apply {
      if (areNotificationsEnabled()) notify(pkg, 1, n)
    }
  }

  /** Called when the app is unlocked: the placeholder is no longer needed. */
  @Synchronized
  fun clear(ctx: Context, pkg: String) {
    counts.remove(pkg)
    try {
      NotificationManagerCompat.from(ctx).cancel(pkg, 1)
    } catch (_: Exception) {
    }
  }
}
