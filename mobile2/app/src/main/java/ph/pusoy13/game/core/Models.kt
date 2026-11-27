package ph.pusoy13.game.core

import org.json.JSONObject

/*
 * Shapes returned by the Laravel API (the same as mobile/src/lib/types.ts, lobby.ts, gold.ts and
 * the Single Player types). Everything here is display data: the server decides every rule.
 */

typealias Rows = Map<String, List<String>>

val LANES = listOf("front", "middle", "back")
val LANE_SIZE = mapOf("front" to 3, "middle" to 5, "back" to 5)

fun rowsOf(o: JSONObject?): Rows? = o?.let { mapOf("front" to (it.strs("front") ?: emptyList()), "middle" to (it.strs("middle") ?: emptyList()), "back" to (it.strs("back") ?: emptyList())) }
fun Rows.lane(l: String): List<String> = this[l] ?: emptyList()
fun Rows.isFull(): Boolean = lane("front").size == 3 && lane("middle").size == 5 && lane("back").size == 5
fun Rows.json(): JSONObject = Api.body("front" to lane("front"), "middle" to lane("middle"), "back" to lane("back"))

/** The 13 cards placed straight into the rows in the order they were dealt: 1-3 Front, 4-8 Middle, 9-13 Back. */
fun dealtRows(cards: List<String>): Rows = mapOf("front" to cards.take(3), "middle" to cards.drop(3).take(5), "back" to cards.drop(8).take(5))

val LUCKY_LABELS = mapOf("three_flushes" to "3-Flushes", "three_straights" to "3-Straight", "no_face_cards" to "No Faces", "six_pairs" to "6 Pairs")
fun luckyAnnouncement(label: String) = "${label.uppercase()} – LUCKY HAND"

data class Level(val level: Int, val xp: Int, val intoLevel: Int, val forNext: Int) {
    companion object {
        fun of(o: JSONObject?) = o?.let { Level(it.int("level", 1), it.int("xp"), it.int("into_level"), it.int("for_next", 1)) }
    }
}

data class GamePrefs(val bgm: Boolean, val sfx: Boolean, val motion: String, val motionChosen: Boolean)

data class User(
    val id: Int,
    val name: String,
    val username: String,
    val displayName: String?,
    val avatar: String?,
    val role: String,
    val level: Level?,
    val prefs: GamePrefs?,
) {
    val shownName get() = displayName?.takeIf { it.isNotBlank() } ?: name

    companion object {
        fun of(o: JSONObject) = User(
            o.int("id"), o.text("name"), o.text("username"), o.str("display_name"), o.str("avatar"), o.text("role", "player"), Level.of(o.obj("level")),
            o.obj("preferences")?.let { GamePrefs(it.bool("bgm", true), it.bool("sfx", true), it.text("motion", "high"), it.bool("motion_chosen", true)) },
        )
    }
}

data class Wallet(val currency: String, val type: String, val balance: Double, val frozen: Boolean) {
    companion object {
        fun of(o: JSONObject) = Wallet(o.text("currency"), o.text("type"), o.num("balance"), o.bool("is_frozen"))
    }
}

data class Transaction(val id: Int, val reference: String, val type: String, val currency: String, val amount: Double, val direction: String?, val balanceAfter: Double?, val reason: String?, val createdAt: String?) {
    companion object {
        fun of(o: JSONObject) = Transaction(o.int("id"), o.text("reference"), o.text("type"), o.text("currency"), o.num("amount"), o.str("direction"), o.numOrNull("balance_after"), o.str("reason"), o.str("created_at"))
    }
}

data class SeatPlayer(
    val userId: Int,
    val name: String,
    val avatar: String?,
    val seat: Int,
    val isReady: Boolean,
    val isConnected: Boolean,
    val isYou: Boolean,
    val hasSubmitted: Boolean,
    val isBanker: Boolean,
    val bet: Double,
    val betType: String?,
) {
    companion object {
        fun of(o: JSONObject) = SeatPlayer(
            o.int("user_id"), o.text("name"), o.str("avatar"), o.int("seat"), o.bool("is_ready"), o.bool("is_connected", true), o.bool("is_you"),
            o.bool("has_submitted"), o.bool("is_banker"), o.num("bet"), o.str("bet_type"),
        )
    }
}

