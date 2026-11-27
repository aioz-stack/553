package ph.pusoy13.game.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.ApiException
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.Store
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.ui.AssetImage
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.Card
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.Field
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.GoldIcon
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u
import ph.pusoy13.game.ui.ts

/** Splash: decides where to go (onboarding → login → home). */
@Composable
fun SplashScreen() {
    val ready by Session.ready.collectAsState()
    LaunchedEffect(ready) {
        if (!ready) return@LaunchedEffect
        delay(900)
        when {
            Session.user.value != null -> Nav.reset(Route.Home())
            Store.flag("pusoy.onboarded", false) -> Nav.reset(Route.Login)
            else -> Nav.reset(Route.Onboarding)
        }
    }
    Stage(background = { Scene("lantern") }) {
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            CardFan(listOf("AS", "KH", "QD", "JC", "TS"), 110)
            Row {
                Txt("PUSOY ", 130, color = C.Gold, stroke = Color(0xFF3A1300), strokeWidth = 10)
                Txt("13", 130, stroke = Color(0xFF3A1300), strokeWidth = 10)
            }
            Txt("CHINESE POKER", 30, color = C.White.copy(alpha = 0.7f))
            Box(Modifier.height(30.u))
            Box(Modifier.size(320.u, 18.u).clip(RoundedCornerShape(999.u)).background(Brush.horizontalGradient(listOf(Color(0xFFFFD75A), Color(0xFFE89A00)))))
        }
    }
}

@Composable
fun CardFan(cards: List<String>, w: Number, spread: Float = 12f) {
    Box(Modifier.size((w.toFloat() * (cards.size * 0.55f + 0.6f)).u, (w.toFloat() * 1.6f).u), contentAlignment = Alignment.Center) {
        val mid = (cards.size - 1) / 2f
        cards.forEachIndexed { i, c ->
            Box(Modifier.offset(x = ((i - mid) * w.toFloat() * 0.55f).u, y = (kotlin.math.abs(i - mid) * w.toFloat() * 0.08f).u).rotate((i - mid) * spread)) {
                Card(c, w)
            }
        }
    }
}

private data class Slide(val title: String, val text: String)

private val SLIDES = listOf(
    Slide("13 cards, 3 hands", "Arrange your cards into a Front (3), Middle (5) and Back (5). The Back must be your strongest."),
    Slide("Beat every rival", "Each hand is compared with the same hand of all three opponents: +1 win, −1 loss, 0 tie."),
    Slide("Gold and Chips", "Gold is for Single Player, Chips are for Multiplayer. They are separate, never mixed, and never cash."),
    Slide("Provably fair", "Every deck is locked in before the deal and revealed afterwards so anyone can verify it."),
)

@Composable
fun OnboardingScreen() {
    var index by remember { mutableIntStateOf(0) }
    val slide = SLIDES[index]
    val last = index == SLIDES.lastIndex
    val finish = {
        Store.setFlag("pusoy.onboarded", true)
        Nav.reset(Route.Login)
    }
    Stage(background = { Scene("lantern") }) {
        Box(Modifier.at(1400, 30).tap(onClick = finish).clip(RoundedCornerShape(999.u)).background(Color(0x33FFFFFF)).padding(horizontal = 28.u, vertical = 10.u)) {
            Txt("Skip", 28, color = C.White.copy(alpha = 0.85f))
        }
        Column(Modifier.align(Alignment.Center).width(900.u), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.height(300.u), contentAlignment = Alignment.Center) {
                when (index) {
                    0 -> CardFan(listOf("AS", "AH", "KD", "KC", "QS"), 110, 10f)
                    1 -> Art3("home-crest")
                    2 -> Row(horizontalArrangement = Arrangement.spacedBy(30.u)) { GoldIcon(150); ChipIcon(150) }
                    else -> Art3("mini-crest")
                }
            }
            Txt(slide.title, 64, align = TextAlign.Center, stroke = Color(0xFF2A0A40))
            Txt(slide.text, 30, color = C.White.copy(alpha = 0.8f), align = TextAlign.Center)
            Box(Modifier.height(30.u))
            Row(horizontalArrangement = Arrangement.spacedBy(12.u)) {
                SLIDES.indices.forEach { i -> Box(Modifier.size(if (i == index) 48.u else 16.u, 16.u).clip(CircleShape).background(if (i == index) C.Gold else Color(0x40FFFFFF))) }
            }
            Box(Modifier.height(30.u))
            CandyButton(if (last) "LET'S PLAY" else "NEXT", Modifier.size(460.u, 96.u), size = 44) { if (last) finish() else index++ }
        }
    }
}

