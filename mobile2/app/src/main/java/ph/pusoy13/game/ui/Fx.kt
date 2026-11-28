package ph.pusoy13.game.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.SweepGradientShader
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.tan

/*
 * The web app's decorative CSS (mobile/src/app/globals.css) redone natively: the shimmering gold
 * rim (`lx-gold`) with its orbiting glint, the gloss dome + sweep (`lx-gloss`), glitter flecks
 * (`Glitter`), the idle spring bounce (`lx-spring*`), CandyText titles, the text shine and the
 * popup entrance (`sp-pop`). All run from the shared MotionClock and stop under Low motion.
 */

private fun clockNow(clock: androidx.compose.runtime.MutableFloatState?) = clock?.floatValue ?: 0f

private val GOLD_STOPS = arrayOf(
    0f to Color(0xFFB86A00), 0.18f to Color(0xFFFFD34D), 0.26f to Color(0xFFFFF7C2), 0.36f to Color(0xFFFFC531),
    0.55f to Color(0xFFC97A00), 0.72f to Color(0xFFFFD95E), 0.80f to Color(0xFFFFF3A6), 1f to Color(0xFFC47300),
)
private val AVATAR_GOLD_STOPS = arrayOf(
    0f to Color(0xFFA86204), 0.18f to Color(0xFFFFCC3D), 0.26f to Color(0xFFFFF7C2), 0.36f to Color(0xFFFFCC3D),
    0.55f to Color(0xFFA86204), 0.72f to Color(0xFFFFE07A), 0.80f to Color(0xFFFFF3A6), 1f to Color(0xFFA86204),
)

/** `lx-gold`: 110° gold gradient, 260% wide, sliding over 5 s (lx-shimmer). */
fun goldBrush(size: Size, t: Float, avatar: Boolean = false): Brush {
    val w = size.width * 2.6f
    val shift = -(t % 5f) / 5f * w
    val a = Math.toRadians(110.0 - 90.0)
    val dx = cos(a).toFloat() * w / 2
    val dy = sin(a).toFloat() * w / 2 * (size.height / size.width.coerceAtLeast(1f)).coerceAtMost(1f)
    val cx = size.width / 2 + shift + w / 2
    val cy = size.height / 2
    return Brush.linearGradient(colorStops = if (avatar) AVATAR_GOLD_STOPS else GOLD_STOPS, start = Offset(cx - dx, cy - dy), end = Offset(cx + dx, cy + dy), tileMode = TileMode.Repeated)
}

/** The orbiting glint of `lx-gold::after`: a conic light drawn on the rim ring only. */
private val GLINT = arrayOf(
    0f to Color.Transparent, 95f / 360 to Color.Transparent, 112f / 360 to Color(0x80FFFFFF), 120f / 360 to Color.White, 128f / 360 to Color(0x80FFFFFF),
    145f / 360 to Color.Transparent, 255f / 360 to Color.Transparent, 285f / 360 to Color(0x8CFFEC96), 312f / 360 to Color.White,
    328f / 360 to Color.White, 336f / 360 to Color(0xFFFFF3A0), 350f / 360 to Color(0x66FFEC96), 1f to Color.Transparent,
)

/**
 * A gold frame: shimmering gold fill with an orbiting glint on the `rim` ring. Put the content
 * inside with padding = rim. Radius / rim in stage units.
 */
@Composable
fun Modifier.goldRim(radius: Number, rim: Number, glintDelay: Float = 0f, avatar: Boolean = false, glint: Boolean = true): Modifier {
    val clock = LocalClock.current
    val u = LocalUnit.current
    val r = radius.toFloat() * u
    val w = rim.toFloat() * u
    // Shaders, paths and matrices are built once per size; each frame only moves the shaders'
    // local matrices. The outer/inner layers keep the per-frame redraw to this rim alone.
    return this.graphicsLayer().drawWithCache {
        val rr = r.coerceAtMost(size.minDimension / 2)
        val gold = goldShader(size, avatar)
        val goldBrush = ShaderBrush(gold)
        val goldMatrix = android.graphics.Matrix()
        val goldSpan = size.width * 2.6f
        val c = Offset(size.width / 2, size.height / 2)
        val glintShader = SweepGradientShader(c, GLINT.map { it.second }, GLINT.map { it.first })
        val glintBrush = ShaderBrush(glintShader)
        val glintMatrix = android.graphics.Matrix()
        val ring = ringPath(size, rr, w)
        onDrawWithContent {
            val t = clockNow(clock)
            goldMatrix.setTranslate(-(t % 5f) / 5f * goldSpan, 0f)
            gold.setLocalMatrix(goldMatrix)
            drawRoundRect(goldBrush, cornerRadius = CornerRadius(rr))
            drawContent()
            if (glint && clock != null) {
                // CSS conic starts at 12 o'clock, sweepGradient at 3 o'clock.
                val angle = ((t - glintDelay) % 4.2f) / 4.2f * 360f
                glintMatrix.setRotate(angle - 90f, c.x, c.y)
                glintShader.setLocalMatrix(glintMatrix)
                drawPath(ring, glintBrush)
            }
        }
    }.graphicsLayer()
}

