package ph.pusoy13.game.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import kotlinx.coroutines.delay
import ph.pusoy13.game.core.Sound

// ---------------------------------------------------------------- text

@Composable
fun Txt(
    text: String,
    size: Number,
    modifier: Modifier = Modifier,
    color: Color = C.White,
    font: FontFamily = Display,
    weight: FontWeight = FontWeight.ExtraBold,
    align: TextAlign = TextAlign.Start,
    maxLines: Int = Int.MAX_VALUE,
    stroke: Color? = null,
    strokeWidth: Number = 6,
    italic: Boolean = false,
) {
    val style = TextStyle(fontFamily = font, fontWeight = weight, fontStyle = if (italic) androidx.compose.ui.text.font.FontStyle.Italic else androidx.compose.ui.text.font.FontStyle.Normal, fontSize = size.ts, lineHeight = (size.toFloat() * 1.12f).ts, color = color, textAlign = align)
    if (stroke == null) {
        BasicText(text, modifier, style = style, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
    } else {
        val px = strokeWidth.toFloat() * LocalUnit.current
        Box(modifier) {
            BasicText(text, style = style.copy(color = stroke, drawStyle = Stroke(width = px, join = androidx.compose.ui.graphics.StrokeJoin.Round)), maxLines = maxLines, overflow = TextOverflow.Ellipsis)
            BasicText(text, style = style, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---------------------------------------------------------------- touch

/** Tap with a squish and the tap sound (the web app's `lx-tile`). */
@Composable
fun Modifier.tap(enabled: Boolean = true, sound: String? = "tap", label: String? = null, onClick: () -> Unit): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed && enabled) 0.94f else 1f, label = "tap")
    return this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .then(if (label != null) Modifier.semantics { contentDescription = label } else Modifier)
        .clickable(source, null, enabled = enabled) {
            sound?.let(Sound::play)
            onClick()
        }
}

// ---------------------------------------------------------------- frames and buttons

val GoldBrush = Brush.verticalGradient(listOf(Color(0xFFFFF4B8), Color(0xFFF2C64A), Color(0xFFB07A0E)))

/** A gold-rimmed panel (the web app's `lx-gold` frame) with a fill inside. */
@Composable
fun GoldFrame(
    modifier: Modifier = Modifier,
    radius: Number = 30,
    rim: Number = 6,
    fill: Brush = Brush.verticalGradient(listOf(Color(0xFF8F1015), Color(0xFF3A0204))),
    content: @Composable BoxScope.() -> Unit,
) {
    val outer = RoundedCornerShape(radius.u)
    val inner = RoundedCornerShape((radius.toFloat() - rim.toFloat()).coerceAtLeast(0f).u)
    Box(modifier.shadow(8.u, outer).clip(outer).background(GoldBrush).padding(rim.u)) {
        Box(Modifier.fillMaxSize().clip(inner).background(fill), content = content)
    }
}

/** The 553 Lobby candy-button tones (lobby/LobbyUI.tsx): gradient, text, border and lip colours. */
enum class Tone(val fill: List<Color>, val text: Color, val edge: Color, val lip: Color, val lipDy: Int = 7) {
    Gold(listOf(Color(0xFFFFE46A), Color(0xFFFFC531), Color(0xFFE08A00)), Color(0xFF4A1D00), Color(0xFFFFF3A0), Color(0xFF8A4A00)),
    Purple(listOf(Color(0xFFC47CFF), Color(0xFF8F2FF0), Color(0xFF5A12B0)), Color.White, Color(0xFFFFD34D), Color(0xFF36086E)),
    Green(listOf(Color(0xFF5EF08A), Color(0xFF13A344)), Color.White, Color(0xFFC8FFD8), Color(0xFF0B6B2A)),
    Blue(listOf(Color(0xFF3A8AFF), Color(0xFF0D3FB0)), Color.White, Color(0xFF9AD4FF), Color(0xFF082A78)),
    Red(listOf(Color(0xFFFF6B5C), Color(0xFFB3121A)), Color.White, Color(0xFFFFC2C2), Color(0xFF6B0606)),
    Dark(listOf(Color(0xFF6A1218), Color(0xFF33060A)), Color(0xFFFFE9B0), Color(0xFFD9A441), Color(0xFF1A0204), 6),
}

/** A glossy candy button (LobbyUI `CandyButton`): pill, 4-unit border, solid lip, gloss sweep. */
@Composable
fun CandyButton(
    text: String,
    modifier: Modifier,
    tone: Tone = Tone.Gold,
    size: Number = 34,
    enabled: Boolean = true,
    sound: String? = "tap",
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(999.u)
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.55f)
            .tap(enabled, sound, text, onClick)
            .lip(tone.lipDy, tone.lip, 999)
            .clip(shape)
            .background(Brush.verticalGradient(tone.fill))
            .gloss(dome = false)
            .border(4.u, tone.edge, shape),
        contentAlignment = Alignment.Center,
    ) {
        Txt(text, size, color = tone.text, align = TextAlign.Center, maxLines = 1)
    }
}

