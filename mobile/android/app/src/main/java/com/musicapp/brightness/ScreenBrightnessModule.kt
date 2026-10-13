package com.musicapp.brightness

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenBrightnessModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "ScreenBrightness"

  @ReactMethod
  fun setBrightness(value: Double, promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.resolve(null)
      return
    }
    val level = value.toFloat().coerceIn(0.01f, 1f)
    activity.runOnUiThread {
      val params = activity.window.attributes
      params.screenBrightness = level
      activity.window.attributes = params
    }
    promise.resolve(null)
  }
}
