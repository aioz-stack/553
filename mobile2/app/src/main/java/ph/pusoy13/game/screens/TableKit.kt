package ph.pusoy13.game.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import ph.pusoy13.game.core.LANES
import ph.pusoy13.game.core.LANE_SIZE
import ph.pusoy13.game.core.Rows
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.lane
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyText
import ph.pusoy13.game.ui.Card
import ph.pusoy13.game.ui.Display
import ph.pusoy13.game.ui.LocalClock
import ph.pusoy13.game.ui.LocalUnit
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.gloss
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.softGlow
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.ts
import ph.pusoy13.game.ui.u
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/*
 * The PUSOY 553 game table shared by Single Player and Multiplayer — a port of
 * mobile/src/components/table/TableLayout.tsx, the table chrome of practice/page.tsx and
 * MultiplayerTable.tsx, Chip (TableArt.tsx) and RevealShow.tsx, on the 1600×900 stage:
 *
 *   ┌ top-left controls · logo ─────────── Total · Bet / Covering ┐
 *   │                 [avatar] [ TOP hand panel ]          Round  │
 *   │ [avatar][ LEFT hand panel ]  PUSOY 553  [ RIGHT hand panel ][avatar]
 *   │                             ROUND X / 12                    │
 *   │               [ [avatar]  YOUR hand panel ]     Skip · Sort │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Display only: every card, label, result and banker flag comes from the server.
 */

enum class Spot(val x: Int, val y: Int, val w: Int, val h: Int, val avatarX: Int?, val avatarY: Int?) {
    Top(730, 106, 336, 212, 590, 126),
    Left(168, 322, 364, 228, 20, 352),
    Right(1068, 322, 364, 228, 1444, 352),
    Bottom(446, 590, 708, 284, null, null),
}

/** What a panel's three rows show (TableLayout `PanelCards`). */
sealed class PanelCards {
    data object Empty : PanelCards()
    data object Backs : PanelCards()
    data class Shown(
        val rows: Rows,
        val labels: Map<String, String>?,
        val outcomes: Map<String, Int>?,
        val up: ((String, Int) -> Boolean)? = null,
        val laneShown: ((String) -> Boolean)? = null,
        val hit: Set<String> = emptySet(),
    ) : PanelCards()
}

val WinGreen = listOf(Color(0xFF3FE06E), Color(0xFF0F8A34))
val LoseRed = listOf(Color(0xFFFF5A6E), Color(0xFFB3121A))

@Composable
fun OutcomePill(v: Int) {
    val (txt, fill, border) = when {
        v > 0 -> Triple("WIN", WinGreen, Color(0xFFB8FFCB))
        v < 0 -> Triple("LOSE", LoseRed, Color(0xFFFFC2C8))
        else -> Triple("TIE", listOf(Color(0xFF9A9AA6), Color(0xFF5A5A66)), Color(0x99FFFFFF))
    }
    Box(Modifier.lip(2, Color(0x59000000), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(fill)).border(2.u, border, RoundedCornerShape(999.u)).padding(horizontal = 12.u, vertical = 1.u)) {
        Txt(txt, 14)
    }
}

@Composable
fun RankPill(text: String) {
    Box(Modifier.clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF2A1406), Color(0xFF0D0602)))).border(2.u, Color(0xFFFFC531), RoundedCornerShape(999.u)).padding(horizontal = 10.u, vertical = 1.u)) {
        Txt(text, 14, color = Color(0xFFFFE14D), maxLines = 1)
    }
}

/** Three card rows (3 / 5 / 5) with each row's hand ranking and result vs the banker. */
@Composable
fun HandRows(cards: PanelCards, large: Boolean) {
    val w = if (large) 54 else 38
    val h = if (large) 76 else 54
    val step = if (large) 57 else 41
    val clock = LocalClock.current
    Column(verticalArrangement = Arrangement.spacedBy((if (large) 8 else 6).u)) {
        LANES.forEach { lane ->
            val n = LANE_SIZE.getValue(lane)
            val shown = cards is PanelCards.Shown && (cards.laneShown == null || cards.laneShown.invoke(lane))
            val hit = cards is PanelCards.Shown && lane in cards.hit
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                Box(
                    Modifier.size((w + step * (n - 1)).u, h.u).then(
                        if (hit && clock != null) Modifier.graphicsLayer {
                            val p = (clock.floatValue * 1000 % 450) / 450f
                            translationX = (sin(p * 2 * PI) * 6).toFloat(); translationY = (cos(p * 2 * PI) * 2).toFloat()
                        } else Modifier,
                    ),
                ) {
                    repeat(n) { i ->
                        Box(Modifier.at(i * step, 0, w, h)) {
                            when {
                                cards is PanelCards.Empty || (cards is PanelCards.Shown && cards.rows.lane(lane).getOrNull(i) == null) ->
                                    Box(Modifier.size(w.u, h.u).clip(RoundedCornerShape(6.u)).background(Color(0x26000000)).dashed(Color(0x33FFFFFF), 6))
                                cards is PanelCards.Backs -> Card(null, w)
                                cards is PanelCards.Shown -> FlipCard(cards.rows.lane(lane)[i], w, cards.up?.invoke(lane, i) ?: true, hit)
                            }
                        }
                    }
                }
                Column(Modifier.alpha(if (shown) 1f else 0f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.u)) {
                    if (cards is PanelCards.Shown) {
                        cards.labels?.get(lane)?.takeIf { it.isNotBlank() }?.let { RankPill(it) }
                        cards.outcomes?.get(lane)?.let { OutcomePill(it) }
                    }
                }
            }
        }
    }
}