data class Arrangement(val userId: Int, val name: String, val rows: Rows, val labels: Map<String, String>, val isFoul: Boolean, val luckyType: String?, val luckyFailed: Boolean) {
    companion object {
        fun of(o: JSONObject) = Arrangement(
            o.int("user_id"), o.text("name"), rowsOf(o)!!,
            o.obj("labels")?.let { l -> LANES.associateWith { l.text(it) } } ?: emptyMap(),
            o.bool("is_foul"), o.str("lucky_type"), o.bool("lucky_failed"),
        )
    }
}

data class GameResult(val userId: Int, val name: String, val seat: Int, val score: Int, val placement: Int, val isFoul: Boolean, val net: Double, val role: String?, val bet: Double, val lanes: Map<String, Int>?, val luckyType: String?, val luckyFailed: Boolean, val penalty: String?) {
    companion object {
        fun of(o: JSONObject) = GameResult(
            o.int("user_id"), o.text("name"), o.int("seat"), o.int("score"), o.int("placement"), o.bool("is_foul"), o.num("net"), o.str("role"), o.num("bet"),
            o.obj("lanes")?.let { l -> LANES.associateWith { l.int(it) } }, o.str("lucky_type"), o.bool("lucky_failed"), o.str("penalty"),
        )
    }
}

data class Standing(val rank: Int, val userId: Int, val name: String, val avatar: String?, val rounds: Int, val bankerRounds: Int, val net: Double) {
    companion object {
        fun of(o: JSONObject) = Standing(o.int("rank"), o.int("user_id"), o.text("name"), o.str("avatar"), o.int("rounds"), o.int("banker_rounds"), o.num("net"))
    }
}

data class SessionState(
    val id: Int,
    val status: String,
    val serverTime: Long?,
    val arrangementDeadline: Long?,
    val bettingDeadline: Long?,
    val arrangementSeconds: Int,
    val bettingSeconds: Int,
    val roundsTotal: Int,
    val betChips: List<Double>,
    val minEntry: Double,
    val roundNumber: Int,
    val bankerUserId: Int?,
    val bankerChecks: List<Pair<Int, Boolean>>,
    val myBet: Double?,
    val myBetType: String?,
    val myAutoBetSkipped: String?,
    val canBet: Boolean,
    val players: List<SeatPlayer>,
    val myCards: List<String>?,
    val myDraft: Rows?,
    val mySubmission: JSONObject?,
    val arrangements: List<Arrangement>?,
    val results: List<GameResult>?,
    val cancelReason: String?,
) {
    companion object {
        fun of(o: JSONObject): SessionState {
            val c = o.obj("config") ?: JSONObject()
            return SessionState(
                o.int("id"), o.text("status"), instant(o.str("server_time")), instant(o.str("arrangement_deadline")), instant(o.str("betting_deadline")),
                c.int("arrangement_seconds", 90), c.int("betting_seconds", 15), c.int("rounds_total", 12),
                c.strs("bet_chips")?.mapNotNull { it.toDoubleOrNull() } ?: emptyList(), c.num("min_entry"),
                o.int("round_number", 1), o.intOrNull("banker_user_id"),
                o.obj("banker_selection")?.objs("checks")?.map { it.int("user_id") to it.bool("eligible", true) } ?: emptyList(),
                o.numOrNull("my_bet"), o.str("my_bet_type"), o.str("my_auto_bet_skipped"), o.bool("can_bet"),
                o.objs("players").map(SeatPlayer::of), o.strs("my_cards"), rowsOf(o.obj("my_draft")), o.obj("my_submission"),
                o.arr("arrangements")?.objects()?.map(Arrangement::of), o.arr("results")?.objects()?.map(GameResult::of), o.str("cancel_reason"),
            )
        }
    }
}