@Composable
private fun Art3(name: String) = ph.pusoy13.game.ui.Art(name, Modifier.size(600.u, 250.u))

/**
 * Mobile Game sign-in (players) on the Pusoy553 login artwork: username, password, show / hide
 * and LOG IN. The server decides everything (wrong credentials, pending / suspended accounts,
 * maintenance, staff accounts) and its message is shown here.
 */
@Composable
fun LoginScreen() {
    val username = remember { mutableStateOf("") }
    val password = remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val submit: () -> Unit = {
        if (!busy) {
            busy = true
            error = null
            scope.launch {
                try {
                    Session.login(username.value.trim(), password.value)
                    Sound.play("win")
                    Nav.reset(Route.Home())
                } catch (e: Exception) {
                    error = errorText(e)
                    password.value = ""
                    busy = false
                    Sound.play("lose")
                }
            }
        }
    }
    var shown by remember { mutableStateOf(false) }
    // The artwork (1672×941) already draws the two fields and the LOG IN button: the inputs sit on
    // its boxes (measured in mobile/src/components/LoginArt.tsx), scaled to the 1600×900 stage.
    Stage(background = { AssetImage("login-art.webp", Modifier.fillMaxSize(), cover = true) }) {
        AssetImage("login-art.webp", Modifier.at(0, 0, 1600, 900))
        ArtInput(username, "Username", false, shown, 586, 391, 520, 75)
        ArtInput(password, "Password", true, shown, 586, 501, 455, 74)
        Box(Modifier.at(1051, 513, 55, 50).tap(sound = null, label = if (shown) "Hide password" else "Show password") { shown = !shown })
        Box(
            Modifier.at(468, 617, 659, 103).tap(enabled = !busy && username.value.isNotBlank() && password.value.isNotEmpty(), label = "Log in", onClick = submit).clip(RoundedCornerShape(999.u))
                .background(if (busy) Color(0x40000000) else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) { if (busy) Txt("SIGNING IN…", 34, color = C.Brown) }
        Column(Modifier.at(420, 727).width(760.u), horizontalAlignment = Alignment.CenterHorizontally) {
            error?.let { Txt(it, 22, color = Color(0xFFFFE4E4), align = TextAlign.Center, modifier = Modifier.clip(RoundedCornerShape(999.u)).background(Color(0xE63A0D14)).padding(horizontal = 24.u, vertical = 6.u)) }
            Txt("Have a registration link? Create an account", 20, color = C.Cream, align = TextAlign.Center, modifier = Modifier.padding(top = 8.u).tap { Nav.go(Route.Register) }, stroke = Color(0xCC000000), strokeWidth = 4)
        }
    }
}

/** A text input drawn on the artwork's own field box (the art's fill colour hides its placeholder). */
@Composable
private fun ArtInput(state: androidx.compose.runtime.MutableState<String>, hint: String, password: Boolean, shown: Boolean, x: Int, y: Int, w: Int, h: Int) {
    Box(Modifier.at(x, y, w, h).background(Color(0xFF2F1B1B)), contentAlignment = Alignment.CenterStart) {
        if (state.value.isEmpty()) Txt(hint, 32, color = Color(0x80E5DED6), font = ph.pusoy13.game.ui.Body, weight = androidx.compose.ui.text.font.FontWeight.Bold)
        androidx.compose.foundation.text.BasicTextField(
            state.value, { state.value = it }, Modifier.fillMaxWidth(), singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(fontFamily = ph.pusoy13.game.ui.Body, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, fontSize = 32.ts, color = Color(0xFFE5DED6)),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(C.Gold),
            visualTransformation = if (password && !shown) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = if (password) androidx.compose.ui.text.input.KeyboardType.Password else androidx.compose.ui.text.input.KeyboardType.Text),
        )
    }
}

