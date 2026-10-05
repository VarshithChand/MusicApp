package com.applocker.app

import com.applocker.app.apps.AppListModule
import com.applocker.app.biometric.BiometricModule
import com.applocker.app.lock.LockModule
import com.applocker.app.lock.SecuritySettingsModule
import com.applocker.app.permissions.PermissionModule
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AppLockerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(
    AppListModule(reactContext),
    PermissionModule(reactContext),
    BiometricModule(reactContext),
    LockModule(reactContext),
    SecuritySettingsModule(reactContext),
  )

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
