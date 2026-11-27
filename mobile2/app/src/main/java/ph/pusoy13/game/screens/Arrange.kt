package ph.pusoy13.game.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.LANES
import ph.pusoy13.game.core.LANE_SIZE
import ph.pusoy13.game.core.Preview
import ph.pusoy13.game.core.Rows
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.dealtRows
import ph.pusoy13.game.core.isFull
import ph.pusoy13.game.core.json
import ph.pusoy13.game.core.lane
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.Card
import ph.pusoy13.game.ui.GoldBrush
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

/** Exchange two cards' places (same row: reorder; different rows: each goes into the other's slot). */
fun exchange(rows: Rows, a: String, b: String): Rows {
    val next = LANES.associateWith { rows.lane(it).toMutableList() }
    val pa = LANES.firstNotNullOfOrNull { l -> next.getValue(l).indexOf(a).takeIf { it >= 0 }?.let { l to it } } ?: return rows
    val pb = LANES.firstNotNullOfOrNull { l -> next.getValue(l).indexOf(b).takeIf { it >= 0 }?.let { l to it } } ?: return rows
    next.getValue(pa.first)[pa.second] = b
    next.getValue(pb.first)[pb.second] = a
    return next
}

private const val CW = 104

/**
 * The arrangement popup, shown right after the deal (the web app's LuckPopup). Your 13 cards sit
 * directly in Front (3), Middle (5) and Back (5), in the order they were dealt — nothing is sorted
 * for you. Each row always holds its 3 / 5 / 5, so moving a card swaps it:
 *  - tap a card, then another card to swap the two (any rows); tap it again to put it down;
 *  - or drag a card onto another card;
 *  - ⇅ swaps Middle and Back.
 * Hand names and ✓ / ✗ order marks come from the server preview. SUBMIT sends the rows as they
 * are (a misplaced hand pays the 2× penalty); Declared Luck asks the server to check a Lucky Hand.
 */