/** The `goldBrush` gradient at t = 0 as a shader, so it can be slid with a local matrix. */
private fun goldShader(size: Size, avatar: Boolean): androidx.compose.ui.graphics.Shader {
    val w = size.width * 2.6f
    val a = Math.toRadians(110.0 - 90.0)
    val dx = cos(a).toFloat() * w / 2
    val dy = sin(a).toFloat() * w / 2 * (size.height / size.width.coerceAtLeast(1f)).coerceAtMost(1f)
    val cx = size.width / 2 + w / 2
    val cy = size.height / 2
    val stops = if (avatar) AVATAR_GOLD_STOPS else GOLD_STOPS
    return LinearGradientShader(Offset(cx - dx, cy - dy), Offset(cx + dx, cy + dy), stops.map { it.second }, stops.map { it.first }, TileMode.Repeated)
}

private fun ringPath(size: Size, radius: Float, rim: Float): Path {
    val outer = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(0f, 0f, size.width, size.height, CornerRadius(radius))) }
    val inner = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(rim, rim, size.width - rim, size.height - rim, CornerRadius((radius - rim).coerceAtLeast(0f)))) }
    return Path().apply { fillType = PathFillType.EvenOdd; addPath(outer); addPath(inner) }
}

/** `lx-gloss`: the glossy dome highlight on top and a light sweep crossing every 4.8 s. */
@Composable
fun Modifier.gloss(sweepDelay: Float = 0f, dome: Boolean = true): Modifier {
    val clock = LocalClock.current
    return this.graphicsLayer().drawWithCache {
        val l = size.width * 0.05f
        val top = size.height * 0.03f
        val h = size.height * 0.42f
        val domeBrush = Brush.verticalGradient(listOf(Color(0x8CFFFFFF), Color(0x00FFFFFF)), startY = top, endY = top + h)
        // The sweep band is built once at x = 0 and slid with translate().
        val bw = size.width * 0.28f
        val skew = tan(Math.toRadians(18.0)).toFloat() * size.height
        val band = Path().apply {
            moveTo(skew / 2, -size.height * 0.2f); lineTo(bw + skew / 2, -size.height * 0.2f)
            lineTo(bw - skew / 2, size.height * 1.2f); lineTo(-skew / 2, size.height * 1.2f); close()
        }
        val bandBrush = Brush.horizontalGradient(listOf(Color(0x00FFFFFF), Color(0x8CFFFFFF), Color(0x00FFFFFF)), startX = 0f, endX = bw)
        onDrawWithContent {
            drawContent()
            if (dome) drawRoundRect(domeBrush, topLeft = Offset(l, top), size = Size(size.width - 2 * l, h), cornerRadius = CornerRadius(minOf(size.width, h)))
            if (clock != null) {
                // lx-sweep: translateX(-160% → 520%) of a 28%-wide skewed band during 55% of 4.8 s.
                val p = (((clock.floatValue - sweepDelay) % 4.8f) + 4.8f) % 4.8f / 4.8f
                if (p < 0.55f) {
                    val e = (0.5 - 0.5 * cos(PI * (p / 0.55f))).toFloat()
                    translate((-1.6f + e * 6.8f) * bw, 0f) { drawPath(band, bandBrush) }
                }
            }
        }
    }.graphicsLayer()
}

/** Deterministic random numbers (the same sequence as Sparkles.tsx). */
private class Rand(seed: Int) {
    private var s = (seed * 9301L + 49297L)
    fun next(): Float {
        s = (s * 9301L + 49297L) % 233280L
        return s / 233280f
    }
}

private class Fleck(val star: Boolean, val x: Float, val y: Float, val px: Float, val delay: Float, val dur: Float)