data class TableState(
    val id: Int,
    val status: String,
    val roomName: String,
    val gameMode: String?,
    val betChips: List<Double>,
    val minEntry: Double,
    val bankerReserve: Double,
    val roundsTotal: Int,
    val roundsPlayed: Int,
    val bankerUserId: Int?,
    val nextRoundAt: Long?,
    val endReason: String?,
    val leaveAllowed: Boolean,
    val leaveReason: String?,
    val pausedMessage: String?,
    val standings: List<Standing>,
    val players: List<SeatPlayer>,
    val currentSessionId: Int?,
) {
    companion object {
        fun of(o: JSONObject): TableState {
            val room = o.obj("room") ?: JSONObject()
            return TableState(
                o.int("id"), o.text("status"), room.text("name"), o.str("game_mode") ?: room.str("game_mode"),
                room.strs("bet_chips")?.mapNotNull { it.toDoubleOrNull() } ?: emptyList(), room.num("min_entry"), room.num("banker_reserve"),
                o.int("rounds_total", 12), o.int("rounds_played"), o.intOrNull("banker_user_id"), instant(o.str("next_round_at")), o.str("end_reason"),
                o.obj("leave")?.bool("allowed") ?: false, o.obj("leave")?.str("reason"), o.obj("paused")?.str("message"),
                o.objs("standings").map(Standing::of), o.objs("players").map(SeatPlayer::of), o.intOrNull("current_session_id"),
            )
        }
    }
}

// ---- Multiplayer lobbies ----

data class LobbyTier(val minEntry: Int, val bets: List<Int>, val keys: Int) {
    companion object {
        fun of(o: JSONObject) = LobbyTier(o.int("min_entry"), o.arr("bets")?.let { a -> (0 until a.length()).map { a.optInt(it) } } ?: emptyList(), o.int("keys"))
        val DEFAULT = listOf(LobbyTier(100, listOf(5, 10, 15), 1), LobbyTier(500, listOf(20, 30, 40), 2), LobbyTier(1000, listOf(50, 75, 100), 5))
    }
}

data class LobbySummary(
    val id: Int,
    val lobbyId: String,
    val name: String,
    val gameMode: String,
    val gameModeLabel: String,
    val minEntry: Double,
    val minBet: Double,
    val betChips: List<Double>,
    val keyFee: Int,
    val preparationSeconds: Int,
    val players: Int,
    val maxPlayers: Int,
    val type: String,
    val status: String,
    val isMine: Boolean,
    val canJoin: Boolean,
) {
    companion object {
        fun of(o: JSONObject) = LobbySummary(
            o.int("id"), o.text("lobby_id"), o.text("name"), o.text("game_mode", "round_bank"), o.text("game_mode_label", "Round Bank"), o.num("min_entry"), o.num("min_bet"),
            o.strs("bet_chips")?.mapNotNull { it.toDoubleOrNull() } ?: listOf(o.num("min_bet")), o.int("key_fee"), o.int("preparation_seconds"), o.int("players"), o.int("max_players", 4),
            o.text("type", "public"), o.text("status"), o.bool("is_mine"), o.bool("can_join"),
        )
    }
}

data class LobbySeat(val seat: Int, val userId: Int?, val state: String, val name: String?, val avatar: String?, val isReady: Boolean, val isConnected: Boolean, val isOwner: Boolean, val isBanker: Boolean, val isYou: Boolean) {
    companion object {
        fun of(o: JSONObject) = LobbySeat(
            o.int("seat"), o.intOrNull("user_id"), o.text("state", "available"), o.str("name"), o.str("avatar"), o.bool("is_ready"), o.bool("is_connected", true),
            o.bool("is_owner"), o.bool("is_banker"), o.bool("is_you"),
        )
    }
}

data class LobbyDetail(
    val summary: LobbySummary,
    val tableId: Int?,
    val tableStatus: String?,
    val seats: List<LobbySeat>,
    val isOwner: Boolean,
    val isSeated: Boolean,
    val mySeat: Int?,
    val mySeatConfirmed: Boolean,
    val myReady: Boolean,
    val allConfirmed: Boolean,
    val readyCount: Int,
    val seatedCount: Int,
    val countdownEndsAt: Long?,
    val serverTime: Long?,
    val canPressStart: Boolean,
    val startHint: String,
    val myBet: Double?,
    val myRequiredChips: Double?,
    val myKeys: Double,
) {
    companion object {
        fun of(o: JSONObject) = LobbyDetail(
            LobbySummary.of(o), o.intOrNull("table_id"), o.str("table_status"), o.objs("seats").map(LobbySeat::of), o.bool("is_owner"), o.bool("is_seated"),
            o.intOrNull("my_seat"), o.bool("my_seat_confirmed"), o.bool("my_ready"), o.bool("all_confirmed"), o.int("ready_count"),
            o.int("seated_count", o.int("players")), instant(o.str("countdown_ends_at")), instant(o.str("server_time")), o.bool("can_press_start"),
            o.text("start_hint"), o.numOrNull("my_bet"), o.numOrNull("my_required_chips"), o.num("my_keys"),
        )
    }
}

