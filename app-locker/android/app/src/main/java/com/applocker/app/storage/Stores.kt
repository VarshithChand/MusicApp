package com.applocker.app.storage

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Base64
import com.applocker.app.lock.LockConfig
import com.applocker.app.lock.LockMode
import com.applocker.app.lock.ThemeMode
import org.json.JSONArray
import org.json.JSONObject

/** App-private storage. Backups are disabled in the manifest, so none of this leaves the phone. */
object Prefs {
  fun get(ctx: Context): SharedPreferences = ctx.getSharedPreferences("applocker", Context.MODE_PRIVATE)
}

data class ProtectedApp(val packageName: String, val displayName: String, val enabled: Boolean, val addedAt: Long)

/** The packages the user chose to protect. Package names are not secret, but they stay private to the app. */
class ProtectedAppsStore(private val ctx: Context) {
  private val cache = LinkedHashMap<String, ProtectedApp>()

  init {
    val raw = Prefs.get(ctx).getString("protected_apps", null)
    if (raw != null) {
      try {
        val arr = JSONArray(raw)
        for (i in 0 until arr.length()) {
          val o = arr.getJSONObject(i)
          val app = ProtectedApp(o.getString("p"), o.optString("n"), o.optBoolean("e", true), o.optLong("t"))
          cache[app.packageName] = app
        }
      } catch (_: Exception) {
        cache.clear()
      }
    }
  }

  @Synchronized fun all(): List<ProtectedApp> = cache.values.toList()

  @Synchronized fun isProtected(pkg: String): Boolean = cache[pkg]?.enabled == true

  @Synchronized fun add(pkg: String, displayName: String) {
    cache[pkg] = ProtectedApp(pkg, displayName, true, System.currentTimeMillis())
    save()
  }

  @Synchronized fun remove(pkg: String) {
    if (cache.remove(pkg) != null) save()
  }

  private fun save() {
    val arr = JSONArray()
    for (a in cache.values) {
      arr.put(JSONObject().put("p", a.packageName).put("n", a.displayName).put("e", a.enabled).put("t", a.addedAt))
    }
    Prefs.get(ctx).edit().putString("protected_apps", arr.toString()).apply()
  }
}

/** User choices. Nothing here is secret. */
class SecuritySettings(private val ctx: Context) {
  private val p get() = Prefs.get(ctx)

  var biometricEnabled: Boolean
    get() = p.getBoolean("biometric_enabled", false)
    set(v) = p.edit().putBoolean("biometric_enabled", v).apply()

  var lockMode: LockMode
    get() = try { LockMode.valueOf(p.getString("lock_mode", "IMMEDIATE")!!) } catch (_: Exception) { LockMode.IMMEDIATE }
    set(v) = p.edit().putString("lock_mode", v.name).apply()

  var graceMinutes: Int
    get() = p.getInt("grace_minutes", 5)
    set(v) = p.edit().putInt("grace_minutes", v).apply()

  var pinLength: Int
    get() = p.getInt("pin_length", PinPolicy.DEFAULT_LENGTH)
    set(v) = p.edit().putInt("pin_length", v).apply()

  var themeMode: ThemeMode
    get() = try { ThemeMode.valueOf(p.getString("theme_mode", "SYSTEM")!!) } catch (_: Exception) { ThemeMode.SYSTEM }
    set(v) = p.edit().putString("theme_mode", v.name).apply()

  /** Replace the text of notifications from locked apps with "Unlock to read". On by default; needs notification access. */
  var hideNotifications: Boolean
    get() = p.getBoolean("hide_notifications", true)
    set(v) = p.edit().putBoolean("hide_notifications", v).apply()

  fun lockConfig() = LockConfig(lockMode, graceMinutes * 60_000L)
}

data class PinResult(val ok: Boolean, val remainingMs: Long, val failed: Int)

/**
 * Stores the PIN as PBKDF2(salt, pin), encrypted again with a Keystore key, plus the failed-attempt counter.
 * The plain PIN is never stored or logged and the char array is wiped after use.
 */
class PinVerifier(private val ctx: Context) {
  private val p get() = Prefs.get(ctx)

  fun isConfigured(): Boolean = p.contains("pin_record")

  @Synchronized fun setPin(pin: CharArray) {
    val salt = PinHasher.newSalt()
    val hash = PinHasher.hash(pin, salt)
    val enc = KeystoreCrypto.encrypt(hash)
    hash.fill(0)
    val record = "${PinHasher.ITERATIONS}:${b64(salt)}:${b64(enc)}"
    p.edit().putString("pin_record", record).putInt("pin_length", pin.size).apply()
    saveState(LockoutState())
    pin.fill('0')
  }

  /** Checks a PIN. While locked out it does not even look at the PIN. */
  @Synchronized fun verify(pin: CharArray): PinResult {
    val now = SystemClock.elapsedRealtime()
    var state = loadState().rebased(now)
    val remaining = state.remainingMs(now)
    if (remaining > 0) {
      pin.fill('0')
      saveState(state)
      return PinResult(false, remaining, state.failed)
    }
    val record = p.getString("pin_record", null)
    val ok = try {
      val parts = record!!.split(":")
      val expected = KeystoreCrypto.decrypt(Base64.decode(parts[2], Base64.NO_WRAP))
      val result = PinHasher.matches(pin, Base64.decode(parts[1], Base64.NO_WRAP), parts[0].toInt(), expected)
      expected.fill(0)
      result
    } catch (_: Exception) {
      false
    }
    pin.fill('0')
    if (ok) {
      saveState(LockoutState())
      return PinResult(true, 0, 0)
    }
    state = state.afterFailure(now)
    saveState(state)
    return PinResult(false, state.remainingMs(now), state.failed)
  }

  @Synchronized fun lockoutRemainingMs(): Long {
    val now = SystemClock.elapsedRealtime()
    val s = loadState().rebased(now)
    saveState(s)
    return s.remainingMs(now)
  }

  private fun loadState() = LockoutState(
    p.getInt("failed", 0), p.getLong("lock_ends", 0), p.getLong("lock_set", 0), p.getLong("lock_dur", 0),
  )

  private fun saveState(s: LockoutState) {
    p.edit().putInt("failed", s.failed).putLong("lock_ends", s.endsAt).putLong("lock_set", s.setAt)
      .putLong("lock_dur", s.durationMs).apply()
  }

  private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
}
