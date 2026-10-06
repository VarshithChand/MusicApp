package com.lifetracker.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Alarms are lost when the phone restarts or the app is updated, so put the stored reminders back. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      ReminderScheduler.scheduleAll(ctx)
    }
  }
}