/** Round icon button with a gold rim (back, settings, help…). */
@Composable
fun RoundIcon(label: String, modifier: Modifier, size: Number = 78, onClick: () -> Unit, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier.size(size.u).tap(label = label, onClick = onClick).shadow(6.u, CircleShape).clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Color(0xFF8A1A1F), Color(0xFF3A0406)))).border(5.u, C.GoldEdge, CircleShape),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

@Composable
fun Pill(text: String, modifier: Modifier = Modifier, bg: Color = Color(0x8C000000), color: Color = C.White, size: Number = 20) {
    Box(modifier.clip(RoundedCornerShape(999.u)).background(bg).padding(horizontal = 14.u, vertical = 3.u), contentAlignment = Alignment.Center) {
        Txt(text, size, color = color, maxLines = 1)
    }
}

// ---------------------------------------------------------------- popups and toasts

/**
 * The 553 popup (LobbyUI `Modal`): dark overlay, a crimson panel in a 10-unit gold frame, the title on
 * a purple ribbon across the top edge and a round red close button on the corner. Tapping outside
 * closes it (when `onClose` is set); the content scrolls when it is taller than the screen.
 */
@Composable
fun Modal(title: String?, onClose: (() -> Unit)?, width: Number = 920, height: Number? = null, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable(remember { MutableInteractionSource() }, null) { onClose?.invoke() }, contentAlignment = Alignment.Center) {
        Box(Modifier.padding(top = if (title != null) 42.u else 0.u).popIn(title ?: "modal")) {
            Box(
                Modifier.width(width.u).then(if (height != null) Modifier.height(height.u) else Modifier.heightIn(max = 800.u))
                    .clickable(remember { MutableInteractionSource() }, null) {}
                    .lip(14, Color(0xFF5A2A00), 46).goldRim(46, 10).padding(10.u),
            ) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(38.u)).background(Brush.verticalGradient(listOf(Color(0xFF7A0F16), Color(0xFF55070C), Color(0xFF2E0306))))
                        .verticalScroll(rememberScrollState()).padding(start = 48.u, end = 48.u, top = if (title != null) 56.u else 36.u, bottom = 36.u),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { content() }
            }
            if (title != null) {
                Box(
                    Modifier.align(Alignment.TopCenter).offset(y = (-42).u).lip(7, Color(0xFF36086E), 30).clip(RoundedCornerShape(30.u))
                        .background(Brush.verticalGradient(listOf(Color(0xFFC47CFF), Color(0xFF8F2FF0), Color(0xFF5A12B0)))).border(5.u, Color(0xFFFFD34D), RoundedCornerShape(30.u)).padding(horizontal = 40.u, vertical = 8.u),
                ) { Txt(title, 44, stroke = Color(0xFF2A0660), strokeWidth = 4, maxLines = 1) }
            }
            if (onClose != null) {
                Box(
                    Modifier.align(Alignment.TopEnd).offset(x = 26.u, y = (-26).u).size(84.u).tap(label = "Close", onClick = onClose).lip(6, Color(0xFF6B0606), 999).clip(CircleShape)
                        .background(Brush.verticalGradient(listOf(Color(0xFFFF6B5C), Color(0xFFC0101A)))).border(5.u, Color(0xFFFFD34D), CircleShape),
                    contentAlignment = Alignment.Center,
                ) { Txt("✕", 38) }
            }
        }
    }
}

