package ph.pusoy13.game.screens

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.ui.ArtStore
import ph.pusoy13.game.ui.LocalUnit
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/*
 * Shuffle-and-deal animation (mobile/src/components/table/DealAnimation.tsx), drawn natively:
 * GATHER → FORM DECK → SPLIT → RIFFLE SHUFFLE → MERGE & SQUARE → DECK READY → DEAL CLOCKWISE →
 * your cards turn over. It only shows the deal the server already made: card p (0 = top of the
 * deck) goes to dealOrder(banker)[p % n]; bot cards stay face down; yours turn over (your real
 * cards, in the order you received them) once all are out. Same timings and poses as the web app.
 */

private const val CARD_W = 84f
private const val CARD_H = 118f
private const val CX = 800f
private const val CY = 455f
private const val TILT = 16f
private const val STEP = 1.1f
private const val SHUFFLE_SPEED = 0.275f
private fun T(ms: Float) = Math.round(ms * SHUFFLE_SPEED).toFloat()

private val PH_FORM = T(1900f)
private val PH_SPLIT = T(2650f)
private val PH_RIFFLE = T(3800f)
private val PH_MERGE = T(5800f)
private val PH_READY = T(6500f)
private val PH_DEAL = T(7200f)
private const val DEAL_GAP = 55f
private const val FLIGHT = 210f
private const val BOUNCE = 30f
private const val FLIP_GAP = 18f
private const val FLIP = 150f

private fun timing(n: Int): Pair<Float, Float> {
    val complete = PH_DEAL + (13 * n - 1) * DEAL_GAP + FLIGHT + 2 * BOUNCE + 40
    return complete to complete + 12 * FLIP_GAP + FLIP + 100
}

private data class Pose(val x: Float, val y: Float, val z: Float, val rz: Float, val rx: Float, val ry: Float, val s: Float)
private class Key(val t: Float, val p: Pose, val e: Easing)

private fun fanPose(seat: Int, k: Int): Pose {
    val d = (k - 6).toFloat()
    val z = 2 + k * 0.6f
    return when (seat) {
        1 -> Pose(CX + d * 32, 646 + abs(d) * 1.8f, z, d * 2.2f, TILT, 0f, 0.92f)
        3 -> Pose(CX - d * 17, 276 + abs(d) * 1.2f, z, 180 + d * 2, TILT, 0f, 0.56f)
        2 -> Pose(270 + abs(d) * 1.4f, CY - d * 15, z, 90 + d * 3, TILT, 0f, 0.56f)
        else -> Pose(1330 - abs(d) * 1.4f, CY + d * 15, z, -90 + d * 3, TILT, 0f, 0.56f)
    }
}

/** The web's small deterministic PRNG (mulberry32). */
private class Rng(seed: Int) {
    private var a = if (seed == 0) 1 else seed
    fun next(): Float {
        a += 0x6d2b79f5
        var t = a
        t = (t xor (t ushr 15)) * (t or 1)
        t = t xor (t + (t xor (t ushr 7)) * (t or 61))
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL) / 4294967296f
    }
}

private val EASE_IN_OUT = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)
private val EASE_IN = CubicBezierEasing(0.42f, 0f, 1f, 1f)
private val EASE_OUT = CubicBezierEasing(0f, 0f, 0.58f, 1f)

