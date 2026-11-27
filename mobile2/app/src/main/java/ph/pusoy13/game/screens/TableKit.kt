package ph.pusoy13.game.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import ph.pusoy13.game.core.LANES
import ph.pusoy13.game.core.Rows
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.lane
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.Card
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.LocalUnit
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

/** Seat panels on the 1600×900 table (TableLayout.tsx): the three others and you at the bottom. */
enum class Spot(val x: Int, val y: Int, val w: Int, val h: Int, val avatarX: Int?, val avatarY: Int?) {
    Top(730, 106, 336, 212, 590, 126),
    Left(168, 322, 364, 228, 20, 352),
    Right(1068, 322, 364, 228, 1444, 352),
    Bottom(446, 590, 708, 284, null, null),
}

/** What a seat shows: nothing, face-down backs (dealt), or its three rows (with reveal timing). */
sealed class SeatCards {
    data object Empty : SeatCards()
    data object Backs : SeatCards()
    data class Shown(val rows: Rows, val labels: Map<String, String>?, val outcomes: Map<String, Int>?, val up: ((String, Int) -> Boolean)? = null, val laneShown: ((String) -> Boolean)? = null) : SeatCards()
}

@Composable
fun BoxScope.HandPanel(
    spot: Spot,
    name: String,
    avatar: (@Composable () -> Unit)?,
    status: String? = null,
    statusColor: Color = C.White,
    banker: Boolean = false,
    offline: Boolean = false,
    glow: Boolean = false,
    cards: SeatCards = SeatCards.Empty,
    badges: List<Pair<String, Color>> = emptyList(),
    extra: (@Composable () -> Unit)? = null,
) {
    val you = spot == Spot.Bottom
    if (avatar != null && spot.avatarX != null && spot.avatarY != null) {
        Column(Modifier.at(spot.avatarX, spot.avatarY).width(136.u), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.border(4.u, if (banker) Color(0xFF7CC8FF) else if (glow) C.Gold else Color.White, RoundedCornerShape(18.u)).alpha(if (offline) 0.5f else 1f)) { avatar() }
            Txt(name, 20, maxLines = 1, align = TextAlign.Center, stroke = Color(0xAA000000), strokeWidth = 4)
            if (banker) Pill("BANKER", bg = Color(0xFFE08A00), color = C.Brown, size = 15)
            if (offline) Pill("offline", size = 14)
        }
    }
    GoldFrame(
        Modifier.at(spot.x, spot.y, spot.w, spot.h), radius = 26, rim = if (glow) 7 else 5,
        fill = Brush.verticalGradient(if (you) listOf(Color(0xE65A0609), Color(0xF22A0204)) else listOf(Color(0xCC1A0A12), Color(0xE60E0408))),
    ) {
        Column(Modifier.fillMaxSize().padding(10.u), verticalArrangement = Arrangement.spacedBy(4.u)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                if (you && avatar != null) avatar()
                Column(Modifier.weight(1f)) {
                    if (you) Txt(name + if (banker) " (banker)" else "", 24, maxLines = 1)
                    status?.let { Txt(it, if (you) 22 else 19, color = statusColor, maxLines = 2) }
                }
            }
            when (cards) {
                SeatCards.Empty -> Unit
                SeatCards.Backs -> Row(horizontalArrangement = Arrangement.spacedBy((-24).u)) { repeat(13) { Card(null, if (you) 54 else 38) } }
                is SeatCards.Shown -> Column(verticalArrangement = Arrangement.spacedBy(2.u)) {
                    LANES.forEach { l ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.u)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(if (you) (-6).u else (-8).u)) {
                                cards.rows.lane(l).forEachIndexed { i, c -> Card(if (cards.up?.invoke(l, i) == false) null else c, if (you) 54 else 38) }
                            }
                            if (cards.laneShown?.invoke(l) != false) {
                                cards.labels?.get(l)?.takeIf { it.isNotBlank() }?.let { Txt(it, if (you) 17 else 14, color = C.Cream, maxLines = 1) }
                                cards.outcomes?.get(l)?.let { o -> Txt(if (o > 0) "WIN" else if (o < 0) "LOSE" else "TIE", if (you) 17 else 14, color = if (o > 0) C.Mint else if (o < 0) C.Pink else C.White) }
                            }
                        }
                    }
                }
            }
            if (badges.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.u)) { badges.forEach { (t, c) -> Pill(t, bg = c, size = 14) } }
            extra?.invoke()
        }
    }
}

/** Felt centre: the PUSOY 553 crest, ROUND X / 12 and the status line. */
@Composable
fun BoxScope.TableCrest(round: Int, total: Int, status: String?) {
    Column(Modifier.at(560, 318).width(480.u), horizontalAlignment = Alignment.CenterHorizontally) {
        Art("mini-crest", Modifier.size(240.u, 140.u))
        Txt("ROUND ${minOf(round, total)} / $total", 30, color = C.Gold, stroke = Color(0xFF3A1300))
        status?.let { Pill(it, Modifier.padding(top = 6.u), size = 19) }
    }
}