/**
 * The compact popup (LobbyUI `Modal compact`): smaller padding and frame, at most `maxHeight` tall;
 * the content scrolls inside it while `footer` (the action buttons) stays visible.
 */
@Composable
fun CompactModal(title: String, onClose: () -> Unit, width: Number = 820, maxHeight: Number = 780, footer: (@Composable ColumnScope.() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0x99000000)).clickable(remember { MutableInteractionSource() }, null) { onClose() }.padding(top = 36.u), contentAlignment = Alignment.Center) {
        Box(Modifier.popIn(title)) {
            Box(
                Modifier.width(width.u).heightIn(max = maxHeight.u).clickable(remember { MutableInteractionSource() }, null) {}
                    .lip(10, Color(0xFF5A2A00), 36).goldRim(36, 8).padding(8.u),
            ) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(30.u)).background(Brush.verticalGradient(listOf(Color(0xFF7A0F16), Color(0xFF55070C), Color(0xFF2E0306))))
                        .padding(start = 32.u, end = 32.u, top = 36.u, bottom = 20.u),
                ) {
                    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(end = 4.u)) { content() }
                    if (footer != null) Column(Modifier.fillMaxWidth().padding(top = 12.u), horizontalAlignment = Alignment.CenterHorizontally) { footer() }
                }
            }
            Box(
                Modifier.align(Alignment.TopCenter).offset(y = (-34).u).lip(6, Color(0xFF36086E), 26).clip(RoundedCornerShape(26.u))
                    .background(Brush.verticalGradient(listOf(Color(0xFFC47CFF), Color(0xFF8F2FF0), Color(0xFF5A12B0)))).border(4.u, Color(0xFFFFD34D), RoundedCornerShape(26.u)).padding(horizontal = 32.u, vertical = 4.u),
            ) { Txt(title, 36, maxLines = 1) }
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = 20.u, y = (-20).u).size(66.u).tap(label = "Close", onClick = onClose).lip(5, Color(0xFF6B0606), 999).clip(CircleShape)
                    .background(Brush.verticalGradient(listOf(Color(0xFFFF6B5C), Color(0xFFC0101A)))).border(4.u, Color(0xFFFFD34D), CircleShape),
                contentAlignment = Alignment.Center,
            ) { Txt("✕", 30) }
        }
    }
}

class ToastState {
    var message by mutableStateOf<Pair<Boolean, String>?>(null)
    var key by mutableStateOf(0)
    fun show(ok: Boolean, text: String) {
        message = ok to text
        key++
    }
}

@Composable
fun rememberToast() = remember { ToastState() }

/** A short notice at the top of the stage (green: done · red: problem). */
@Composable
fun BoxScope.ToastHost(state: ToastState, y: Number = 130, millis: Long = 3500) {
    val m = state.message
    LaunchedEffect(state.key) {
        if (m != null) {
            delay(millis)
            state.message = null
        }
    }
    if (m != null) {
        val (ok, text) = m
        Box(
            Modifier.align(Alignment.TopCenter).offset(y = y.u).widthIn(max = 1300.u).clip(RoundedCornerShape(999.u))
                .background(if (ok) Color(0xFF0F2A1C) else Color(0xFF3A0D14)).border(4.u, if (ok) Color(0xFF4EE36B) else Color(0xFFFF8A8A), RoundedCornerShape(999.u))
                .padding(horizontal = 32.u, vertical = 12.u),
        ) {
            Txt(text, 26, color = if (ok) Color(0xFFB9FFCB) else Color(0xFFFFE4E4), align = TextAlign.Center)
        }
    }
}


// ---------------------------------------------------------------- inputs

