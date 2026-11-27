# Pusoy 13 — React Native app (`mobile2`)

The native Android / iOS client for Pusoy 13, built with **Expo (React Native)**. It replaces the
Next.js + Capacitor app in `../mobile`, which ran inside a WebView and stuttered on real phones.

- **Native rendering.** Screens are native views. Animations run on the UI thread (Reanimated) and
  only move, rotate, scale or fade pre-rendered images, so the GPU never redraws artwork.
- **Same design.** The scenes (beach, lantern room), tile art, labels, cards and table were exported
  from the web components themselves (`scripts/art/`) and replayed natively with the same keyframes.
- **Same backend.** It talks to the Laravel app over the same `/api/v1` REST API (Sanctum bearer
  token) and the same Laravel Reverb server for real-time events. **No game rules, scoring or wallet
  logic live in the app** — the server decides everything; the app displays it.

| | |
|---|---|
| Framework | Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router |
| Animation | react-native-reanimated 4 |
| Real time | laravel-echo + pusher-js → Laravel Reverb |
| App id | `ph.pusoy13.native` (installs beside the old `ph.pusoy13.app`; change in `app.config.ts` when this app replaces it) |
| Orientation | Landscape |

---

## 1. Requirements (Windows)

| Tool | Notes |
|---|---|
| Node.js 20+ | `node -v` |
| Android Studio | Installs the Android SDK and a JDK (`…\Android Studio\jbr`) |
| Android SDK | Default `%LOCALAPPDATA%\Android\Sdk` (SDK Platform 36, Build-Tools 36) |
| A phone or emulator | Phone: enable **Developer options → USB debugging** |

Set these once (PowerShell, then reopen the terminal):

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
```

```powershell
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
```

No Docker is needed.

## 2. Install

```powershell
cd mobile2
```

```powershell
npm install
```

## 3. Connect to the Laravel backend (`.env`)

Copy `.env.example` to `.env` and set the server. The values are **baked into the app at build
time**, so rebuild after changing them. They must match Laravel's `REVERB_*` settings.

**Production / test server (real phones):**

```env
EXPO_PUBLIC_API_URL=https://test.asperioscents.com
EXPO_PUBLIC_REVERB_APP_KEY=<Laravel REVERB_APP_KEY>
EXPO_PUBLIC_REVERB_HOST=test.asperioscents.com
EXPO_PUBLIC_REVERB_PORT=443
EXPO_PUBLIC_REVERB_SCHEME=https
```

**Laravel on this PC (Android emulator):** the emulator reaches your PC's `localhost` as `10.0.2.2`.

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
EXPO_PUBLIC_REVERB_APP_KEY=<Laravel REVERB_APP_KEY>
EXPO_PUBLIC_REVERB_HOST=10.0.2.2
EXPO_PUBLIC_REVERB_PORT=8080
EXPO_PUBLIC_REVERB_SCHEME=http
```

Run the backend so the emulator can reach it (from the Laravel project root):

```powershell
php artisan serve --host=0.0.0.0 --port=8000
```

```powershell
php artisan reverb:start --host=0.0.0.0 --port=8080
```

A plain-`http` API automatically enables Android cleartext traffic for that build (`app.config.ts`);
production builds use `https` / `wss` only.

## 4. Run during development

The app uses native modules, so it runs as a **development build** (not Expo Go). The first run
compiles and installs it on the connected phone / emulator:

```powershell
npm run android
```

After that, start the JS server and the installed app reloads on every save:

```powershell
npm start
```

## 5. Build an APK

### Option A — Android Studio

1. Generate the native project (re-run after changing `app.config.ts`, icons or native packages):

   ```powershell
   npx expo prebuild --platform android
   ```

2. Android Studio → **Open** → `mobile2/android`.
3. **Build → Generate App Bundles or APKs → Generate APKs** (choose the *release* variant for real
   performance), or **Build → Generate Signed App Bundle / APK** for a store build (see §6).
