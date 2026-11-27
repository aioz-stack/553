# mobile2 — Pusoy 13 native Android app (Kotlin + Jetpack Compose)

A native Android rebuild of the `/mobile` app (Next.js + Capacitor). It works the same way: same
screens, same Laravel `/api/v1` endpoints, same Reverb real-time events, same rules. **The Laravel
backend stays the single source of truth**: this app shows state and sends requests; it never
shuffles, scores, settles or decides a payout.

Package id `ph.pusoy13.game` (installs next to the Capacitor app `ph.pusoy13.app`).

**Quick start:** every command (build, install, logs) is in **[COMMANDS.md](COMMANDS.md)**.

---

## 1. What is in it

| Screen | Same as `/mobile` | API |
|---|---|---|
| Splash, onboarding | `app/page.tsx`, `onboarding` | `GET /auth/me` |
| Login, register (invitation link) | `login`, `register` | `POST /auth/login`, `POST /auth/register` |
| Home: profile/level, Gold · Chips · Keys, friends, tiles | `home` | `/wallet`, `/practice/gold`, `/profile/stats`, `/friends`, `/tables/current` |
| Settings (BGM, SFX, motion, password), Shop (Keys), avatar + nickname | `SettingsPanel`, `ShopModal`, `AvatarPicker` | `/profile/*`, `/shop`, `/shop/key-exchanges` |
| Multiplayer Lobby: tabs, search, pages, Quick Join, Create / Join / Leave | `lobby` | `/lobbies*`, `/tables/{id}/leave` |
| Choose Your Seat: seats, bet, Start, server-timed countdown, kick, edit | `lobby/room` | `/lobbies/{id}`, `/seat`, `/bet`, `/start`, `/kick` |
| Multiplayer table: betting, deal, arrangement, Declared Luck, reveal, standings | `play`, `MultiplayerTable`, `LuckPopup`, `RevealShow` | `/tables/{id}`, `/games/{id}` (+`/bet`, `/draft`, `/preview`, `/submit`, `/lucky`), heartbeat |
| Single Player vs LuckyBot / CardBot / AceBot, Out of Gold | `practice`, `SinglePlayerPicker`, `OutOfGoldPopup` | `/practice/*` |
| Wallet + transactions, game history, notifications | `wallet`, `history`, `notifications` | `/wallet/transactions`, `/profile/games`, `/notifications` |
| Maintenance screen, "account connected elsewhere" | `MaintenanceGate`, `SessionDisconnected` | `GET /status`, 503 / `session_replaced` |

Real time: `core/Echo.kt` speaks the Pusher protocol to Laravel Reverb over an OkHttp WebSocket and
authorises `private-…` / `presence-…` channels at `/api/v1/broadcasting/auth` with the Sanctum
token — like `laravel-echo` in the web apps. Events are only signals to re-read the server state,
so a reconnect (network drop, app resume) recovers like a fresh load; polling covers a missing socket.

Art: the layered WebP art exported from the web components lives in `app/src/main/assets/art`
(each piece has a `manifest.json`); `ui/Base.kt` draws it on a Canvas and plays the same keyframe
animations. Screens use the web app's 1600×900 landscape stage, scaled to the phone.

Sound: effects and the background tune are synthesised in code (`core/Sound.kt`), like the web
apps' Web Audio versions — no audio files.

## 2. Layout

```
mobile2/
  app/build.gradle.kts         build config; reads ../.env into BuildConfig
  app/src/main/java/ph/pusoy13/game/
    MainActivity.kt            app + activity (landscape, immersive)
    Root.kt                    screen switch, maintenance and sign-out overlays
    core/                      Api (OkHttp), Echo (Reverb), Session (user, wallets), Models, Sound
    ui/                        Base (stage, art, fonts), Kit (buttons, popups, cards, avatars)
    screens/                   Auth, Home, Panels, Lobby, Room, Play, Practice, Arrange, TableKit, Account
  app/src/main/assets/         art/, avatars/, login-art.webp, maintenance.webp
  scripts/build-apk.ps1        build + copy the APK to dist/
```

## 3. Requirements

| Tool | Version |
|---|---|
| Android Studio | any recent; its bundled JDK (`jbr`) is used |
| Android SDK | Platform 36, Build-Tools 36 |
| Gradle | wrapper included (9.4.1) — nothing to install |

No Node.js, no C++ toolchain, no long-path setup: the app is plain Kotlin.

## 4. Configure the server

Copy `.env.example` to `.env` and set the API and Reverb values (they must match Laravel's
`REVERB_*`). They are baked in at build time, so **rebuild after changing them**. A plain `http`
API turns on cleartext traffic for that build only; production uses `https` / `wss`.

## 5. Build an APK

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
```

Output: `dist\pusoy13-release.apk` (`-Variant debug` for `dist\pusoy13-debug.apk`). Or open
`mobile2` in Android Studio and use **Build → Generate APKs**.

## 6. Signing for release

Without a key, release builds are signed with the Android debug key — fine for testing, not for the
Play Store. Create an upload key once (keep it safe, never commit it):

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore pusoy13-upload.jks -alias pusoy13 -keyalg RSA -keysize 2048 -validity 10000
```

Then create `mobile2/keystore.properties` (gitignored):

```properties
storeFile=pusoy13-upload.jks
storePassword=…
keyAlias=pusoy13
keyPassword=…
```

and build again; the release APK is signed with it.

## 7. Not included yet

- Push notifications (FCM needs a `google-services.json` from your Firebase project).
- iOS (this is the Android app; `/mobile` still covers iOS through Capacitor).
