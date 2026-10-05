# App Locker — test matrix and results

Legend: ☑ passed (how it was checked) · ☐ not run yet · — not applicable. Nothing is marked passed that was not actually run.

## Automated (run in CI on every change to `app-locker/`)

| Layer | What | Count / status |
|---|---|---|
| Kotlin unit tests (`./gradlew testDebugUnitTest`) | Lock state machine: unprotected apps ignored, lock once, own package and System UI ignored, stays open while inside, immediate re-lock after leaving, timed grace, after-screen-lock, cancel then lock, rapid switching between protected apps, dismissal when moving on, turning protection off, 50-switch no-loop | 12 ☑ |
| | PIN hash (round trip, wrong PIN, different salts) | 2 ☑ |
| | PIN rules (format, trivial PINs, lockout schedule, countdown, reboot restarts the wait) | 5 ☑ |
| Jest (`npm test`) | App list search/filter (name, package, case, system apps, locked/unlocked), permission summary, brand tips, wait formatting | 9 ☑ |
| TypeScript (`tsc --noEmit`) | Whole project | ☑ clean |
| Emulator end-to-end (`.github/scripts/locker-e2e.sh`) | Lock screen appears over a protected app; says "Unlock <name>"; Home and Back never reveal the app; locks again next time; unprotected app is not locked; no crash | see section "Emulator results" |
| Release gate | Signed with the private key (not the debug key); no INTERNET permission; same signing certificate as the previous release; version higher than the published one | enforced by the pipeline on release |

## Manual matrix (physical phones)

| Area | Case | Result |
|---|---|---|
| Install | Fresh install | ☐ |
| | Update over the previous APK (same key) | ☐ |
| | Uninstall and reinstall clears locks | ☐ |
| App list | Installed apps appear with icon and name; nothing hard-coded | ☐ (emulator: see below) |
| | Search finds by name and by package; empty result message | ☐ |
| | New app installed while the list is open appears | ☐ |
| Toggle | ON the first time (PIN is already created in onboarding, no PIN prompt per app) | ☐ |
| | OFF removes the lock | ☐ |
| PIN | Create, mismatch on confirm, change PIN, correct PIN, wrong PIN ×5 lockout, lockout survives app restart, lockout after changing the clock | ☐ |
| Biometric | Fingerprint success / failure / cancel; not enrolled; sensor unavailable; too many attempts | ☐ |
| Permissions | Accessibility off shows the warning; restricted-settings help on Android 13+; overlay off; battery optimisation on | ☐ |
| Lifecycle | Reboot (service comes back); screen lock/unlock; Recents; Home; Back; rotation on the lock screen; split-screen; rapid switching between two protected apps; the locker's own gate; service killed; force-stop (protection ends — expected) | ☐ |
| Re-lock modes | Every time; after screen lock; after 1/5/15/30 min | ☐ |
| Targets | WhatsApp, Instagram, Telegram, Chrome, YouTube, Gallery, a banking app (some banking apps block overlays — record) | ☐ |
| OEM | Samsung, Xiaomi, Redmi, Oppo, Vivo, OnePlus, Realme: the service keeps running after 1 hour idle; lock screen opens from the background; brand tips match the phone | ☐ |

## Emulator results

Emulator: Android 17 (API 37), Pixel 6a image, x86_64, 16 KB pages, software graphics. Debug APK, `locker-e2e.sh`. 2026-10-05, after a clean reboot of the emulator:

| Check | Result |
|---|---|
| Lock screen appears when a protected app (Android Settings) opens | ☑ |
| Lock screen says "Unlock Settings" | ☑ |
| Home closes the lock screen | ☑ |
| Protected app not revealed after Home | ☑ |
| Locks again on the next open | ☑ |
| Back does not reveal the protected app | ☑ |
| Rapid Home + reopen locks every time (4 rounds) | ☑ |
| An unprotected app is not locked | ☑ |
| No crash | ☑ |
| **Result** | **9 of 9 passed, no ANR** |

### Honest notes
- Before the clean reboot, repeated runs on the same emulator (after many force-stops and reinstalls) produced "Input dispatching timed out: application does not have a focused window" after pressing Back on the lock screen, the process was killed and the service stayed down. Disabling the cover overlay or `FLAG_SECURE` did not change it, and Settings itself also ANR'd in that state, so I believe the emulator was degraded (it also had a crash-looping NFC service). After a reboot the full test passed repeatedly. **Not proven; re-check on real phones.**
- Not tested yet: a real fingerprint, a real phone, Android 14/15 images, any phone brand, the Keystore path on real hardware, the first-run onboarding UI by hand, and the GitHub pipeline.
