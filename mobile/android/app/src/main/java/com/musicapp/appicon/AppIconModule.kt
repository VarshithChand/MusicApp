package com.musicapp.appicon

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppIconModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "AppIcon"

  @ReactMethod
  fun setVariant(variant: String, promise: Promise) {
    try {
      val pm = ctx.packageManager
      val pkg = ctx.packageName
      val dark = ComponentName(pkg, "$pkg.LauncherDark")
      val light = ComponentName(pkg, "$pkg.LauncherLight")
      val (enable, disable) = if (variant == "light") light to dark else dark to light
      pm.setComponentEnabledSetting(enable, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      pm.setComponentEnabledSetting(disable, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("APP_ICON", e)
    }
  }
}
