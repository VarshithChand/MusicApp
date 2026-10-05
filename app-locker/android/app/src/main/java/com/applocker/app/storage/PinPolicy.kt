package com.applocker.app.storage

/** Pure rules for PINs and lockouts. No Android imports so they can be unit-tested on the JVM. */
object PinPolicy {
  const val MIN_LENGTH = 4
  const val MAX_LENGTH = 8
  const val DEFAULT_LENGTH = 6

  fun isValidFormat(pin: String): Boolean = pin.length in MIN_LENGTH..MAX_LENGTH && pin.all { it in '0'..'9' }

  /** Same digit repeated (1111) or a straight run (1234, 4321). These are warned about, not forbidden by the native layer. */
  fun isTrivial(pin: String): Boolean {
    if (pin.length < 2) return true
    if (pin.all { it == pin[0] }) return true
    val up = pin.zipWithNext().all { (a, b) -> b - a == 1 }
    val down = pin.zipWithNext().all { (a, b) -> a - b == 1 }
    return up || down
  }

  private val STEPS_MS = longArrayOf(30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000)

  /** After the 5th wrong try the PIN pad locks: 30 s, then 1 min, 5 min, 15 min and 30 min for every further wrong try. */
  fun lockoutMsFor(failed: Int): Long {
    if (failed < 5) return 0
    return STEPS_MS[minOf(failed - 5, STEPS_MS.size - 1)]
  }
}

/** Persisted failed-attempt state. Times come from SystemClock.elapsedRealtime(), so changing the clock does not help. */
data class LockoutState(val failed: Int = 0, val endsAt: Long = 0, val setAt: Long = 0, val durationMs: Long = 0) {
  /** elapsedRealtime restarts at boot. If it went backwards, the phone rebooted: restart the full wait from now. */
  fun rebased(now: Long): LockoutState =
    if (durationMs > 0 && now < setAt) copy(setAt = now, endsAt = now + durationMs) else this

  fun remainingMs(now: Long): Long {
    val s = rebased(now)
    return if (s.durationMs <= 0) 0 else maxOf(0, s.endsAt - now)
  }

  fun afterFailure(now: Long): LockoutState {
    val f = failed + 1
    val d = PinPolicy.lockoutMsFor(f)
    return LockoutState(f, now + d, now, d)
  }
}