/** A two-sided card that turns face up (rotateY, 0.26 s) at its moment of the reveal show. */
@Composable
fun FlipCard(code: String, w: Int, up: Boolean, glow: Boolean = false) {
    val a = remember { Animatable(if (up) 0f else 180f) }
    LaunchedEffect(up) { a.animateTo(if (up) 0f else 180f, tween(260, easing = CubicBezierEasing(0.3f, 0.7f, 0.3f, 1.15f))) }
    val face = a.value < 90f
    Box(Modifier.graphicsLayer { rotationY = if (face) a.value else a.value - 180f; cameraDistance = 12f * density }.then(if (glow) Modifier.drawBehind { drawRoundRect(Color(0xAAC9A8FF), topLeft = Offset(-6f, -6f), size = Size(size.width + 12, size.height + 12), cornerRadius = CornerRadius(12f)) } else Modifier)) {
        Card(if (face) code else null, w)
    }
}

/** A dashed rounded border (the empty card slots). */
@Composable
fun Modifier.dashed(color: Color, radius: Number, width: Number = 2): Modifier {
    val u = LocalUnit.current
    return drawBehind {
        drawRoundRect(color, cornerRadius = CornerRadius(radius.toFloat() * u), style = Stroke(width.toFloat() * u, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(6 * u, 4 * u))))
    }
}

/** The avatar tile beside a panel (gold frame; brighter gold with a glow for the banker). */
@Composable
fun AvatarTile(banker: Boolean, glow: Boolean, offline: Boolean, content: @Composable () -> Unit) {
    val clock = LocalClock.current
    Box(contentAlignment = Alignment.BottomCenter) {
        Box(
            Modifier
                .then(if (glow && clock != null) Modifier.drawBehind {
                    val p = (clock.floatValue % 1.2f) / 1.2f
                    val k = (0.5 - 0.5 * cos(2 * PI * p)).toFloat()
                    softGlow(Color(0xFFFFE14D).copy(alpha = 0.9f * k), 34f * density * k + 1f, 18f * density)
                } else Modifier)
                .then(if (banker) Modifier.drawBehind { softGlow(Color(0xE6FFC83C), 24f * density, 18f * density) } else Modifier.lip(6, Color(0xFF7A3E00), 18))
                .then(if (banker) Modifier.clip(RoundedCornerShape(18.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFF3A0), Color(0xFFE08A00)))) else Modifier.goldRim(18, 5))
                .padding(5.u),
        ) {
            Box(Modifier.clip(RoundedCornerShape(13.u)).border(2.u, Color(0xB3FFFFFF), RoundedCornerShape(13.u)).alpha(if (offline) 0.55f else 1f)) { content() }
        }
        if (offline) Box(Modifier.offset(y = 8.u).clip(RoundedCornerShape(999.u)).background(Color(0xFF3A0D14)).padding(horizontal = 8.u)) { Txt("OFFLINE", 13, color = Color(0xFFFFB3BD)) }
    }
}

/**
 * One seat (TableLayout `HandPanel`): the avatar, name and status beside the panel (inside it for
 * you), and the panel with its three rows — or `children` (your bet chips, status) instead.
 */