4. The APK is in `mobile2/android/app/build/outputs/apk/release/app-release.apk`.

### Option B — command line

Release APK (optimized JavaScript, what players get; use this to judge smoothness):

```powershell
npm run apk:release
```

Debug APK (connects to the dev server from `npm start`):

```powershell
npm run apk:debug
```

Output: `android/app/build/outputs/apk/release/app-release.apk` (or `…/debug/app-debug.apk`).

Install on a USB-connected phone:

```powershell
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

> Test smoothness with a **release** build on a **real phone**. Debug builds run unoptimized
> JavaScript, and the emulator uses your PC's graphics card.

## 6. Signing for release (Play Store / sharing)

Out of the box, release builds are signed with the Android **debug** key: fine for testing, not for
the Play Store. Create your own upload key once and keep it safe (never commit it):

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -storetype PKCS12 -keystore pusoy13-upload.jks -alias pusoy13 -keyalg RSA -keysize 2048 -validity 10000
```

Then either sign in Android Studio (**Build → Generate Signed App Bundle / APK**, pick the `.jks`),
or build in the cloud with EAS, which manages the keys for you:

```powershell
npx eas-cli@latest build --platform android --profile production
```

Bump `android.versionCode` (and `version`) in `app.config.ts` for every store upload.

## 7. iOS

iOS builds need a Mac with Xcode (`npm run ios`) or EAS in the cloud
(`npx eas-cli@latest build --platform ios`). The bundle id is `ph.pusoy13.native`.

## 8. Project layout

```
mobile2/
  app.config.ts          app identity, orientation, plugins (native folders are generated from it)
  .env / .env.example    backend addresses (EXPO_PUBLIC_*)
  src/app/               screens (Expo Router): login, register, home, practice,
                         lobby, room/[id] (waiting room), table/[id] (multiplayer game)
  src/lib/               api (Sanctum), auth, echo (Reverb), wallet, multiplayer, motion, types
  src/ui/                Stage (1600×900 design canvas), Art (native animation engine),
                         kit (buttons, tiles, cards, panels), Arrange (card arrangement), Table
  src/art/generated.ts   GENERATED map of the exported art
  assets/art/            exported art (WebP + manifest.json per piece)
  scripts/art/           art exporter (runs in the web app) + index builder
```

All screens use the same 1600×900 coordinates as the web app, scaled to fit the phone. Scenes and
dialog dims fill the whole screen, so phones wider or taller than 16:9 show no seams.

## 9. Updating the art from the web app

The artwork comes from the web components, so design changes there can be re-exported:

1. Run the web app (`npm run dev` in `../mobile`, signed in) and the receiver:
   `node scripts/art/receiver.mjs`.
2. In the web page's console, export an SVG, e.g. the beach on `/home/`:
   `(await import('http://127.0.0.1:8787/exporter.js')).exportSvg(document.querySelector('svg.scene-bg'), 'beach', 1.5)`
3. Convert to WebP and regenerate the index: `npm run art:index`.

## 10. Status

Ported and working against the live API: login, registration, home (profile, live Gold / Chips /
Keys, friends list, return-to-seat), Settings (motion level, change password), **Single Player**
(difficulty picker, bet, deal, arrange with live hand names, submit, reveal, next round, match
summary, out of Gold, leave), **Multiplayer** (live lobby list, tabs, search, Join with password,
Quick Join, waiting room with seats / bet / Ready / synced countdown, table with betting, arranging
with server-saved drafts and timer, reveal, results, standings, leave rules, reconnect on resume).

Not ported yet (still on the web app): Shop and Keys purchase, Create Lobby, friend requests and
invites, avatar / nickname change, sound effects and music, the deal and reveal show animations,
Lucky Hand declaration, Out of Gold free-Gold claim, transactions / history screens, push
notifications, maintenance screen.

## 11. Checks

```powershell
npm run typecheck
```

```powershell
npx expo-doctor
```
