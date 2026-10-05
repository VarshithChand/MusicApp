# App Locker — architecture and implementation plan

Status: **implementation in progress** (see "Implementation status" below). Written 2026-10-05 against the real configuration of this repository.

## Implementation status (updated 2026-10-05)

The plan was approved to proceed with phases 0 to 10 inside this repository (folder `app-locker/`, separate workflow `applocker.yml`, tags `locker-vX.Y.Z`, release `locker-latest`). Decisions taken: separate folder in this repo, applicationId `com.applocker.app`, minSdk 26, direct-APK distribution, the locker's own screens are gated by the PIN/fingerprint.

| Phase | Status | Evidence |
|---|---|---|
| 0 Skeleton + native-module spike | Done | RN 0.87.1 + new architecture builds; native modules and the native Activity run on the emulator |
| 1 Detection spike | Done on emulators (Android 17 locally, Android 14 on GitHub) | Service sees the foreground app and starts the lock screen; a real phone is still untested |
| 2 App discovery + App Lock list | Built, emulator-verified for the list code path only | PackageManager list, cached icons, search/filter (Jest-tested) |
| 3 PIN + secure storage | Done | PBKDF2 + Keystore, lockout (JUnit-tested); Keystore path itself not exercised by automated tests |
| 4 Lock screen + PIN unlock | Done on emulators | Emulator test (10 checks): service running, lock appears, Home/Back never reveal, locks again, rapid re-open locks. Passed locally and in GitHub Actions. The PIN pad itself was not typed on in the test |
| 5 Biometric | Built | Uses Android BiometricPrompt; **not tested with a real fingerprint** |
| 6 Permissions screen + OEM tips | Built | Status checks and settings intents; **OEM screens untested** (best effort, with fallback) |
| 7 Re-lock modes | Done | All three modes covered by 12 JUnit tests |
| 8 Home, About, locker's own gate | Built | |
| 9 CI/CD + private signing | Checks job **verified in GitHub** (type check, Jest, Kotlin tests, debug build, Android 14 emulator test: all green). **The signed-release job has never run**: it needs you to create the key and four secrets (docs/APP_LOCKER_RELEASE.md) |
| 10 Hardening + OEM pass + 1.0 | **Not done** | Needs real phones; see docs/APP_LOCKER_TESTING.md |