@Composable
fun BoxScope.HandPanel(
    spot: Spot,
    name: String,
    avatar: @Composable () -> Unit,
    status: (@Composable () -> Unit)? = null,
    banker: Boolean = false,
    offline: Boolean = false,
    glow: Boolean = false,
    cards: PanelCards? = null,
    extra: (@Composable () -> Unit)? = null,
    children: (@Composable () -> Unit)? = null,
) {
    val you = spot == Spot.Bottom
    val tile = @Composable { AvatarTile(banker, glow, offline, avatar) }
    if (spot.avatarX != null && spot.avatarY != null) {
        Column(Modifier.at(spot.avatarX, spot.avatarY).width(132.u), horizontalAlignment = Alignment.CenterHorizontally) {
            if (banker) {
                Row(
                    Modifier.padding(bottom = 4.u).lip(3, Color(0xFF7A3E00), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00))))
                        .border(2.u, Color(0xFFFFF3A0), RoundedCornerShape(999.u)).padding(horizontal = 10.u),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.u),
                ) {
                    Art("crown-mark", Modifier.size(18.u, 14.u), animate = false)
                    Txt("BANKER", 15, color = Color(0xFF4A1D00))
                }
            }
            tile()
            Box(Modifier.padding(top = 4.u).widthIn(max = 150.u).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF3A0A0C), Color(0xFF1A0304)))).border(2.u, Color(0xB3D9A441), RoundedCornerShape(999.u)).padding(horizontal = 12.u, vertical = 2.u)) {
                Txt(name, 18, maxLines = 1)
            }
            status?.let { Box(Modifier.padding(top = 2.u)) { it() } }
        }
    }
    val panelShape = RoundedCornerShape(26.u)
    val clock = LocalClock.current
    Box(
        Modifier.at(spot.x, spot.y, spot.w, spot.h)
            .then(if (banker) Modifier.drawBehind { softGlow(Color(0xBFFFC83C), 28f * density, 26f * density) }.lip(8, Color(0xFF3A1600), 26) else Modifier.lip(8, Color(0x59000000), 26))
            .then(if (glow && !you.not() && clock != null) Modifier.drawBehind {
                val p = (clock.floatValue % 1.2f) / 1.2f
                val k = (0.5 - 0.5 * cos(2 * PI * p)).toFloat()
                softGlow(Color(0xFFFFE14D).copy(alpha = 0.9f * k), 34f * density * k + 1f, 26f * density)
            } else Modifier)
            .clip(panelShape)
            .background(Brush.verticalGradient(if (you) listOf(Color(0xF26E0B10), Color(0xF22A0305)) else listOf(Color(0xE60F4A2C), Color(0xE6082A19))))
            .border(3.u, if (banker) Color(0xFFFFD34D) else Color(0xCCD9A441), panelShape),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = if (you) 20.u else 12.u),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (you) Arrangement.spacedBy(16.u) else Arrangement.Center,
        ) {
            if (you) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    tile()
                    Txt(name, 18, maxLines = 1, modifier = Modifier.padding(top = 4.u).widthIn(max = 170.u))
                    status?.invoke()
                }
            }
            if (cards != null) {
                Column(verticalArrangement = Arrangement.spacedBy(4.u)) {
                    HandRows(cards, you)
                    extra?.invoke()
                }
            } else {
                Box(Modifier.weight(1f)) { children?.invoke() }
            }
        }
    }
}

/** The ★ BANKER (YOU) ★ ribbon over your panel, with a crown and laurels. */
@Composable
fun BoxScope.BankerRibbon() {
    Row(Modifier.at(618, 528).width(364.u), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.Center) {
        Art("laurel", Modifier.size(58.u), animate = false)
        Box(contentAlignment = Alignment.TopCenter) {
            Box(
                Modifier.padding(top = 20.u).lip(5, Color(0xFF4A0408), 14).clip(RoundedCornerShape(14.u)).background(Brush.verticalGradient(listOf(Color(0xFFE3283C), Color(0xFF7C0612))))
                    .border(3.u, Color(0xFFFFD34D), RoundedCornerShape(14.u)).padding(horizontal = 24.u, vertical = 4.u),
            ) { Txt("BANKER (YOU)", 28) }
            Art("crown-mark", Modifier.size(44.u, 33.u), animate = false)
        }
        Art("laurel", Modifier.size(58.u).graphicsLayer { scaleX = -1f }, animate = false)
    }
}

/** The centre of the felt: PUSOY 553 crest with laurels, the ROUND X / 12 badge and the status line. */
@Composable
fun BoxScope.TableCrest(round: Int, total: Int, status: (@Composable () -> Unit)?) {
    Column(Modifier.at(560, 318).width(480.u), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Art("laurel", Modifier.size(72.u), animate = false)
            Box(contentAlignment = Alignment.TopCenter) {
                Column(Modifier.padding(top = 0.u), horizontalAlignment = Alignment.CenterHorizontally) {
                    GradientText("PUSOY", 56, listOf(Color(0xFFFFF4B8), Color(0xFFF2C64A), Color(0xFFB07A0E)), Color(0xFF5A2A00))
                    Box(
                        Modifier.offset(y = (-4).u).lip(4, Color(0xFF06301A), 10).clip(RoundedCornerShape(10.u)).background(Brush.verticalGradient(listOf(Color(0xFF1F8A4A), Color(0xFF0B4A26))))
                            .border(3.u, Color(0xFFFFD34D), RoundedCornerShape(10.u)).padding(horizontal = 20.u),
                    ) { Txt("553", 34) }
                }
                Art("crown-mark", Modifier.offset(y = (-30).u).size(50.u, 38.u), animate = false)
            }
            Art("laurel", Modifier.size(72.u).graphicsLayer { scaleX = -1f }, animate = false)
        }
        Row(Modifier.padding(top = 8.u).popIn(round), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
            Box(Modifier.size(40.u, 3.u).clip(RoundedCornerShape(999.u)).background(Brush.horizontalGradient(listOf(Color.Transparent, Color(0xFFFFD34D)))))
            Row(
                Modifier.drawBehind { softGlow(Color(0x8CFFC83C), 18f * density, 999f) }.lip(4, Color(0xFF2A0204), 999)
                    .clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFA3101C), Color(0xFF4A0408)))).border(3.u, Color(0xFFFFD34D), RoundedCornerShape(999.u)).padding(horizontal = 28.u, vertical = 2.u),
            ) {
                Txt("ROUND ", 28)
                Txt("${minOf(round, total)} / $total", 28, color = C.Gold)
            }
            Box(Modifier.size(40.u, 3.u).clip(RoundedCornerShape(999.u)).background(Brush.horizontalGradient(listOf(Color(0xFFFFD34D), Color.Transparent))))
        }
        status?.let { Box(Modifier.padding(top = 6.u).widthIn(max = 470.u), contentAlignment = Alignment.Center) { it() } }
    }
}

