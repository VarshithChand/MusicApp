# App Locker — signing key and releasing

The release APK must be signed with a **private key that only you hold**. The public Android debug key is never used for a release: the build refuses to make a release APK without the private key, and the pipeline fails if the result looks debug-signed.

**Why this matters:** Android installs an update only over an app signed with the *same* key. If you lose this key, nobody can update; they would have to uninstall (which also clears their locks) and reinstall.

## 1. Create the key (once, on your computer)

Needs `keytool`, which comes with the JDK you already have (Temurin 17).

```
keytool -genkeypair -v -keystore applocker-release.jks -alias applocker -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a keystore password, a key password and some name fields. Choose strong passwords and write them in your password manager.

**Back up `applocker-release.jks` somewhere safe and offline** (two places). Do not put it in the repository (`*.keystore` / `*.jks` are ignored, but be careful).

## 2. Put it in GitHub Secrets

Repository → Settings → Secrets and variables → Actions → New repository secret. Create four:

| Secret | Value |
|---|---|
| `APPLOCKER_KEYSTORE_BASE64` | the key file encoded as text: `base64 -w0 applocker-release.jks` (Git Bash) |
| `APPLOCKER_KEYSTORE_PASSWORD` | the keystore password |
| `APPLOCKER_KEY_ALIAS` | `applocker` |
| `APPLOCKER_KEY_PASSWORD` | the key password |

Never paste these into chat or commit them.

## 3. Release

Either push a tag:

```
git tag locker-v1.0.0
git push origin locker-v1.0.0
```

or GitHub → Actions → **App Locker** → Run workflow → enter `1.0.0`.

The pipeline then: checks the version is higher than the published one; type-checks; runs the JavaScript and Kotlin tests; builds the debug APK and runs the **emulator test** (the lock screen must really appear over a protected app); builds the signed release APK; verifies the signature and that the key is not the debug key; verifies the APK has **no INTERNET permission**; refuses to continue if the signing certificate differs from the previous release; writes the SHA-256; publishes `app-locker.apk`, `app-locker.apk.sha256` and `version.json` to the GitHub release `locker-latest`.

Version numbers: `versionName = 1.2.3`, `versionCode = major*10000 + minor*100 + patch`. Minor and patch stay between 0 and 99.

Checks only (no release) run automatically on every push or pull request that changes `app-locker/`.

## 4. Install

Download `app-locker.apk` from the `locker-latest` release and open it on the phone (allow "install from this source" when Android asks). To verify the download, compare its SHA-256 with `app-locker.apk.sha256`.

On Android 13 and newer, the Accessibility switch is greyed out for apps installed from an APK until you open App info → ⋮ → **Allow restricted settings**. The app's Permissions screen explains this.

## Local test build without the private key

```
cd app-locker/android
./gradlew assembleRelease -PallowDebugSigning=true -PappVersionName=0.1.0 -PappVersionCode=100
```

That APK is for your own testing only and must never be shared or published.
