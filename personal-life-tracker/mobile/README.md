# Life Tracker (Android app)

Fully offline. No internet permission. Data is stored in SQLite on the phone only (ADR-007).

## What works (2026-10-06)
Plan tab (salary day, loans with EMI/deduction day/tenure, savings, reminders), spending (add for any date, categories, delete, month totals, average per recorded day, projection, budget, "I recorded everything"), food, water, a Today screen with insights, all calculated on the phone. See the repository README for status and limits. Not built yet: Health Connect / watch data, screen time, borrowed/lent money and other recurring payments, water/food/expense reminders, backup and export, database encryption.

## Develop
```
npm install
npm run typecheck && npm test          # 134 tests: dates, money, analytics, insights, database (in-memory SQLite)
```
`npm test` needs Node 22+ (the database tests use Node's built-in `node:sqlite`).

## Build the APK on Windows
React Native's native build fails on Windows when the folder path is long (260-character limit). This script builds from a short drive letter (no admin rights needed):
```
set JAVA_HOME to a JDK 17 folder, ANDROID_HOME to the Android SDK
powershell -ExecutionPolicy Bypass -File scripts\build-android-windows.ps1 -Arch arm64-v8a,armeabi-v7a -Version 0.1.1 -Code 101
```
Output: `android/app/build/outputs/apk/release/app-release.apk`. Use `-Arch x86_64` for an emulator.

## Signing
Release builds are signed with the debug key unless `LIFETRACKER_KEYSTORE_FILE` (+ `_PASSWORD`, `LIFETRACKER_KEY_ALIAS`, `LIFETRACKER_KEY_PASSWORD`) are set. That is fine for installing on your own phone, but the debug key is public: anyone who gets the same key could sign an APK that installs over this app. Create a private key (see ../../docs/APP_LOCKER_RELEASE.md for the commands) before keeping the app long term.

## Layout
```
src/lib/        dates (YYYY-MM-DD, leap years, month boundaries), money (paise)
src/analytics/  spending, water/food, insight sentences (pure, tested; no AI)
src/db/         Db interface, migrations (schema v1), repositories, native module wrapper
src/notify/     reminder sync + native wrapper
src/screens/    Today, Spend, Food, Water, Plan, More
android/        Kotlin: LifeDbModule (SQLite), notify/ (alarms, notifications, boot receiver)
```
