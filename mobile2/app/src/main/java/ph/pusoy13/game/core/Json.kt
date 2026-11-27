package ph.pusoy13.game.core

import org.json.JSONArray
import org.json.JSONObject
import java.text.DecimalFormat
import java.time.Instant

/** Null-safe readers for the API's JSON (fields may be missing, null, strings or numbers). */
fun JSONObject.str(key: String): String? = if (!has(key) || isNull(key)) null else optString(key)
fun JSONObject.text(key: String, fallback: String = ""): String = str(key) ?: fallback
fun JSONObject.int(key: String, fallback: Int = 0): Int = if (!has(key) || isNull(key)) fallback else optString(key).toDoubleOrNull()?.toInt() ?: fallback
fun JSONObject.intOrNull(key: String): Int? = if (!has(key) || isNull(key)) null else optString(key).toDoubleOrNull()?.toInt()
fun JSONObject.num(key: String, fallback: Double = 0.0): Double = if (!has(key) || isNull(key)) fallback else optString(key).toDoubleOrNull() ?: fallback
fun JSONObject.numOrNull(key: String): Double? = if (!has(key) || isNull(key)) null else optString(key).toDoubleOrNull()
fun JSONObject.bool(key: String, fallback: Boolean = false): Boolean = if (!has(key) || isNull(key)) fallback else optBoolean(key, fallback)
fun JSONObject.obj(key: String): JSONObject? = if (!has(key) || isNull(key)) null else optJSONObject(key)
fun JSONObject.arr(key: String): JSONArray? = if (!has(key) || isNull(key)) null else optJSONArray(key)
fun JSONObject.objs(key: String): List<JSONObject> = arr(key)?.objects() ?: emptyList()
fun JSONObject.strs(key: String): List<String>? = arr(key)?.strings()
fun JSONObject.data(): JSONObject = optJSONObject("data") ?: this
fun JSONObject.dataList(): List<JSONObject> = optJSONArray("data")?.objects() ?: emptyList()

fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONArray.strings(): List<String> = (0 until length()).map { optString(it) }

fun instant(value: String?): Long? = value?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() ?: runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }

private val whole = DecimalFormat("#,##0")
private val upTo2 = DecimalFormat("#,##0.##")
private val two = DecimalFormat("#,##0.00")

/** A Chips / Gold amount: whole or with cents, e.g. 1,000 or 12.5. */
fun fmt(n: Number?): String = upTo2.format(n?.toDouble() ?: 0.0)
fun fmtWhole(n: Number?): String = whole.format(kotlin.math.floor(n?.toDouble() ?: 0.0))
fun fmt2(n: Number?): String = two.format(n?.toDouble() ?: 0.0)
fun signed(n: Double): String = "${if (n > 0) "+" else if (n < 0) "−" else ""}${fmt(kotlin.math.abs(n))}"

fun titleCase(value: String?): String = (value ?: "").lowercase().replace('_', ' ').split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) }

fun whenText(value: String?): String {
    val ms = instant(value) ?: return "—"
    return java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT).format(java.util.Date(ms))
}