/** The dark status pill under the crest. */
@Composable
fun StatusPill(text: String, color: Color = Color.White, content: (@Composable () -> Unit)? = null) {
    Box(Modifier.clip(RoundedCornerShape(999.u)).background(Color(0x73000000)).padding(horizontal = 16.u, vertical = 2.u), contentAlignment = Alignment.Center) {
        if (content != null) content() else Txt(text, 19, color = color, align = TextAlign.Center)
    }
}

/** Text filled with a vertical gradient and a solid drop shadow (bg-clip-text + drop-shadow). */
@Composable
fun GradientText(text: String, size: Number, fill: List<Color>, shadow: Color, dy: Number = 3) {
    val style = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = size.ts, lineHeight = size.ts)
    Box {
        androidx.compose.foundation.text.BasicText(text, Modifier.offset(y = dy.u), style = style.copy(color = shadow))
        androidx.compose.foundation.text.BasicText(text, style = style.copy(brush = Brush.verticalGradient(fill)))
    }
}

// ------------------------------------------------------------------ table chrome

/** The red round control button with a gold ring (Back / Settings / ?). */
@Composable
fun RoundButton(label: String, x: Int, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier.at(x, 18, 76, 76).tap(label = label, onClick = onClick).lip(6, Color(0xFF3A0204), 999).clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Color(0xFFB3141B), Color(0xFF5A0609)))).border(5.u, Color(0xFFFFC531), CircleShape),
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** Back · Settings · How to play, and the PUSOY 553 mini crest (top-left of every table). */
@Composable
fun BoxScope.TableControls(onBack: () -> Unit, onSettings: () -> Unit, onHelp: () -> Unit) {
    RoundButton("Back", 20, onBack) { Art("ic-back", Modifier.size(40.u), animate = false) }
    RoundButton("Settings", 108, onSettings) { Art("ic-gear", Modifier.size(40.u), animate = false) }
    RoundButton("How to play", 196, onHelp) { Txt("?", 44, color = Color(0xFFFFD34D)) }
    Art("mini-crest", Modifier.at(290, 4, 240, 140))
}

/** The wallet HUD (GoldWalletHud): TOTAL GOLD / TOTAL CHIPS with the server balance, flashing on change. */
@Composable
fun WalletHud(modifier: Modifier, label: String, amount: Double?, icon: String, sub: String? = null) {
    var last by remember { androidx.compose.runtime.mutableStateOf(amount) }
    var flash by remember { androidx.compose.runtime.mutableStateOf(0) }
    LaunchedEffect(amount) {
        val before = last
        last = amount
        if (amount != null && before != null && amount != before) {
            flash = if (amount > before) 1 else -1
            kotlinx.coroutines.delay(1200)
            flash = 0
        }
    }
    Box(modifier.size(330.u, 76.u).lip(6, Color(0xFF7A3E00), 26).goldRim(26, 4).padding(4.u)) {
        Row(Modifier.fillMaxSize().clip(RoundedCornerShape(22.u)).background(Brush.verticalGradient(listOf(Color(0xFF5A0609), Color(0xFF2A0204)))).padding(horizontal = 12.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
            Art(icon, Modifier.offset(x = (-4).u).size(52.u), animate = false)
            Column {
                Txt(label.uppercase(), 16, color = C.Gold)
                sub?.let { Txt(it, 14, color = Color(0x99FFFFFF)) }
            }
            Txt(amount?.let(::fmtWhole) ?: "…", 34, modifier = Modifier.weight(1f), align = TextAlign.End, color = when (flash) { 1 -> Color(0xFF7DFF8A); -1 -> Color(0xFFFF9A9A); else -> Color.White }, maxLines = 1)
        }
    }
}

/** The red bet pill (top right): "Bet: 10 Gold" / "Covering 450" / "Banker · no bet". */
@Composable
fun BoxScope.BetPill(text: String, icon: String) {
    Box(Modifier.at(1250, 18, 330, 76).lip(6, Color(0xFF7A3E00), 24).goldRim(24, 5).padding(5.u)) {
        Row(Modifier.fillMaxSize().clip(RoundedCornerShape(19.u)).background(Brush.verticalGradient(listOf(Color(0xFFB3141B), Color(0xFF5A0609)))).padding(horizontal = 12.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
            Art(icon, Modifier.size(56.u), animate = false)
            Txt(text, 28, modifier = Modifier.weight(1f), align = TextAlign.Center, maxLines = 1)
        }
    }
}

/** The round / banker line and a second info line under the bet pill (right-aligned). */
@Composable
fun BoxScope.InfoPills(line1: @Composable () -> Unit, line2: (@Composable () -> Unit)?) {
    Column(Modifier.at(1080, 100).width(498.u), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.u)) {
        Box(Modifier.clip(RoundedCornerShape(999.u)).background(Color(0x8C000000)).padding(horizontal = 16.u, vertical = 4.u)) { line1() }
        line2?.let { Box(Modifier.clip(RoundedCornerShape(999.u)).background(Color(0x73000000)).padding(horizontal = 16.u, vertical = 2.u)) { it() } }
    }
}

/** Inline coloured text runs: [("Round 3/12 · ", white), ("CardBot banks", gold)]. */
@Composable
fun Runs(size: Number, vararg runs: Pair<String, Color>) {
    Row { runs.forEach { (t, c) -> Txt(t, size, color = c, maxLines = 1) } }
}

/** The Sort button (bottom right): dealt → rank → suit; disabled outside the arranging phase. */
@Composable
fun BoxScope.SortButton(mode: String, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.at(1326, 748, 250, 76).alpha(if (enabled) 1f else 0.5f).tap(enabled = enabled, label = "Sort: $mode", onClick = onClick).lip(6, Color(0xFF5A0609), 22)
            .clip(RoundedCornerShape(22.u)).background(Brush.verticalGradient(listOf(Color(0xFFFF4A4A), Color(0xFFB3141B)))).border(5.u, Color(0xFFFFC531), RoundedCornerShape(22.u)),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        Art("ic-sort", Modifier.size(28.u, 36.u), animate = false)
        Txt("  Sort ", 36)
        Txt(mode, 16, color = Color(0xCCFFFFFF), font = ph.pusoy13.game.ui.Display)
    }
}