@Composable
fun Field(
    label: String?,
    state: MutableState<String>,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    password: Boolean = false,
    error: String? = null,
    keyboard: KeyboardType = KeyboardType.Text,
    size: Number = 26,
    dark: Boolean = true,
) {
    var shown by remember { mutableStateOf(false) }
    Column(modifier) {
        if (label != null) Txt(label, size.toFloat() * 0.8f, color = if (dark) C.Cream else Color(0xFF4A1D0A), modifier = Modifier.padding(start = 10.u, bottom = 4.u))
        Box(
            Modifier.fillMaxWidth().height((size.toFloat() * 2.4f).u).clip(RoundedCornerShape(999.u)).background(if (dark) Color(0xE61D0306) else Color.White)
                .border(4.u, if (error != null) Color(0xFFFF8A8A) else Color(0xFFD9A441), RoundedCornerShape(999.u)).padding(horizontal = 24.u),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (state.value.isEmpty()) Txt(placeholder, size, color = (if (dark) Color.White else Color.Black).copy(alpha = 0.4f), font = Body, weight = FontWeight.Bold, maxLines = 1)
            BasicTextField(
                state.value, { state.value = it },
                Modifier.fillMaxWidth().padding(end = if (password) 70.u else 0.u),
                singleLine = true,
                textStyle = TextStyle(fontFamily = Body, fontWeight = FontWeight.Bold, fontSize = size.ts, color = if (dark) Color.White else Color(0xFF2A1000)),
                cursorBrush = SolidColor(C.Gold),
                visualTransformation = if (password && !shown) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard),
            )
            if (password) {
                Box(Modifier.align(Alignment.CenterEnd).tap(sound = null, label = if (shown) "Hide password" else "Show password") { shown = !shown }.padding(8.u)) {
                    Txt(if (shown) "🙈" else "👁", size, color = if (dark) C.Cream else Color(0xFF6A2A0C))
                }
            }
        }
        if (error != null) Txt(error, size.toFloat() * 0.7f, color = C.Pink, font = Body, weight = FontWeight.Bold, modifier = Modifier.padding(start = 10.u, top = 2.u))
    }
}

// ---------------------------------------------------------------- game pieces

/** Cartoon avatar ids (the same as the server's App\Support\Avatars). */
val AVATAR_IDS: List<String> = listOf("boy" to 9, "girl" to 10, "animal" to 10).flatMap { (c, n) -> (1..n).map { "$c-%02d".format(it) } }
val AVATAR_NAMES = mapOf(
    "boy-01" to "Red Hoodie", "boy-02" to "Backwards Cap", "boy-03" to "Cool Shades", "boy-04" to "Silver Hair", "boy-05" to "553 Headband",
    "boy-06" to "Smart Glasses", "boy-07" to "Straw Hat", "boy-08" to "553 Cap", "boy-09" to "Beanie",
    "girl-01" to "Hibiscus", "girl-02" to "Sunny Bun", "girl-03" to "553 Beats", "girl-04" to "Golden Shades", "girl-05" to "Pink Buns",
    "girl-06" to "Headphones", "girl-07" to "Flower Curls", "girl-08" to "Bookworm", "girl-09" to "553 Cap", "girl-10" to "Blonde Star",
    "animal-01" to "Husky", "animal-02" to "Tabby Cat", "animal-03" to "Panda", "animal-04" to "Buffalo", "animal-05" to "Monkey",
    "animal-06" to "Eagle", "animal-07" to "Tiger", "animal-08" to "Lion King", "animal-09" to "Fox", "animal-10" to "Bunny",
)

/** The avatar to show: the chosen one when valid, else the player's stable default (same rule as the server). */
fun avatarFor(chosen: String?, userId: Int?): String = if (chosen != null && chosen in AVATAR_IDS) chosen else AVATAR_IDS[kotlin.math.abs(userId ?: 0) % AVATAR_IDS.size]

@Composable
fun Avatar(avatar: String?, userId: Int?, size: Number, modifier: Modifier = Modifier, square: Boolean = false, offline: Boolean = false) {
    val shape = if (square) RoundedCornerShape((size.toFloat() * 0.14f).u) else CircleShape
    Box(modifier.size(size.u).clip(shape).background(Color(0xFF241433)).alpha(if (offline) 0.45f else 1f)) {
        AssetImage("avatars/${avatarFor(avatar, userId)}.webp", Modifier.fillMaxSize())
    }
}

