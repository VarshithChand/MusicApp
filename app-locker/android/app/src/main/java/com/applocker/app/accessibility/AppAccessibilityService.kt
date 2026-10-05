package com.applocker.app.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat
import com.applocker.app.lock.LockController
import com.applocker.app.lock.LockManager
import com.applocker.app.lock.LockOverlay

/**
 * Watches which app is in front. It reads only the package and window class names of window-change events:
 * it never reads what is on the screen (canRetrieveWindowContent is false in the service configuration).
 */
class AppAccessibilityService : AccessibilityService() {
  private var receiverRegistered = false

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_OFF) {
        LockManager.onScreenOff()
        LockOverlay.hide()
      }
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    LockManager.init(applicationContext)
    LockManager.serviceConnected = true
    LockManager.refreshInputMethods()
    if (!receiverRegistered) {
      ContextCompat.registerReceiver(this, screenReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
      receiverRegistered = true
    }
    LockManager.emit("protectionChanged", "on")
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    com.applocker.app.lock.DebugLog.d("event $pkg ${event.className}")
    if (!isActivityWindow(event.className?.toString())) return
    LockController.handleForeground(this, pkg)
  }

  override fun onInterrupt() {}

  override fun onUnbind(intent: Intent?): Boolean {
    stopWatching()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    stopWatching()
    super.onDestroy()
  }

  private fun stopWatching() {
    LockManager.serviceConnected = false
    LockManager.reset()
    LockOverlay.hide()
    if (receiverRegistered) {
      try {
        unregisterReceiver(screenReceiver)
      } catch (_: Exception) {
      }
      receiverRegistered = false
    }
    LockManager.emit("protectionChanged", "off")
  }

  /** Popups, menus and keyboards raise window events too. Only real screens (activities) say which app is in front. */
  private fun isActivityWindow(cls: String?): Boolean {
    if (cls == null) return false
    return !(cls.startsWith("android.widget.") || cls.startsWith("android.view.") ||
      cls.startsWith("android.inputmethodservice") || cls == "android.app.Dialog" ||
      cls.startsWith("android.app.AlertDialog") || cls.endsWith("PopupWindow"))
  }
}
