package com.applocker.app

import com.applocker.app.notifications.NotificationPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationPolicyTest {
  private fun hide(
    hideEnabled: Boolean = true,
    canPost: Boolean = true,
    locked: Boolean = true,
    own: Boolean = false,
    category: String? = "msg",
    flags: Int = 0,
  ) = NotificationPolicy.shouldHide(hideEnabled, canPost, locked, own, category, flags)

  @Test fun hidesAMessageFromALockedApp() = assertTrue(hide())

  @Test fun leavesUnlockedAppsAlone() = assertFalse(hide(locked = false))

  @Test fun doesNothingWhenTheOptionIsOff() = assertFalse(hide(hideEnabled = false))

  @Test fun neverRemovesTheOriginalIfItCannotShowTheReplacement() = assertFalse(hide(canPost = false))

  @Test fun neverTouchesItsOwnNotifications() = assertFalse(hide(own = true))

  @Test fun neverTouchesCallsAlarmsMusicNavigationOrDownloads() {
    for (c in listOf("call", "alarm", "transport", "navigation", "progress", "service", "sys", "err", "stopwatch")) {
      assertFalse("category $c", hide(category = c))
    }
  }

  @Test fun neverTouchesOngoingOrForegroundServiceNotifications() {
    assertFalse(hide(flags = NotificationPolicy.FLAG_ONGOING_EVENT))
    assertFalse(hide(flags = NotificationPolicy.FLAG_FOREGROUND_SERVICE))
    assertFalse(hide(flags = NotificationPolicy.FLAG_NO_CLEAR))
  }

  @Test fun anUnknownCategoryIsStillHidden() = assertTrue(hide(category = null))

  @Test fun replacementTextNeverContainsOriginalContent() {
    assertEquals("New notification. Unlock to read it.", NotificationPolicy.replacementText(1))
    assertEquals("3 new notifications. Unlock to read them.", NotificationPolicy.replacementText(3))
  }
}
