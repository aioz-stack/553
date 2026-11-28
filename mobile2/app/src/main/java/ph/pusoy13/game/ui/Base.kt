package ph.pusoy13.game.ui

import android.content.Context
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.TextUnit
import org.json.JSONObject
import ph.pusoy13.game.R
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.num
import ph.pusoy13.game.core.objs
import ph.pusoy13.game.core.str
import ph.pusoy13.game.core.text
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// ---------------------------------------------------------------- theme

object C {
    val Night = Color(0xFF170A3A)
    val Gold = Color(0xFFFFE14D)
    val GoldDeep = Color(0xFFE08A00)
    val GoldEdge = Color(0xFFFFC531)
    val Cream = Color(0xFFFFE9B0)
    val Brown = Color(0xFF4A1D00)
    val Red = Color(0xFFB3141B)
    val RedDeep = Color(0xFF5A0609)
    val Maroon = Color(0xFF2A0204)
    val Green = Color(0xFF13A344)
    val Mint = Color(0xFF7DFFA0)
    val Pink = Color(0xFFFF9AA8)
    val Purple = Color(0xFF5A14B8)
    val White = Color.White
    val Dim = Color(0x99000000)
}

val Display = FontFamily(Font(R.font.baloo_extrabold, FontWeight.ExtraBold), Font(R.font.baloo_bold, FontWeight.Bold))
val Body = FontFamily(Font(R.font.nunito_bold, FontWeight.Bold), Font(R.font.nunito_black, FontWeight.Black))

// ---------------------------------------------------------------- stage (1600 × 900 units)

/** Screen pixels per stage unit: every screen is laid out on the web app's 1600×900 stage. */
val LocalUnit = staticCompositionLocalOf { 1f }

val Number.u: Dp
    @Composable @ReadOnlyComposable get() = with(LocalDensity.current) { (toFloat() * LocalUnit.current).toDp() }

/** A text size in stage units (ignores the system font scale, like the web stage). */
val Number.ts: TextUnit
    @Composable @ReadOnlyComposable get() = with(LocalDensity.current) { (toFloat() * LocalUnit.current).toSp() }

/** Place at stage coordinates (x, y), optionally with a size. */
@Composable
fun Modifier.at(x: Number, y: Number, w: Number? = null, h: Number? = null): Modifier {
    var m = offset(x.u, y.u)
    if (w != null && h != null) m = m.requiredSize(w.u, h.u)
    return m
}

/**
 * The landscape stage: 1600×900 units scaled to fit the screen and centred; `background` fills
 * the whole screen behind it (scenes cover the screen, so wider phones show no seam).
 */
@Composable
fun Stage(background: @Composable BoxScope.() -> Unit = {}, content: @Composable BoxScope.() -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().background(C.Night)) {
        val unit = min(constraints.maxWidth / 1600f, constraints.maxHeight / 900f)
        CompositionLocalProvider(LocalUnit provides unit) {
            Box(Modifier.fillMaxSize(), content = background)
            Box(Modifier.align(Alignment.Center).size(1600.u, 900.u), content = content)
        }
    }
}

// ---------------------------------------------------------------- art

/** One shared animation clock (seconds); stopped when motion effects are Low. */
val LocalClock = staticCompositionLocalOf<MutableFloatState?> { null }

@Composable
fun MotionClock(content: @Composable () -> Unit) {
    val clock = remember { mutableFloatStateOf(0f) }
    val level = Session.motion.value
    LaunchedEffect(level) {
        if (level == "low") return@LaunchedEffect
        var last = 0L
        val step = if (level == "medium") 2 else 1
        var frame = 0
        while (true) {
            withFrameNanos { now ->
                if (last != 0L && frame++ % step == 0) clock.floatValue += (now - last) * step / 1e9f
                last = now
            }
        }
    }
    CompositionLocalProvider(LocalClock provides clock, content = content)
}

data class ArtLayer(
    val file: String, val anim: String?, val x: Float, val y: Float, val w: Float, val h: Float,
    val duration: Float, val delay: Float, val timing: Int, val pivotX: Float?, val pivotY: Float?, val unit: Float, val flip: Boolean,
)

