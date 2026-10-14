package com.musicapp.media

import android.app.Activity
import android.app.RecoverableSecurityException
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Reads the phone's own audio and video libraries through Android's MediaStore (read-only; nothing is ever written,
 * copied or uploaded). The JS side asks for permission itself (PermissionsAndroid, built into React Native); this
 * module assumes permission is already granted and simply returns an empty list if a query fails for any reason
 * (including a missing permission), so a stale/denied permission never crashes the app.
 */
class LocalMediaModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx), ActivityEventListener {
  private val worker = Executors.newSingleThreadExecutor()

  /** The delete waiting on the system's confirmation dialog, if any. */
  private var pendingDelete: Promise? = null

  init {
    ctx.addActivityEventListener(this)
  }

  override fun getName() = "LocalMedia"

  @ReactMethod
  fun listAudio(promise: Promise) {
    worker.execute {
      try {
        promise.resolve(queryAudio())
      } catch (e: Exception) {
        promise.reject("LIST_AUDIO_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun listVideo(promise: Promise) {
    worker.execute {
      try {
        promise.resolve(queryVideo())
      } catch (e: Exception) {
        promise.reject("LIST_VIDEO_FAILED", e.message, e)
      }
    }
  }

  /**
   * Deletes one file from the phone, for real and for good.
   *
   * From Android 11 the app cannot remove media it did not create on its own say-so: the system shows its
   * own confirmation dialog and reports back here, so resolving false means the owner said no, not that
   * anything failed. Android 10 asks the same question through a recoverable error; older versions, which
   * have no such protection, delete on the storage permission alone.
   */
  @ReactMethod
  fun deleteMedia(uriString: String, promise: Promise) {
    val uri = try {
      Uri.parse(uriString)
    } catch (e: Exception) {
      promise.reject("BAD_URI", "That doesn't look like a media file on this phone.", e)
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val activity = ctx.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "The app has to be on screen to confirm a delete.")
        return
      }
      if (pendingDelete != null) {
        promise.reject("DELETE_BUSY", "Another delete is still waiting to be confirmed.")
        return
      }
      try {
        val request = MediaStore.createDeleteRequest(ctx.contentResolver, listOf(uri))
        pendingDelete = promise
        activity.startIntentSenderForResult(request.intentSender, DELETE_REQUEST, null, 0, 0, 0)
      } catch (e: Exception) {
        pendingDelete = null
        promise.reject("DELETE_FAILED", e.message, e)
      }
      return
    }

    worker.execute {
      try {
        val removed = ctx.contentResolver.delete(uri, null, null)
        if (removed > 0) promise.resolve(true)
        else promise.reject("DELETE_FAILED", "That file couldn't be removed. It may already be gone.")
      } catch (e: SecurityException) {
        // Android 10 hands back the permission to ask for; older versions never get here.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && e is RecoverableSecurityException) {
          promise.reject("DELETE_NEEDS_CONFIRMATION", "Android needs you to confirm this delete in its own files app.", e)
        } else {
          promise.reject("DELETE_FAILED", e.message, e)
        }
      } catch (e: Exception) {
        promise.reject("DELETE_FAILED", e.message, e)
      }
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != DELETE_REQUEST) return
    val waiting = pendingDelete ?: return
    pendingDelete = null
    waiting.resolve(resultCode == Activity.RESULT_OK)
  }

  override fun onNewIntent(intent: Intent) {}

  private companion object {
    /** Identifies our delete dialog when the system reports the answer back. */
    const val DELETE_REQUEST = 7301
  }

  private fun queryAudio(): WritableArray {
    val out = Arguments.createArray()
    val projection = arrayOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.TITLE,
      MediaStore.Audio.Media.ARTIST,
      MediaStore.Audio.Media.ALBUM,
      MediaStore.Audio.Media.ALBUM_ID,
      MediaStore.Audio.Media.DURATION,
    )
    val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
    ctx.contentResolver.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, projection, selection, null, "${MediaStore.Audio.Media.TITLE} ASC")
      ?.use { c ->
        val idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
        val titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
        val artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
        val albumCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
        val albumIdCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
        val durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
        while (c.moveToNext()) {
          val id = c.getLong(idCol)
          val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
          val albumId = c.getLong(albumIdCol)
          val row = Arguments.createMap()
          row.putString("id", id.toString())
          row.putString("uri", uri.toString())
          row.putString("title", c.getString(titleCol) ?: "Unknown title")
          row.putString("artist", c.getString(artistCol))
          row.putString("album", c.getString(albumCol))
          row.putDouble("durationMs", c.getLong(durationCol).toDouble())
          // Long-standing content URI for an album's art; works across the SDK range this app supports (24+).
          // Not every album has one — the app shows a placeholder cover when this doesn't resolve to an image.
          row.putString("artworkUri", ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId).toString())
          out.pushMap(row)
        }
      }
    return out
  }

  private fun queryVideo(): WritableArray {
    val out = Arguments.createArray()
    val projection = arrayOf(
      MediaStore.Video.Media._ID,
      MediaStore.Video.Media.DISPLAY_NAME,
      MediaStore.Video.Media.DURATION,
      MediaStore.Video.Media.SIZE,
      MediaStore.Video.Media.WIDTH,
      MediaStore.Video.Media.HEIGHT,
    )
    ctx.contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, projection, null, null, "${MediaStore.Video.Media.DATE_ADDED} DESC")
      ?.use { c ->
        val idCol = c.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
        val nameCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
        val durationCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
        val sizeCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
        val widthCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.WIDTH)
        val heightCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.HEIGHT)
        while (c.moveToNext()) {
          val id = c.getLong(idCol)
          val uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
          val row = Arguments.createMap()
          row.putString("id", id.toString())
          row.putString("uri", uri.toString())
          row.putString("title", c.getString(nameCol) ?: "Video")
          row.putDouble("durationMs", c.getLong(durationCol).toDouble())
          row.putDouble("sizeBytes", c.getLong(sizeCol).toDouble())
          val width = c.getInt(widthCol)
          val height = c.getInt(heightCol)
          if (width > 0) row.putInt("width", width) else row.putNull("width")
          if (height > 0) row.putInt("height", height) else row.putNull("height")
          row.putString("thumbnailUri", thumbnailFor(ctx, uri))
          out.pushMap(row)
        }
      }
    return out
  }

  /**
   * A small cached-on-disk thumbnail for a video, as a file:// URI an <Image> can load directly. `loadThumbnail`
   * returns an in-memory Bitmap (API 29+), not something a URI alone can point at, so it is written once to this
   * app's cache directory (not shared storage) and reused on later calls, keyed by media id. Below API 29 there
   * isn't an equally simple route without the legacy, now largely non-functional MediaStore.Video.Thumbnails table,
   * so this returns null there and the app shows a placeholder instead — API 24-28 is a shrinking minority of phones.
   */
  private fun thumbnailFor(c: Context, uri: Uri): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    val dir = File(c.cacheDir, "video_thumbs").apply { mkdirs() }
    val file = File(dir, "${uri.lastPathSegment}.jpg")
    if (file.exists()) return Uri.fromFile(file).toString()
    return try {
      val bitmap: Bitmap = c.contentResolver.loadThumbnail(uri, Size(320, 320), null)
      FileOutputStream(file).use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out) }
      Uri.fromFile(file).toString()
    } catch (_: Exception) {
      null
    }
  }
}
