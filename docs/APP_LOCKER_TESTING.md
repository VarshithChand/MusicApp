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
| Emulator end-to-end (`.github/scripts/locker-e2e.sh`) | Service running; lock screen appears over a protected app; says "Unlock <name>"; Home and Back never reveal the app; locks again next time; 4 rapid Home+reopen rounds; unprotected app is not locked; no crash | 10 checks ☑ locally (Android 17) and ☑ in GitHub Actions (Android 14), see "Emulator results" |
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

### Added 2026-10-05: layout, fingerprint animation, notifications, light theme

| Check | Result |
|---|---|
| Lock screen layout: app icon and name at the top, number pad at the bottom (dark and light), checked on a screenshot | ☑ |
| Animated fingerprint (pulsing ring + scan line) shown above the pad and tappable; checked on a screenshot with a forced preview because the emulator has no enrolled fingerprint | ☑ (look only; **not tested with a real fingerprint**) |
| Light theme on the lock screen (follows the system setting; status-bar icons turn dark) | ☑ screenshot |
| Notification text of a locked app replaced by "Unlock to read it", original text gone (emulator test, Android Shell as the locked sender) | ☑ in 2 consecutive runs |
| Notification rules: calls, alarms, music, navigation, downloads, ongoing and foreground-service notifications untouched; no removal when the replacement cannot be shown; own notifications ignored | ☑ 9 unit tests |
| Not tested: real WhatsApp/Telegram notifications, reply actions, group summaries on a real phone, notification access on Android 13+ restricted settings, the in-app Appearance screens by hand | ☐ |

### Honest notes
- Notification hiding removes the original notification, so its **Reply / Mark as read buttons are gone** for locked apps. The placeholder opens the app (after unlocking) instead. If a locked app re-posts the same notification, the placeholder is updated, not duplicated.
- Debug builds allow screenshots of the lock screen so the layout can be checked; release builds keep it hidden from screenshots and recents.
- **Force-stop switches the service off (Android behaviour, not a bug).** My first versions of the test force-stopped the app right before enabling the service. Android removes an app's accessibility service from the enabled list after a force-stop, which raced with the test: the first lock worked, then "Enabled services" became empty, the process was frozen and nothing locked any more. The GitHub run showed it (`Enabled services:{}`, `freezing ... com.applocker.app`). This is the documented limit that a force-stopped locker stops protecting; the Permissions/Home screens show "Protection is off" when it happens. The test now stops the process with a plain kill and checks the service is running before and during the run.
- Earlier on a local emulator I also saw "Input dispatching timed out: application does not have a focused window" after pressing Back, followed by the process being killed. That happened only in the degraded state produced by repeated force-stops/reinstalls. After switching the test to a plain kill, three consecutive full runs (one after a reboot, two without) passed with no ANR. I did not find a separate cause, so **re-check Back on the lock screen on real phones**.
- GitHub Actions run 37293548112 (checks job, Android 14 emulator): all steps green, 10 of 10 checks passed.
- Not tested yet: a real fingerprint, a real phone, any phone brand, typing a PIN on the lock screen, the Keystore path on real hardware, the first-run onboarding UI by hand, and a signed release from the GitHub pipeline (needs your signing secrets).
