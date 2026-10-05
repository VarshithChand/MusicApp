package com.applocker.app.lock

import android.content.Context
import android.os.SystemClock
import android.view.inputmethod.InputMethodManager
import com.applocker.app.storage.PinVerifier
import com.applocker.app.storage.ProtectedAppsStore
import com.applocker.app.storage.SecuritySettings

/**
 * The single place that knows which apps are protected, how re-locking works and which sessions are unlocked.
 * The accessibility service, the lock screen and the React Native modules all go through here.
 */
object LockManager {
  private lateinit var appContext: Context
  private var machine: LockStateMachine? = null
  lateinit var apps: ProtectedAppsStore
    private set
  lateinit var settings: SecuritySettings
    private set
  lateinit var pin: PinVerifier
    private set

  /** True while the accessibility service is connected in this process. */
  @Volatile var serviceConnected = false

  /** React Native listens here to learn about changes. The payload is a plain string. */
  @Volatile var listener: ((event: String, payload: String?) -> Unit)? = null

  private var imePackages: Set<String> = emptySet()

  @Synchronized fun init(ctx: Context) {
    if (machine != null) return
    appContext = ctx.applicationContext
    DebugLog.init(appContext)
    apps = ProtectedAppsStore(appContext)
    settings = SecuritySettings(appContext)
    pin = PinVerifier(appContext)
    refreshInputMethods()
    machine = LockStateMachine(
      ownPackage = appContext.packageName,
      isProtected = { apps.isProtected(it) && pin.isConfigured() },
      isIgnored = { it == "com.android.systemui" || it in PERMISSION_UI || it in imePackages },
      config = { settings.lockConfig() },
    )
  }

  fun refreshInputMethods() {
    imePackages = try {
      val imm = appContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.enabledInputMethodList.map { it.packageName }.toSet()
    } catch (_: Exception) {
      emptySet()
    }
  }

  @Synchronized fun onForeground(pkg: String): Decision =
    machine!!.onForeground(pkg, SystemClock.elapsedRealtime()).also { DebugLog.d("fg $pkg -> $it pending=${machine!!.pendingLock}") }

  @Synchronized fun hasPendingLock(): Boolean = machine!!.pendingLock != null

  @Synchronized fun markUnlocked(pkg: String) {
    machine!!.onUnlocked(pkg)
    emit("lockStateChanged", "unlocked:$pkg")
  }

  @Synchronized fun markCancelled() = machine!!.onLockCancelled()

  @Synchronized fun onScreenOff() = machine!!.onScreenOff()

  @Synchronized fun reset() = machine?.reset()

  @Synchronized fun addProtected(pkg: String, name: String) {
    apps.add(pkg, name)
    emit("lockStateChanged", "added:$pkg")
  }

  @Synchronized fun removeProtected(pkg: String) {
    apps.remove(pkg)
    machine?.onUnprotected(pkg)
    emit("lockStateChanged", "removed:$pkg")
  }

  fun emit(event: String, payload: String? = null) {
    try {
      listener?.invoke(event, payload)
    } catch (_: Exception) {
      // The UI may not be running; the lock itself never depends on it.
    }
  }

  // Dialogs shown on top of an app by the system. They are part of the app on screen, not a different app.
  private val PERMISSION_UI = setOf("com.google.android.permissioncontroller", "com.android.permissioncontroller")
}