/** Twinkling glitter (4-point stars and soft dots) over the parent box — `Glitter` in Sparkles.tsx. */
@Composable
fun BoxScope.Glitter(count: Int = 8, seed: Int = 1, size: Float = 1f) {
    val clock = LocalClock.current ?: return
    if (ph.pusoy13.game.core.Session.motion.value == "low") return
    val u = LocalUnit.current
    val flecks = remember(count, seed, size) {
        val r = Rand(seed)
        List(count) { i ->
            val star = i % 3 != 2
            val px = (if (star) 10 + r.next() * 16 else 3 + r.next() * 4) * size
            Fleck(star, (4 + r.next() * 92) / 100, (4 + r.next() * 88) / 100, px, r.next() * 3, 2 + r.next() * 2)
        }
    }
    val star = remember { Path() }
    Canvas(Modifier.matchParentSize().graphicsLayer()) {
        val t = clock.floatValue
        flecks.forEach { f ->
            val dur = if (f.star) f.dur else 3.1f
            val p = ((((t - f.delay) % dur) + dur) % dur) / dur
            // lx-fleck: 0/100% scale .2 op 0 · 45% scale 1 rot 45 op 1 · 60% scale .85 rot 60 op .9
            val (sc, rot, op) = when {
                p < 0.45f -> { val k = ease(p / 0.45f); Triple(0.2f + 0.8f * k, 45f * k, k) }
                p < 0.6f -> { val k = ease((p - 0.45f) / 0.15f); Triple(1f - 0.15f * k, 45f + 15f * k, 1f - 0.1f * k) }
                else -> { val k = ease((p - 0.6f) / 0.4f); Triple(0.85f - 0.65f * k, 60f - 60f * k, 0.9f - 0.9f * k) }
            }
            if (op <= 0.01f) return@forEach
            val c = Offset(f.x * this.size.width + f.px * u / 2, f.y * this.size.height + f.px * u / 2)
            val half = f.px * u / 2 * sc
            if (f.star) {
                rotate(rot, c) {
                    star.apply {
                        reset()
                        moveTo(c.x, c.y - half); lineTo(c.x + half * 0.22f, c.y - half * 0.22f); lineTo(c.x + half, c.y); lineTo(c.x + half * 0.22f, c.y + half * 0.22f)
                        lineTo(c.x, c.y + half); lineTo(c.x - half * 0.22f, c.y + half * 0.22f); lineTo(c.x - half, c.y); lineTo(c.x - half * 0.22f, c.y - half * 0.22f); close()
                    }
                    drawPath(star, Brush.radialGradient(listOf(Color.White, Color.White, Color(0xE6FFF6B8), Color.Transparent), center = c, radius = half.coerceAtLeast(0.1f)), alpha = op)
                }
            } else {
                drawCircle(Color(0xE6FFF0AA), radius = half + 6 * u * 0.5f, center = c, alpha = op * 0.35f)
                drawCircle(Color.White, radius = half, center = c, alpha = op)
            }
        }
    }
}

private fun ease(x: Float) = (0.5 - 0.5 * cos(PI * x)).toFloat()

/** The stable per-key spring timing of lib/spring.ts: (duration, delay) in seconds. */
fun springTiming(key: String, min: Float = 2.8f, spread: Float = 1.6f): Pair<Float, Float> {
    var h = 2166136261L.toInt()
    key.forEach { ch -> h = (h xor ch.code) * 16777619 }
    val u = h.toLong() and 0xFFFFFFFFL
    val a = (u % 1000) / 1000f
    val b = ((u ushr 10) % 1000) / 1000f
    val dur = min + a * spread
    return dur to -b * dur
}

private val SPRING = floatArrayOf(0f, 0.09f, 0.18f, 0.25f, 0.32f, 0.4f)
private val SPRING_Y = mapOf("tile" to floatArrayOf(0f, -0.04f, 0f, -0.012f, 0f, 0f), "icon" to floatArrayOf(0f, -0.14f, 0f, -0.05f, 0f, 0f))
private val SPRING_SX = mapOf("tile" to floatArrayOf(1f, 0.985f, 1.025f, 0.995f, 1.008f, 1f), "icon" to floatArrayOf(1f, 0.94f, 1.1f, 0.98f, 1.03f, 1f))
private val SPRING_SY = mapOf("tile" to floatArrayOf(1f, 1.02f, 0.97f, 1.008f, 0.993f, 1f), "icon" to floatArrayOf(1f, 1.08f, 0.88f, 1.03f, 0.97f, 1f))