/** A casino chip (TableArt `Chip`): coloured disc, white edge spots, dashed inner ring, value. */
@Composable
fun Chip(value: String, color: Color, size: Number, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val density = androidx.compose.ui.platform.LocalDensity.current
    Canvas(modifier.size(size.u)) {
        val s = this.size.width / 100f
        drawCircle(Color.Black.copy(alpha = 0.3f), 46 * s, Offset(50 * s, 53 * s))
        drawCircle(color, 46 * s, Offset(50 * s, 50 * s))
        drawCircle(Color.White, 46 * s, Offset(50 * s, 50 * s), style = Stroke(2 * s))
        repeat(8) { i ->
            rotate(i * 45f, Offset(50 * s, 50 * s)) { drawRoundRect(Color.White, Offset(45 * s, 4 * s), Size(10 * s, 16 * s), CornerRadius(2 * s)) }
        }
        drawCircle(color, 31 * s, Offset(50 * s, 50 * s))
        drawCircle(Color.White, 31 * s, Offset(50 * s, 50 * s), style = Stroke(3 * s, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(5 * s, 4 * s))))
        drawCircle(Color.White.copy(alpha = 0.12f), 26 * s, Offset(50 * s, 50 * s))
        val arc = Path().apply { moveTo(22 * s, 34 * s); quadraticTo(50 * s, 8 * s, 78 * s, 34 * s) }
        drawPath(arc, Color.White.copy(alpha = 0.35f), style = Stroke(5 * s, cap = StrokeCap.Round))
        val fs = when { value.length > 4 -> 20; value.length > 3 -> 24; else -> 30 }
        val st = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = with(density) { (fs * s).toSp() })
        val lay = measurer.measure(value, st)
        val baseY = (if (value.length > 4) 58 else 61) * s
        val tl = Offset(50 * s - lay.size.width / 2f, baseY - lay.firstBaseline)
        drawText(measurer, value, tl, st.copy(color = Color(0x55000000), drawStyle = Stroke(2.4f * s, join = StrokeJoin.Round)))
        drawText(measurer, value, tl, st.copy(color = Color.White))
    }
}

val CHIP_COLORS = listOf(Color(0xFF1F6FE0), Color(0xFF14A046), Color(0xFFE0262F))

/** A bet chip button: lifts on press, raised with a gold glow while it is the selected bet. */
@Composable
fun BetChipButton(value: String, index: Int, size: Number, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.graphicsLayer { translationY = if (selected) -12f * density else 0f }
            .then(if (selected) Modifier.drawBehind { softGlow(Color(0xF2FFE14D), 16f * density, 0f, circle = true) } else Modifier)
            .alpha(if (enabled) 1f else 0.5f).tap(enabled = enabled, sound = null, label = "Bet $value", onClick = onClick),
    ) { Chip(value, CHIP_COLORS[index % 3], size) }
}

