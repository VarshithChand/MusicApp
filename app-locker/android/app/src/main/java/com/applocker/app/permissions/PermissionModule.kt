package com.applocker.app.permissions

import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import com.applocker.app.accessibility.AppAccessibilityService
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Reports what Android access the app has and opens the right Settings page. Nothing is granted silently. */
class PermissionModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "PermissionModule"

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val m = Arguments.createMap()
      m.putBoolean("accessibility", PermissionState.accessibilityEnabled(ctx))
      m.putBoolean("overlay", Settings.canDrawOverlays(ctx))
      m.putString("biometric", PermissionState.biometricStatus(ctx))
      m.putBoolean("usageAccess", PermissionState.usageAccess(ctx))
      m.putBoolean("batteryUnrestricted", PermissionState.batteryUnrestricted(ctx))
      m.putString("manufacturer", Build.MANUFACTURER)
      m.putInt("sdkInt", Build.VERSION.SDK_INT)
      promise.resolve(m)
    } catch (e: Exception) {
      promise.reject("PERMISSION_STATUS_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun getAppInfo(promise: Promise) {
    try {
      val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      val m = Arguments.createMap()
      m.putString("versionName", info.versionName ?: "")
      m.putDouble("versionCode", (if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()).toDouble())
      promise.resolve(m)
    } catch (e: Exception) {
      promise.reject("APP_INFO_FAILED", e.message, e)
    }
  }

  /** kind: accessibility | overlay | usage | battery | appInfo | oem */
  @ReactMethod
  fun openPermissionSettings(kind: String, promise: Promise) {
    try {
      val intent = when (kind) {
        "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
        "usage" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
        "appInfo" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
        "oem" -> null
        else -> throw IllegalArgumentException("Unknown settings page: $kind")
      }
      if (intent == null) {
        promise.resolve(OemSettings.open(ctx))
        return
      }
      promise.resolve(start(intent, kind))
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", e.message, e)
    }
  }

  private fun start(intent: Intent, kind: String): Boolean {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      ctx.startActivity(intent)
      true
    } catch (_: Exception) {
      if (kind == "battery") {
        try {
          ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          return true
        } catch (_: Exception) {
        }
      }
      false
    }
  }
}

object PermissionState {
  fun accessibilityEnabled(ctx: Context): Boolean {
    val enabled = Settings.Secure.getInt(ctx.contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1
    if (!enabled) return false
    val list = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
    val me = ComponentName(ctx, AppAccessibilityService::class.java)
    return list.split(':').any { ComponentName.unflattenFromString(it) == me }
  }

  fun biometricStatus(ctx: Context): String = when (BiometricManager.from(ctx).canAuthenticate(BIOMETRIC_STRONG)) {
    BiometricManager.BIOMETRIC_SUCCESS -> "available"
    BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none_enrolled"
    BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "no_hardware"
    BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "unavailable"
    else -> "unsupported"
  }

  @Suppress("DEPRECATION")
  fun usageAccess(ctx: Context): Boolean {
    val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    } else {
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun batteryUnrestricted(ctx: Context): Boolean =
    (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
}