@Composable
fun BoxScope.BankerRibbon() {
    Box(Modifier.at(618, 540).width(364.u), contentAlignment = Alignment.Center) {
        Pill("👑 YOU ARE THE BANKER", bg = Color(0xFFE08A00), color = C.Brown, size = 22)
    }
}

/** Lucky Hand / false declaration / misarranged tags under a revealed hand (each is 2× the bet). */
fun handBadges(lucky: String?, foul: Boolean, failed: Boolean): List<Pair<String, Color>> = buildList {
    if (lucky != null) add("${lucky.uppercase()} – LUCKY HAND · +2× BET" to Color(0xFF6A1FC9))
    if (failed) add("FALSE LUCKY −2× BET" to Color(0xFFD81E3C))
    if (foul && !failed) add("MISARRANGED −2× BET" to Color(0xFFD81E3C))
}

// ------------------------------------------------------------------ reveal show

data class RevealSeat(val seat: Int, val isBanker: Boolean, val bet: Double, val rows: Rows, val isFoul: Boolean, val lanes: Map<String, Int>?)
data class Fx(val kind: String, val seat: Int, val t: Long, val end: Long, val amount: Double)
data class RevealPlan(val flips: Map<String, Long>, val lanes: Map<String, Pair<Long, Long>>, val fx: List<Fx>, val done: Long)

private const val INTRO = 900L
private const val FLIP_GAP = 50L
private const val FLIP = 260L
private const val HOLD = 650L
private const val BOMB = 2300L
private const val ZAP = 2200L
private const val TAIL = 300L

/** Clockwise from the seat after the banker (the order the server deals and reveals in). */
fun dealOrder(banker: Int): List<Int> {
    val first = (banker % 4) + 1
    return (0..3).map { ((first - 1 + it) % 4) + 1 }
}

/**
 * The reveal sequence (RevealShow.tsx): ALL SUBMITTED → FRONT (cards flip one by one, every seat) →
 * FRONT RESULT → MIDDLE → BACK → PUSOY! (lost all three lanes) / ARAYYY KOOOO! (misarranged).
 * Seats are view seats: 1 you, 2 left, 3 top, 4 right.
 */
fun revealPlan(players: List<RevealSeat>, banker: Int): RevealPlan {
    val by = players.associateBy { it.seat }
    val order = dealOrder(banker).filter { it in by }
    val flips = mutableMapOf<String, Long>()
    val lanes = mutableMapOf<String, Pair<Long, Long>>()
    var t = INTRO
    for (lane in LANES) {
        val start = t
        for (seat in order) by[seat]?.rows?.lane(lane)?.forEachIndexed { i, _ -> flips["$seat:$lane:$i"] = t; t += FLIP_GAP }
        t += FLIP - FLIP_GAP
        lanes[lane] = start to t
        t += HOLD
    }
    val all = { p: RevealSeat, v: Int -> p.lanes != null && LANES.all { p.lanes[it] == v } }
    val others = players.filter { !it.isBanker }
    val bankerSeat = players.find { it.isBanker }
    val fx = mutableListOf<Triple<String, Int, Double>>()
    others.filter { !it.isFoul && all(it, -1) }.forEach { fx += Triple("bomb", it.seat, 2 * it.bet) }
    if (bankerSeat != null && !bankerSeat.isFoul) {
        val swept = others.filter { !it.isFoul && all(it, 1) }
        if (swept.isNotEmpty()) fx += Triple("bomb", bankerSeat.seat, swept.sumOf { 2 * it.bet })
    }
    players.filter { it.isFoul }.forEach { p -> fx += Triple("zap", p.seat, if (p.isBanker) others.filter { !it.isFoul }.sumOf { 2 * it.bet } else 2 * p.bet) }
    val timed = mutableListOf<Fx>()
    (fx.filter { it.first == "bomb" } + fx.filter { it.first == "zap" }).forEach { (k, s, a) ->
        val d = if (k == "bomb") BOMB else ZAP
        timed += Fx(k, s, t, t + d, a)
        t += d
    }
    return RevealPlan(flips, lanes, timed, t + TAIL)
}

fun RevealPlan.isUp(now: Long, seat: Int, lane: String, i: Int) = now >= (flips["$seat:$lane:$i"] ?: 0L)
fun RevealPlan.laneShown(now: Long, lane: String) = now >= (lanes[lane]?.second ?: 0L)