data class ArtPiece(val name: String, val width: Float, val height: Float, val layers: List<ArtLayer>)

/** Art exported from the web components (still layers + moving parts), read from assets/art. */
object ArtStore {
    private lateinit var context: Context
    private val pieces = mutableMapOf<String, ArtPiece?>()
    private val bitmaps = object : LruCache<String, ImageBitmap>((Runtime.getRuntime().maxMemory() / 3).toInt()) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }

    fun init(c: Context) {
        context = c.applicationContext
    }

    fun piece(name: String): ArtPiece? = synchronized(pieces) {
        pieces.getOrPut(name) {
            runCatching {
                val o = JSONObject(context.assets.open("art/$name/manifest.json").bufferedReader().readText())
                ArtPiece(name, o.num("width").toFloat(), o.num("height").toFloat(), o.objs("layers").map {
                    val t = it.text("timing")
                    ArtLayer(
                        it.text("file"), if (it.text("kind") == "anim") it.str("anim") else null,
                        it.num("x").toFloat(), it.num("y").toFloat(), it.num("w").toFloat(), it.num("h").toFloat(),
                        it.num("duration", 1.0).toFloat(), it.num("delay").toFloat(), if (t == "linear") 1 else if (t.startsWith("cubic-bezier(0.3")) 2 else 0,
                        if (it.has("pivotX")) it.num("pivotX").toFloat() else null, if (it.has("pivotY")) it.num("pivotY").toFloat() else null,
                        it.num("unit", 1.0).toFloat(), it.optBoolean("flip"),
                    )
                })
            }.getOrNull()
        }
    }

    /** Decode the full-screen scenes off the main thread at start-up so the first screen doesn't stall. */
    fun preload(vararg names: String) {
        Thread {
            names.forEach { n -> piece(n)?.layers?.forEach { bitmap("art/$n/${it.file}") } }
        }.apply { priority = Thread.MIN_PRIORITY; isDaemon = true }.start()
    }

    fun bitmap(path: String): ImageBitmap? {
        bitmaps.get(path)?.let { return it }
        val bmp = runCatching { context.assets.open(path).use { BitmapFactory.decodeStream(it) }?.asImageBitmap() }.getOrNull() ?: return null
        bitmaps.put(path, bmp)
        return bmp
    }
}

private class Pose(val tx: Float = 0f, val ty: Float = 0f, val tyP: Float = 0f, val rot: Float = 0f, val sx: Float = 1f, val sy: Float = 1f, val op: Float = 1f)
private fun p(tx: Float? = null, ty: Float? = null, tyP: Float? = null, rot: Float? = null, s: Float? = null, sx: Float? = null, sy: Float? = null, op: Float? = null) = floatArrayOf(
    tx ?: Float.NaN, ty ?: Float.NaN, tyP ?: Float.NaN, rot ?: Float.NaN, sx ?: s ?: Float.NaN, sy ?: s ?: Float.NaN, op ?: Float.NaN,
)

