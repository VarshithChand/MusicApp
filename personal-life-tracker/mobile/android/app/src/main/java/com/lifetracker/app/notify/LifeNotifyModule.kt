package com.lifetracker.app.notify

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

class LifeNotifyModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "LifeNotify"

  /** json: [{id, date: "YYYY-MM-DD", time: "HH:MM", title, text}]. Replaces the whole schedule; resolves with the number set. */
  @ReactMethod
  fun setSchedule(json: String, promise: Promise) {
    try {
      promise.resolve(ReminderScheduler.replaceAll(ctx.applicationContext, json))
    } catch (e: Exception) {
      promise.reject("SCHEDULE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun status(promise: Promise) {
    val m = Arguments.createMap()
    m.putBoolean("enabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled())
    m.putInt("sdkInt", Build.VERSION.SDK_INT)
    promise.resolve(m)
  }

  /** Android 13+ asks with a system dialog; otherwise (or if it was refused before) the app's notification settings open. */
  @ReactMethod
  fun requestPermission(promise: Promise) {
    val activity = ctx.currentActivity
    if (Build.VERSION.SDK_INT >= 33 && activity != null &&
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
      !asked
    ) {
      asked = true
      ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7001)
      promise.resolve(true)
      return
    }
    try {
      ctx.startActivity(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  private var asked = false
}

class LifeNotifyPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(LifeNotifyModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
