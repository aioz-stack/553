package ph.pusoy13.game.core

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import ph.pusoy13.game.BuildConfig
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Server settings baked in at build time from mobile2/.env (see app/build.gradle.kts). */
object Config {
    val apiUrl: String = BuildConfig.API_URL.trimEnd('/')
    val reverbKey: String = BuildConfig.REVERB_KEY
    val reverbHost: String = BuildConfig.REVERB_HOST
    val reverbPort: Int = BuildConfig.REVERB_PORT
    val reverbTls: Boolean = BuildConfig.REVERB_SCHEME == "https"
}

/** Small key/value store in the app's private storage (the Sanctum token, onboarding, settings). */
object Store {
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences("pusoy", Context.MODE_PRIVATE)
    }

    fun get(key: String): String? = prefs.getString(key, null)
    fun set(key: String, value: String?) = prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    fun flag(key: String, default: Boolean) = prefs.getBoolean(key, default)
    fun setFlag(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
}

class ApiException(
    message: String,
    val status: Int,
    val code: String? = null,
    val errors: Map<String, List<String>> = emptyMap(),
) : Exception(message)

fun errorText(e: Throwable): String = e.message?.takeIf { it.isNotBlank() } ?: "Something went wrong."

fun idempotencyKey(): String = UUID.randomUUID().toString()

/**
 * Thin client for the Laravel /api/v1 endpoints with a Sanctum bearer token. All game rules,
 * scoring and wallet logic stay on the server; this only sends requests and reports answers.
 */
object Api {
    private const val TOKEN_KEY = "pusoy.token"
    private val JSON_TYPE = "application/json".toMediaType()

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    @Volatile
    var token: String? = null
        private set

    /** Called when the server answers 401 to a signed-in request (token revoked or expired). */
    var onUnauthorized: (() -> Unit)? = null
    /** One active login per player: another device signed in (title, message). */
    var onDisconnected: ((String, String) -> Unit)? = null
    /** The server is in maintenance for the game (503 "maintenance"). */
    var onMaintenance: ((JSONObject?) -> Unit)? = null

    fun loadToken() {
        token = Store.get(TOKEN_KEY)
    }

    fun setToken(value: String?) {
        token = value
        Store.set(TOKEN_KEY, value)
    }

    /** Builds a JSON body from Kotlin maps / lists / JSONObjects. */
    fun body(vararg pairs: Pair<String, Any?>): JSONObject = JSONObject().apply {
        pairs.forEach { (k, v) -> put(k, wrap(v)) }
    }

    private fun wrap(v: Any?): Any? = when (v) {
        null -> JSONObject.NULL
        is JSONObject, is JSONArray -> v
        is Map<*, *> -> JSONObject().apply { v.forEach { (k, x) -> put(k.toString(), wrap(x)) } }
        is Collection<*> -> JSONArray().apply { v.forEach { put(wrap(it)) } }
        else -> v
    }

    suspend fun get(path: String, query: Map<String, Any?> = emptyMap()): JSONObject = call("GET", path, null, query)
    suspend fun post(path: String, body: JSONObject? = null): JSONObject = call("POST", path, body ?: JSONObject())
    suspend fun put(path: String, body: JSONObject): JSONObject = call("PUT", path, body)
    suspend fun patch(path: String, body: JSONObject): JSONObject = call("PATCH", path, body)
    suspend fun delete(path: String): JSONObject = call("DELETE", path, null)

    suspend fun call(method: String, path: String, body: JSONObject?, query: Map<String, Any?> = emptyMap()): JSONObject = withContext(Dispatchers.IO) {
        val sentToken = token
        val url = "${Config.apiUrl}/api/v1$path".toHttpUrl().newBuilder().apply {
            query.forEach { (k, v) -> if (v != null && v.toString().isNotEmpty()) addQueryParameter(k, v.toString()) }
        }.build()
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .apply { if (sentToken != null) header("Authorization", "Bearer $sentToken") }
            .method(method, body?.toString()?.toRequestBody(JSON_TYPE) ?: if (method == "GET" || method == "DELETE") null else "{}".toRequestBody(JSON_TYPE))
            .build()

        val response = try {
            http.newCall(request).execute()
        } catch (e: IOException) {
            throw ApiException("Network unavailable. Check your connection.", 0, "network")
        }

        response.use { r ->
            val text = r.body?.string().orEmpty()
            val data = if (text.isBlank()) JSONObject() else runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (r.isSuccessful) return@withContext data

            val code = data.optString("error").ifBlank { null }
            if (code == "account_already_connected" || code == "session_replaced") {
                val title = data.optString("title").ifBlank { if (code == "session_replaced") "Signed Out" else "Account Already Connected" }
                onDisconnected?.invoke(title, data.optString("message").removePrefix("Account Already Connected.").trim())
            }
            if (r.code == 401 && sentToken != null) {
                setToken(null)
                onUnauthorized?.invoke()
            }
            if (r.code == 503 && code == "maintenance") onMaintenance?.invoke(data.optJSONObject("maintenance"))

            val errors = mutableMapOf<String, List<String>>()
            data.optJSONObject("errors")?.let { e -> e.keys().forEach { k -> errors[k] = e.optJSONArray(k)?.strings() ?: listOf(e.optString(k)) } }
            val message = if (errors.isNotEmpty()) errors.values.flatten().joinToString(" ") else data.optString("message").ifBlank { "Request failed (${r.code})" }
            throw ApiException(message, r.code, code, errors)
        }
    }
}