data class LobbyList(val rows: List<LobbySummary>, val page: Int, val pages: Int, val counts: Map<String, Int>, val myLobbyId: Int?, val otherTableId: Int?, val tiers: List<LobbyTier>) {
    companion object {
        fun of(o: JSONObject): LobbyList {
            val m = o.obj("meta") ?: JSONObject()
            val c = m.obj("counts")
            return LobbyList(
                o.dataList().map(LobbySummary::of), m.int("page", 1), m.int("pages", 1),
                mapOf("all" to (c?.int("all") ?: 0), "public" to (c?.int("public") ?: 0), "private" to (c?.int("private") ?: 0)),
                m.intOrNull("my_lobby_id"), m.intOrNull("other_table_id"), m.arr("tiers")?.objects()?.map(LobbyTier::of)?.takeIf { it.isNotEmpty() } ?: LobbyTier.DEFAULT,
            )
        }
    }
}

const val PLAYER_BET_MULTIPLE = 2
fun requiredChips(minEntry: Double, bet: Double) = maxOf(minEntry, bet * PLAYER_BET_MULTIPLE)
fun keysLabel(n: Int) = "$n ${if (n == 1) "Key" else "Keys"}"

/** What stops a player from joining (null = OK). Display only: the server checks again. */
fun entryProblem(minEntry: Double, bets: List<Double>, keyFee: Int, chips: Double?, keys: Double?): String? {
    val bet = bets.minOrNull() ?: 0.0
    val need = requiredChips(minEntry, bet)
    if (chips != null && chips < need) {
        return if (need > minEntry) "You need at least ${fmt(need)} Chips (2× your ${fmt(bet)} bet). You have ${fmtWhole(chips)}."
        else "You need at least ${fmt(need)} Chips for this lobby. You have ${fmtWhole(chips)}."
    }
    if (keys != null && keys < keyFee) return "You need ${keysLabel(keyFee)} to play. You have ${fmt(keys)}."
    return null
}

// ---- Single Player ----

data class GoldWallet(val gold: Double, val total: Double, val outOfGold: Boolean, val claimAmount: Int, val canClaim: Boolean, val minimumToStart: Int) {
    companion object {
        fun of(o: JSONObject) = GoldWallet(o.num("gold"), o.numOrNull("total") ?: o.num("gold"), o.bool("out_of_gold"), o.int("claim_amount"), o.bool("can_claim"), o.int("minimum_to_start"))
    }
}

data class PracticeTier(val key: String, val name: String, val stars: Int, val crown: Boolean, val minGold: Int, val bets: List<Int>, val eligible: Boolean) {
    companion object {
        fun of(o: JSONObject) = PracticeTier(o.text("key"), o.text("name"), o.int("stars"), o.bool("crown"), o.int("min_gold"), o.arr("bets")?.let { a -> (0 until a.length()).map { a.optInt(it) } } ?: emptyList(), o.bool("eligible", true))
    }
}

data class RoundPlayer(val seat: Int, val name: String, val isYou: Boolean, val isBanker: Boolean, val bet: Double, val rows: Rows?, val labels: Map<String, String>, val isFoul: Boolean, val lucky: String?, val lanes: Map<String, Int>?, val gold: Double) {
    companion object {
        fun of(o: JSONObject) = RoundPlayer(
            o.int("seat"), o.text("name"), o.bool("is_you"), o.bool("is_banker"), o.num("bet"), if (o.has("front")) rowsOf(o) else null,
            o.obj("labels")?.let { l -> LANES.associateWith { l.text(it) } } ?: emptyMap(), o.bool("is_foul"), o.obj("lucky")?.str("label"),
            o.obj("lanes")?.let { l -> LANES.associateWith { l.int(it) } }, o.num("gold"),
        )
    }
}

