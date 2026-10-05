package com.applocker.app.apps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import androidx.core.content.ContextCompat
import com.applocker.app.lock.LockManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Lists the installed apps that have a launcher icon. Nothing is hard-coded: the list always comes from PackageManager.
 * Icons are saved once as small PNG files in the cache and returned as file:// URIs, so no big images cross the bridge.
 * (On Android 11+ apps without a launcher entry are invisible to us by design: the manifest declares a narrow
 * <queries> block instead of the Play-restricted QUERY_ALL_PACKAGES permission.)
 */
class AppListModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val worker = Executors.newSingleThreadExecutor()
  private var receiver: BroadcastReceiver? = null

  override fun getName() = "AppList"

  override fun initialize() {
    super.initialize()
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_PACKAGE_ADDED)
      addAction(Intent.ACTION_PACKAGE_REMOVED)
      addDataScheme("package")
    }
    receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, i: Intent) {
        val pkg = i.data?.schemeSpecificPart
        if (i.action == Intent.ACTION_PACKAGE_REMOVED && pkg != null && !i.getBooleanExtra(Intent.EXTRA_REPLACING, false)) {
          LockManager.init(ctx)
          LockManager.removeProtected(pkg) // an uninstalled app cannot stay on the protected list
        }
        if (ctx.hasActiveReactInstance()) {
          ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("appsChanged", pkg)
        }
      }
    }
    ContextCompat.registerReceiver(ctx, receiver!!, filter, ContextCompat.RECEIVER_EXPORTED)
  }

  override fun invalidate() {
    receiver?.let { try { ctx.unregisterReceiver(it) } catch (_: Exception) {} }
    receiver = null
    super.invalidate()
  }

  @ReactMethod
  fun getLaunchableApps(promise: Promise) {
    worker.execute {
      try {
        val pm = ctx.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val seen = HashSet<String>()
        val out = Arguments.createArray()
        val dir = File(ctx.cacheDir, "icons").apply { mkdirs() }
        val found = pm.queryIntentActivities(launcher, 0)
          .mapNotNull { it.activityInfo?.applicationInfo }
          .filter { it.packageName != ctx.packageName && seen.add(it.packageName) }
          .map { Triple(it, pm.getApplicationLabel(it).toString(), isSystem(it)) }
          .sortedBy { it.second.lowercase() }
        for ((info, label, system) in found) {
          val row = Arguments.createMap()
          row.putString("packageName", info.packageName)
          row.putString("label", label)
          row.putBoolean("isSystem", system)
          row.putString("iconUri", iconFor(pm, info, dir))
          out.pushMap(row)
        }
        promise.resolve(out)
      } catch (e: Exception) {
        promise.reject("APPS_FAILED", e.message, e)
      }
    }
  }

  private fun isSystem(i: ApplicationInfo) = (i.flags and ApplicationInfo.FLAG_SYSTEM) != 0

  private fun iconFor(pm: PackageManager, info: ApplicationInfo, dir: File): String? {
    return try {
      val stamp = try { pm.getPackageInfo(info.packageName, 0).lastUpdateTime } catch (_: Exception) { 0L }
      val file = File(dir, "${info.packageName}_$stamp.png")
      if (!file.exists()) {
        val bmp = toBitmap(pm.getApplicationIcon(info), 96)
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
      }
      "file://${file.absolutePath}"
    } catch (_: Exception) {
      null
    }
  }

  private fun toBitmap(d: Drawable, size: Int): Bitmap {
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    d.setBounds(0, 0, size, size)
    d.draw(c)
    return bmp
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
