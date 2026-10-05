package com.applocker.app.lock

import com.applocker.app.permissions.PermissionState
import com.applocker.app.storage.PinPolicy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/** The protected-app list and the lock settings, for the React Native screens. Detection itself never runs in JS. */
class LockModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "LockModule"

  override fun initialize() {
    super.initialize()
    LockManager.init(ctx)
    LockManager.listener = { event, payload ->
      if (ctx.hasActiveReactInstance()) {
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, payload)
      }
    }
  }

  override fun invalidate() {
    LockManager.listener = null
    super.invalidate()
  }

  @ReactMethod
  fun getProtectedApps(promise: Promise) {
    try {
      val pm = ctx.packageManager
      val out = Arguments.createArray()
      for (a in LockManager.apps.all()) {
        // Skip entries for apps that were uninstalled while we were not running.
        val installed = try { pm.getApplicationInfo(a.packageName, 0); true } catch (_: Exception) { false }
        if (!installed) {
          LockManager.removeProtected(a.packageName)
          continue
        }
        val m = Arguments.createMap()
        m.putString("packageName", a.packageName)
        m.putString("displayName", a.displayName)
        m.putBoolean("enabled", a.enabled)
        m.putDouble("addedAt", a.addedAt.toDouble())
        out.pushMap(m)
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("LIST_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun addProtectedApp(packageName: String, displayName: String, promise: Promise) {
    if (packageName == ctx.packageName) {
      promise.reject("SELF", "App Locker cannot lock itself")
      return
    }
    if (!LockManager.pin.isConfigured()) {
      promise.reject("PIN_REQUIRED", "Create a PIN first")
      return
    }
    LockManager.addProtected(packageName, displayName)
    promise.resolve(true)
  }

  @ReactMethod
  fun removeProtectedApp(packageName: String, promise: Promise) {
    LockManager.removeProtected(packageName)
    promise.resolve(true)
  }

  /** True when locks can actually take effect: the service is enabled in Android and a PIN exists. */
  @ReactMethod
  fun isProtectionActive(promise: Promise) {
    promise.resolve(PermissionState.accessibilityEnabled(ctx) && LockManager.pin.isConfigured())
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}

/** PIN and lock-mode settings. The PIN crosses the bridge once, is hashed immediately on the native side and is never logged. */
class SecuritySettingsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "SecuritySettings"

  override fun initialize() {
    super.initialize()
    LockManager.init(ctx)
  }

  @ReactMethod
  fun isTrivialPin(pin: String, promise: Promise) {
    promise.resolve(PinPolicy.isTrivial(pin))
  }

  @ReactMethod
  fun setPin(pin: String, promise: Promise) {
    if (!PinPolicy.isValidFormat(pin)) {
      promise.reject("INVALID_PIN", "The PIN must be ${PinPolicy.MIN_LENGTH} to ${PinPolicy.MAX_LENGTH} digits")
      return
    }
    try {
      LockManager.pin.setPin(pin.toCharArray())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PIN_FAILED", "Could not save the PIN", e)
    }
  }

  @ReactMethod
  fun changePin(oldPin: String, newPin: String, promise: Promise) {
    if (!PinPolicy.isValidFormat(newPin)) {
      promise.reject("INVALID_PIN", "The PIN must be ${PinPolicy.MIN_LENGTH} to ${PinPolicy.MAX_LENGTH} digits")
      return
    }
    val r = LockManager.pin.verify(oldPin.toCharArray())
    val m = Arguments.createMap()
    if (r.ok) LockManager.pin.setPin(newPin.toCharArray())
    m.putBoolean("ok", r.ok)
    m.putDouble("remainingMs", r.remainingMs.toDouble())
    promise.resolve(m)
  }

  @ReactMethod
  fun verifyPin(pin: String, promise: Promise) {
    val r = LockManager.pin.verify(pin.toCharArray())
    val m = Arguments.createMap()
    m.putBoolean("ok", r.ok)
    m.putDouble("remainingMs", r.remainingMs.toDouble())
    m.putInt("failed", r.failed)
    promise.resolve(m)
  }

  @ReactMethod
  fun getLockoutRemaining(promise: Promise) {
    promise.resolve(LockManager.pin.lockoutRemainingMs().toDouble())
  }

  @ReactMethod
  fun getSettings(promise: Promise) {
    val s = LockManager.settings
    val m = Arguments.createMap()
    m.putBoolean("pinConfigured", LockManager.pin.isConfigured())
    m.putBoolean("biometricEnabled", s.biometricEnabled)
    m.putString("lockMode", s.lockMode.name)
    m.putInt("graceMinutes", s.graceMinutes)
    m.putInt("pinLength", s.pinLength)
    promise.resolve(m)
  }

  @ReactMethod
  fun updateSettings(patch: ReadableMap, promise: Promise) {
    val s = LockManager.settings
    if (patch.hasKey("biometricEnabled")) s.biometricEnabled = patch.getBoolean("biometricEnabled")
    if (patch.hasKey("lockMode")) {
      val mode = try { LockMode.valueOf(patch.getString("lockMode") ?: "") } catch (_: Exception) {
        promise.reject("INVALID_MODE", "Unknown lock mode")
        return
      }
      s.lockMode = mode
      LockManager.reset() // a new mode starts from a clean state
    }
    if (patch.hasKey("graceMinutes")) s.graceMinutes = patch.getInt("graceMinutes").coerceIn(1, 120)
    promise.resolve(true)
  }
}
