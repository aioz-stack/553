# mobile2 — command list (native Android)

All commands are **PowerShell**, run from the `mobile2` folder. Full explanations: [README.md](README.md).

## 1. One-time setup

Use Android Studio's JDK for Gradle (add to your profile, or run in each new terminal):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

Server settings (baked in at build time):

```powershell
Copy-Item .env.example .env
```

## 2. Build the APK

Release (optimized; what players get):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
```

Output: `dist\pusoy13-release.apk`

Debug:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Variant debug
```

Output: `dist\pusoy13-debug.apk`

Compile only (fast check):

```powershell
.\gradlew.bat :app:compileDebugKotlin
```

## 3. Install and test

```powershell
adb install -r dist\pusoy13-release.apk
```

```powershell
adb shell am start -n ph.pusoy13.game/.MainActivity
```

App logs:

```powershell
adb logcat --pid=$(adb shell pidof -s ph.pusoy13.game)
```

## 4. Emulator → Laravel on this PC

```powershell
php artisan serve --host=0.0.0.0 --port=8000
```

```powershell
php artisan reverb:start --host=0.0.0.0 --port=8080
```

Set `API_URL=http://10.0.2.2:8000` and `REVERB_HOST=10.0.2.2` in `.env`, then rebuild.

## 5. Clean build

```powershell
.\gradlew.bat clean
```
