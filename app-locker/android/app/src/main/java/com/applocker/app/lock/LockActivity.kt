package com.applocker.app.lock

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference
import java.util.concurrent.Executors

/**
 * The lock screen. A native Activity on purpose: it opens instantly (no React Native start-up), hosts the system
 * fingerprint prompt, is hidden from screenshots and Recents, and Back / Home both send the user to the launcher
 * so the protected app is never revealed without authentication.
 */
class LockActivity : AppCompatActivity() {
  private var targetPkg = ""
  private var targetLabel = ""
  private val entered = StringBuilder()
  private var unlocked = false
  private var promptShowing = false
  private var wantPrompt = false

  private lateinit var title: TextView
  private lateinit var message: TextView
  private lateinit var dots: TextView
  private lateinit var icon: ImageView
  private lateinit var bioButton: TextView
  private val keys = ArrayList<TextView>()

  private val ui = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private var tick: Runnable? = null
  private var busy = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    LockManager.init(applicationContext)
    current = WeakReference(this)
    setContentView(buildUi())
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() = goHome()
    })
    bind(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    bind(intent)
  }

  override fun onResume() {
    super.onResume()
    DebugLog.d("LockActivity resumed for $targetPkg")
    LockOverlay.hide() // the screen is on top now; the cover is no longer needed
    if (wantPrompt && biometricUsable()) {
      wantPrompt = false
      ui.postDelayed({ showPrompt() }, 150)
    }
    refreshLockout()
  }

  override fun onStop() {
    super.onStop()
    DebugLog.d("LockActivity stopped finishing=$isFinishing unlocked=$unlocked prompt=$promptShowing")
    // The user left (Home, Recents). Do not leave a stale lock screen behind.
    if (!isFinishing && !unlocked && !promptShowing) {
      LockManager.markCancelled()
      finish()
    }
  }

  override fun onDestroy() {
    tick?.let { ui.removeCallbacks(it) }
    worker.shutdown()
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun bind(i: Intent) {
    val pkg = i.getStringExtra(LockController.EXTRA_PKG)
    if (pkg == null) {
      finish()
      return
    }
    targetPkg = pkg
    try {
      val info = packageManager.getApplicationInfo(pkg, 0)
      targetLabel = packageManager.getApplicationLabel(info).toString()
      icon.setImageDrawable(packageManager.getApplicationIcon(info))
    } catch (_: PackageManager.NameNotFoundException) {
      targetLabel = pkg
    }
    title.text = "Unlock $targetLabel"
    entered.clear()
    render()
    message.text = ""
    wantPrompt = true
    bioButton.visibility = if (biometricUsable()) android.view.View.VISIBLE else android.view.View.GONE
    refreshLockout()
  }

  // ---- authentication ----

  private fun biometricUsable(): Boolean =
    LockManager.settings.biometricEnabled &&
      BiometricManager.from(this).canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

  private fun showPrompt() {
    if (promptShowing || isFinishing) return
    promptShowing = true
    val info = BiometricPrompt.PromptInfo.Builder()
      .setTitle("Unlock $targetLabel")
      .setSubtitle("Confirm it's you")
      .setNegativeButtonText("Use PIN")
      .setAllowedAuthenticators(BIOMETRIC_STRONG)
      .setConfirmationRequired(false)
      .build()
    BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        promptShowing = false
        unlock()
      }

      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        promptShowing = false
        val chosenPin = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON || errorCode == BiometricPrompt.ERROR_USER_CANCELED
        if (!chosenPin) message.text = errString.toString()
        // The prompt is dismissed when the user leaves the app; onStop ran while it was showing, so finish here.
        if (!unlocked && !lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) {
          LockManager.markCancelled()
          finish()
        }
      }
    }).authenticate(info)
  }

  private fun submit() {
    val chars = entered.toString().toCharArray()
    entered.clear()
    render()
    busy = true
    setKeysEnabled(false)
    worker.execute {
      val r = LockManager.pin.verify(chars)
      ui.post {
        busy = false
        if (r.ok) {
          unlock()
        } else {
          message.text = if (r.remainingMs > 0) "" else "Wrong PIN"
          refreshLockout()
          if (r.remainingMs <= 0) setKeysEnabled(true)
        }
      }
    }
  }

  private fun refreshLockout() {
    if (busy) return
    tick?.let { ui.removeCallbacks(it) }
    val remaining = LockManager.pin.lockoutRemainingMs()
    if (remaining <= 0) {
      setKeysEnabled(true)
      return
    }
    setKeysEnabled(false)
    val s = (remaining + 999) / 1000
    message.text = "Too many attempts. Try again in %d:%02d".format(s / 60, s % 60)
    tick = Runnable { refreshLockout() }.also { ui.postDelayed(it, 1000) }
  }

  private fun unlock() {
    unlocked = true
    LockManager.markUnlocked(targetPkg)
    finish()
    @Suppress("DEPRECATION") overridePendingTransition(0, 0)
  }

  private fun goHome() {
    LockManager.markCancelled()
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  // ---- UI, built in code so no layout files are needed ----

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun render() {
    val len = LockManager.settings.pinLength
    dots.text = (0 until len).joinToString(" ") { if (it < entered.length) "●" else "○" }
  }

  private fun setKeysEnabled(on: Boolean) {
    keys.forEach {
      it.isEnabled = on
      it.alpha = if (on) 1f else 0.35f
    }
  }

  private fun key(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
    text = label
    textSize = 24f
    setTextColor(Color.WHITE)
    gravity = Gravity.CENTER
    background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.parseColor("#2A2A2E"))
    }
    layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)).apply { setMargins(dp(10), dp(6), dp(10), dp(6)) }
    setOnClickListener { if (isEnabled) onClick() }
    keys.add(this)
  }

  private fun buildUi(): LinearLayout {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(Color.parseColor("#0B0B0D"))
      setPadding(dp(24), dp(56), dp(24), dp(24))
    }
    icon = ImageView(this).apply { layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)) }
    title = TextView(this).apply {
      setTextColor(Color.WHITE)
      textSize = 22f
      gravity = Gravity.CENTER
      setPadding(0, dp(16), 0, dp(8))
    }
    dots = TextView(this).apply {
      setTextColor(Color.WHITE)
      textSize = 22f
      gravity = Gravity.CENTER
      letterSpacing = 0.15f
      setPadding(0, dp(12), 0, dp(8))
    }
    message = TextView(this).apply {
      setTextColor(Color.parseColor("#FF8A80"))
      textSize = 14f
      gravity = Gravity.CENTER
      minHeight = dp(40)
    }
    root.addView(icon)
    root.addView(title)
    root.addView(dots)
    root.addView(message)

    val rows = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "<"))
    for (row in rows) {
      val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
      for (k in row) {
        when (k) {
          "" -> line.addView(android.view.View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)).apply { setMargins(dp(10), dp(6), dp(10), dp(6)) } })
          "<" -> line.addView(key("⌫") {
            if (entered.isNotEmpty()) entered.deleteCharAt(entered.length - 1)
            render()
          })
          else -> line.addView(key(k) {
            if (entered.length < LockManager.settings.pinLength) entered.append(k)
            render()
            if (entered.length == LockManager.settings.pinLength) submit()
          })
        }
      }
      root.addView(line)
    }

    bioButton = TextView(this).apply {
      text = "Use fingerprint"
      textSize = 16f
      setTextColor(Color.parseColor("#7CB7FF"))
      gravity = Gravity.CENTER
      setPadding(dp(16), dp(16), dp(16), dp(16))
      setOnClickListener { showPrompt() }
    }
    root.addView(bioButton)
    return root
  }

  companion object {
    private var current: WeakReference<LockActivity>? = null

    @Suppress("unused")
    fun isShowing(ctx: Context) = current?.get() != null
  }
}