/** Milliseconds into the reveal show (plays flip / fx sounds); calls onDone at the end. */
@Composable
fun revealClock(plan: RevealPlan?, onDone: () -> Unit): Long {
    var now by remember(plan) { mutableLongStateOf(if (plan == null) Long.MAX_VALUE else 0L) }
    LaunchedEffect(plan) {
        if (plan == null) return@LaunchedEffect
        val start = withFrameMillis { it }
        val sounds = (plan.flips.values.map { it to "flip" } + plan.fx.map { it.t to if (it.kind == "bomb") "boom" else "zap" }).sortedBy { it.first }.toMutableList()
        while (true) {
            val t = withFrameMillis { it } - start
            now = t
            while (sounds.isNotEmpty() && sounds.first().first <= t) Sound.play(sounds.removeAt(0).second)
            if (t >= plan.done) {
                onDone()
                break
            }
        }
    }
    return now
}

@Composable
fun BoxScope.RevealBanner(plan: RevealPlan, now: Long, onSkip: () -> Unit) {
    val current = LANES.lastOrNull { now >= (plan.lanes[it]?.first ?: Long.MAX_VALUE) }
    val title = if (current == null) "ALL PLAYERS SUBMITTED" else current.uppercase()
    val sub = if (current == null) "Revealing…" else if (plan.laneShown(now, current)) "RESULT" else "Revealing…"
    GoldFrame(Modifier.at(640, 430, 320, 100), radius = 30, rim = 5) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Txt(title, 30, color = C.Gold, align = TextAlign.Center)
            Txt(sub, 20, align = TextAlign.Center)
        }
    }
    Box(Modifier.at(1420, 640).tap(onClick = onSkip).clip(RoundedCornerShape(999.u)).background(Color(0x66000000)).border(3.u, Color(0x99FFFFFF), RoundedCornerShape(999.u)).padding(horizontal = 20.u, vertical = 8.u)) {
        Txt("Skip ▸▸", 20)
    }
    val fx = plan.fx.firstOrNull { now >= it.t && now < it.end }
    if (fx != null) {
        val k = ((now - fx.t).toFloat() / (fx.end - fx.t)).coerceIn(0f, 1f)
        val pop = if (k < 0.15f) k / 0.15f else 1f
        val (x, y) = when (fx.seat) { 1 -> 800 to 650; 2 -> 300 to 430; 3 -> 900 to 210; else -> 1300 to 430 }
        Column(
            Modifier.at(x - 320, y - 90).width(640.u).graphicsLayer { scaleX = pop; scaleY = pop; alpha = if (k > 0.85f) (1 - k) / 0.15f else 1f }.rotate(if (fx.kind == "bomb") -4f else 3f),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Txt(if (fx.kind == "bomb") "💣 PUSOY!" else "⚡ ARAYYY KOOOO!", if (fx.kind == "bomb") 110 else 76, color = if (fx.kind == "bomb") Color(0xFFFFB21F) else C.Gold, stroke = if (fx.kind == "bomb") Color(0xFF7A0A00) else Color(0xFF3A0A6B), strokeWidth = 10, align = TextAlign.Center)
            Txt("−${fmt(fx.amount)}", 44, color = C.Pink, stroke = Color(0xFF2A0204))
        }
    }
}

// ------------------------------------------------------------------ deal animation

/**
 * Shuffle and the clockwise deal: 13 rounds of face-down cards fly from the centre to each seat
 * in deal order (view seats; 1 is you). Under Low motion it is skipped.
 */
@Composable
fun BoxScope.DealAnimation(roundId: Int, banker: Int, seats: List<Int>, onDone: () -> Unit) {
    val progress = remember(roundId) { Animatable(0f) }
    val order = remember(banker, seats) { dealOrder(banker).filter { it in seats } }
    LaunchedEffect(roundId) {
        if (Session.motion.value == "low") {
            onDone()
            return@LaunchedEffect
        }
        Sound.play("deal")
        progress.animateTo(1f, tween(2200))
        onDone()
    }
    val p = progress.value
    val total = 13 * order.size
    val dealt = (p * total).toInt()
    val unit = LocalUnit.current
    Box(Modifier.fillMaxSize().background(Color(0x40000000))) {
        Txt("Shuffling and dealing…", 34, modifier = Modifier.at(600, 470).width(400.u), align = TextAlign.Center, stroke = Color(0xAA000000))
        // the deck in the middle
        Box(Modifier.at(760, 380)) { Card(null, 80) }
        // the card in flight
        if (dealt < total) {
            val seat = order[dealt % order.size]
            val f = (p * total) - dealt
            val (tx, ty) = when (seat) { 1 -> 760 to 700; 2 -> 300 to 420; 3 -> 760 to 160; else -> 1220 to 420 }
            val x = 760 + (tx - 760) * f
            val y = 380 + (ty - 380) * f
            Box(Modifier.graphicsLayer { translationX = x * unit; translationY = y * unit; rotationZ = f * 180f }) { Card(null, 70) }
        }
        LaunchedEffect(dealt / maxOf(1, order.size)) { if (dealt in 1 until total) Sound.play("flip") }
    }
}
