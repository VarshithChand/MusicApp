#!/usr/bin/env bash
# Runs inside the Android emulator: installs the APK, launches it, and records what happened.
# The last line of smoke-out/result.txt is ALIVE only if the app is running without any crash.
set -u
APK=${1:-app-release.apk}
OUT=smoke-out
mkdir -p "$OUT"

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb logcat -c

echo "== install" | tee "$OUT/result.txt"
adb install -r "$APK" 2>&1 | tee -a "$OUT/result.txt"

echo "== launch" | tee -a "$OUT/result.txt"
adb shell monkey -p com.musicapp -c android.intent.category.LAUNCHER 1 2>&1 | tail -2 | tee -a "$OUT/result.txt"
sleep 30

# Collect everything first, then judge.
adb exec-out screencap -p > "$OUT/screen.png" 2>/dev/null
adb logcat -d > "$OUT/logcat-full.txt" 2>&1
adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp" > "$OUT/focus.txt" || true
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNative|ReactNativeJS|com.musicapp|Process: |Caused by|UnsatisfiedLink|Fatal signal|Abort message" "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true

echo "== verdict" | tee -a "$OUT/result.txt"
VERDICT=ALIVE

# 1) a Java crash in our process
if grep -A2 "FATAL EXCEPTION" "$OUT/logcat-full.txt" | grep -q "Process: com.musicapp"; then
  echo "crash: Java FATAL EXCEPTION in com.musicapp" | tee -a "$OUT/result.txt"
  VERDICT=DEAD
fi

# 2) a native crash in our process
if grep -E "Fatal signal .*\(com\.musicapp\)" "$OUT/logcat-full.txt" | grep -q .; then
  echo "crash: native fatal signal in com.musicapp" | tee -a "$OUT/result.txt"
  VERDICT=DEAD
fi

# 3) Android's "keeps stopping" dialog is showing, or our app is not the one on screen
if grep -qiE "Application Error|keeps stopping" "$OUT/focus.txt"; then
  echo "crash: Android crash dialog is showing" | tee -a "$OUT/result.txt"
  VERDICT=DEAD
fi
if ! grep -q "com.musicapp" "$OUT/focus.txt"; then
  echo "crash: com.musicapp is not the focused app" | tee -a "$OUT/result.txt"
  VERDICT=DEAD
fi

echo "$VERDICT" | tee -a "$OUT/result.txt"