/** The idle spring bounce (`lx-spring` = "tile", `lx-spring-icon` = "icon", `lx-spring-soft` = "soft"). */
@Composable
fun Modifier.spring(key: String, kind: String = "tile", min: Float = 2.8f, spread: Float = 1.6f): Modifier {
    val clock = LocalClock.current ?: return this
    val (dur, delay) = remember(key, min, spread) { springTiming(key, min, spread) }
    return this.graphicsLayer {
        val p = ((((clock.floatValue - delay) % dur) + dur) % dur) / dur
        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f)
        if (kind == "soft") {
            val (ty, sx, sy) = when {
                p < 0.12f -> ease(p / 0.12f).let { Triple(-0.012f * it, 1 - 0.003f * it, 1 + 0.006f * it) }
                p < 0.24f -> ease((p - 0.12f) / 0.12f).let { Triple(-0.012f * (1 - it), 0.997f + 0.009f * it, 1.006f - 0.011f * it) }
                p < 0.34f -> ease((p - 0.24f) / 0.1f).let { Triple(0f, 1.006f - 0.006f * it, 0.995f + 0.005f * it) }
                else -> Triple(0f, 1f, 1f)
            }
            translationY = ty * size.height; scaleX = sx; scaleY = sy
            return@graphicsLayer
        }
        val ys = SPRING_Y.getValue(kind); val xs = SPRING_SX.getValue(kind); val yss = SPRING_SY.getValue(kind)
        var i = 0
        while (i < SPRING.size - 2 && p > SPRING[i + 1]) i++
        if (p >= 0.4f) { translationY = 0f; scaleX = 1f; scaleY = 1f; return@graphicsLayer }
        val k = ease(((p - SPRING[i]) / (SPRING[i + 1] - SPRING[i])).coerceIn(0f, 1f))
        translationY = (ys[i] + (ys[i + 1] - ys[i]) * k) * size.height
        scaleX = xs[i] + (xs[i + 1] - xs[i]) * k
        scaleY = yss[i] + (yss[i + 1] - yss[i]) * k
    }
}

/** A constant bob (`lx-bob`, `lx-bob-slow`): translateY 0 → −10 → 0. */
@Composable
fun Modifier.bob(seconds: Float = 3.2f, amount: Number = 10): Modifier {
    val clock = LocalClock.current ?: return this
    val u = LocalUnit.current
    return graphicsLayer {
        val p = (clock.floatValue % seconds) / seconds
        translationY = -ease(if (p < 0.5f) p * 2 else 2 - p * 2) * amount.toFloat() * u
    }
}

/**
 * CandyText (HomeArt.tsx): bubbly title text — gradient fill, thick outline, a dark drop shadow, a
 * glossy top highlight and a light sweep every 4.5 s. Sizes in stage units.
 */
@Composable
fun CandyText(
    text: String,
    width: Number,
    height: Number,
    size: Number,
    modifier: Modifier = Modifier,
    stroke: Color = Color(0xFF6B2300),
    fill: List<Color> = listOf(Color(0xFFFFFBE0), Color(0xFFFFE14D), Color(0xFFFFA514)),
    sweepDelay: Float = 0f,
) {
    val measurer = rememberTextMeasurer(cacheSize = 1)
    val clock = LocalClock.current
    val u = LocalUnit.current
    val density = androidx.compose.ui.platform.LocalDensity.current
    val sweep = clock != null && ph.pusoy13.game.core.Session.motion.value != "low"
    // The text is measured once (per size), not on every frame; frames only redraw the layout.
    Box(modifier.size(width.u, height.u).graphicsLayer().drawWithCache {
        val fs = with(density) { (size.toFloat() * u).toSp() }
        val base = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = fs, textAlign = TextAlign.Center)
        val layout = measurer.measure(text, base.copy(color = Color.White))
        val maxW = this.size.width
        val scaleDown = if (layout.size.width > maxW) maxW / layout.size.width else 1f
        val baselineY = this.size.height / 2 + size.toFloat() * 0.36f * u
        val top = baselineY - layout.firstBaseline * scaleDown
        val left = (this.size.width - layout.size.width * scaleDown) / 2
        val sw = size.toFloat() * 0.16f * u
        val outline = Stroke(width = sw / scaleDown, join = StrokeJoin.Round)
        val h = layout.size.height.toFloat()
        val fillTop = layout.firstBaseline - size.toFloat() * u * 0.75f
        val fillBrush = Brush.verticalGradient(fill, startY = fillTop, endY = layout.firstBaseline)
        val shineBrush = Brush.verticalGradient(listOf(Color(0xF2FFFFFF), Color(0x00FFFFFF)), startY = fillTop, endY = fillTop + h * 0.45f)
        val w = width.toFloat() * u
        onDrawBehind {
            withTransform(scaleDown, left, top) {
                drawText(layout, Color(0x803D1200), Offset(0f, 7 * u))
                drawText(layout, stroke, drawStyle = outline)
                drawText(layout, fillBrush)
                drawText(layout, shineBrush)
                if (sweep) {
                    val p = (((clock!!.floatValue - sweepDelay) % 4.5f) + 4.5f) % 4.5f / 4.5f
                    if (p < 0.45f) {
                        val x = -w * 0.5f + (p / 0.45f) * w * 1.8f - left
                        drawText(layout, Brush.linearGradient(listOf(Color(0x00FFFFFF), Color(0xF2FFFFFF), Color(0x00FFFFFF)), start = Offset(x, 0f), end = Offset(x + w * 0.35f, height.toFloat() * u * 0.4f)))
                    }
                }
            }
        }
    })
}