/** Lucky Hand / false declaration / misarranged tags under a revealed hand (each is 2× the bet). */
@Composable
fun HandBadges(lucky: String?, foul: Boolean, failed: Boolean) {
    if (lucky == null && !foul && !failed) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.u)) {
        if (lucky != null) Box(Modifier.clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFA24DFF), Color(0xFF4A0F9A)))).padding(horizontal = 12.u)) { Txt("${lucky.uppercase()} – LUCKY HAND · +2× BET", 15, color = C.Gold, maxLines = 1) }
        if (failed) Box(Modifier.clip(RoundedCornerShape(999.u)).background(Color(0xFFD81E3C)).padding(horizontal = 12.u)) { Txt("FALSE LUCKY −2× BET", 15) }
        if (foul && !failed) Box(Modifier.clip(RoundedCornerShape(999.u)).background(Color(0xFFD81E3C)).padding(horizontal = 12.u)) { Txt("MISARRANGED −2× BET", 15) }
    }
}

fun toneColor(n: Double) = if (n > 0) C.Mint else if (n < 0) C.Pink else C.White

// ------------------------------------------------------------------ reveal show

data class RevealSeat(val seat: Int, val isBanker: Boolean, val bet: Double, val rows: Rows, val isFoul: Boolean, val lanes: Map<String, Int>?, val misplaced: Set<String> = emptySet())
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
 * The reveal sequence (RevealShow.tsx): ALL PLAYERS SUBMITTED → FRONT (cards flip one by one, every
 * seat) → FRONT RESULT → MIDDLE → BACK → PUSOY! (lost all three lanes) / ARAYYY KOOOO! (misarranged).
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
fun RevealPlan.fxAt(now: Long) = fx.firstOrNull { now >= it.t && now < it.end }

/** Milliseconds into the reveal show (plays the flip sounds); calls onDone at the end. */
@Composable
fun revealClock(plan: RevealPlan?, onDone: () -> Unit): Long {
    var now by remember(plan) { mutableLongStateOf(if (plan == null) Long.MAX_VALUE else 0L) }
    LaunchedEffect(plan) {
        if (plan == null) return@LaunchedEffect
        val start = withFrameMillis { it }
        val sounds = plan.flips.values.sorted().toMutableList()
        while (true) {
            val t = withFrameMillis { it } - start
            now = t
            var flipped = false
            while (sounds.isNotEmpty() && sounds.first() <= t) { sounds.removeAt(0); flipped = true }
            if (flipped) Sound.play("flip")
            if (t >= plan.done) {
                onDone()
                break
            }
        }
    }
    return now
}

/** The centre banner ("All Players Submitted" → FRONT / MIDDLE / BACK · Revealing… → RESULT) and Skip. */
@Composable
fun BoxScope.RevealBanner(plan: RevealPlan, now: Long, onSkip: () -> Unit) {
    var title: String? = null
    var sub = ""
    if (now < INTRO) {
        title = "All Players Submitted"; sub = "Revealing cards…"
    } else LANES.forEach { lane ->
        val (start, result) = plan.lanes.getValue(lane)
        if (now in start until result) { title = lane.uppercase(); sub = "Revealing…" }
        else if (now >= result && now < result + HOLD) { title = lane.uppercase(); sub = "RESULT" }
    }
    title?.let { t ->
        Box(Modifier.at(880, 440).width(320.u).popIn("$t$sub").lip(8, Color(0xFF7A3E00), 30).goldRim(30, 5).padding(5.u)) {
            Column(Modifier.clip(RoundedCornerShape(25.u)).background(Brush.verticalGradient(listOf(Color(0xFF5A0609), Color(0xFF2A0204)))).padding(horizontal = 16.u, vertical = 8.u).widthIn(min = 310.u), horizontalAlignment = Alignment.CenterHorizontally) {
                GradientText(t, if (t.length > 8) 28 else 44, listOf(C.Gold, C.Gold), Color(0xFF3A0204))
                Txt(sub, if (sub == "RESULT") 30 else 22, color = if (sub == "RESULT") Color.White else Color(0xD9FFFFFF))
            }
        }
    }
    Box(
        Modifier.at(1420, 640).height(52.u).tap(label = "Skip", onClick = onSkip).clip(RoundedCornerShape(999.u)).background(Color(0x66000000)).border(3.u, Color(0x99FFFFFF), RoundedCornerShape(999.u)).padding(horizontal = 20.u),
        contentAlignment = Alignment.Center,
    ) { Txt("Skip ▸▸", 20) }
    plan.fxAt(now)?.let { RevealFx(it, now - it.t) }
}

private val FX_AVATAR = mapOf(1 to Offset(640f, 560f), 2 to Offset(98f, 440f), 3 to Offset(800f, 150f), 4 to Offset(1502f, 440f))
private val FX_CARDS = mapOf(1 to Offset(640f, 500f), 2 to Offset(300f, 410f), 3 to Offset(790f, 300f), 4 to Offset(1290f, 410f))

private class Seeded(seed: Long) {
    private var s = seed
    fun next(): Float { s = (s * 9301 + 49297) % 233280; return s / 233280f }
}

