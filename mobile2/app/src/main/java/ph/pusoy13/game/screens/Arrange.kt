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
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
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
import ph.pusoy13.game.ui.LocalClock
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.gloss
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.softGlow
import ph.pusoy13.game.ui.popIn
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u
import kotlin.math.PI
import kotlin.math.cos

/** Exchange two cards' places (same row: reorder; different rows: each goes into the other's slot). */
fun exchange(rows: Rows, a: String, b: String): Rows {
    val next = LANES.associateWith { rows.lane(it).toMutableList() }
    val pa = LANES.firstNotNullOfOrNull { l -> next.getValue(l).indexOf(a).takeIf { it >= 0 }?.let { l to it } } ?: return rows
    val pb = LANES.firstNotNullOfOrNull { l -> next.getValue(l).indexOf(b).takeIf { it >= 0 }?.let { l to it } } ?: return rows
    next.getValue(pa.first)[pa.second] = b
    next.getValue(pb.first)[pb.second] = a
    return next
}

/** Rows sorted for display (Sort button): "rank" (high to low) or "suit" (♠ ♥ ♦ ♣); "dealt" keeps them. */
fun sortedRows(rows: Rows, by: String): Rows {
    if (by == "dealt") return rows
    val ranks = "23456789TJQKA"
    val suits = "SHDC"
    val cmp = Comparator<String> { a, b ->
        val r = ranks.indexOf(b[0]) - ranks.indexOf(a[0])
        val s = suits.indexOf(a[1]) - suits.indexOf(b[1])
        if (by == "rank") (if (r != 0) r else s) else (if (s != 0) s else r)
    }
    return rows.mapValues { it.value.sortedWith(cmp) }
}

private const val CW = 104
private const val CH = 140

/**
 * The card arrangement popup shared by Single Player and Multiplayer (table/LuckPopup.tsx), on the
 * 1600×900 stage. Your 13 cards sit straight in Front (3), Middle (5) and Back (5) in dealt order —
 * nothing is sorted or arranged for you. Each row always holds its 3 / 5 / 5, so a move is a swap:
 *  - tap a card, then any other card (any row) to swap the two; tap it again to put it down;
 *  - or drag a card onto another card;
 *  - ⇅ swaps Middle and Back.
 * Hand names and ✓ / ✗ order marks come from the server preview. SUBMIT sends the rows as they are
 * (a misarranged hand pays the 2× penalty); Declared Luck asks the server to check a Lucky Hand.
 * Only the mode's adapter differs: `previewPath` and the callbacks (Single Player → /practice,
 * Multiplayer → /games, with server-saved drafts and the auto-submit at the timer's end).
 */
