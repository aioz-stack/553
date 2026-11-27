This is the native Android app for Pusoy 13 (Kotlin + Jetpack Compose, Gradle). It mirrors the
`/mobile` Next.js + Capacitor app screen for screen and talks to the same Laravel `/api/v1` and
Reverb. Read [README.md](README.md) first.

## Rules

- The Laravel backend is the single source of truth. Never shuffle, score, settle, decide a banker
  or a payout here; show what the server returns and send the player's choices.
- When `/mobile` changes a screen or an API call, port the same change here (and the reverse).
- Real-time events (`core/Echo.kt`) are signals to re-read state from the API, never data to trust.
- Chips, Gold and Keys are separate wallets; never combine them.
- Layout uses the 1600×900 stage (`ui/Base.kt`: `Stage`, `Modifier.at`, `Number.u`, `Number.ts`)
  so positions match the web app's stage coordinates.
- Art lives in `app/src/main/assets/art/<name>/manifest.json` + WebP layers; draw it with `Art(name)`.

## Commands

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat :app:compileDebugKotlin                                 # compile check
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1        # release APK → dist\
```

Compile before declaring any task done.