@Composable
fun BoxScope.ArrangePopup(
    roundId: Int,
    cards: List<String>,
    initial: Rows?,
    title: String,
    betLabel: String,
    previewPath: String,
    sideNames: Pair<String, String>,
    declaring: Boolean,
    submitting: Boolean,
    onDeclare: (Rows) -> Unit,
    onSubmit: (Rows) -> Unit,
    onRowsChange: ((Rows) -> Unit)? = null,
    hud: @Composable BoxScope.() -> Unit,
) {
    var rows by remember(roundId) { mutableStateOf(initial?.takeIf { it.isFull() && it.values.flatten().toSet() == cards.toSet() } ?: dealtRows(cards)) }
    var sel by remember(roundId) { mutableStateOf<String?>(null) }
    var hint by remember(roundId) { mutableStateOf<String?>(null) }
    var preview by remember(roundId) { mutableStateOf<Preview?>(null) }
    var dragging by remember { mutableStateOf<String?>(null) }
    var drag by remember { mutableStateOf(Offset.Zero) }
    var dragStart by remember { mutableStateOf(Offset.Zero) }
    val rects = remember { mutableStateMapOf<String, Rect>() }

    LaunchedEffect(rows) {
        delay(150)
        runCatching { preview = Preview.of(Api.post(previewPath, rows.json()).data()) }
    }
    val apply = { next: Rows ->
        rows = next
        onRowsChange?.invoke(next)
        sel = null
        hint = null
        Sound.play("deal")
    }
    val tapCard = { c: String ->
        when (sel) {
            null -> { Sound.play("tap"); sel = c; hint = "Now tap the card to swap it with (in any row)." }
            c -> { sel = null; hint = null }
            else -> apply(exchange(rows, sel!!, c))
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable(remember { MutableInteractionSource() }, null) {}.zIndex(40f)) {
        Box(Modifier.at(60, 24, 1480, 852)) {
            Box(Modifier.fillMaxSize().clip(RoundedCornerShape(48.u)).background(GoldBrush).padding(12.u)) {
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(38.u)).background(Brush.radialGradient(listOf(Color(0xFF1FA046), Color(0xFF0E6A2A), Color(0xFF09481C)))))
            }
            Art("mini-crest", Modifier.at(18, 6, 240, 140))
            // round + bet
            GoldFrame(Modifier.at(990, 26, 360, 90), radius = 22, rim = 4, fill = Brush.verticalGradient(listOf(Color(0xFF5A0609), Color(0xFF2A0204)))) {
                Column(Modifier.fillMaxSize().padding(horizontal = 16.u), verticalArrangement = Arrangement.Center) {
                    Txt(title, 20, maxLines = 2)
                    Txt(betLabel, 22, color = C.Gold, maxLines = 1)
                }
            }
            // the others' face-down cards around the rows
            Fan(Modifier.at(500, 0), 8, 58)
            Fan(Modifier.at(30, 150), 7, 62)
            Txt(sideNames.first, 20, modifier = Modifier.at(40, 290).width(220.u), align = TextAlign.Center)
            Fan(Modifier.at(1180, 150), 7, 62)
            Txt(sideNames.second, 20, modifier = Modifier.at(1190, 290).width(220.u), align = TextAlign.Center)

            // your 13 cards, directly in the three rows
            Column(Modifier.at(240, 92), verticalArrangement = Arrangement.spacedBy(12.u)) {
                LANES.forEach { lane ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                        Column(Modifier.width(150.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.u)) {
                            val ok = preview?.order?.get(lane)
                            Box(Modifier.size(56.u).alpha(if (ok == null) 0f else 1f).clip(CircleShape).background(if (ok == true) Color(0xFF13A344) else Color(0xFFB3121A)).border(4.u, Color.White, CircleShape), contentAlignment = Alignment.Center) {
                                Txt(if (ok == true) "✓" else "✕", 30)
                            }
                            GoldFrame(Modifier.width(150.u), radius = 14, rim = 3, fill = Brush.verticalGradient(listOf(Color(0xFF5A0609), Color(0xFF2A0204)))) {
                                Column(Modifier.padding(vertical = 4.u).width(150.u), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Txt("${lane.uppercase()} ${rows.lane(lane).size}/${LANE_SIZE[lane]}", 18)
                                    preview?.labels?.get(lane)?.let { Txt(it, 15, color = C.Gold, maxLines = 1) }
                                }
                            }
                        }
                        Row(
                            Modifier.clip(RoundedCornerShape(20.u)).background(Color(0x33000000)).padding(8.u).tap(sound = null) {
                                if (sel != null) hint = "${lane.replaceFirstChar(Char::uppercase)} is full (${LANE_SIZE[lane]}/${LANE_SIZE[lane]}) — tap one of its cards to swap."
                            },
                            horizontalArrangement = Arrangement.spacedBy(10.u),
                        ) {
                            rows.lane(lane).forEach { c ->
                                val isDragged = dragging == c
                                Box(
                                    Modifier
                                        .zIndex(if (isDragged) 10f else 0f)
                                        .onGloballyPositioned { rects[c] = it.boundsInRoot() }
                                        .graphicsLayer { if (isDragged) { translationX = drag.x; translationY = drag.y; scaleX = 1.08f; scaleY = 1.08f } }
                                        .pointerInput(c, rows) {
                                            detectDragGestures(
                                                onDragStart = { p ->
                                                    dragging = c
                                                    drag = Offset.Zero
                                                    dragStart = (rects[c]?.topLeft ?: Offset.Zero) + p
                                                    sel = null
                                                },
                                                onDragEnd = {
                                                    val at = dragStart + drag
                                                    val target = rects.entries.firstOrNull { it.key != c && it.key in rows.values.flatten() && it.value.contains(at) }?.key
                                                    if (target != null) apply(exchange(rows, c, target)) else hint = "Drop it on a card to swap the two."
                                                    dragging = null
                                                    drag = Offset.Zero
                                                },
                                                onDragCancel = { dragging = null; drag = Offset.Zero },
                                            ) { change, amount ->
                                                change.consume()
                                                drag += amount
                                            }
                                        }
                                        .tap(sound = null) { tapCard(c) },
                                ) { Card(c, CW, selected = sel == c) }
                            }
                        }
                    }
                }
            }
            // ⇅ swap Middle and Back
            Box(
                Modifier.at(1100, 352, 88, 88).tap(label = "Swap Middle and Back") { apply(mapOf("front" to rows.lane("front"), "middle" to rows.lane("back"), "back" to rows.lane("middle"))) }
                    .clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFF5A4A), Color(0xFFA10D0B)))).border(5.u, C.GoldEdge, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Txt("⇅", 46) }

            Txt(
                hint ?: "Tap a card, then tap another card to swap them — or drag one onto another.", 19,
                color = C.White.copy(alpha = 0.85f), align = TextAlign.Center, modifier = Modifier.at(240, 640).width(860.u),
            )

            // actions
            Row(Modifier.at(330, 680), horizontalArrangement = Arrangement.spacedBy(24.u), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(320.u, 120.u).alpha(if (declaring || submitting) 0.6f else 1f).tap(enabled = !declaring && !submitting, label = "Declared Luck") { onDeclare(rows) }
                        .clip(RoundedCornerShape(999.u)).background(GoldBrush).padding(6.u),
                ) {
                    Row(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFA24DFF), Color(0xFF4A0F9A)))).padding(horizontal = 12.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                        Art("clover", Modifier.size(76.u))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Txt(if (declaring) "Checking…" else "Declared", 30)
                            if (!declaring) Txt("Luck", 34, color = C.Gold)
                        }
                    }
                }
                Box(
                    Modifier.size(380.u, 120.u).alpha(if (declaring || submitting) 0.6f else 1f).tap(enabled = !declaring && !submitting, label = "Submit") { onSubmit(rows) }
                        .clip(RoundedCornerShape(999.u)).background(GoldBrush).padding(6.u),
                ) {
                    Box(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFF3A0), Color(0xFFFFD13A), Color(0xFFE08A00)))), contentAlignment = Alignment.Center) {
                        Txt(if (submitting) "…" else "SUBMIT", 58, color = C.Brown)
                    }
                }
            }
            hud()
        }
    }
}

@Composable
private fun Fan(modifier: Modifier, count: Int, w: Int) {
    Box(modifier.size((w + count * 16).u, (w * 1.4f + 24).u)) {
        val mid = (count - 1) / 2f
        repeat(count) { i ->
            Box(Modifier.padding(start = (i * 16).u, top = 12.u).rotate((i - mid) * 8f)) { Card(null, w) }
        }
    }
}
