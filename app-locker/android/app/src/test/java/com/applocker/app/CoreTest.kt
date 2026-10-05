package com.applocker.app

import com.applocker.app.lock.Decision
import com.applocker.app.lock.LockConfig
import com.applocker.app.lock.LockMode
import com.applocker.app.lock.LockStateMachine
import com.applocker.app.storage.LockoutState
import com.applocker.app.storage.PinHasher
import com.applocker.app.storage.PinPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PinPolicyTest {
  @Test fun formatRules() {
    assertTrue(PinPolicy.isValidFormat("1357"))
    assertTrue(PinPolicy.isValidFormat("13572468"))
    assertFalse(PinPolicy.isValidFormat("135"))
    assertFalse(PinPolicy.isValidFormat("135724681"))
    assertFalse(PinPolicy.isValidFormat("12a4"))
  }

  @Test fun trivialPins() {
    assertTrue(PinPolicy.isTrivial("1111"))
    assertTrue(PinPolicy.isTrivial("1234"))
    assertTrue(PinPolicy.isTrivial("9876"))
    assertFalse(PinPolicy.isTrivial("1357"))
    assertFalse(PinPolicy.isTrivial("2580"))
  }

  @Test fun lockoutSchedule() {
    assertEquals(0L, PinPolicy.lockoutMsFor(4))
    assertEquals(30_000L, PinPolicy.lockoutMsFor(5))
    assertEquals(60_000L, PinPolicy.lockoutMsFor(6))
    assertEquals(5 * 60_000L, PinPolicy.lockoutMsFor(7))
    assertEquals(15 * 60_000L, PinPolicy.lockoutMsFor(8))
    assertEquals(30 * 60_000L, PinPolicy.lockoutMsFor(9))
    assertEquals(30 * 60_000L, PinPolicy.lockoutMsFor(40))
  }

  @Test fun lockoutStateCountsDown() {
    var s = LockoutState()
    for (i in 1..4) s = s.afterFailure(1_000)
    assertEquals(0L, s.remainingMs(1_000))
    s = s.afterFailure(10_000) // 5th wrong try
    assertEquals(30_000L, s.remainingMs(10_000))
    assertEquals(10_000L, s.remainingMs(30_000))
    assertEquals(0L, s.remainingMs(40_001))
  }

  @Test fun rebootRestartsTheWait() {
    var s = LockoutState()
    repeat(5) { s = s.afterFailure(5_000_000) }
    // elapsedRealtime restarted from near 0 after a reboot: the full wait applies again, counting from now.
    assertEquals(30_000L, s.remainingMs(1_000))
    val rebased = s.rebased(1_000)
    assertEquals(20_000L, rebased.remainingMs(11_000))
  }
}

class PinHasherTest {
  @Test fun roundTrip() {
    val salt = PinHasher.newSalt()
    val h = PinHasher.hash("135790".toCharArray(), salt, 1_000)
    assertTrue(PinHasher.matches("135790".toCharArray(), salt, 1_000, h))
    assertFalse(PinHasher.matches("135791".toCharArray(), salt, 1_000, h))
  }

  @Test fun saltChangesTheHash() {
    val a = PinHasher.hash("135790".toCharArray(), PinHasher.newSalt(), 1_000)
    val b = PinHasher.hash("135790".toCharArray(), PinHasher.newSalt(), 1_000)
    assertFalse(a.contentEquals(b))
  }
}

class LockStateMachineTest {
  private val me = "com.applocker.app"
  private val protectedApps = mutableSetOf("com.whatsapp", "com.instagram.android")
  private var cfg = LockConfig(LockMode.IMMEDIATE)

  private fun machine() = LockStateMachine(
    me,
    { it in protectedApps },
    { it == "com.android.systemui" },
    { cfg },
  )

  @Test fun unprotectedAppsAreIgnored() {
    val m = machine()
    assertEquals(Decision.None, m.onForeground("com.android.chrome", 0))
  }

  @Test fun protectedAppLocksOnce() {
    val m = machine()
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 0))
    // repeated events while the lock is pending must not trigger again
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 50))
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 100))
  }

  @Test fun ownPackageAndSystemUiNeverCount() {
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    assertEquals(Decision.None, m.onForeground(me, 10))
    assertEquals(Decision.None, m.onForeground("com.android.systemui", 20))
    assertEquals("com.whatsapp", m.pendingLock)
  }

  @Test fun unlockedAppStaysOpenWhileInside() {
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    m.onUnlocked("com.whatsapp")
    assertEquals(Decision.None, m.onForeground(me, 5)) // lock screen closing
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 10))
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 20_000))
  }

  @Test fun immediateRelocksAfterLeaving() {
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    m.onUnlocked("com.whatsapp")
    m.onForeground("com.android.chrome", 1_000)
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 1_500))
  }

  @Test fun timedKeepsUnlockedWithinGraceOnly() {
    cfg = LockConfig(LockMode.TIMED, 60_000)
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    m.onUnlocked("com.whatsapp")
    m.onForeground("com.android.chrome", 1_000)
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 30_000)) // 29 s away
    m.onForeground("com.android.chrome", 31_000)
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 100_000)) // 69 s away
  }

  @Test fun afterScreenLockSurvivesSwitchingButNotScreenOff() {
    cfg = LockConfig(LockMode.AFTER_SCREEN_LOCK)
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    m.onUnlocked("com.whatsapp")
    m.onForeground("com.android.chrome", 1_000)
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 9_000_000))
    m.onScreenOff()
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 9_000_100))
  }

  @Test fun cancellingTheLockScreenAllowsALaterLock() {
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    m.onLockCancelled()
    m.onForeground("com.android.launcher", 100) // user sent home
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 200))
  }

  @Test fun rapidSwitchBetweenProtectedApps() {
    val m = machine()
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 0))
    assertEquals(Decision.Lock("com.instagram.android"), m.onForeground("com.instagram.android", 100))
    assertEquals("com.instagram.android", m.pendingLock)
  }

  @Test fun movingToAnUnprotectedAppDismissesTheLock() {
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    assertEquals(Decision.Dismiss, m.onForeground("com.android.chrome", 100))
    assertNull(m.pendingLock)
  }

  @Test fun turningProtectionOffClearsTheSession() {
    val m = machine()
    m.onForeground("com.whatsapp", 0)
    m.onUnlocked("com.whatsapp")
    protectedApps.remove("com.whatsapp")
    m.onUnprotected("com.whatsapp")
    assertEquals(Decision.None, m.onForeground("com.whatsapp", 10))
    protectedApps.add("com.whatsapp")
    m.onForeground("com.android.chrome", 20)
    assertEquals(Decision.Lock("com.whatsapp"), m.onForeground("com.whatsapp", 30))
  }

  @Test fun noLoopInManyRapidSwitches() {
    val m = machine()
    var locks = 0
    var t = 0L
    repeat(50) {
      if (m.onForeground("com.whatsapp", t++) is Decision.Lock) locks++
      m.onForeground(me, t++) // lock activity appears
      m.onUnlocked("com.whatsapp")
      m.onForeground(me, t++) // lock activity closes
      m.onForeground("com.whatsapp", t++) // app visible again: must stay open
    }
    assertEquals(1, locks)
  }
}
