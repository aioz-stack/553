import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/**
 * Server settings come from mobile2/.env (gitignored) and are baked in at build time — rebuild
 * after changing them. The old EXPO_PUBLIC_* names from the React Native app still work.
 */
val env = Properties().apply {
    val f = rootProject.file(".env")
    if (f.exists()) f.forEachLine { line ->
        val t = line.trim()
        if (t.isNotEmpty() && !t.startsWith("#") && t.contains("=")) {
            val (k, v) = t.split("=", limit = 2)
            setProperty(k.trim().removePrefix("EXPO_PUBLIC_"), v.trim().trim('"'))
        }
    }
}
fun envOr(key: String, fallback: String) = env.getProperty(key)?.takeIf { it.isNotBlank() } ?: fallback
val apiUrl = ((findProperty("apiUrl") as String?) ?: envOr("API_URL", "http://10.0.2.2:8000")).trimEnd('/')

/** Optional release signing: mobile2/keystore.properties (storeFile, storePassword, keyAlias, keyPassword). */
val keystore = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "ph.pusoy13.game"
    compileSdk = 36

    defaultConfig {
        applicationId = "ph.pusoy13.game"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "2.0.0"

        buildConfigField("String", "API_URL", "\"$apiUrl\"")
        buildConfigField("String", "REVERB_KEY", "\"${(findProperty("reverbKey") as String?) ?: envOr("REVERB_APP_KEY", "")}\"")
        // -PreverbHost / -PreverbPort / -PreverbScheme override .env (e.g. a LAN test build).
        buildConfigField("String", "REVERB_HOST", "\"${(findProperty("reverbHost") as String?) ?: envOr("REVERB_HOST", "10.0.2.2")}\"")
        buildConfigField("int", "REVERB_PORT", (findProperty("reverbPort") as String?) ?: envOr("REVERB_PORT", "8080"))
        buildConfigField("String", "REVERB_SCHEME", "\"${(findProperty("reverbScheme") as String?) ?: envOr("REVERB_SCHEME", "http")}\"")
        // Plain-http backends (local development) need cleartext traffic; production uses https/wss only.
        manifestPlaceholders["cleartext"] = apiUrl.startsWith("http://").toString()
    }

    signingConfigs {
        if (keystore.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without keystore.properties, release builds are signed with the debug key (testing only).
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        // The layered art is already compressed WebP.
        noCompress += "webp"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    val compose = "1.10.5"
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-process:2.9.4")
    implementation("androidx.compose.ui:ui:$compose")
    implementation("androidx.compose.foundation:foundation:$compose")
    implementation("androidx.compose.animation:animation:$compose")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
