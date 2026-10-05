# App Locker

A standalone Android app that locks other apps behind a fingerprint or PIN. It is separate from the music app in this repository.

- Plan, design and limits: [../docs/APP_LOCKER_PLAN.md](../docs/APP_LOCKER_PLAN.md)
- Signing and releasing: [../docs/APP_LOCKER_RELEASE.md](../docs/APP_LOCKER_RELEASE.md)
- Test matrix: [../docs/APP_LOCKER_TESTING.md](../docs/APP_LOCKER_TESTING.md)

## What it is, honestly

A deterrent against casual access, **not** an unbreakable lock. It stops working if the Accessibility Service is turned off or the app is force-stopped or uninstalled; an app may show for a split second before the lock appears; Android Settings and other system screens cannot be reliably locked. It does not try to bypass any Android security feature.

## Privacy

Local only. The release app has **no INTERNET permission** (the pipeline fails if it ever does), no account, no analytics. The Accessibility Service is configured so it cannot read screen content; it sees only the package name and window class of the app in front. Biometric data never reaches the app: Android only answers yes or no. The PIN is stored as PBKDF2-HMAC-SHA256 with a random salt, encrypted again with a non-exportable Android Keystore key.

## Notification privacy (optional)

With **Notification access** switched on by the user, `LockedNotificationListener` replaces the text of notifications from locked apps with "New notification. Unlock to read it." (one silent placeholder per app; tapping it opens the locked app, which asks for the PIN). Android gives a listener every notification, so the service decides only from the package name, category and flags and never reads the title or text. Rules (`NotificationPolicy`, unit-tested): calls, alarms, music controls, navigation, downloads, ongoing and foreground-service notifications are never touched, and the original is only removed when the placeholder can actually be shown (otherwise the notification would vanish). The placeholder disappears when the app is unlocked.

## Themes

Security -> Appearance: System, Light or Dark. It applies to the app (`src/theme.ts`) and to the native lock screen (`LockPalette.kt`), which share the same colours.

## How it works

```
Accessibility Service (Kotlin)  -- window changed: package + class -->  LockStateMachine (pure Kotlin, unit-tested)
        |                                                                   |
        |  Lock(pkg)                                                        v
        +--> black cover overlay  +  LockActivity (native)  <-- BiometricPrompt / PIN pad (PBKDF2 + Keystore)
React Native (UI only): Home, App Lock, Security, Permissions, Lock Settings, About  -- native modules -->  Kotlin
```

Everything security-critical is Kotlin and runs without React Native. The lock screen is a native Activity so it opens instantly.

## Project layout

```
android/app/src/main/java/com/applocker/app/
  accessibility/AppAccessibilityService.kt   foreground-app detection
  lock/        LockStateMachine (pure), LockManager, LockController (+ cover overlay), LockActivity, LockModule
  storage/     PinPolicy, PinHasher (pure), KeystoreCrypto, Stores (apps, settings, PinVerifier)
  apps/        AppListModule (PackageManager list + cached icons)
  biometric/   BiometricModule
  permissions/ PermissionModule, OemSettings
android/app/src/test/                        JUnit tests for the pure Kotlin core
src/         screens, components, store (zustand), services (typed native wrappers), utils
__tests__/   Jest tests
```

Routes: `onboarding` (first run), `gate` (the locker's own PIN/fingerprint), `home`, `app-lock`, `security`, `permissions`, `lock-settings`, `about`, `pin-setup` (change PIN). The unlock screen for protected apps is the native `LockActivity`, not a React Navigation screen.

## Develop

```
npm install
npm run typecheck && npm test
cd android && ./gradlew testDebugUnitTest         # Kotlin tests
./gradlew assembleDebug                            # debug APK (needs Metro for JS: npm start)
./gradlew assembleRelease -PallowDebugSigning=true # local test build with the JS bundled
```

Needs JDK 17, Node 22+, the Android SDK (compileSdk 37, build-tools 37.0.0). Put the SDK path in `android/local.properties` using forward slashes: `sdk.dir=C:/Users/you/AppData/Local/Android/Sdk`.

## Emulator test

`bash ../.github/scripts/locker-e2e.sh android/app/build/outputs/apk/debug/app-debug.apk` with an emulator running. It protects Android Settings, enables the service through `adb`, and checks that the lock screen appears, that Home and Back never reveal the app, and that it locks again.

## Known gaps (also listed in the plan)

- Verified on an emulator only so far; a real phone and each brand (Samsung, Xiaomi/Redmi, Oppo, Vivo, OnePlus, Realme) still need the manual test matrix.
- Whether the service may start the lock screen from the background without the "display over other apps" permission on every Android version is measured, not assumed; the cover overlay offers "tap to unlock" as a fallback.
