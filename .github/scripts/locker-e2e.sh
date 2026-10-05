#!/usr/bin/env bash
# End-to-end test of the App Locker's core on a running emulator or device.
# Usage: locker-e2e.sh path/to/debug.apk
#
# It checks the part that matters and that unit tests cannot: that the Accessibility Service really notices a
# protected app opening and puts the lock screen on top, that Home sends the user away without revealing the app,
# and that the app locks again next time. It uses a DEBUG build because it writes the app's private settings with
# `run-as`. The PIN record it writes is a placeholder: the test never enters a PIN, it only checks the lock screen.
set -u
export MSYS_NO_PATHCONV=1 # Git Bash on Windows must not rewrite /sdcard paths
APK="$1"
PKG=com.applocker.app
SERVICE="$PKG/$PKG.accessibility.AppAccessibilityService"
PROTECTED=com.android.settings
FAILS=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILS=$((FAILS + 1)); }

focus() { adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -3 | tr -d '\r'; }
wait_for_focus() { # $1 = text expected in focus, $2 = seconds
  for _ in $(seq 1 "$2"); do
    if focus | grep -q "$1"; then return 0; fi
    sleep 1
  done
  return 1
}

adb wait-for-device
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
adb install -r "$APK" || { echo "FAIL: install"; exit 1; }

# Start once so the app's data folder exists, then stop it.
adb shell am start -n "$PKG/.MainActivity" >/dev/null
sleep 6
adb shell am force-stop "$PKG"

# Protect Android Settings and pretend a PIN exists (placeholder record), without any UI.
PREFS='<?xml version="1.0" encoding="utf-8" standalone="yes" ?><map><string name="protected_apps">[{&quot;p&quot;:&quot;'"$PROTECTED"'&quot;,&quot;n&quot;:&quot;Settings&quot;,&quot;e&quot;:true,&quot;t&quot;:1}]</string><string name="pin_record">1:AAAA:AAAA</string><int name="pin_length" value="6" /></map>'
adb shell "run-as $PKG sh -c 'mkdir -p shared_prefs && cat > shared_prefs/applocker.xml'" <<< "$PREFS" || { fail "could not write settings"; }

# Turn the accessibility service on (works from adb on an emulator).
adb shell settings put secure enabled_accessibility_services "$SERVICE"
adb shell settings put secure accessibility_enabled 1
sleep 4

# 1. Opening the protected app shows the lock screen.
adb shell input keyevent KEYCODE_HOME
sleep 1
adb shell am start -a android.settings.SETTINGS >/dev/null
if wait_for_focus "LockActivity" 12; then pass "lock screen appears when a protected app opens"; else fail "lock screen did not appear"; focus; fi

# 2. The lock screen has the app's name.
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q "Unlock Settings" && pass "lock screen says 'Unlock Settings'" || fail "lock screen text missing"

# 3. Home leaves the lock screen and does not reveal the protected app.
adb shell input keyevent KEYCODE_HOME
sleep 3
if focus | grep -q "LockActivity"; then fail "lock screen still showing after Home"; else pass "Home closes the lock screen"; fi
if focus | grep -q "com.android.settings"; then fail "protected app visible after Home"; else pass "protected app not revealed after Home"; fi

# 4. Opening it again locks again (no loop, no bypass).
adb shell am start -a android.settings.SETTINGS >/dev/null
if wait_for_focus "LockActivity" 12; then pass "locks again on the next open"; else fail "did not lock the second time"; focus; fi

# 5. Back also leaves without revealing it.
adb shell input keyevent KEYCODE_BACK
sleep 3
if focus | grep -q "com.android.settings"; then fail "Back revealed the protected app"; else pass "Back does not reveal the protected app"; fi

# 5b. Pressing Home and reopening immediately, several times, must lock every time (no stale event may reveal the app).
RAPID_OK=1
for i in 1 2 3 4; do
  adb shell "input keyevent KEYCODE_HOME; am start -a android.settings.SETTINGS" >/dev/null 2>&1
  if ! wait_for_focus "LockActivity" 10; then RAPID_OK=0; echo "rapid round $i: not locked"; focus; fi
  sleep 2
  adb shell input keyevent KEYCODE_HOME
  sleep 2
done
[ "$RAPID_OK" -eq 1 ] && pass "rapid Home + reopen locks every time" || fail "rapid Home + reopen revealed the app"

# 6. An unprotected app is not locked.
adb shell am start -a android.intent.action.VIEW -d "content://contacts/people" >/dev/null 2>&1
sleep 3
if focus | grep -q "LockActivity"; then fail "an unprotected app was locked"; else pass "unprotected apps are left alone"; fi

# 7. The service survived all of that and the app did not crash.
if adb logcat -d | grep -E "FATAL EXCEPTION" -A3 | grep -q "$PKG"; then fail "App Locker crashed"; adb logcat -d | grep -E "FATAL EXCEPTION" -A8 | head -30; else pass "no crash"; fi

echo "RESULT: failures=$FAILS"
[ "$FAILS" -eq 0 ]
