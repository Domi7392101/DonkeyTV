# Donkey TV

An Android TV app for [donkey.to](https://donkey.to). It is a WebView shell built for the remote: the D-pad drives everything and ad domains are blocked.

## Features

- WebView-based, no browser needed
- Full D-pad navigation (no touch or mouse required)
- Built-in cursor mode for sites that don't work well with focus navigation
- Ad domain blocking
- Built automatically with GitHub Actions, so there is no local Android Studio setup

## Controls

| Button | Action |
|---|---|
| D-pad arrows | Move focus |
| OK / Enter | Open / play |
| Long-press OK | Toggle mouse cursor |
| Menu | Open options |
| Back | Exit fullscreen, then go back a page; press twice quickly to quit |

## Install

### 1. Get the APK

1. Fork or clone this repo to your own GitHub account.
2. Open the **Actions** tab and run (or wait for) the build workflow.
3. Download the **DonkeyTV-apk** artifact and unzip it to get `app-debug.apk`.

### 2. Put it on your TV

**Option A: Downloader app**
Host the APK somewhere reachable and open the link in the Downloader app on your TV.

**Option B: ADB**

```bash
adb connect TV_IP:5555
adb install app-debug.apk
```

Enable *Developer options* and *ADB debugging* (or *Network debugging*) on the TV first. Allow installs from unknown sources for Downloader if you use option A.

## Building locally

```bash
./gradlew assembleDebug
```

The APK ends up in `app/build/outputs/apk/debug/`.

## Project layout

```
.github/workflows/   CI build that produces the APK artifact
app/                 Android app module (WebView shell)
build.gradle         Root Gradle config
settings.gradle
gradle.properties
```

## Troubleshooting

- **Player feels laggy:** make sure the TV isn't low on RAM (close other apps) and that hardware acceleration is enabled for the app.
- **Focus gets stuck:** long-press OK to switch to cursor mode and click manually.
- **App won't install over an old version:** uninstall the old one first if it was signed with a different key.

## Disclaimer

Donkey TV is only a viewer shell for a third-party website. It hosts no content and is not affiliated with donkey.to.
