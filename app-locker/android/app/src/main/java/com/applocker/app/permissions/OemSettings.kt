package com.applocker.app.permissions

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Best-effort shortcuts to the brand-specific "autostart / background" screens. These screen names are not part of
 * Android and change between phone-software versions, so every one is tried inside try/catch and the app's own
 * App Info page is the fallback. The Permissions screen also explains the steps in words.
 */
object OemSettings {
  private val candidates: Map<String, List<ComponentName>> = mapOf(
    "xiaomi" to listOf(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
    "redmi" to listOf(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
    "poco" to listOf(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
    "oppo" to listOf(
      ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
      ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
    ),
    "realme" to listOf(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
    "vivo" to listOf(
      ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
      ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
    ),
    "oneplus" to listOf(ComponentName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")),
    "samsung" to listOf(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")),
  )

  /** Opens the brand screen if one works, otherwise the app's own App Info page. Returns true when something opened. */
  fun open(ctx: Context): Boolean {
    val brand = Build.MANUFACTURER.lowercase()
    for (c in candidates[brand].orEmpty()) {
      try {
        ctx.startActivity(Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
      } catch (_: Exception) {
        // not present on this phone-software version; try the next one
      }
    }
    return try {
      ctx.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      true
    } catch (_: Exception) {
      false
    }
  }
}
