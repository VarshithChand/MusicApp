package com.applocker.app.lock

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

/** Turns the state machine's decisions into screens. Runs on the main thread (accessibility events arrive there). */
object LockController {
  const val EXTRA_PKG = "protected_package"
  private const val TAG = "AppLocker"

  fun handleForeground(service: AccessibilityService, pkg: String) {
    when (val d = LockManager.onForeground(pkg)) {
      is Decision.Lock -> {
        LockOverlay.show(service, d.pkg)
        launch(service, d.pkg)
      }
      // The lock screen is NOT closed here. A late window event from the app we just left (for example the launcher)
      // must never be able to close the lock and reveal the protected app. When the user really leaves, Android stops
      // the lock screen and LockActivity.onStop() finishes it.
      Decision.Dismiss -> if (!LockManager.hasPendingLock()) LockOverlay.hide()
      Decision.None -> if (!LockManager.hasPendingLock()) LockOverlay.hide()
    }
  }

  fun lockIntent(ctx: Context, pkg: String): Intent =
    Intent(ctx, LockActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or Intent.FLAG_ACTIVITY_NO_ANIMATION)
      .putExtra(EXTRA_PKG, pkg)

  fun launch(ctx: Context, pkg: String) {
    try {
      ctx.startActivity(lockIntent(ctx, pkg))
    } catch (e: Exception) {
      // The black overlay stays and offers "tap to unlock", which starts the lock screen from a real touch.
      Log.w(TAG, "Could not start the lock screen: ${e.javaClass.simpleName}")
    }
  }
}

/**
 * A black cover shown the instant a protected app is detected, so its content is not visible while the lock screen
 * opens. It is an accessibility overlay: no extra permission is needed. It stays until the lock screen is on top.
 * If the lock screen could not be started in the background, a tap on the cover starts it.
 */
object LockOverlay {
  private var view: View? = null
  private var windowManager: WindowManager? = null
  private val main = Handler(Looper.getMainLooper())

  fun show(service: AccessibilityService, pkg: String) {
    if (view != null) return
    val wm = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val text = TextView(service).apply {
      setTextColor(Color.parseColor("#AAAAAA"))
      textSize = 16f
      gravity = Gravity.CENTER
    }
    val root = FrameLayout(service).apply {
      setBackgroundColor(Color.BLACK)
      addView(text, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
      setOnClickListener { LockController.launch(service, pkg) }
    }
    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.OPAQUE,
    )
    try {
      wm.addView(root, lp)
      view = root
      windowManager = wm
      // If the lock screen has not appeared after a moment, say what to do.
      main.postDelayed({ if (view === root) text.text = "Locked\nTap to unlock" }, 1200)
    } catch (e: Exception) {
      Log.w("AppLocker", "Could not show the cover: ${e.javaClass.simpleName}")
    }
  }

  fun hide() {
    val v = view ?: return
    view = null
    try {
      windowManager?.removeViewImmediate(v)
    } catch (_: Exception) {
    }
    windowManager = null
  }
}
