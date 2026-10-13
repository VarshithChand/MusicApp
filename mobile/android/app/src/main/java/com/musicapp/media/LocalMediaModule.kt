package com.musicapp.media

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Size
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
class LocalMediaModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val worker = Executors.newSingleThreadExecutor()

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