/** A playing card (the PUSOY 553 design) `w` units wide; null code = face down. */
@Composable
fun Card(code: String?, w: Number, modifier: Modifier = Modifier, selected: Boolean = false, dim: Boolean = false) {
    val h = w.toFloat() * 1.4f
    val lift = LocalUnit.current
    Box(
        modifier.size(w.u, h.u).graphicsLayer { translationY = if (selected) -18f * lift else 0f }
            .then(if (selected) Modifier.border(4.u, C.Gold, RoundedCornerShape((w.toFloat() * 0.09f).u)) else Modifier)
            .alpha(if (dim) 0.55f else 1f),
    ) {
        Art(if (code == null) "cards/back" else "cards/$code", Modifier.fillMaxSize(), animate = false)
    }
}

/** A casino chip with its value (the table's three bet chips are blue, green, red). */
@Composable
fun BetChip(value: String, index: Int, size: Number, modifier: Modifier = Modifier) {
    Box(modifier.size(size.u), contentAlignment = Alignment.Center) {
        Art(listOf("chip-blue", "chip-green", "chip-red")[index % 3], Modifier.fillMaxSize(), animate = false)
        Txt(value, size.toFloat() * 0.3f, stroke = Color(0xFF1A0A00), strokeWidth = 4, align = TextAlign.Center)
    }
}

@Composable
fun ChipIcon(size: Number, modifier: Modifier = Modifier) = Art("icon-chips", modifier.size(size.u), animate = false)

@Composable
fun GoldIcon(size: Number, modifier: Modifier = Modifier) = Art("icon-gold", modifier.size(size.u), animate = false)

@Composable
fun KeyIcon(size: Number, modifier: Modifier = Modifier) = Art("icon-keys", modifier.size(size.u), animate = false)

/** A wallet badge: icon + amount in a gold-rimmed pill (display only). */
@Composable
fun WalletPill(icon: @Composable () -> Unit, amount: String, modifier: Modifier, fill: List<Color> = listOf(Color(0xFF5A0609), Color(0xFF2A0204)), label: String? = null, plus: (() -> Unit)? = null) {
    GoldFrame(modifier, radius = 999, rim = 5, fill = Brush.verticalGradient(fill)) {
        Row(Modifier.fillMaxSize().padding(horizontal = 12.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.u)) {
            icon()
            if (label != null) Txt(label, 15, color = C.Gold, maxLines = 1)
            Txt(amount, 34, modifier = Modifier.weight(1f), align = TextAlign.Center, maxLines = 1)
            if (plus != null) {
                Box(Modifier.size(46.u).tap(label = "Buy", onClick = plus).clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFF7DFF8A), Color(0xFF13A344)))).border(3.u, Color.White, CircleShape), contentAlignment = Alignment.Center) {
                    Txt("+", 32)
                }
            }
        }
    }
}

@Composable
fun Spinner(modifier: Modifier = Modifier, text: String = "Loading…") {
    Txt(text, 30, modifier, color = C.White.copy(alpha = 0.8f), align = TextAlign.Center)
}

@Composable
fun Toggle(on: Boolean, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(110.u, 56.u).tap(label = label, onClick = onClick).clip(RoundedCornerShape(999.u))
            .background(if (on) Color(0xFF13A344) else Color(0xFF6B5A4A)).border(4.u, Color.White, RoundedCornerShape(999.u)).padding(6.u),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(Modifier.size(42.u).clip(CircleShape).background(Color.White))
    }
}

@Composable
fun Divider(modifier: Modifier = Modifier) = Spacer(modifier.fillMaxWidth().height(2.u).background(C.GoldEdge.copy(alpha = 0.3f)))

/** Fixed-width spacer in stage units. */
@Composable
fun Gap(w: Number = 0, h: Number = 0) = Spacer(Modifier.size(w.u, h.u))

@Composable
fun Tilted(deg: Float, content: @Composable () -> Unit) = Box(Modifier.rotate(deg)) { content() }
