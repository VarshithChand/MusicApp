package com.applocker.app.lock

enum class LockMode { IMMEDIATE, AFTER_SCREEN_LOCK, TIMED }

data class LockConfig(val mode: LockMode = LockMode.IMMEDIATE, val graceMs: Long = 0)

sealed class Decision {
  /** Nothing to do. */
  object None : Decision()

  /** A protected app came to the front and needs authentication. */
  data class Lock(val pkg: String) : Decision()

  /** A lock screen that is showing is no longer needed (the user moved on). */
  object Dismiss : Decision()
}

/**
 * Decides when a protected app must be locked. No Android imports: time is passed in, so every mode and every loop
 * case is unit-tested on the JVM.
 *
 * Rules (docs/APP_LOCKER_PLAN.md section 8):
 *  - IMMEDIATE: locked every time the app is entered from somewhere else; staying inside never re-locks.
 *  - AFTER_SCREEN_LOCK: stays unlocked until the screen turns off.
 *  - TIMED: stays unlocked for graceMs after the user last left the app.
 * Loops are prevented because our own package and system chrome never count, and while a lock for a package is
 * pending, further events for that package are swallowed.
 */
class LockStateMachine(
  private val ownPackage: String,
  private val isProtected: (String) -> Boolean,
  private val isIgnored: (String) -> Boolean,
  private val config: () -> LockConfig,
) {
  /** An unlocked session. lastLeftAt == null means the user is still inside the app. */
  private class Session(var lastLeftAt: Long?)

  private val sessions = HashMap<String, Session>()
  private var foreground: String? = null

  var pendingLock: String? = null
    private set

  fun onForeground(pkg: String, now: Long): Decision {
    if (pkg == ownPackage || isIgnored(pkg)) return Decision.None

    var dismiss = false
    val prev = foreground
    if (prev != pkg) {
      if (prev != null) sessions[prev]?.lastLeftAt = now
      foreground = pkg
      if (pendingLock != null && pendingLock != pkg) {
        pendingLock = null
        dismiss = true
      }
    }

    if (!isProtected(pkg)) return if (dismiss) Decision.Dismiss else Decision.None
    if (pendingLock == pkg) return Decision.None

    val s = sessions[pkg]
    if (s != null && valid(s, now)) {
      s.lastLeftAt = null
      return if (dismiss) Decision.Dismiss else Decision.None
    }

    sessions.remove(pkg)
    pendingLock = pkg
    return Decision.Lock(pkg)
  }

  private fun valid(s: Session, now: Long): Boolean {
    val cfg = config()
    val left = s.lastLeftAt
    return when (cfg.mode) {
      LockMode.IMMEDIATE -> left == null
      LockMode.AFTER_SCREEN_LOCK -> true
      LockMode.TIMED -> left == null || now - left < cfg.graceMs
    }
  }

  fun onUnlocked(pkg: String) {
    sessions[pkg] = Session(null)
    pendingLock = null
    foreground = pkg
  }

  /** The user backed out of the lock screen (it sent them to the launcher). */
  fun onLockCancelled() {
    pendingLock = null
  }

  fun onScreenOff() {
    sessions.clear()
    pendingLock = null
    foreground = null
  }

  /** The user switched protection off for this app. */
  fun onUnprotected(pkg: String) {
    sessions.remove(pkg)
    if (pendingLock == pkg) pendingLock = null
  }

  fun reset() {
    sessions.clear()
    pendingLock = null
    foreground = null
  }
}