/** A registration link (…/register/player?ref=CODE or …/register/agent?ref=CODE) or its code. */
fun parseRegistrationLink(input: String): Pair<String, String> {
    val text = input.trim()
    val ref = Regex("[?&]ref=([^&#\\s]+)", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
    val code = java.net.URLDecoder.decode(ref ?: text, "UTF-8").trim().uppercase()
    return code to if (Regex("/register/agent\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)) "agent" else "player"
}

@Composable
fun RegisterScreen() {
    val fields = listOf("name", "username", "email", "password", "password_confirmation", "referral_code").associateWith { remember { mutableStateOf("") } }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Stage(background = { Scene("lantern") }) {
        GoldFrame(Modifier.at(300, 40, 1000, 820), radius = 40, rim = 8) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 40.u, vertical = 24.u), verticalArrangement = Arrangement.spacedBy(10.u)) {
                Txt("Join the table — it's free to play", 36, color = C.Gold, modifier = Modifier.align(Alignment.CenterHorizontally))
                error?.let { Txt(it, 22, color = C.Pink) }
                done?.let { Txt(it, 22, color = C.Mint) }
                Row(horizontalArrangement = Arrangement.spacedBy(20.u)) {
                    Field("Full name", fields.getValue("name"), Modifier.weight(1f), error = errors["name"], size = 24)
                    Field("Username", fields.getValue("username"), Modifier.weight(1f), error = errors["username"], size = 24)
                }
                Field("Email", fields.getValue("email"), Modifier.fillMaxWidth(), error = errors["email"], size = 24)
                Row(horizontalArrangement = Arrangement.spacedBy(20.u)) {
                    Field("Password", fields.getValue("password"), Modifier.weight(1f), password = true, error = errors["password"], size = 24)
                    Field("Confirm password", fields.getValue("password_confirmation"), Modifier.weight(1f), password = true, error = errors["password_confirmation"], size = 24)
                }
                Field("Registration link or code (required)", fields.getValue("referral_code"), Modifier.fillMaxWidth(), placeholder = "Paste the link your agent sent you", error = errors["referral_code"], size = 24)
                Txt("Registration is by invitation only: use the registration link from your agent or administrator.", 18, color = C.White.copy(alpha = 0.7f))
                Row(horizontalArrangement = Arrangement.spacedBy(20.u), modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    CandyButton("Back to sign in", Modifier.size(340.u, 80.u), Tone.Dark, size = 28) { Nav.back() }
                    CandyButton(if (busy) "CREATING…" else "CREATE ACCOUNT", Modifier.size(420.u, 80.u), Tone.Green, size = 30, enabled = !busy && done == null) {
                        busy = true
                        errors = emptyMap()
                        error = null
                        scope.launch {
                            try {
                                val (code, type) = parseRegistrationLink(fields.getValue("referral_code").value)
                                val form = fields.mapValues { it.value.value } + mapOf("referral_code" to code, "account_type" to type)
                                done = Session.register(form) + " You can sign in once an administrator approves it."
                            } catch (e: Exception) {
                                if (e is ApiException) errors = e.errors.mapValues { it.value.firstOrNull().orEmpty() }
                                error = errorText(e)
                            }
                            busy = false
                        }
                    }
                }
            }
        }
    }
}