private fun cardKeys(p: Int, order: List<Int>, seed: Int): List<Key> {
    val r = Rng(seed * 131 + p * 7919 + 17)
    val left = p % 2 == 0
    val pileH = if (left) (50 - p) / 2f else (51 - p) / 2f
    val h = if (left) 26 + pileH else pileH
    val side = if (left) -1f else 1f
    val deckZ = { height: Float -> 1 + height * STEP }
    val keys = mutableListOf<Key>()
    var nextEase: Easing = LinearEasing
    fun at(t: Float, change: (Pose) -> Pose = { it }, e: Easing? = null) {
        val prev = keys.lastOrNull()?.p ?: Pose(CX, CY, 1f, 0f, TILT, 0f, 1f)
        keys += Key(t, change(prev), nextEase)
        nextEase = e ?: LinearEasing
    }

    // 1 GATHER
    val ang = r.next() * PI.toFloat() * 2
    val rad = 0.45f + r.next() * 0.55f
    val sx = CX + cos(ang) * 470 * rad
    val sy = CY + sin(ang) * 190 * rad
    val lands = T(700 + h * 20)
    val rz0 = r.next() * 360 - 180
    at(0f, { it.copy(x = sx, y = sy, z = 1f, rz = rz0, s = 0.9f) })
    at(lands - T(650f), e = CubicBezierEasing(0.45f, 0f, 0.2f, 1f))
    at(lands - T(300f), { it.copy(x = (sx + CX) / 2, y = (sy + CY) / 2 - 10, z = 40 + h * STEP, rz = (rz0 + (r.next() * 14 - 7)) / 2, s = 0.95f) }, CubicBezierEasing(0.2f, 0.6f, 0.3f, 1f))
    at(lands, { it.copy(x = CX + (r.next() * 8 - 4), y = CY + (r.next() * 6 - 3), z = deckZ(h), rz = r.next() * 14 - 7, s = 1f) })
    // 2 FORM
    at(PH_FORM, e = CubicBezierEasing(0.3f, 0f, 0.2f, 1f))
    at(PH_FORM + T(550f), { it.copy(x = CX, y = CY, rz = 0f) }, EASE_IN_OUT)
    at(PH_SPLIT - T(50f), { it.copy(z = deckZ(h) + 22) }, CubicBezierEasing(0.3f, 0f, 0.2f, 1f))
    // 3 SPLIT
    val pileZ = deckZ(pileH) + 10
    at(PH_SPLIT + T(250f), { if (left) it.copy(x = CX - 70, z = deckZ(h) + 60, rz = -3f) else it.copy(x = CX + 25, z = pileZ + 12, rz = 2f) }, EASE_IN_OUT)
    at(PH_SPLIT + T(700f), { it.copy(x = CX + side * 190, y = CY + 6, z = pileZ, rz = side * 7) })
    at(PH_RIFFLE - T(100f), { it.copy(x = CX + side * 122, z = pileZ + 6, ry = side * 16, rz = side * 4) })
    // 4 RIFFLE
    val k = 51 - p
    val drop = PH_RIFFLE + T(k * 34f)
    at(drop, e = CubicBezierEasing(0.5f, 0f, 0.6f, 1f))
    at(drop + T(70f), { it.copy(x = CX + side * 58, z = deckZ((51 - p).toFloat()) + 18, ry = side * 46, rz = side * 2) }, CubicBezierEasing(0.2f, 0.6f, 0.3f, 1f))
    at(drop + T(170f), { it.copy(x = CX + (r.next() * 4 - 2), y = CY, z = deckZ((51 - p).toFloat()), ry = 0f, rz = r.next() * 4 - 2) })
    // 5 MERGE
    at(PH_MERGE, e = EASE_IN_OUT)
    at(PH_MERGE + T(330f), { it.copy(rz = (51 - p) * 0.14f + 3, z = deckZ((51 - p).toFloat()) + 4) }, EASE_IN_OUT)
    at(PH_READY, { it.copy(x = CX, y = CY, rz = 0f, z = deckZ((51 - p).toFloat())) })
    // 6-8 DEAL
    val n = order.size
    val (complete, done) = timing(n)
    if (p >= 13 * n) {
        at(done)
        return keys
    }
    val seat = order[p % n]
    val target = fanPose(seat, p / n)
    val go = PH_DEAL + p * DEAL_GAP
    val spin = if (target.rz > 90) -1 else 1
    at(go, e = CubicBezierEasing(0.35f, 0f, 0.25f, 1f))
    at(go + FLIGHT * 0.5f, { it.copy(x = (CX + target.x) / 2, y = (CY + target.y) / 2 - 30, z = 150f, rz = target.rz / 2 + spin * 160, s = (1 + target.s) / 2 + 0.08f) }, CubicBezierEasing(0.15f, 0.55f, 0.3f, 1f))
    at(go + FLIGHT, { target.copy(rz = target.rz + spin * 360) }, EASE_OUT)
    at(go + FLIGHT + BOUNCE, { it.copy(z = target.z + 7) }, EASE_IN)
    at(go + FLIGHT + 2 * BOUNCE, { it.copy(z = target.z) })
    // 9 your cards turn over
    if (seat == 1) {
        val flip = complete + (p / n) * FLIP_GAP
        at(flip, e = EASE_IN)
        at(flip + FLIP / 2, { it.copy(z = target.z + 26, ry = 90f) }, EASE_OUT)
        at(flip + FLIP, { it.copy(z = target.z, ry = 180f) })
    }
    at(done)
    return keys
}