/** The web's keyframes (globals.css) as stops: [offset, tx, ty, tyP, rot, sx, sy, op]. */
private val KEYFRAMES: Map<String, List<Pair<Float, FloatArray>>> = mapOf(
    "lx-breathe" to listOf(0f to p(s = 1f, op = 0.8f), 0.5f to p(s = 1.1f, op = 1f), 1f to p(s = 1f, op = 0.8f)),
    "lx-drift" to listOf(0f to p(tx = 0f), 0.5f to p(tx = 70f), 1f to p(tx = 0f)),
    "lx-sea" to listOf(0f to p(tx = 0f), 0.5f to p(tx = -26f), 1f to p(tx = 0f)),
    "lx-palm" to listOf(0f to p(rot = -1.5f), 0.5f to p(rot = 1.5f), 1f to p(rot = -1.5f)),
    "lx-twinkle" to listOf(0f to p(s = 0.35f, rot = 0f, op = 0.2f), 0.5f to p(s = 1.15f, rot = 45f, op = 1f), 1f to p(s = 0.35f, rot = 0f, op = 0.2f)),
    "lx-spring-icon" to listOf(0f to p(), 0.09f to p(tyP = -0.14f, sx = 0.94f, sy = 1.08f), 0.18f to p(sx = 1.1f, sy = 0.88f), 0.25f to p(tyP = -0.05f, sx = 0.98f, sy = 1.03f), 0.32f to p(sx = 1.03f, sy = 0.97f), 0.4f to p(), 1f to p()),
    "tb-swing" to listOf(0f to p(rot = -3f), 0.5f to p(rot = 3f), 1f to p(rot = -3f)),
    "tb-sway-soft" to listOf(0f to p(rot = -4f), 0.5f to p(rot = 4f), 1f to p(rot = -4f)),
    "lx-sway" to listOf(0f to p(rot = -4f), 0.5f to p(rot = 4f), 1f to p(rot = -4f)),
    "lx-bob" to listOf(0f to p(ty = 0f), 0.5f to p(ty = -10f), 1f to p(ty = 0f)),
    "lx-coin" to listOf(0f to p(), 0.7f to p(), 0.8f to p(ty = -16f, sx = 0.96f, sy = 1.06f), 0.9f to p(ty = 0f, sx = 1.06f, sy = 0.92f), 1f to p()),
    "lx-spin" to listOf(0f to p(rot = 0f), 1f to p(rot = 360f)),
    "lx-nudge" to listOf(0f to p(tx = 0f), 0.5f to p(tx = 10f), 1f to p(tx = 0f)),
    "lx-glow" to listOf(0f to p(op = 0.8f), 0.5f to p(op = 1f), 1f to p(op = 0.8f)),
    "lx-glint" to listOf(0f to p(rot = -6f, s = 1f), 0.5f to p(rot = 6f, s = 1.08f), 1f to p(rot = -6f, s = 1f)),
    "tb-petal" to listOf(0f to p(tx = 0f, ty = -40f, rot = 0f, op = 0f), 0.1f to p(tx = 12f, ty = -10f, rot = 32f, op = 0.9f), 1f to p(tx = 120f, ty = 260f, rot = 320f, op = 0f)),
)
private val DEFAULTS = floatArrayOf(0f, 0f, 0f, 0f, 1f, 1f, 1f)

private fun ease(x: Float, timing: Int): Float = when (timing) {
    1 -> x
    2 -> 1 - (1 - x).pow(3) * (1 - 1.6f * x)
    else -> (0.5 - 0.5 * cos(PI * x)).toFloat()
}

private fun poseAt(stops: List<Pair<Float, FloatArray>>, t: Float, timing: Int, out: FloatArray): FloatArray {
    var i = 0
    while (i < stops.size - 2 && t > stops[i + 1].first) i++
    val (o0, a) = stops[i]
    val (o1, b) = stops[i + 1]
    val k = ease(if (o1 > o0) ((t - o0) / (o1 - o0)).coerceIn(0f, 1f) else 0f, timing)
    for (j in 0 until 7) {
        val u = if (a[j].isNaN()) DEFAULTS[j] else a[j]
        val v = if (b[j].isNaN()) DEFAULTS[j] else b[j]
        out[j] = u + (v - u) * k
    }
    return out
}

/** A layer ready to draw: bitmap and keyframes resolved once instead of every frame. */
private class Prepared(val l: ArtLayer, val bmp: ImageBitmap, val stops: List<Pair<Float, FloatArray>>?)

/** Consecutive layers that are all still or all moving, drawn together in one render layer. */
private class Run(val moving: Boolean, val layers: MutableList<Prepared> = mutableListOf(), val pose: FloatArray = FloatArray(7))

