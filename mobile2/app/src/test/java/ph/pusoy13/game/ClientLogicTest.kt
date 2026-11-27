package ph.pusoy13.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ph.pusoy13.game.core.dealtRows
import ph.pusoy13.game.core.entryProblem
import ph.pusoy13.game.core.isFull
import ph.pusoy13.game.core.lane
import ph.pusoy13.game.core.requiredChips
import ph.pusoy13.game.screens.RevealSeat
import ph.pusoy13.game.screens.dealOrder
import ph.pusoy13.game.screens.exchange
import ph.pusoy13.game.screens.parseRegistrationLink
import ph.pusoy13.game.screens.revealPlan

/** Display-side logic only: every game rule is decided by the server. */
class ClientLogicTest {
    private val hand = listOf("AS", "KS", "QS", "JS", "TS", "9S", "8S", "7S", "6S", "5S", "4S", "3S", "2S")

    @Test
    fun dealtRowsFillFrontMiddleBackInDealOrder() {
        val rows = dealtRows(hand)
        assertEquals(listOf("AS", "KS", "QS"), rows.lane("front"))
        assertEquals(hand.subList(3, 8), rows.lane("middle"))
        assertEquals(hand.subList(8, 13), rows.lane("back"))
        assertTrue(rows.isFull())
    }

    @Test
    fun exchangeSwapsAcrossRowsAndKeepsSizes() {
        val rows = exchange(dealtRows(hand), "AS", "2S")
        assertEquals("2S", rows.lane("front")[0])
        assertEquals("AS", rows.lane("back")[4])
        assertTrue(rows.isFull())
        assertEquals(hand.toSet(), rows.values.flatten().toSet())
    }

    @Test
    fun exchangeWithinARowReorders() {
        val rows = exchange(dealtRows(hand), "AS", "QS")
        assertEquals(listOf("QS", "KS", "AS"), rows.lane("front"))
    }

    @Test
    fun exchangeWithUnknownCardChangesNothing() {
        val rows = dealtRows(hand)
        assertEquals(rows, exchange(rows, "AS", "XX"))
    }

    @Test
    fun dealOrderStartsAfterTheBanker() {
        assertEquals(listOf(2, 3, 4, 1), dealOrder(1))
        assertEquals(listOf(1, 2, 3, 4), dealOrder(4))
    }

    @Test
    fun revealFlipsEveryCardLaneByLane() {
        val rows = dealtRows(hand)
        val plan = revealPlan(listOf(RevealSeat(1, true, 0.0, rows, false, null), RevealSeat(2, false, 10.0, rows, false, mapOf("front" to -1, "middle" to -1, "back" to -1))), 1)
        assertEquals(26, plan.flips.size)
        assertTrue(plan.lanes.getValue("front").second < plan.lanes.getValue("middle").first)
        assertTrue(plan.lanes.getValue("middle").second < plan.lanes.getValue("back").first)
        // seat 2 lost all three lanes: one PUSOY! bomb for 2× its bet
        assertEquals(1, plan.fx.size)
        assertEquals("bomb", plan.fx[0].kind)
        assertEquals(20.0, plan.fx[0].amount, 0.0)
        assertTrue(plan.done > plan.fx[0].end)
    }

    @Test
    fun misarrangedHandGetsTheLightning() {
        val rows = dealtRows(hand)
        val plan = revealPlan(listOf(RevealSeat(1, true, 0.0, rows, false, null), RevealSeat(3, false, 15.0, rows, true, null)), 1)
        assertEquals(listOf("zap"), plan.fx.map { it.kind })
        assertEquals(30.0, plan.fx[0].amount, 0.0)
    }

    @Test
    fun registrationLinkOrCode() {
        assertEquals("AB12" to "player", parseRegistrationLink("https://x.test/register/player?ref=ab12"))
        assertEquals("AG77" to "agent", parseRegistrationLink("https://x.test/register/agent?ref=AG77&utm=1"))
        assertEquals("CODE9" to "player", parseRegistrationLink("  code9 "))
    }

    @Test
    fun entryChecksMinimumEntryTwiceTheBetAndKeys() {
        assertEquals(100.0, requiredChips(100.0, 15.0), 0.0)
        assertEquals(200.0, requiredChips(100.0, 100.0), 0.0)
        assertNull(entryProblem(100.0, listOf(5.0, 10.0, 15.0), 1, 150.0, 2.0))
        assertTrue(entryProblem(100.0, listOf(5.0, 10.0, 15.0), 1, 50.0, 2.0)!!.contains("100 Chips"))
        assertTrue(entryProblem(500.0, listOf(20.0, 30.0, 40.0), 2, 900.0, 1.0)!!.contains("2 Keys"))
    }
}