data class RoundState(
    val id: Int,
    val status: String,
    val round: Int,
    val roundsTotal: Int,
    val banker: Int,
    val bankerName: String,
    val tierName: String,
    val bet: Double,
    val covered: Double,
    val cards: List<String>,
    val players: List<RoundPlayer>,
    val resultGold: Double?,
    val resultLanes: Map<String, Int>?,
    val resultMultiple: Int?,
    val misplaced: Boolean,
    val luckyFailed: Boolean,
    val luckyLabel: String?,
) {
    companion object {
        fun of(o: JSONObject): RoundState {
            val r = o.obj("result")
            return RoundState(
                o.int("id"), o.text("status"), o.int("round", 1), o.int("rounds_total", 12), o.int("banker", 1), o.text("banker_name"), o.obj("tier")?.text("name") ?: "",
                o.num("bet"), o.num("covered"), o.strs("cards") ?: emptyList(), o.objs("players").map(RoundPlayer::of),
                r?.numOrNull("gold"), r?.obj("lanes")?.let { l -> LANES.associateWith { l.int(it) } }, r?.intOrNull("multiple"), r?.bool("misplaced") ?: false,
                r?.bool("lucky_failed") ?: false, o.obj("lucky")?.str("label"),
            )
        }
    }
}

data class MatchHistory(val round: Int, val bankerName: String, val bet: Double, val gold: Double, val lucky: String?)

data class MatchState(
    val id: Int,
    val status: String,
    val outOfGold: Boolean,
    val tierKey: String,
    val tierName: String,
    val roundsTotal: Int,
    val roundsPlayed: Int,
    val nextRound: Int?,
    val nextBanker: Int?,
    val nextBankerName: String?,
    val gold: Double,
    val standings: List<Triple<Int, String, Double>>,
    val history: List<MatchHistory>,
    val current: RoundState?,
) {
    companion object {
        fun of(o: JSONObject) = MatchState(
            o.int("id"), o.text("status"), o.bool("out_of_gold"), o.obj("tier")?.text("key") ?: "", o.obj("tier")?.text("name") ?: "", o.int("rounds_total", 12), o.int("rounds_played"),
            o.intOrNull("next_round"), o.intOrNull("next_banker"), o.str("next_banker_name"), o.num("gold"),
            o.objs("standings").map { Triple(it.int("seat"), it.text("name"), it.num("gold")) },
            o.objs("history").map { MatchHistory(it.int("round"), it.text("banker_name"), it.num("bet"), it.num("gold"), it.str("lucky")) },
            o.obj("current")?.let(RoundState::of),
        )
    }
}

// ---- Friends, shop, maintenance ----

data class Friend(val id: Int, val userId: Int, val username: String, val name: String, val avatar: String?, val level: Int, val online: Boolean, val lastSeenAt: String?, val inGame: Boolean, val roomName: String?) {
    companion object {
        fun of(o: JSONObject) = Friend(o.int("id"), o.int("user_id"), o.text("username"), o.text("name"), o.str("avatar"), o.int("level", 1), o.bool("online"), o.str("last_seen_at"), o.bool("in_game"), o.str("room_name"))
    }
}

data class FriendsData(val friends: List<Friend>, val incoming: List<Friend>, val outgoing: List<Friend>, val onlineCount: Int) {
    companion object {
        fun of(o: JSONObject) = FriendsData(o.objs("friends").map(Friend::of), o.objs("incoming").map(Friend::of), o.objs("outgoing").map(Friend::of), o.int("online_count"))
    }
}

data class ShopPack(val id: String, val keys: Int, val chips: Int)
data class ShopState(val chipsPerKey: Int, val packages: List<ShopPack>, val keys: Double, val chips: Double, val history: List<JSONObject>) {
    companion object {
        fun of(o: JSONObject) = ShopState(
            o.int("chips_per_key", 5), o.objs("packages").map { ShopPack(it.text("id"), it.int("keys"), it.int("chips")) },
            o.obj("balances")?.num("keys") ?: 0.0, o.obj("balances")?.num("chips") ?: 0.0, o.objs("history"),
        )
    }
}

data class Maintenance(val mode: String, val label: String, val gameBlocked: Boolean) {
    companion object {
        fun of(o: JSONObject) = Maintenance(o.text("mode", "off"), o.text("label"), o.bool("game_blocked"))
    }
}

data class Preview(val labels: Map<String, String?>, val isFoul: Boolean, val order: Map<String, Boolean?>) {
    companion object {
        fun of(o: JSONObject) = Preview(
            o.obj("labels")?.let { l -> LANES.associateWith { l.str(it) } } ?: emptyMap(), o.bool("is_foul"),
            o.obj("order")?.let { l -> LANES.associateWith { if (l.isNull(it)) null else l.optBoolean(it) } } ?: emptyMap(),
        )
    }
}
