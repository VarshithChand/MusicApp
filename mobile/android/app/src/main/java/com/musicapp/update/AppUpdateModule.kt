package com.musicapp.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Downloads a new version of the app and hands it to Android's installer.
 *
 * The download goes through the system's own DownloadManager rather than being fetched in JS: it
 * survives the app being backgrounded, reports how far it has got, and gives back a uri the
 * installer will accept without this app having to publish a file provider of its own.
 */
class AppUpdateModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "AppUpdate"

  /** The version this build is, so JS can tell whether a release is newer. */
  @ReactMethod
  fun currentVersion(promise: Promise) {
    try {
      val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      promise.resolve(info.versionName ?: "")
    } catch (e: Exception) {
      promise.reject("VERSION_FAILED", e.message, e)
    }
  }

  /** Downloads the apk, reporting progress as it goes, and resolves with where it landed. */
  @ReactMethod
  fun download(url: String, promise: Promise) {
    val manager = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
    if (manager == null) {
      promise.reject("NO_DOWNLOAD_MANAGER", "This phone cannot download in the background.")
      return
    }

    val id = try {
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle("Musica update")
        .setDescription("Downloading the new version")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
        .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, "musica-update.apk")
      manager.enqueue(request)
    } catch (e: Exception) {
      promise.reject("DOWNLOAD_FAILED", e.message, e)
      return
    }

    Thread {
      var finished = false
      while (!finished) {
        var cursor: Cursor? = null
        try {
          cursor = manager.query(DownloadManager.Query().setFilterById(id))
          if (cursor == null || !cursor.moveToFirst()) {
            promise.reject("DOWNLOAD_FAILED", "The download disappeared before it finished.")
            return@Thread
          }
          val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
          val soFar = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
          val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))

          when (status) {
            DownloadManager.STATUS_SUCCESSFUL -> {
              finished = true
              emit(1.0)
              val file = manager.getUriForDownloadedFile(id)
              if (file == null) promise.reject("DOWNLOAD_FAILED", "The downloaded file could not be found.")
              else promise.resolve(file.toString())
            }
            DownloadManager.STATUS_FAILED -> {
              finished = true
              promise.reject("DOWNLOAD_FAILED", "The download did not complete.")
            }
            else -> {
              if (total > 0) emit(soFar.toDouble() / total.toDouble())
              Thread.sleep(300)
            }
          }
        } catch (e: Exception) {
          finished = true
          promise.reject("DOWNLOAD_FAILED", e.message, e)
        } finally {
          cursor?.close()
        }
      }
    }.start()
  }

  /** Hands the downloaded file to Android, which asks the owner whether to install it. */
  @ReactMethod
  fun install(fileUri: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(fileUri), "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("INSTALL_FAILED", e.message, e)
    }
  }

  /**
   * Required by React Native for any module JS listens to: without these it refuses to build the
   * emitter at all, and the error brings the whole app down on startup rather than just the update
   * check. There is nothing to do here -- the emitting side keeps no per-listener state.
   */
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun emit(progress: Double) {
    val payload = Arguments.createMap().apply { putDouble("progress", progress) }
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AppUpdateProgress", payload)
  }
}