private fun poseAt(keys: List<Key>, t: Float): Pose {
    if (t <= keys.first().t) return keys.first().p
    for (i in 1 until keys.size) {
        val b = keys[i]
        if (t <= b.t) {
            val a = keys[i - 1]
            val span = (b.t - a.t).coerceAtLeast(0.001f)
            val k = b.e.transform(((t - a.t) / span).coerceIn(0f, 1f))
            fun m(x: Float, y: Float) = x + (y - x) * k
            return Pose(m(a.p.x, b.p.x), m(a.p.y, b.p.y), m(a.p.z, b.p.z), m(a.p.rz, b.p.rz), m(a.p.rx, b.p.rx), m(a.p.ry, b.p.ry), m(a.p.s, b.p.s))
        }
    }
    return keys.last().p
}

/**
 * Plays the deal for a round: `banker` and `seats` are view seats (1 = you), `cards` your 13 cards
 * in dealt order. Skip (or Low motion) ends it at once.
 */
@Composable
fun BoxScope.DealAnimation(roundId: Int, banker: Int, cards: List<String>, names: Map<Int, String>, seats: List<Int> = listOf(1, 2, 3, 4), onDone: () -> Unit) {
    val order = remember(banker, seats) { dealOrder(banker).filter { it in seats } }
    val n = order.size
    val (complete, done) = remember(n) { timing(n) }
    val keys = remember(roundId, order) { (0 until 52).map { cardKeys(it, order, roundId) } }
    var now by remember(roundId) { mutableLongStateOf(0L) }
    val u = LocalUnit.current
    LaunchedEffect(roundId) {
        if (Session.motion.value == "low") { onDone(); return@LaunchedEffect }
        Sound.play("deal")
        val start = withFrameMillis { it }
        var lastLanded = 0
        while (true) {
            val t = withFrameMillis { it } - start
            now = t
            val landed = (((t - PH_DEAL - FLIGHT) / DEAL_GAP).toInt() + 1).coerceIn(0, 13 * n)
            if (landed > lastLanded) { if (landed % 2 == 0) Sound.play("flip"); lastLanded = landed }
            if (t >= done) { onDone(); break }
        }
    }
    val back = remember { ArtStore.bitmap("art/cards/back/00-still.webp") }
    val mineIdx = order.indexOf(1)
    Box(Modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            val t = now.toFloat()
            // Draw in deck order, the cards that are higher (z) last.
            val poses = keys.mapIndexed { p, k -> p to poseAt(k, t) }.sortedBy { it.second.z }
            poses.forEach { (p, pose) ->
                val yours = mineIdx >= 0 && p < 13 * n && p % n == mineIdx
                val face = yours && pose.ry > 90f
                val img = if (face) ArtStore.bitmap("art/cards/${cards.getOrNull(p / n) ?: "AS"}/00-still.webp") else back
                img ?: return@forEach
                val x = pose.x * u
                val y = (pose.y - pose.z * 0.6f) * u
                // soft shadow on the felt under a lifted card
                val lift = (pose.z - 4).coerceAtLeast(0f)
                if (lift > 0) drawOval(Color.Black.copy(alpha = minOf(0.42f, lift / 90)), topLeft = Offset((pose.x + lift * 0.18f - CARD_W * pose.s / 2) * u, (pose.y + lift * 0.3f + 2 - CARD_H * pose.s / 2 * 0.96f) * u), size = androidx.compose.ui.geometry.Size(CARD_W * pose.s * u, CARD_H * pose.s * 0.96f * u))
                translate(x, y) {
                    rotate(pose.rz, Offset.Zero) {
                        val sx = pose.s * abs(cos(Math.toRadians(pose.ry.toDouble())).toFloat()).coerceAtLeast(0.02f)
                        val sy = pose.s * cos(Math.toRadians(pose.rx.toDouble())).toFloat()
                        scale(sx, sy, Offset.Zero) {
                            drawImage(img, dstOffset = IntOffset((-CARD_W / 2 * u).toInt(), (-CARD_H / 2 * u).toInt()), dstSize = IntSize((CARD_W * u).toInt(), (CARD_H * u).toInt()), filterQuality = FilterQuality.Medium)
                        }
                    }
                }
            }
        }
        // count badges per seat
        val landed = (((now - PH_DEAL - FLIGHT) / DEAL_GAP).toInt() + 1).coerceIn(0, 13 * n)
        val badge = mapOf(1 to (CX.toInt() + 230 to 600), 2 to (330 to 360), 3 to (CX.toInt() + 140 to 250), 4 to (1270 to 360))
        if (now >= PH_DEAL) order.forEach { seat ->
            val c = (0 until landed).count { order[it % n] == seat }
            val (bx, by) = badge.getValue(seat)
            Box(
                Modifier.at(bx - 19, by - 19).height(38.u).clip(RoundedCornerShape(999.u)).background(if (c == 13) Brush.verticalGradient(listOf(Color(0xFFFFD13A), Color(0xFFE08A00))) else Brush.verticalGradient(listOf(Color(0x99000000), Color(0x99000000))))
                    .border(3.u, if (c == 13) Color(0xFFFFF3A0) else Color(0xB3FFFFFF), RoundedCornerShape(999.u)).padding(horizontal = 8.u),
                contentAlignment = Alignment.Center,
            ) { Txt("$c", 20, color = if (c == 13) Color(0xFF4A1D00) else Color.White) }
        }
        val t = now.toFloat()
        val caption = when {
            t >= complete -> "All cards dealt"
            t >= PH_DEAL -> "Dealing clockwise from ${names[order.first()] ?: "the next seat"}…"
            t >= PH_READY -> "Deck ready"
            t >= PH_MERGE -> "Merging and squaring…"
            t >= PH_RIFFLE -> "Riffle shuffle…"
            t >= PH_SPLIT -> "Splitting the deck…"
            t >= PH_FORM -> "Forming the deck…"
            else -> "Gathering the cards…"
        }
        Box(Modifier.align(Alignment.TopCenter).padding(top = 548.u).clip(RoundedCornerShape(999.u)).background(Color(0x8C000000)).padding(horizontal = 20.u, vertical = 4.u)) {
            Txt(caption, 22, align = TextAlign.Center, maxLines = 1)
        }
        Box(
            Modifier.at(1420, 640).height(52.u).tap(label = "Skip", onClick = onDone).clip(RoundedCornerShape(999.u)).background(Color(0x66000000)).border(3.u, Color(0x99FFFFFF), RoundedCornerShape(999.u)).padding(horizontal = 20.u),
            contentAlignment = Alignment.Center,
        ) { Txt("Skip ▸▸", 20) }
    }
}
