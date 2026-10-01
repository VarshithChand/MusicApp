#!/usr/bin/env bash
# Runs inside the Android emulator: installs the APK, launches it, and records what happened.
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
adb shell monkey -p com.musicapp -c android.intent.category.LAUNCHER 1 2>&1 | tee -a "$OUT/result.txt"
sleep 25

echo "== process alive after 25s?" | tee -a "$OUT/result.txt"
if adb shell pidof com.musicapp >/dev/null 2>&1 && [ -n "$(adb shell pidof com.musicapp | tr -d '\r')" ]; then
  echo "ALIVE" | tee -a "$OUT/result.txt"
else
  echo "DEAD (crashed or exited)" | tee -a "$OUT/result.txt"
fi

adb exec-out screencap -p > "$OUT/screen.png" 2>/dev/null
adb logcat -d > "$OUT/logcat-full.txt" 2>&1
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNative|ReactNativeJS|com.musicapp|Process: |Caused by|UnsatisfiedLink|java.lang|DEBUG  |libc  " "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true
cat "$OUT/result.txt"