private inline fun DrawScope.withTransform(scale: Float, left: Float, top: Float, block: DrawScope.() -> Unit) {
    translate(left, top) {
        drawContext.transform.scale(scale, scale, Offset.Zero)
        block()
        drawContext.transform.scale(1 / scale, 1 / scale, Offset.Zero)
    }
}

/** `lx-text-shine`: a metallic shine travelling across text every 4.5 s (base colour `c`). */
fun shineBrush(c: Color, t: Float, widthPx: Float, sweepDelay: Float = 0f): Brush {
    val p = (((t - sweepDelay) % 4.5f) + 4.5f) % 4.5f / 4.5f
    val k = if (p < 0.6f) ease(p / 0.6f) else 1f
    val w = widthPx * 3f
    val start = -w * (1f - 1.5f * k) + widthPx * 0.0f
    return Brush.linearGradient(
        colorStops = arrayOf(0f to c, 0.4f to c, 0.47f to Color(0xFFFFF7C2), 0.5f to Color.White, 0.53f to Color(0xFFFFF7C2), 0.6f to c, 1f to c),
        start = Offset(start, 0f), end = Offset(start + w, widthPx * 0.36f),
    )
}

/** `sp-pop`: a popup scales in from 0.7 with a springy overshoot (0.45 s). */
@Composable
fun Modifier.popIn(key: Any = Unit): Modifier {
    val a = remember(key) { Animatable(0f) }
    LaunchedEffect(key) { a.animateTo(1f, tween(450, easing = CubicBezierEasing(0.2f, 1.4f, 0.4f, 1f))) }
    return graphicsLayer {
        val v = a.value
        scaleX = 0.7f + 0.3f * v; scaleY = 0.7f + 0.3f * v; alpha = v.coerceIn(0f, 1f)
    }
}

/** A solid offset shadow under a rounded box (CSS `box-shadow: 0 <dy>px 0 <color>`), stage units. */
@Composable
fun Modifier.lip(dy: Number, color: Color, radius: Number): Modifier {
    val u = LocalUnit.current
    val d = dy.toFloat() * u
    val r = radius.toFloat() * u
    return drawBehind {
        drawRoundRect(color, topLeft = Offset(0f, d), size = size, cornerRadius = CornerRadius(r.coerceAtMost(size.minDimension / 2)))
    }
}

/** A soft drop shadow under a rounded box (CSS `0 <dy>px <blur>px rgba(0,0,0,a)`), approximated. */
@Composable
fun Modifier.softShadow(dy: Number, blur: Number, alpha: Float, radius: Number): Modifier {
    val u = LocalUnit.current
    return drawBehind {
        val steps = 6
        val b = blur.toFloat() * u
        val r = radius.toFloat() * u
        for (i in steps downTo 1) {
            val g = b * i / steps
            drawRoundRect(Color.Black.copy(alpha = alpha / steps), topLeft = Offset(-g / 2, dy.toFloat() * u - g / 2), size = Size(size.width + g, size.height + g), cornerRadius = CornerRadius(r + g / 2))
        }
    }
}

/** A soft glow around the box (CSS `box-shadow: 0 0 <blur>px <spread>px color`), approximated in layers. */
fun androidx.compose.ui.graphics.drawscope.DrawScope.softGlow(color: Color, blur: Float, radius: Float, circle: Boolean = false) {
    val steps = 8
    for (i in steps downTo 1) {
        val g = blur * i / steps
        val a = color.alpha * (1f - (i - 1f) / steps) / steps * 2.2f
        if (circle) drawCircle(color.copy(alpha = a.coerceIn(0f, 1f)), radius = size.minDimension / 2 + g)
        else drawRoundRect(color.copy(alpha = a.coerceIn(0f, 1f)), topLeft = Offset(-g, -g), size = Size(size.width + 2 * g, size.height + 2 * g), cornerRadius = CornerRadius(radius + g))
    }
}
