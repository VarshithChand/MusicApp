package com.applocker.app.lock

import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log

/**
 * Logs which app came to the front, but ONLY in debuggable builds. A release build writes nothing, because the foreground
 * app names would otherwise be readable by anyone with a USB cable. Never log PINs or anything secret here.
 */
object DebugLog {
  @Volatile private var enabled = false

  fun init(ctx: Context) {
    enabled = (ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
  }

  val isDebuggable: Boolean get() = enabled

  fun d(msg: String) {
    if (enabled) Log.d("AppLockerDbg", msg)
  }
}