/** PUSOY! (a bomb thrown at the seat, exploding) or ARAYYY KOOOO! (lightning on misplaced cards). */
@Composable
private fun BoxScope.RevealFx(fx: Fx, ms: Long) {
    val u = LocalUnit.current
    val lite = Session.motion.value != "high"
    LaunchedEffect(fx) {
        if (fx.kind == "bomb") { kotlinx.coroutines.delay(750); Sound.play("boom") } else { kotlinx.coroutines.delay(250); Sound.play("zap") }
    }
    val t = ms / 1000f
    if (fx.kind == "bomb") {
        val to = FX_AVATAR.getValue(fx.seat)
        val from = Offset(800f, 120f)
        val mid = Offset((from.x + to.x) / 2, minOf(from.y, to.y) - 140)
        Canvas(Modifier.matchParentSize()) {
            // the throw (0.75 s on a curve), then the explosion
            if (t < 0.75f) {
                val k = t / 0.75f
                val p = (from * ((1 - k) * (1 - k))) + (mid * (2 * k * (1 - k))) + (to * (k * k))
                drawCircle(Color(0xFF1A1A22), 44 * u, p * u)
                drawCircle(Color(0x66FFFFFF), 12 * u, (p + Offset(-14f, -14f)) * u)
                drawLine(Color(0xFF8A5A2A), (p + Offset(24f, -30f)) * u, (p + Offset(40f, -52f)) * u, 6 * u)
                drawCircle(if ((ms / 60) % 2 == 0L) Color(0xFFFFD34D) else Color(0xFFFF7A1F), 9 * u, (p + Offset(42f, -56f)) * u)
            } else {
                val e = t - 0.75f
                val c = to * u
                // ring
                val rk = (e / 0.6f).coerceIn(0f, 1f)
                drawCircle(Color(0xFFFFF3A0).copy(alpha = 1 - rk), 90 * u * (0.1f + 2.5f * rk), c, style = Stroke(10 * u))
                // burst star
                val bk = (e / 0.65f).coerceIn(0f, 1f)
                val bs = if (bk < 0.55f) 0.1f + bk / 0.55f * 1.05f else 1.15f + (bk - 0.55f) / 0.45f * 0.2f
                val ba = if (bk < 0.1f) bk * 10 else if (bk < 0.55f) 1f else 1 - (bk - 0.55f) / 0.45f
                rotate(30f * bk, c) {
                    listOf(150f to Color(0xFFFF7A1F), 110f to Color(0xFFFFB21F), 70f to Color(0xFFFFF3A0)).forEach { (r, col) ->
                        val star = Path()
                        repeat(24) { i ->
                            val a = PI * i / 12
                            val rr = (if (i % 2 == 0) r else r * 0.6f) * u * bs
                            val pt = Offset(c.x + cos(a).toFloat() * rr, c.y + sin(a).toFloat() * rr)
                            if (i == 0) star.moveTo(pt.x, pt.y) else star.lineTo(pt.x, pt.y)
                        }
                        star.close()
                        drawPath(star, col, alpha = ba.coerceIn(0f, 1f))
                    }
                }
                // sparks
                val sk = (e / 0.7f).coerceIn(0f, 1f)
                val rnd = Seeded(fx.seat * 31L + fx.t)
                repeat(if (lite) 8 else 16) { i ->
                    val a = i / 16.0 * PI * 2
                    val d = (130 + rnd.next() * 110) * u * sk
                    drawCircle(if (i % 2 == 1) Color(0xFFFFD34D) else Color(0xFFFF7A1F), 5 * u * (1.2f - sk), Offset(c.x + cos(a).toFloat() * d, c.y + sin(a).toFloat() * d), alpha = 1 - sk)
                }
                // smoke
                val mk = ((e + 0.03f) / 1.2f).coerceIn(0f, 1f)
                repeat(if (lite) 4 else 8) { i ->
                    val a = i / 8.0 * PI * 2 + rnd.next()
                    val d = (90 + rnd.next() * 70) * u
                    val size = (70 + rnd.next() * 50) * u
                    drawCircle(Brush.radialGradient(listOf(Color(0xFFCFC6C0), Color(0xFF6D6460), Color.Transparent), center = Offset(c.x + cos(a).toFloat() * d * mk, c.y + (sin(a).toFloat() * d - 40 * u) * mk), radius = size * (0.3f + 1.4f * mk) / 2), radius = size * (0.3f + 1.4f * mk) / 2, center = Offset(c.x + cos(a).toFloat() * d * mk, c.y + (sin(a).toFloat() * d - 40 * u) * mk), alpha = (if (mk < 0.15f) mk / 0.15f * 0.95f else 0.95f * (1 - mk)))
                }
            }
        }
        if (t > 0.85f) {
            val text = Offset(800 + (to.x - 800) * 0.4f, 450 + (to.y - 450) * 0.4f)
            Column(Modifier.at(text.x.toInt() - 280, text.y.toInt() - 80).width(560.u).popIn(fx).rotate(-5f), horizontalAlignment = Alignment.CenterHorizontally) {
                CandyText("PUSOY!", 560, 140, 124, stroke = Color(0xFF7A0A00), fill = listOf(Color(0xFFFFF6A8), Color(0xFFFFB21F), Color(0xFFFF5A1F)))
                Box(Modifier.offset(y = (-8).u).clip(RoundedCornerShape(999.u)).background(Color(0xB3000000)).padding(horizontal = 16.u, vertical = 4.u)) { Txt("Lost all three lines · 2× bet · −${fmt(fx.amount)}", 26, color = C.Pink) }
            }
        }
    } else {
        val at = FX_CARDS.getValue(fx.seat)
        Canvas(Modifier.matchParentSize()) {
            // dim 2.2 s · flash · bolt
            val dk = t / 2.2f
            val dim = if (dk < 0.12f) dk / 0.12f * 0.5f else if (dk < 0.8f) 0.5f else 0.5f * (1 - (dk - 0.8f) / 0.2f)
            drawRect(Color(0xFF0A0420), alpha = dim.coerceIn(0f, 1f))
            val fk = ((t - 0.25f) / 0.5f)
            if (fk in 0f..1f) {
                val fl = when { fk < 0.1f -> fk * 7.5f; fk < 0.3f -> 0.75f - (fk - 0.1f) * 3.25f; fk < 0.45f -> 0.1f + (fk - 0.3f) * 2.7f; else -> 0.5f * (1 - (fk - 0.45f) / 0.55f) }
                drawRect(Color(0xFFE9DCFF), alpha = fl.coerceIn(0f, 1f))
            }
            val bk = t - 0.25f
            if (bk in 0f..1f) {
                val op = when { bk < 0.18f -> 1f; bk < 0.28f -> 0.15f; bk < 0.5f -> 1f; bk < 0.6f -> 0.3f; bk < 0.85f -> 1f; else -> 0.6f }
                val rnd = Seeded(fx.seat * 17L + fx.t)
                val pts = mutableListOf(Offset(at.x - 60 + rnd.next() * 120, -20f))
                for (i in 1 until 7) {
                    val k = i / 7f
                    pts += Offset(pts[0].x + (at.x - pts[0].x) * k + (rnd.next() * 90 - 45), -20 + (at.y + 20) * k)
                }
                pts += at
                val bolt = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.x * u, p.y * u) else lineTo(p.x * u, p.y * u) } }
                val forks = listOf(2, 4).map { k ->
                    val (fx0, fy0) = pts[k]
                    val dir = if (rnd.next() > 0.5f) 1 else -1
                    Path().apply { moveTo(fx0 * u, fy0 * u); lineTo((fx0 + dir * (40 + rnd.next() * 40)) * u, (fy0 + 50) * u); lineTo((fx0 + dir * (60 + rnd.next() * 60)) * u, (fy0 + 110) * u) }
                }
                (listOf(bolt) + forks).forEach { p ->
                    drawPath(p, Color(0xFFB98CFF), alpha = op * 0.6f, style = Stroke(18 * u, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    drawPath(p, Color(0xFFE9DCFF), alpha = op, style = Stroke(7 * u, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    drawPath(p, Color.White, alpha = op, style = Stroke(3 * u, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
            val gk = ((t - 0.25f) / 1.4f).coerceIn(0f, 1f)
            if (t > 0.25f) {
                val gs = if (gk < 0.15f) 0.3f + gk / 0.15f * 0.8f else 1.1f + (gk - 0.15f) / 0.85f * 0.3f
                val ga = if (gk < 0.15f) gk / 0.15f else 1 - (gk - 0.15f) / 0.85f
                drawOval(Brush.radialGradient(listOf(Color(0xF2E9DCFF), Color(0x8C9B5CFF), Color.Transparent), center = at * u, radius = 150 * u * gs), topLeft = Offset((at.x - 150 * gs) * u, (at.y - 110 * gs) * u), size = Size(300 * gs * u, 220 * gs * u), alpha = ga.coerceIn(0f, 1f))
            }
        }
        if (t > 0.45f) {
            Column(Modifier.at(minOf(maxOf(at.x.toInt() + 60, 40), 900), maxOf(at.y.toInt() - 250, 40)).width(640.u).popIn(fx).rotate(-5f), horizontalAlignment = Alignment.CenterHorizontally) {
                CandyText("ARAYYY KOOOO!", 640, 120, 84, stroke = Color(0xFF3A0A6B), fill = listOf(Color.White, Color(0xFFFFE14D), Color(0xFFFFA514)))
                Box(Modifier.offset(y = (-4).u).clip(RoundedCornerShape(999.u)).background(Color(0xB3000000)).padding(horizontal = 16.u, vertical = 4.u)) { Txt("Misplaced cards · 2× bet penalty · −${fmt(fx.amount)}", 26, color = C.Pink) }
            }
        }
    }
}

private operator fun Offset.times(k: Float) = Offset(x * k, y * k)

@Composable
private fun Modifier.popIn(key: Any): Modifier {
    val a = remember(key) { Animatable(0f) }
    LaunchedEffect(key) { a.animateTo(1f, tween(500, easing = CubicBezierEasing(0.2f, 1.6f, 0.4f, 1f))) }
    return graphicsLayer {
        val v = a.value
        scaleX = 0.2f + 0.8f * v; scaleY = 0.2f + 0.8f * v; alpha = v.coerceIn(0f, 1f)
    }
}
