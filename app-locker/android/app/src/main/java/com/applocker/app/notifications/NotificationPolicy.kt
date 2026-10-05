package com.applocker.app.notifications

/**
 * Decides whether a notification from a locked app may have its text hidden. No Android imports, so it is unit-tested.
 *
 * Safety first: anything the user may need to act on right away, or that Android treats as an ongoing task, is never
 * touched. That includes phone calls and alarms (so locking the Phone or Clock app can not stop them ringing), music
 * controls, navigation, downloads and running services.
 */
object NotificationPolicy {
  // Notification.flags bits (copied from android.app.Notification so this file stays pure).
  const val FLAG_ONGOING_EVENT = 0x00000002
  const val FLAG_NO_CLEAR = 0x00000020
  const val FLAG_FOREGROUND_SERVICE = 0x00000040

  /** Notification.category values that are never hidden or removed. */
  private val NEVER_TOUCH = setOf(
    "call", "alarm", "transport", "navigation", "progress", "service", "sys", "err", "stopwatch", "location_sharing",
  )

  fun shouldHide(
    hideEnabled: Boolean,
    canPostReplacement: Boolean,
    appIsLocked: Boolean,
    isOwnNotification: Boolean,
    category: String?,
    flags: Int,
  ): Boolean {
    if (!hideEnabled || !appIsLocked || isOwnNotification) return false
    // If we cannot show our replacement, removing the original would make the notification disappear entirely.
    if (!canPostReplacement) return false
    if (category != null && category in NEVER_TOUCH) return false
    if (flags and (FLAG_ONGOING_EVENT or FLAG_NO_CLEAR or FLAG_FOREGROUND_SERVICE) != 0) return false
    return true
  }

  /** The text of the replacement. It never contains anything from the original notification. */
  fun replacementText(count: Int): String =
    if (count <= 1) "New notification. Unlock to read it." else "$count new notifications. Unlock to read them."
}
