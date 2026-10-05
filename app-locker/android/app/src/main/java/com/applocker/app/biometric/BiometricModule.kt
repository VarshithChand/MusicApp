package com.applocker.app.biometric

import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.applocker.app.permissions.PermissionState
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Wraps Android's own BiometricPrompt. We never see or store biometric data: Android only tells us "yes" or "no".
 * Used by the app's own screens (testing biometric, unlocking the locker's settings); the lock screen for protected
 * apps is the native LockActivity.
 */
class BiometricModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "BiometricModule"

  /** "available" | "none_enrolled" | "no_hardware" | "unavailable" | "unsupported" */
  @ReactMethod
  fun isBiometricAvailable(promise: Promise) {
    promise.resolve(PermissionState.biometricStatus(ctx))
  }

  /** Resolves true on success, false when the user chose "Use PIN"/cancelled; rejects on a real error. */
  @ReactMethod
  fun authenticate(reason: String, promise: Promise) {
    val activity = ctx.currentActivity as? FragmentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No screen is available to show the fingerprint prompt")
      return
    }
    activity.runOnUiThread {
      val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(reason)
        .setNegativeButtonText("Use PIN")
        .setAllowedAuthenticators(BIOMETRIC_STRONG)
        .setConfirmationRequired(false)
        .build()
      BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          promise.resolve(true)
        }

        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
          val declined = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON || errorCode == BiometricPrompt.ERROR_USER_CANCELED
          if (declined) promise.resolve(false) else promise.reject("BIOMETRIC_ERROR_$errorCode", errString.toString())
        }
      }).authenticate(info)
    }
  }
}