private fun DrawScope.layer(p: Prepared, s: Float, clock: Float?, pose: FloatArray) {
    val l = p.l
    val dst = IntSize(max(1, (l.w * s).toInt()), max(1, (l.h * s).toInt()))
    val stops = p.stops
    if (stops == null || clock == null) {
        drawImage(p.bmp, dstOffset = IntOffset((l.x * s).toInt(), (l.y * s).toInt()), dstSize = dst, filterQuality = FilterQuality.Medium)
        return
    }
    val raw = (clock - l.delay) / (if (l.duration > 0) l.duration else 1f)
    val q = poseAt(stops, raw - floor(raw), l.timing, pose)
    val dir = if (l.flip) -1f else 1f
    val unit = l.unit * s
    val pivot = if (l.pivotX != null && l.pivotY != null) Offset((l.pivotX - l.x) * s, (l.pivotY - l.y) * s) else Offset(dst.width / 2f, dst.height / 2f)
    translate(l.x * s + q[0] * unit * dir, l.y * s + q[1] * unit + q[2] * l.h * s) {
        rotate(q[3] * dir, pivot) {
            scale(q[4], q[5], pivot) {
                drawImage(p.bmp, dstSize = dst, alpha = q[6].coerceIn(0f, 1f), filterQuality = FilterQuality.Medium)
            }
        }
    }
}

private fun runs(piece: ArtPiece, animate: Boolean): List<Run> {
    val out = mutableListOf<Run>()
    piece.layers.forEach { l ->
        val bmp = ArtStore.bitmap("art/${piece.name}/${l.file}") ?: return@forEach
        val stops = l.anim?.let { KEYFRAMES[it] }
        val moving = animate && stops != null
        if (out.isEmpty() || out.last().moving != moving) out.add(Run(moving))
        out.last().layers.add(Prepared(l, bmp, stops))
    }
    return out
}

/**
 * Draws a piece as runs of still / moving layers, each in its own render layer: only the moving
 * runs re-record per frame, while still layers (and everything else on screen) are reused as-is.
 */
@Composable
private fun ArtRuns(piece: ArtPiece, animate: Boolean, modifier: Modifier, place: DrawScope.(draw: DrawScope.(Float) -> Unit) -> Unit) {
    val clock = if (animate) LocalClock.current else null
    val groups = remember(piece, clock != null) { runs(piece, clock != null) }
    Box(modifier) {
        groups.forEach { run ->
            Canvas(Modifier.matchParentSize().graphicsLayer()) {
                val t = if (run.moving) clock?.floatValue else null
                place { s -> run.layers.forEach { layer(it, s, t, run.pose) } }
            }
        }
    }
}

/** An exported art piece drawn into `modifier`'s size (keep its aspect ratio). */
@Composable
fun Art(name: String, modifier: Modifier, animate: Boolean = true) {
    val piece = remember(name) { ArtStore.piece(name) } ?: return
    ArtRuns(piece, animate, modifier) { draw -> draw(size.width / piece.width) }
}

/** A full-screen scene (beach / lantern room / table) covering the screen like CSS `slice`. */
@Composable
fun Scene(name: String, animate: Boolean = true) {
    val piece = remember(name) { ArtStore.piece(name) } ?: return
    ArtRuns(piece, animate, Modifier.fillMaxSize()) { draw ->
        val s = max(size.width / piece.width, size.height / piece.height)
        translate((size.width - piece.width * s) / 2, (size.height - piece.height * s) / 2) { draw(s) }
    }
}

/** A plain image from assets (avatars, login art); `cover` crops to fill without stretching. */
@Composable
fun AssetImage(path: String, modifier: Modifier, cover: Boolean = false) {
    val bmp = remember(path) { ArtStore.bitmap(path) } ?: return
    Canvas(modifier) {
        if (!cover) {
            drawImage(bmp, dstSize = IntSize(size.width.toInt(), size.height.toInt()), filterQuality = FilterQuality.Medium)
            return@Canvas
        }
        val s = max(size.width / bmp.width, size.height / bmp.height)
        val w = (bmp.width * s).toInt()
        val h = (bmp.height * s).toInt()
        drawImage(bmp, dstOffset = IntOffset(((size.width - w) / 2).toInt(), ((size.height - h) / 2).toInt()), dstSize = IntSize(w, h), filterQuality = FilterQuality.Medium)
    }
}
