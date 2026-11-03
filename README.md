# Eclipse FLAC Bridge for MySpoti

FLAC playback and downloads using your authorized Eclipse account. Requires MySpoti 2.1.0 or later; segmented audio also requires its `audio.manifest` feature. Not affiliated with Eclipse or MySpoti.

## Install and configure

Download `extension.zip` from Releases and install it in MySpoti's Extensions screen. Enter your **Eclipse addon URL** and **Eclipse account token**, then put Eclipse first in playback and download sources. The public package contains no credentials.

### Get your account token and addon URL

1. On a **PC**, sign in at https://eclipsemusic.app/account.
2. Press **F12**. Open **Application** in Chrome/Edge/Brave, or **Storage** in Firefox.
3. Open **Local Storage → https://eclipsemusic.app**.
4. Find **`eclipse_token`** and copy only its **value**, without quotes. Paste it into **Eclipse account token** in the extension's settings. This is not your Google password.
5. On the Eclipse account page, open **Support the project → Eclipse addon → Copy**. Paste the complete personal link ending in `/manifest.json` into **Eclipse addon URL**.

If the key is missing, make sure you completed sign-in on the same domain selected in Local Storage. You do not need to paste commands into the console or disable browser protections. Never share your token, personal URL, logs containing signed URLs, or a personalized package. Google sign-in inside MySpoti's WebView is not used.

## Spotify Connect: phone and computer

1. Turn **Count extension plays on Spotify** off in MySpoti's settings.
2. Keep **Resume Eclipse when returning to this phone (experimental)** on in this extension.
3. Keep Eclipse first in playback sources.

The extension observes the remote device and requests playback through Eclipse only after confirming this phone is active again. The user confirmed phone → PC → phone playback; Spotify audio may be heard briefly before Eclipse resumes. Detection depends on playback events and may wait for the next progress event (10 seconds). A very fast round trip may not be detected. Paused, buffering, unknown or ambiguous device states do not trigger automatic resume.

This feature does not create its own Spotify mirror or guarantee Spotify listen counting while Eclipse plays. It requests playback events, device access (`library.read`) and playback control permissions.

## Session lifetime

The extension verifies the session on first use and then daily when used, keeping the renewed token returned by Eclipse. Observed tokens were valid for 30 days, and verification returned a renewed 30-day lifetime. This does not guarantee indefinite access: an expired or revoked session, or service changes, may require a new token. Editing or clearing the token field clears the cached renewed session. An explicitly entered addon URL takes precedence over the discovered account URL.

## Audio support and validation

Supports direct FLAC and unencrypted, finite HLS FLAC/fMP4 playlists with consecutive numbered HTTPS segments. For those playlists it generates the DASH manifest supported by MySpoti, without re-encoding audio. Unsupported layouts and DRM are rejected. Actual quality depends on Eclipse's response.

Real API tests covered FLAC up to 24-bit/96 kHz. A complete FLAC file was remuxed and decoded on the PC. The user confirmed Eclipse playback and Connect transfers in both directions on Android. Complete downloads and seeking on Android have not yet been confirmed.

## Development and tests

No external JavaScript dependencies. With Node.js:

```sh
node --test tests/*.test.cjs
```

With the official `myspoti-ext` runner:

```sh
myspoti-ext check .
myspoti-ext test . --scenario tests/smoke.json
myspoti-ext test . --scenario tests/http403.json
myspoti-ext test . --scenario tests/edge-cases.json
myspoti-ext pack .
```

Build the runner from the `base` directory of [MySpoti](https://github.com/kota-zo/myspoti) using `./gradlew :extensions-cli:installDist` (`gradlew.bat` on Windows). Scenarios are offline and use fictional credentials. Keep real runner logs private: they may include signed media URLs.