@Composable
fun BoxScope.ArrangePopup(
    roundId: Int,
    cards: List<String>,
    initial: Rows?,
    title: String,
    betLabel: String,
    previewPath: String,
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

    Box(Modifier.fillMaxSize().zIndex(40f)) {
        Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable(remember { MutableInteractionSource() }, null) {})
        Box(Modifier.at(60, 24, 1480, 852).popIn(roundId)) {
            Box(Modifier.fillMaxSize().lip(14, Color(0xFF7A3E00), 48).goldRim(48, 12)) {
                Box(Modifier.fillMaxSize().padding(12.u).clip(RoundedCornerShape(38.u)).background(Brush.radialGradient(listOf(Color(0xFF1FA046), Color(0xFF0E6A2A), Color(0xFF09481C)), radius = 1100f))) {
                    // red corner bands with a gold edge, like the table rail
                    listOf(Triple(-120, -120, 45f), Triple(1456 - 220, -120, -45f), Triple(-120, 828 - 120, -45f), Triple(1456 - 220, 828 - 120, 45f)).forEach { (x, y, r) ->
                        Column(Modifier.at(x, y, 340, 240).rotate(r)) {
                            Box(Modifier.weight(1f).fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFFB3141B), Color(0xFF6E080C)))))
                            Box(Modifier.height(8.u).fillMaxSize().background(Color(0xFFFFC531)))
                        }
                    }
                }
            }
            Art("mini-crest", Modifier.at(18, 6, 240, 140))
            // round + bet
            Box(Modifier.align(Alignment.TopEnd).padding(top = 26.u, end = 130.u).goldRim(22, 4).padding(4.u)) {
                Row(Modifier.clip(RoundedCornerShape(18.u)).background(Brush.verticalGradient(listOf(Color(0xFF5A0609), Color(0xFF2A0204)))).padding(horizontal = 16.u, vertical = 8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
                    Box(Modifier.size(46.u).clip(CircleShape).background(Color(0xE6FFFFFF)), contentAlignment = Alignment.Center) { Art("ic-user", Modifier.size(32.u), animate = false) }
                    Column {
                        Txt(title, 24, maxLines = 1)
                        Txt(betLabel, 22, color = C.Gold, maxLines = 1)
                    }
                }
            }
            // the other seats' cards, face down: top, left and right of your rows
            CardFan(Modifier.at(560, 8), 8, 58, 80, 7f)
            Box(Modifier.at(80, 150).width(220.u), contentAlignment = Alignment.Center) { CardFan(Modifier, 7, 62, 86, 9f) }
            Box(Modifier.at(1210, 150).width(220.u), contentAlignment = Alignment.Center) { CardFan(Modifier, 7, 62, 86, 9f) }

            // your 13 cards, directly in the three rows
            Column(Modifier.at(300, 92), verticalArrangement = Arrangement.spacedBy(12.u)) {
                LANES.forEach { lane ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                        Column(Modifier.width(150.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.u)) {
                            Mark(preview?.order?.get(lane))
                            Box(Modifier.goldRim(14, 3, glint = false).padding(3.u)) {
                                Column(Modifier.clip(RoundedCornerShape(11.u)).background(Brush.verticalGradient(listOf(Color(0xFF5A0609), Color(0xFF2A0204)))).padding(horizontal = 12.u, vertical = 4.u), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Txt("${lane.uppercase()} ${rows.lane(lane).size}/${LANE_SIZE[lane]}", 18, maxLines = 1)
                                    preview?.labels?.get(lane)?.let { Txt(it, 16, color = C.Gold, maxLines = 1) }
                                }
                            }
                        }
                        val target = sel != null && sel !in rows.lane(lane)
                        Row(
                            Modifier.height(164.u)
                                .drawBehind { softGlow(if (target) Color(0x99FFE14D) else Color(0x995DFF7A), 24f * density, 18f * density) }
                                .clip(RoundedCornerShape(18.u)).background(if (target) Color(0x1FFFE14D) else Color(0x26000000))
                                .border(4.u, if (target) Color(0xFFFFE14D) else Color(0xFF5DFF7A), RoundedCornerShape(18.u))
                                .tap(sound = null) { if (sel != null) hint = "${lane.replaceFirstChar(Char::uppercase)} is full (${LANE_SIZE[lane]}/${LANE_SIZE[lane]}) — tap one of its cards to swap." }
                                .padding(8.u),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u),
                        ) {
                            rows.lane(lane).forEach { c ->
                                val isDragged = dragging == c
                                val selected = sel == c
                                Box(
                                    Modifier
                                        .zIndex(if (isDragged) 10f else 0f)
                                        .onGloballyPositioned { rects[c] = it.boundsInRoot() }
                                        .graphicsLayer {
                                            if (isDragged) { translationX = drag.x; translationY = drag.y - 8 * density; scaleX = 1.06f; scaleY = 1.06f }
                                            else if (selected) translationY = -10 * density
                                        }
                                        .then(if (selected) Modifier.drawBehind { softGlow(Color(0xBFFFCC3D), 18f * density, 9f * density) }.border(3.u, Color(0xFFFFE07A), RoundedCornerShape(9.u)) else Modifier)
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
                                                    val target = rects.entries.firstOrNull { it.key != c && it.key in cards && it.value.contains(at) }?.key
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
                                ) { Card(c, CW) }
                            }
                        }
                    }
                }
            }
            // ⇅ swap Middle and Back
            Box(
                Modifier.at(1100, 352, 88, 88).tap(label = "Swap Middle and Back") { apply(mapOf("front" to rows.lane("front"), "middle" to rows.lane("back"), "back" to rows.lane("middle"))) }
                    .lip(6, Color(0xFF5A0609), 999).clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFF5A4A), Color(0xFFA10D0B)))).border(5.u, Color(0xFFFFC531), CircleShape),
                contentAlignment = Alignment.Center,
            ) { Art("ic-swap", Modifier.size(32.u, 40.u), animate = false) }

            Txt(hint ?: "Tap a card, then tap another card to swap them — or drag one onto another.", 18, color = Color(0xCCFFFFFF), align = TextAlign.Center, modifier = Modifier.at(300, 634).width(760.u))

            // actions
            Row(Modifier.at(330, 676), horizontalArrangement = Arrangement.spacedBy(24.u), verticalAlignment = Alignment.CenterVertically) {
                val clock = LocalClock.current
                Box(Modifier.size(320.u, 108.u).alpha(if (declaring || submitting) 0.7f else 1f).tap(enabled = !declaring && !submitting, label = "Declared Luck") { onDeclare(rows) }.lip(8, Color(0xFF7A3E00), 999).goldRim(999, 6).padding(6.u)) {
                    Row(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFA24DFF), Color(0xFF4A0F9A)))).gloss(0.5f).padding(start = 12.u, end = 20.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                        Box(
                            Modifier.size(84.u).graphicsLayer {
                                if (clock != null) {
                                    val p = (clock.floatValue % 2.4f) / 2.4f
                                    val k = (0.5 - 0.5 * cos(2 * PI * p)).toFloat()
                                    rotationZ = -8f + 16f * k; scaleX = 1f + 0.06f * k; scaleY = scaleX
                                }
                            }.drawBehind { softGlow(Color(0xCCFF7AD9), 20f * density, 0f, circle = true) }.clip(CircleShape).background(Brush.radialGradient(listOf(Color(0xFFFF7AD9), Color(0xFF7A1FC9)))),
                            contentAlignment = Alignment.Center,
                        ) { Art("clover", Modifier.size(70.u), animate = false) }
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            Txt(if (declaring) "Checking…" else "Declared", 32, stroke = Color(0xFF2A0660), strokeWidth = 3)
                            if (!declaring) Txt("Luck", 36, color = C.Gold, stroke = Color(0xFF2A0660), strokeWidth = 3)
                        }
                    }
                }
                Box(Modifier.size(380.u, 108.u).alpha(if (declaring || submitting) 0.7f else 1f).tap(enabled = !declaring && !submitting, label = "Submit") { Sound.play("tap"); onSubmit(rows) }.lip(8, Color(0xFF7A3E00), 999).goldRim(999, 6).padding(6.u)) {
                    Box(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFF3A0), Color(0xFFFFD13A), Color(0xFFE08A00)))).gloss(1.2f), contentAlignment = Alignment.Center) {
                        Txt(if (submitting) "…" else "SUBMIT", 58, color = C.Brown)
                    }
                }
            }
            hud()
            // decorative 553 chips
            Art("chips-553", Modifier.at(10, 672, 230, 170), animate = false)
        }
    }
}

/** ✓ / ✗ order mark (empty while the server has not judged the row). */
@Composable
private fun Mark(ok: Boolean?) {
    Box(
        Modifier.size(60.u).alpha(if (ok == null) 0f else 1f).lip(4, Color(0x59000000), 999).clip(CircleShape)
            .background(Brush.verticalGradient(if (ok == true) listOf(Color(0xFF7DFF8A), Color(0xFF13A344)) else listOf(Color(0xFFFF6B6B), Color(0xFFB3121A)))).border(4.u, Color.White, CircleShape),
        contentAlignment = Alignment.Center,
    ) { if (ok == true) Art("ic-tick", Modifier.size(32.u), animate = false) else Txt("✕", 30) }
}

/** A fan of face-down 553 card backs (the other seats' hands in the popup). */
@Composable
fun CardFan(modifier: Modifier, count: Int, w: Int, h: Int, spread: Float) {
    Box(modifier.size((w + count * 16).u, (h + 24).u)) {
        val mid = (count - 1) / 2f
        repeat(count) { i ->
            Box(Modifier.at(i * 16, 24).graphicsLayer { rotationZ = (i - mid) * spread; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f) }) { Card(null, w) }
        }
    }
}