### Where the build differs from the plan above
- **Cover overlay:** it is an *accessibility overlay*, which needs no "display over other apps" permission. That permission is now optional (it can help the lock screen start from the background on some phones). If the lock screen cannot start, the cover shows "Tap to unlock", and that tap starts it.
- **Re-lock "app switch behaviour"** is folded into the modes: *Every time* re-locks after leaving; *After a time away* keeps it unlocked within the chosen minutes; *After screen lock* waits for the screen to turn off.
- **App list:** only apps with a launcher icon are listed (Android's package-visibility rules, no QUERY_ALL_PACKAGES). `getInstalledApps` was dropped.
- **Modules:** Accessibility and Overlay methods live in `PermissionModule`; the PIN and settings live in `SecuritySettings` (in `LockModule.kt`).
- **Back/Home on the lock screen** are verified on the emulator. The lock screen is no longer closed by "the user moved on" window events, because a late event from the app just left must never close it and reveal the protected app.
- **Event throttling** (`notificationTimeout`) is 0 so no window change is skipped.

### Behaviour found while testing
- **A force-stop turns the Accessibility Service off.** Android removes an app's accessibility service from the enabled list when the app is force-stopped, so protection ends until the user switches the service back on. This is the limit already listed above; the Home and Permissions screens show "Protection is off" and the Fix button.
- **If Android kills the service process, restarts can be delayed** (a restart was once scheduled about 30 minutes out after a kill following an error). Real-phone testing must watch for this.
- Once, on a heavily abused emulator, pressing Back on the lock screen ended in an ANR ("no focused window"); it did not reproduce after the test stopped using force-stop. Re-check on real phones.

## 0. Decisions I need from you before Phase 0

| #  | Question                                                    | My recommendation                                                                                                                                                                                                                          |
| -- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1 | Separate repository or a new folder in this repository?     | **Separate repository.** The music pipeline is bound to tags `v*`, the `latest` release and `/app/download`; a second app would collide with all three. The locker gets its own tags, its own release and its own signing key. |
| D2 | App name and applicationId (cannot change after release)    | e.g. "App Locker",`com.applocker.app` — you choose                                                                                                                                                                                      |
| D3 | minSdk                                                      | **26** (not 24 like the music app). Overlay windows use `TYPE_APPLICATION_OVERLAY`, which exists from 26; this removes a legacy code path.                                                                                         |
| D4 | Distribution                                                | Direct APK only. Google Play restricts apps that use the Accessibility API for anything but accessibility, so Play is out of scope.                                                                                                        |
| D5 | Protect the locker's own settings with the PIN/fingerprint? | **Yes** — otherwise anyone holding the phone can simply turn the locks off.                                                                                                                                                         |

## 1. What I inspected (the music app in `mobile/`)

| Item                           | Found                                                                                                                                             | Consequence for the locker                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| React Native                   | 0.87.1, React 19.2.3,**new architecture on**, Hermes on, edge-to-edge on                                                                    | Reuse. Custom native modules must be verified in a Phase 0 spike (see §6.1)                         |
| Android Gradle Plugin / Gradle | AGP 9 (new DSL**off**: `android.newDsl=false`, `android.builtInKotlin=false`), Gradle 9.4.1                                             | Copy`gradle.properties` exactly; assign `versionCode = …` (the call style broke our build once) |
| Kotlin / SDK                   | Kotlin 2.2.0, compileSdk 37, targetSdk 36, buildTools 37.0.0, NDK 27.1.12297006, minSdk 24                                                        | Reuse, minSdk 26                                                                                     |
| JDK / Node                     | JDK 17 (Temurin), Node ≥ 22.11                                                                                                                   | Same in CI                                                                                           |
| Package layout                 | `com.musicapp`, `MainActivity.kt`, `MainApplication.kt`, manifest with INTERNET only                                                        | Locker needs a much larger manifest (§4)                                                            |
| Known fixes we must repeat     | `super.onCreate(null)` in `MainActivity` (react-native-screens crash), `patch-package` postinstall, `setup-android` with `packages: ""` | Carry over                                                                                           |
| CI                             | One job: build → sign (**debug key**) → emulator smoke test → publish to release `latest`                                              | Reuse the structure; replace the debug key with a private keystore (§13)                            |
| Tests                          | Jest in`mobile/`, node:test in backend                                                                                                          | Add JUnit for Kotlin logic                                                                           |

Lesson from the music app: *every* native piece on RN 0.87 needed fixing before it launched. So Phase 0 is a throw-away spike that proves the hard parts on an emulator before any real work.

## 2. Product summary

A standalone Android app. The user picks installed apps; opening one of them shows a lock screen that needs a fingerprint (or PIN) first. Local only: no account, no backend, nothing uploaded.

**Honest limits, up front.** This is a *deterrent against casual access*, not an unbreakable lock:

- It works only while the Accessibility Service is enabled. Disabling it, force-stopping the app, or uninstalling it removes the protection.
- The protected app's screen can flash for a fraction of a second before the lock appears (mitigated, not eliminated).
- It cannot reliably protect Android Settings, the package installer or other system screens, and it will not try to bypass any Android security control.
- Android 13+ blocks sideloaded apps from using Accessibility until the user allows "restricted settings" by hand (§4.3).
- Phone makers (Xiaomi, Oppo, Vivo, Samsung…) can kill background services unless the user changes battery settings (§11).

## 3. Architecture

```
┌──────────────────────── React Native (UI only) ────────────────────────┐
│ Home · App Lock · Security · Permissions · Lock Settings · About       │
│ zustand store · React Navigation                                       │
└───────────────┬──────────────────────────────────────▲────────────────┘
        calls   │ (native modules)             events  │ (DeviceEventEmitter)
┌───────────────▼──────────────────────────────────────┴────────────────┐
│ Kotlin native layer                                                    │
│  AppListModule  PermissionModule  BiometricModule  LockModule          │
│  SecuritySettingsModule                                                │
│        │                │                │              │              │
│        └────────────────┴──── LockManager (single source of truth) ───┤
│  AppAccessibilityService ──▶ LockController ──▶ LockActivity (native) │
│        ▲ foreground events        ▲ screen-off / boot receivers        │
│  SecureStorage (Android Keystore) · ProtectedAppsStore · PinVerifier   │
└────────────────────────────────────────────────────────────────────────┘
```

Principles:

1. **Everything security-critical is Kotlin.** Detection, lock decision, lock screen, PIN check and biometric prompt run without React Native. The service must work when the RN app is closed.
2. **The lock screen is a native Activity, never RN.** Loading the RN runtime takes about a second, which would show the protected app unlocked.
3. **One brain:** `LockManager` holds protected packages, unlocked sessions and the settings; the service, the lock screen and the RN modules all ask it.
4. **Pure-Kotlin core** (`LockStateMachine`, `PinPolicy`) with no Android imports, so it is unit-testable with plain JUnit.

## 4. Android permission architecture

### 4.1 Permissions and access

| Item                                                                   | Type                               | Why                                                                                                               | Required?                                                      | How the user grants it                                                              |
| ---------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Accessibility Service (`BIND_ACCESSIBILITY_SERVICE`)                 | Special access                     | Detect the foreground package                                                                                     | **Required**                                             | Settings → Accessibility → App Locker → On (we open the page, the user flips it) |
| Display over other apps (`SYSTEM_ALERT_WINDOW`)                      | Special access                     | (a) cover screen during launch; (b) lets the app start the lock screen from the background on Android 10+         | **Strongly recommended**                                 | Settings page opened by`ACTION_MANAGE_OVERLAY_PERMISSION`                         |
| Biometric (`USE_BIOMETRIC`)                                          | Normal                             | BiometricPrompt                                                                                                   | Optional (PIN works without)                                   | Granted at install; the user must enrol a fingerprint in Android                    |
| Usage access (`PACKAGE_USAGE_STATS`)                                 | Special access                     | Second signal for the foreground app if an OEM suppresses accessibility events                                    | **Optional, off by default** — decided in Phase 1 spike | Settings page                                                                       |
| Ignore battery optimisation (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) | Normal + dialog                    | Keep the service alive                                                                                            | Recommended                                                    | System dialog / settings list. (Fine for sideloaded APKs; Play would object.)       |
| Package visibility                                                     | `<queries>` MAIN/LAUNCHER intent | List launchable apps on Android 11+**without** `QUERY_ALL_PACKAGES`                                       | Required                                                       | Manifest only                                                                       |
| Boot completed                                                         | Normal                             | Not needed: Android restarts an enabled accessibility service by itself. A receiver is only used to re-arm state. | No                                                             | —                                                                                  |

Nothing is granted silently. The service declares `canRetrieveWindowContent="false"`: **it never reads what is on another app's screen** (also a privacy guarantee we can state).

### 4.2 "Permissions & Protection" screen

One row per item: ✓ Enabled / ⚠ Action required / ✗ Missing, plus a button that opens the right Android page. The screen re-checks every time the app returns to the foreground. A red banner appears on Home and App Lock when Accessibility is off, because then nothing is protected.

### 4.3 Restricted settings (Android 13+, sideloaded APK)

After installing from an APK, the Accessibility toggle is greyed out. The user must open **Settings → Apps → App Locker → ⋮ → Allow restricted settings**, then enable the service. The onboarding screen explains this step with the exact path and a button to App Info. This is a known Android rule, not something we can or should bypass.

## 5. Components

### 5.1 AccessibilityService (`AppAccessibilityService.kt`)

- Config: `typeWindowStateChanged` only (not content-changed — noisy and battery-hungry), `canRetrieveWindowContent=false`, `notificationTimeout≈50 ms`, no package filter (we need to see every package to know when the user *leaves* a protected app).
- On each event: read `packageName` and `className`.
- **Filter noise:** ignore our own package, `com.android.systemui`, keyboards (input methods), and class names that are not Activities (e.g. `android.widget.*`, popup/dialog windows). Permission dialogs and share sheets belong to the app on screen, so they must not count as "leaving".
- Feed `(package, timestamp)` to `LockController`; it asks `LockStateMachine` whether to lock; at most one lock per package until it is resolved (debounce ≈ 500 ms) to prevent loops.
- Registers a dynamic `ACTION_SCREEN_OFF` receiver (cannot be declared in the manifest) for the "after screen lock" mode.
- `onInterrupt` / `onUnbind` / `onDestroy` clear in-memory sessions and tell RN that protection stopped.

### 5.2 Lock screen — chosen design

Evaluated:

| Option                                                        | Strength                                                                                                     | Weakness                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlay only (`WindowManager`)                              | Appears fast; covers content                                                                                 | `BiometricPrompt` needs an Activity, so it cannot host the fingerprint prompt; overlay permission can be revoked; some OEMs hide overlays |
| Dedicated Activity only                                       | Hosts BiometricPrompt; normal back/home handling;`FLAG_SECURE` blocks screenshots                          | Background activity launch limits (Android 10+/14+); slight delay                                                                           |
| **Activity primary + overlay as a cover (recommended)** | Fingerprint works; content hidden during the launch gap; overlay also grants the background-launch exemption | Needs the optional overlay permission to be fully effective; two pieces to keep in sync                                                     |

Design:

- `LockActivity` extends `FragmentActivity`: `singleInstance`, own `taskAffinity`, `excludeFromRecents`, `FLAG_SECURE`, `showWhenLocked`, black background. It shows "Unlock *WhatsApp*" (label and icon from PackageManager), **[Fingerprint]** and **[Use PIN]**, and auto-opens the biometric prompt.
- **Back / Home:** pressing either sends the user to the launcher (`ACTION_MAIN` + `CATEGORY_HOME`) and keeps the app locked. Back never reveals the protected app.
- **Success:** `LockManager.markUnlocked(package, now)`, then `finish()`; the protected app, which was already behind, becomes visible.
- **Cancel / failure:** stay on the lock screen; offer the PIN. A second cancel returns home.
- Optional `LockOverlay` (a plain black `TYPE_APPLICATION_OVERLAY` view) is added the instant a protected package is detected and removed when the Activity is on screen. Skipped if overlay permission is missing.
- Rotation: `configChanges` handled, state kept, nothing exposed.
- **Assumption to verify in the Phase 1 spike:** whether an Accessibility Service can launch the Activity from the background on Android 14/15 without the overlay permission. Android's exemption list changes between versions, so I am not claiming it; the spike measures it on the emulator and a real phone.

### 5.3 Authentication flow

```
protected app detected
   └─ session still valid (grace/mode)?  ── yes → do nothing
   └─ no → LockActivity
        ├─ biometric enabled & available → BiometricPrompt (BIOMETRIC_STRONG, negative button "Use PIN")
        │     ├─ success → unlock
        │     ├─ error/cancel → show PIN pad
        │     └─ 3 failed matches or lockout → PIN only (BiometricPrompt handles its own lockout)
        └─ PIN pad
              ├─ locked out? → show countdown, input disabled
              ├─ correct → reset counter → unlock
              └─ wrong → counter++ → lockout schedule
```

- Biometric: `androidx.biometric` `BiometricPrompt` with `BIOMETRIC_STRONG`. This covers fingerprint, and face/iris **only on devices where Android classifies them as Strong** — many phones' face unlock is "weak" and will not qualify. We document this and do not lower the bar. We never touch biometric data.
- Hardening option for later: bind a Keystore key to the biometric (`CryptoObject`) so success is cryptographically proven, not just a callback.

### 5.4 PIN storage and verification

- 4–8 digits (default 6; reject trivial `1111`/`1234` with a warning).
- Stored as `PBKDF2WithHmacSHA256(pin, random 16-byte salt, ≥ 100 000 iterations)`; the result is then **encrypted with an AES-GCM key held in the Android Keystore** (non-exportable, hardware-backed where available), so a copy of the app's files cannot be brute-forced elsewhere. Salt, iteration count and ciphertext live in app-private storage (`allowBackup=false`, data-extraction rules exclude it).
- Comparison is constant-time. The PIN is held in a `CharArray`/`ByteArray` and zeroed after use; never logged, never sent over the RN bridge after setup (setup passes it once, native side hashes it immediately).
- Library note: `androidx.security:security-crypto` is deprecated, so we use `KeyStore` + `Cipher` directly (small, well-known code).
- **Rate limiting** (persisted, so restarting the app does not reset it): 5 wrong tries → 30 s lockout, then 1 min, 5 min, 15 min, 30 min (cap). Uses `elapsedRealtime()` so changing the clock does not help. Biometric attempts are limited by Android itself.
- **Forgot PIN:** no remote reset (there is no account). Recovery = uninstall/reinstall, which clears all locks. Stated in the UI.

## 6. React Native ↔ Kotlin bridge

### 6.1 Approach

Plain native modules (`ReactContextBaseJavaModule` + `ReactPackage`) running through React Native's interop layer, instead of Codegen TurboModules — less setup and fewer moving parts on a version where every library needed patches. Phase 0 proves it works on RN 0.87.1 with the new architecture; if not, switch to TurboModules before building on it.

### 6.2 Modules

| Module                     | Methods                                                                                                                                | Events                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `AppListModule`          | `getLaunchableApps(): [{packageName,label,iconUri,isSystem}]`, `getInstalledApps()` (includes non-launchable, for advanced filter) | `appsChanged` (install/uninstall via `PACKAGE_ADDED/REMOVED` receiver) |
| `PermissionModule`       | `getPermissionStatus()`, `openPermissionSettings(kind)`, `openAppInfo()`, `openOemAutostartSettings()`                         | `permissionsChanged`                                                     |
| `BiometricModule`        | `isBiometricAvailable(): {status}`, `authenticate(reason)` (for the app's own screens and "Test biometric")                        | —                                                                         |
| `LockModule`             | `getProtectedApps()`, `addProtectedApp(pkg)`, `removeProtectedApp(pkg)`, `isProtectionActive()`                                | `lockStateChanged`, `protectionStopped`                                |
| `SecuritySettingsModule` | `isPinConfigured()`, `setPin(pin)`, `changePin(old,new)`, `verifyPin(pin)`, `getSettings()`, `updateSettings(partial)`     | —                                                                         |

(Your list had separate Accessibility and Overlay modules; I fold them into `PermissionModule` — same methods, one place.)

Icons are **not** sent as base64 through the bridge. `AppListModule` writes each icon once to the cache directory and returns a `file://` URI that `<Image>` loads lazily; the list is returned without blocking the UI thread (coroutine on `Dispatchers.Default`).

### 6.3 What can be pure React Native vs what must be Kotlin

| Pure React Native / TypeScript                                          | **Must be Kotlin**                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| All six screens, navigation, search box, toggles, filters, empty states | Foreground-app detection (AccessibilityService)                 |
| Permission status presentation, onboarding text                         | Reading permission state, opening settings intents              |
| PIN-entry UI during**setup** (collect digits, send once)          | Lock screen Activity and overlay                                |
| Settings forms, About/privacy text                                      | BiometricPrompt                                                 |
| Search/filter/sort of the app list                                      | PackageManager queries and icons                                |
| App's own gate screen (can call native biometric)                       | PIN hashing, Keystore, rate limiting                            |
| Zustand state and presentation logic                                    | `LockManager`/state machine, screen-off and package receivers |

## 7. Routes / navigation

| Route              | Screen                                                           | Content                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/home`          | HomeScreen                                                       | Locked-app count, protection status (on/off), permission summary, button to App Lock                                                                       |
| `/app-lock`      | AppLockScreen                                                    | Search, installed apps (icon, name, package), lock toggle, filters (All / Locked / Unlocked, user apps vs system), empty state, "monitoring is off" banner |
| `/security`      | SecurityScreen                                                   | Biometric on/off, change PIN, test biometric, failed-attempt info                                                                                          |
| `/permissions`   | PermissionsScreen                                                | Accessibility, Overlay, Biometric, Usage access, Battery, OEM tips, restricted-settings help                                                               |
| `/lock-settings` | LockSettingsScreen                                               | Re-lock mode, grace period, app-switch behaviour                                                                                                           |
| `/about`         | AboutScreen                                                      | Version, privacy statement, limitations, licences                                                                                                          |
| `LOCK_SCREEN`    | **Native `LockActivity`** (not a React Navigation route) | Unlock UI                                                                                                                                                  |
| first run          | OnboardingFlow (stack)                                           | Explain → permissions → create PIN → optional biometric                                                                                                 |

Toggle ON logic: if no PIN → PIN setup (enter, confirm) → offer biometric once → store the package. If security is already configured → store immediately, **no PIN prompt**. If Accessibility is off, the toggle still saves the choice but shows the warning that it is not active yet.

## 8. Re-lock behaviour (state machine)

Per protected package the core keeps `unlockedAt` and `lastLeftAt`.

| Setting                                    | Rule                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Immediately**                      | Lock every time the app**comes to the foreground** from another app (a new "entry"). Staying inside it never re-locks. |
| **After screen lock**                | Stay unlocked until`ACTION_SCREEN_OFF`; then clear all sessions.                                                           |
| **Time based** (1 / 5 / 15 / 30 min) | Unlocked while`now − lastLeftAt < grace`. Leaving starts the timer; coming back in time reuses the session.               |
| **App-switch behaviour** (option)    | "Re-lock when I leave the app" = Immediately. "Keep unlocked while I switch" = uses grace.                                   |

**Loop prevention:** (1) events from our own package are ignored; (2) a lock for a package in progress swallows further events for it; (3) after a successful unlock a short "just unlocked" window (≈ 2 s) ignores the transition events caused by the lock screen closing; (4) system UI/keyboard/dialog windows never count as leaving. Several protected apps opened quickly are handled one at a time, newest wins; each app has its own session.

## 9. Local data model (no backend)

| Store                | Fields                                                                                                                         | Where                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `ProtectedApp`     | `packageName` (key), `displayName`, `enabled`, `addedAt`                                                               | App-private DataStore/JSON; not secret but private       |
| `SecuritySettings` | `biometricEnabled`, `pinConfigured`, `lockMode`, `gracePeriodMinutes`, `lockAfterScreenLock`, `appSwitchBehaviour` | Same                                                     |
| `PinRecord`        | `salt`, `iterations`, `ciphertext+iv` (Keystore-wrapped hash)                                                            | Keystore-backed encrypted blob                           |
| `SecurityState`    | `failedAttempts`, `lockoutUntilElapsed`, `lastUnlock`, `currentProtectedPackage`                                       | Persistent for attempts/lockout; the rest in memory only |
| In-memory            | `sessions: package → {unlockedAt, lastLeftAt}`                                                                              | Process memory, cleared on service stop / screen off     |

Never stored: plaintext PIN, biometric data, a list of installed apps outside the device. `allowBackup=false`.

## 10. Threat model

| Threat                                             | Mitigation                                                                                   | Residual risk                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Someone guesses the PIN                            | Salted slow hash, Keystore wrapping, persistent lockout with growing delays, monotonic clock | A short PIN is still guessable over days; recommend 6 digits                      |
| Copy app data to brute-force offline               | Keystore key is non-exportable                                                               | Device with compromised OS                                                        |
| Turn off protection in Settings                    | Locker's own screens gated; banner when service is off                                       | Settings itself is not lockable; protection ends if Accessibility is switched off |
| Force-stop / uninstall                             | Cannot be prevented without Device Admin (we do not use it)                                  | Documented limitation                                                             |
| See content in the gap before lock appears         | Cover overlay + fast native Activity                                                         | Brief flash may remain                                                            |
| Screenshot or recents thumbnail of the lock screen | `FLAG_SECURE`, excluded from recents                                                       | Thumbnails of*other* apps are Android's, not ours                               |
| Lock loop / denial of use                          | Debounce, ignore own package, unlock window                                                  | Needs OEM testing                                                                 |
| Back/Home to bypass                                | Both go to the launcher                                                                      | —                                                                                |
| Reading other apps' screens                        | `canRetrieveWindowContent=false`; no content access                                        | —                                                                                |
| Malicious abuse of the service                     | We state our own limits and never read, record or transmit                                   | —                                                                                |
| Logging secrets                                    | No PIN in logs; release builds strip logs                                                    | —                                                                                |

## 11. OEM compatibility strategy

The service can be killed or blocked differently per brand. We do not assume; we detect `Build.MANUFACTURER`, show brand-specific guidance, and try the matching settings screen inside `try/catch`, falling back to App Info.

| Brand                 | Typical problem                                                                                                                             | Guidance in the Permissions screen                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Samsung               | "Put unused apps to sleep", Adaptive battery                                                                                                | Remove from sleeping apps; battery → Unrestricted                                   |
| Xiaomi / Redmi / POCO | Autostart off;**"Display pop-up windows while running in the background"** blocks the lock screen; MIUI/HyperOS kills background apps | Enable Autostart, that pop-up permission, "No restrictions", lock the app in Recents |
| Oppo / Realme         | Auto-launch off, aggressive background freeze                                                                                               | Allow auto-launch, background activity, battery "Allow"                              |
| Vivo                  | Background-start permission, high background power use                                                                                      | Allow background start / high power use                                              |
| OnePlus               | Battery optimisation, deep optimisation                                                                                                     | "Don't optimise", allow background activity                                          |

Each gets a row in the test matrix. We cite the community reference dontkillmyapp.com for current steps instead of guessing them.

## 12. Testing

### 12.1 Automated

- **JUnit (pure Kotlin):** `LockStateMachine` (every mode, loop cases, rapid switching), `PinPolicy` (lockout schedule, clock tampering), PIN hash round-trip, trivial-PIN rejection.
- **Jest:** app-list filtering/search, toggle flow logic, permission-state mapping.
- **Emulator end-to-end (CI):** enable the service with `adb shell settings put secure enabled_accessibility_services …`, protect a built-in app, launch it, assert `LockActivity` is on top (via `dumpsys window`), enter the PIN through `adb`, assert the app is visible. This is a real functional test, unlike the music app's launch-only smoke test.

### 12.2 Manual matrix (physical phones)

| Area             | Cases                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install / update | Fresh install; update over a previous APK (same key); uninstall/reinstall clears state                                                                                       |
| App list         | Discovery, search, empty search, system apps filter, new app installed while open                                                                                            |
| Toggle           | ON (first time → PIN setup), ON (configured → no prompt), OFF                                                                                                              |
| PIN              | Setup, mismatch on confirm, change, correct, wrong ×5 lockout, lockout survives app restart, clock changed                                                                  |
| Biometric        | Success, failure, cancel, not enrolled, unavailable, too many attempts                                                                                                       |
| Permissions      | Accessibility off, overlay off, battery optimisation on, restricted settings blocked                                                                                         |
| Lifecycle        | Reboot, screen lock/unlock, recents, Home, Back, rotation, split-screen, rapid switching between protected apps, locker's own gate, service killed and restarted, force-stop |
| Targets          | WhatsApp, Instagram, Telegram, Chrome, YouTube, Gallery, a banking app (some banking apps block overlays — record it)                                                       |
| OEMs             | Samsung, Xiaomi, Redmi, Oppo, Vivo, OnePlus, Realme + emulator (API 30, 34, 35/36)                                                                                           |

## 13. CI/CD design (new repository)

Adapted from `.github/workflows/android.yml`. Pull requests build and test; releases are on demand.

1. Checkout · Node 22 · JDK 17 · Android SDK (`packages: ""`) · `npm ci` (runs `patch-package`).
2. `tsc --noEmit`, `eslint`, `jest`, `./gradlew testDebugUnitTest` (JUnit).
3. **PR / push:** `assembleDebug` APK as a build artifact (egress limits on artifact downloads hit us before — keep it small or skip upload; build + test is the point).
4. **Release (tag `vX.Y.Z` or manual):** version → `versionName` / `versionCode = major*10000 + minor*100 + patch`; refuse duplicates/downgrades; `assembleRelease` signed with the **private keystore** from secrets; `apksigner verify`; refuse if the signer certificate differs from the previous release; SHA-256; emulator end-to-end test (above); publish `app-locker.apk`, `version.json` (size, SHA-256, signer fingerprint) to a `latest` release **in the locker repository**.
5. **Signing key:** generate once with `keytool` on your machine, store as GitHub Secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`), and **keep an offline backup** — if the key is lost, nobody can update over the installed app. No debug key in release builds.

(The same private-key step also resolves open risk R1 for the music app.)

## 14. Project structure

```
app-locker/                              (new repository)
├── android/app/src/main/
│   ├── AndroidManifest.xml              service, activity, receivers, <queries>, permissions
│   ├── res/xml/accessibility_service_config.xml
│   ├── res/xml/data_extraction_rules.xml
│   └── java/com/applocker/app/
│       ├── MainActivity.kt  MainApplication.kt          (RN host; super.onCreate(null))
│       ├── AppLockerPackage.kt                          (registers the modules)
│       ├── accessibility/AppAccessibilityService.kt
│       ├── apps/AppListModule.kt  IconCache.kt  PackageChangeReceiver.kt
│       ├── biometric/BiometricModule.kt  BiometricHelper.kt
│       ├── lock/LockActivity.kt  LockController.kt  LockManager.kt  LockOverlay.kt
│       │        LockStateMachine.kt  (pure Kotlin)  ScreenStateReceiver.kt
│       ├── permissions/PermissionModule.kt  OemSettings.kt
│       └── storage/SecureStorage.kt  PinVerifier.kt  PinPolicy.kt  ProtectedAppsStore.kt
├── android/app/src/test/…               JUnit for the pure-Kotlin core
├── android/app/src/androidTest/…        optional instrumented tests
├── src/
│   ├── navigation/  screens/{Home,AppLock,Security,Permissions,LockSettings,About,Onboarding}Screen.tsx
│   ├── components/  (AppRow, SearchBar, PermissionRow, PinPad, StatusBanner)
│   ├── store/       (zustand: apps, security, permissions)
│   ├── services/    (typed wrappers over the native modules)
│   └── types/
├── .github/workflows/android.yml        (+ .github/scripts/e2e.sh)
├── patches/                             (patch-package, if needed)
└── README.md                            (limits, privacy, setup)
```

## 15. Dependencies

| Library                                                                                       | Why                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| react-native 0.87.1, react 19.2.3                                                             | Same as the music app                                     |
| @react-navigation/native + native-stack, react-native-screens, react-native-safe-area-context | Routes                                                    |
| zustand                                                                                       | State                                                     |
| (optional) react-native-svg                                                                   | Icons                                                     |
| `androidx.biometric:biometric`                                                              | BiometricPrompt                                           |
| `androidx.appcompat`, `androidx.fragment`                                                 | `FragmentActivity` for the prompt                       |
| `kotlinx-coroutines-android`                                                                | Off-thread app listing                                    |
| JUnit 4, Jest                                                                                 | Tests                                                     |
| **No** native-lock libraries, no analytics, no network libraries                        | Privacy: the manifest has**no INTERNET permission** |

## 16. Privacy

Local-first: no account, no backend, no analytics, no crash reporter, and **no INTERNET permission in the manifest** — the app physically cannot upload the app list, PIN or biometrics. Biometric data stays inside Android. The Accessibility Service reads only the package and window class name of the foreground window, never screen content. The About screen states all of this.

## 17. Risks and Android limitations

1. Accessibility can be switched off, the app force-stopped or uninstalled — protection then ends. (Device Admin could slow uninstall but adds risk and permissions; not in the MVP.)
2. Brief content flash before the lock appears.
3. Background activity launch rules vary by Android version and OEM (spike in Phase 1).
4. Restricted settings on Android 13+ for sideloaded APKs — extra onboarding step.
5. OEM background killing — mitigated by guidance, not solvable in code.
6. Some apps (banking, some browsers) detect overlays or restrict them.
7. Settings, installer and other system screens are not reliably lockable and we will not try to bypass any system security.
8. Face unlock only counts when Android rates it Strong.
9. RN 0.87 + new architecture is fragile (see §1); Phase 0 de-risks it.
10. Google Play will not accept this use of Accessibility; distribution is by APK only.

We will **not** build: silent install/uninstall, any bypass of Android authentication, credential capture, hidden behaviour, or anything that disables Android security controls.

## 18. Implementation phases

| Phase | Feature                                                                                                                                                                 | Files                                                                                                             | Native work                                 | RN work                                       | Tests                                     | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ------ |
| 0     | Repo + RN 0.87.1 skeleton; prove a custom module and a native Activity launch on the new architecture                                                                   | repo scaffold,`gradle.properties`, `MainActivity.kt`, `AppLockerPackage.kt`, hello module                   | Hello module + empty Activity               | Hello screen                                  | Builds + runs on emulator                 | ☐     |
| 1     | **Detection spike:** AccessibilityService logs foreground package; test background launch of an Activity with/without overlay on Android 14/15 and one real phone | `AppAccessibilityService.kt`, accessibility xml, manifest                                                       | Service,`LockActivity` stub               | —                                            | Manual on emulator + phone                | ☐     |
| 2     | App discovery + App Lock list                                                                                                                                           | `AppListModule.kt`, `IconCache.kt`, `AppLockScreen.tsx`, `AppRow`, `SearchBar`, store                   | PackageManager, icon cache,`<queries>`    | List, search, filters                         | Jest filter tests; manual                 | ☐     |
| 3     | Secure storage + PIN                                                                                                                                                    | `SecureStorage.kt`, `PinVerifier.kt`, `PinPolicy.kt`, `SecuritySettingsModule.kt`, `PinPad`, Onboarding | Keystore, PBKDF2, lockout                   | PIN setup UI                                  | JUnit (hash, lockout, clock)              | ☐     |
| 4     | Lock screen + PIN unlock                                                                                                                                                | `LockActivity.kt`, `LockController.kt`, `LockManager.kt`, `LockOverlay.kt`, `LockModule.kt`             | Activity, overlay cover, back/home handling | Toggle ON/OFF wired to`LockModule`          | JUnit state machine; emulator e2e         | ☐     |
| 5     | Biometric unlock                                                                                                                                                        | `BiometricHelper.kt`, `BiometricModule.kt`, `SecurityScreen.tsx`                                            | BiometricPrompt                             | Enable/test biometric                         | Manual on phone; JUnit for fallback logic | ☐     |
| 6     | Permissions & Protection screen + OEM guidance                                                                                                                          | `PermissionModule.kt`, `OemSettings.kt`, `PermissionsScreen.tsx`                                            | Status checks, settings intents             | Status UI, onboarding for restricted settings | Manual per OEM                            | ☐     |
| 7     | Re-lock modes                                                                                                                                                           | `LockStateMachine.kt`, `ScreenStateReceiver.kt`, `LockSettingsScreen.tsx`                                   | State machine, screen-off receiver          | Settings form                                 | JUnit (all modes, loops)                  | ☐     |
| 8     | Home dashboard, About, locker's own gate                                                                                                                                | `HomeScreen.tsx`, `AboutScreen.tsx`, gate                                                                     | —                                          | Screens, status                               | Jest                                      | ☐     |
| 9     | CI/CD, private signing, version.json                                                                                                                                    | `.github/workflows/android.yml`, `e2e.sh`, signing config                                                     | Gradle signing                              | —                                            | CI run, install-over-update               | ☐     |
| 10    | Hardening + OEM test pass + release 1.0                                                                                                                                 | fixes                                                                                                             | Whatever the matrix finds                   | —                                            | Full manual matrix (§12)                 | ☐     |
| Later | Scheduled locking, per-app rules, intruder log, backup/restore of settings, disguise icon                                                                               | —                                                                                                                | —                                          | —                                            | —                                        | ☐     |

### Definition of done per phase

- **0:** debug and release APK build in CI; hello module returns a value; empty Activity opens over RN.
- **1:** the foreground package appears in logs for ≥ 10 apps; documented answer to "can the service start the lock screen without overlay permission" on Android 14/15 and one real phone; decision on usage access.
- **2:** every launchable app listed with icon and name; search is instant on ≥ 200 apps; no ANR; no hard-coded names.
- **3:** PIN never appears in logs or stored plaintext (checked); lockout survives restart and clock change; unit tests pass.
- **4:** opening a protected app shows the lock on emulator and phone; correct PIN opens it; Back/Home never reveal it; no loop in 50 consecutive switches.
- **5:** fingerprint opens it; cancel/failure falls back to PIN; no biometric enrolled is handled gracefully.
- **6:** every row reflects reality and its button opens the right page; restricted-settings help works on Android 13+; per-OEM tips shown.
- **7:** each mode behaves as in §8, covered by unit tests; no re-lock while using the app.
- **8:** Home counts are correct; the locker's own screens need authentication; About states the limits and privacy.
- **9:** tag → signed APK + `version.json` published; an update installs over the previous version; wrong signer is refused.
- **10:** matrix executed on at least Samsung, Xiaomi/Redmi and one of Oppo/Vivo/OnePlus/Realme, results recorded, known issues listed in README.

## 19. Files created or modified

- **Existing music-app files: none modified.** This plan is the only new file in this repository.
- Everything in §14 is **new**, in the new repository.
- Ideas carried over (copied, not edited): `gradle.properties`, Gradle wrapper version, `android.yml` structure, `smoke.sh` approach.

## 20. Recommended order

0 → 1 (the spike decides the architecture) → 3 → 2 → 4 → 5 → 6 → 7 → 8 → 9 → 10.
PIN storage (3) comes before the lock screen (4) so the lock is never built on a placeholder check, and the permissions/OEM work (6) is done early enough that the real-phone testing in 4 and 5 is not blocked by the phone killing the service.

## 21. Next step

Approve or change D1–D5 and I will start Phase 0 (the repository, a skeleton that builds, and the native-module spike). I will not touch the music app.
