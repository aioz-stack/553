# Pusoy 13 Platform — Development Guide

Last updated: 2026-11-17 (round 2: concurrency fixes, push, payouts, frontend tests, Android build)

This repository contains the **Laravel web application + shared backend** (repo root) and the
**Next.js + Capacitor mobile application** (`mobile/`). Laravel is the single source of truth for
game rules, scoring, wallets, commissions and permissions. Both frontends only call `/api/v1` and
listen to Laravel Reverb.

---

## 1. Architecture assessment (Baseplate + Laravel)

Inspected `https://gitlab.com/czar.gaba/baseplate-react` (commit `60eefa0`) before building:

| Item | Finding |
| --- | --- |
| What it is | Already a **Laravel 13** application, not a standalone React SPA |
| Frontend | React 19 (`.jsx`), **Inertia.js v3** (`@inertiajs/react`), Vite 7 |
| Routing | Laravel routes → `Inertia::render('Page')` → `resources/js/Pages/*.jsx` |
| CSS | Tailwind CSS v4 via `@tailwindcss/vite`, TailAdmin design tokens in `resources/css/style.css` (brand `#465FFF`, Outfit font, dark mode via `.dark`) |
| Layout | `AuthenticatedLayout` (Sidebar + Header + Overlay + Preloader), `GuestLayout` |
| Components | Sidebar, Header, Breadcrumb, FlashMessage, MetricGroup, ApexChart, WorldMap, RecentOrdersTable, UserForm, Icons |
| Extras installed | ApexCharts, FullCalendar, jsvectormap, flatpickr, dropzone, Alpine |
| Tests | Pest 4 (`tests/Feature/AuthAndCrudTest.php`) |
| Auth | Session login by **username**, CRUD users demo at `/crud` |

**Integration strategy:** Baseplate *is* the Laravel web app, so it was adopted as the project
root (no porting). Everything was built on top of it:

- Kept Baseplate's layout, sidebar/header markup, Tailwind tokens, table/card/form classes and
  dark-mode system. New UI uses a small TS kit (`resources/js/Components/ui.tsx`,
  `DataTable.tsx`, `PageShell.tsx`) that reuses Baseplate's exact class names.
- Added **TypeScript** alongside the existing JSX (`tsconfig.json`, `allowJs`); new pages are
  `.tsx`, Baseplate pages stay `.jsx`. The page resolver loads either, code-split.
- Sidebar is now role-specific (`resources/js/lib/navigation.ts`).
- Baseplate's demo e-commerce dashboard is preserved at `resources/js/Pages/Baseplate/Dashboard.jsx`
  (unrouted). Baseplate's `/crud` user screens are kept but **restricted to Super Admin** (they were
  open to every logged-in user, which would let players edit accounts).
- Fixed a Baseplate bug: `Header.jsx` used `IconUsers` without importing it (profile dropdown crash).
- Baseplate's own `AGENTS.md` (Laravel Boost guidelines) was **not** copied because Windows
  filenames are case-insensitive and it would overwrite this project's `agents.md`.
- TailAdmin logos replaced with Pusoy 13 logos (`public/images/logo/pusoy-*.svg`, `public/favicon.svg`).

**Web ↔ API:** Web pages are thin Inertia shells; data and actions go through the same
`/api/v1` endpoints as the mobile app, authenticated by the web session cookie (Sanctum
"stateful" mode). The mobile app uses Sanctum bearer tokens. No business logic exists in either
frontend (hand names/foul hints come from the server `POST /games/{id}/preview` endpoint).

---

## 2. Local development (Windows + XAMPP, no Docker)

Requirements: XAMPP (PHP 8.3+, MariaDB/MySQL), Composer, Node 20+. Database `553` must exist.

```bash
composer install
npm install
cp .env.example .env          # then set DB_DATABASE=553 (already done in this checkout)
php artisan key:generate
php artisan migrate --seed    # roles, permissions, rooms, local demo accounts
npm run build                 # or: npm run dev
```

Run these processes (separate terminals), or use `composer dev` for the first three:

```bash
php artisan serve                                   # http://localhost:8000
php artisan queue:work --sleep=1 --tries=3          # broadcasts, timers, settlement jobs
php artisan reverb:start --host=0.0.0.0 --port=8080 # websockets
php artisan schedule:work                           # pusoy:sweep every minute
```

Local demo accounts (password `password`, created only when `APP_ENV=local`):

| Username | Role |
| --- | --- |
| `superadmin` | Super Admin |
| `admin` | Administrator (all abilities except audit logs) |
| `agent`, `agent2` | Agents (`agent` owns `player`, `demo1`–`demo6`) |
| `player`, `demo1`…`demo12` | Players with 1,000 VC each |

Testing a full game alone: join a room as `player` in the browser, then
`php artisan pusoy:fill-table vc-starter` seats and readies three demo players, and
`php artisan pusoy:fill-table vc-starter --submit` makes them submit (dev-only command).

### Mobile app

```bash
cd mobile
cp .env.example .env.local     # set NEXT_PUBLIC_REVERB_APP_KEY = backend REVERB_APP_KEY
npm install
npm run dev                    # http://localhost:3000 (browser preview)
npm run build && npx cap sync  # static export to out/ and copy into android/ + ios/
npx cap open android           # Android Studio (Windows/macOS/Linux)
npx cap open ios               # Xcode (macOS only)
```

On a physical phone use your PC's LAN IP in `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_REVERB_HOST`.
Icons/splash: edit `mobile/assets/*.svg`, re-render the PNGs, then `npm run assets`.

### Tests

```bash
php artisan test --compact                 # 164 Pest tests (unit + feature), SQLite in-memory
vendor/bin/pest -c phpunit.mysql.xml       # real-MySQL concurrency suite (parallel processes)
npm test                                   # web Vitest + Testing Library
cd mobile && npm test                      # mobile Vitest + Testing Library
vendor/bin/pint --format agent             # PHP formatting
npx tsc --noEmit && (cd mobile && npx tsc --noEmit)
```

**Concurrency suite:** `tests/Concurrency` launches several PHP processes at the same moment
(`tests/Concurrency/worker.php`) against the separate database **`553_testing`** (create it once:
`CREATE DATABASE \`553_testing\``; your dev database `553` is never touched). It covers parallel
debits (no overdraft), one idempotency key used concurrently, 8 simultaneous joins → exactly two
full tables, duplicate joins by one player, and simultaneous final submissions/resolves → settled once.
It found real races under MySQL's default REPEATABLE READ (stale snapshots after waiting on a lock);
the fix is `isolation_level = READ COMMITTED` in `config/database.php` (env `DB_ISOLATION_LEVEL`)
plus locking reads where decisions are made. Keep it at READ COMMITTED.

### Android build (Windows)

```bash
# Android Studio's bundled JDK 25 needs Gradle 9.1+ (wrapper already bumped from 8.14.3)
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
cd mobile && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug      # → android/app/build/outputs/apk/debug/app-debug.apk
```

Testing on the Android emulator against your local backend (plain http):

```bash
NEXT_PUBLIC_API_URL=http://10.0.2.2:8000 NEXT_PUBLIC_REVERB_HOST=10.0.2.2 npm run build
CAP_DEV_HTTP=1 npx cap sync android        # LOCAL ONLY: allows cleartext http; never ship it
```

Run a normal `npm run build && npx cap sync` afterwards so the native project goes back to https-only.

### Push notifications

Backend: `app/Notifications/Channels/PushChannel.php` + `app/Services/Push/FcmClient.php`
(FCM HTTP v1, service-account JWT signed with OpenSSL; no extra packages). Set `FCM_PROJECT_ID`
and `FCM_CREDENTIALS` (absolute path to the service-account JSON, outside `public/` and git).
Without them pushes are only logged. Pushes sent: room invitation, points received, cards dealt
(no card data). Dead tokens are cleared automatically.

Mobile: `@capacitor/push-notifications` registers the device token via
`PUT /api/v1/auth/devices/push-token`. **Only set `NEXT_PUBLIC_PUSH_ENABLED=true` after** adding
`mobile/android/app/google-services.json` (and enabling Push + uploading the APNs key in Firebase
for iOS). Registering without Firebase crashes the Android app; this was reproduced on the
emulator and is why the flag defaults to false.

---

## 3. Code map

| Area | Location |
| --- | --- |
| Game engine (pure PHP, no Laravel) | `app/Game/` — `Card`, `Deck`, `SeededRandom`, `HandEvaluator`, `HandValue`, `Arrangement`, `ArrangementValidator`, `Scorer`, `AutoArranger`, `Payout/*` |
| Game state machine | `app/Services/Game/GameEngine.php` |
| Seating / ready / heartbeat / sweeps | `app/Services/Game/TableService.php` |
| Settlement | `app/Services/Game/SettlementService.php` |
| Per-viewer state (card visibility) | `app/Services/Game/GameStatePresenter.php` |
| Ledger (only code that changes balances) | `app/Services/Wallet/LedgerService.php` |
| Wallets, daily reward, reconciliation | `app/Services/Wallet/WalletService.php` |
| Allocation / adjustments / freezing | `app/Services/Wallet/AllocationService.php` |
| Commissions / cash payout requests (flagged) | `app/Services/Agent/CommissionService.php`, `PayoutService.php` |
| Users, hierarchy, referral codes | `app/Services/Users/UserManagementService.php` |
| API | `routes/api.php`, `app/Http/Controllers/Api/V1/**`, `app/Http/Resources/*`, `app/Http/Requests/*` |
| Web routes (Inertia) | `routes/web.php` |
| Broadcast channels | `routes/channels.php`; events `app/Events/Game/*` |
| Jobs / commands | `app/Jobs/*`, `app/Console/Commands/*`, schedule in `routes/console.php` |
| Config & feature flags | `config/pusoy.php` |
| Web pages | `resources/js/Pages/{Player,Agent,Admin,Account,Auth}` |
| Mobile app | `mobile/src/app/*` (screens), `mobile/src/lib/*` (API, auth, Echo) |

---

## 4. Roles & permissions

Hierarchy: **Super Admin → Administrator → Agent → Player** (`users.role`, `App\Enums\Role`).

- Super Admin holds every ability. Only a Super Admin creates Super Admins and Administrators.
  First Super Admin: `php artisan pusoy:create-super-admin <username> <email>`.
- Administrators get configurable abilities (`permissions` + `permission_user`,
  `App\Enums\Ability`): `manage_players`, `manage_agents`, `allocate_points`, `manage_rooms`,
  `review_transactions`, `view_reports`, `manage_commissions`, `manage_games`, `view_audit_logs`,
  `freeze_allocations`; plus optional per-currency allocation limits (`administrator_limits`).
- Agents manage only their own players (`agent_players.player_id` is unique). They cannot create
  agents/admins, touch other agents' players, change balances or rates, edit history or approve
  their own commissions.
- Players cannot credit themselves or anyone.

Enforcement: Gates (one per ability + `staff`, `super-admin`, `agent`, `play`), Policies
(`UserPolicy`, `GameSessionPolicy`), `role:` middleware, service-level checks (defence in depth),
`EnsureActiveAccount` for suspended users. Every sensitive action writes `audit_logs` (append-only).

---

## 5. Wallets & ledger

- Amounts are **BIGINT minor units** (1 point = 100). API sends/receives decimal strings
  (`"2000.50"`), converted by `App\Support\Points`. No floats touch balances.
- One `wallets` table: `(user, currency, type)` where type ∈ `player`, `allocation`,
  `commission`, plus system wallets `escrow:{CP|VC}` and `platform:{CP|VC}`. The spec's
  `agent_wallets` / `agent_wallet_transactions` are these allocation/commission wallets — there is
  deliberately no second wallet system. CP and VC never mix (enforced in `LedgerService`).
- `wallet_transactions` is immutable (model blocks update/delete): reference, idempotency key,
  type, currency, source/destination wallet, amount, **balance before/after for both sides**,
  status, reason, created_by, approved_by, related player/agent, game session, reversal link.
  Corrections are `REVERSAL` entries (one per original).
- `LedgerService::transfer()` runs in a DB transaction, locks wallets with `SELECT … FOR UPDATE`
  in id order, refuses negative balances and frozen sources, and is idempotent (same key → same
  transaction; same key with different parameters → 409).
- Issuance: only Super Admin allocations (and the optional daily VC reward) have a null source.
- `php artisan pusoy:reconcile` (daily) checks every balance against the ledger and that escrow
  equals active holds + room carry-over banks.
- Cash: deposits, withdrawals/redemption, CP wagering and CP commission payouts are behind
  `FEATURE_*` flags, **all false by default**. `POST /wallet/deposit|withdraw` return 403.

Allocation workflow: Super Admin → Admin/Agent allocation wallet (or a player) → Agent → own
players. Records in `wallet_allocations`; manual credits/debits in `wallet_adjustments`.

---

## 6. Game rules (as implemented)

- 52 cards, no jokers, 4 players × 13 cards. Front 3 / Middle 5 / Back 5.
- **Five-card ranking:** Royal Flush > Straight Flush > Four of a Kind > Full House > Flush >
  Straight > Three of a Kind > Two Pair > One Pair > High Card.
- **Three-card (Front) ranking:** Three of a Kind > One Pair > High Card (no straights/flushes).
- Straights: A-K-Q-J-T is highest; **A-2-3-4-5 is the lowest straight** (ace low). No wrap-around.
- **Comparison:** category first, then tie-break ranks most→least significant
  (pairs/trips/quads ranks first, then kickers). **Suits never break ties** — identical ranks are
  a tie (0 points).
- **Front vs Middle (order check):** both are placed on one category scale; only the overlapping
  tie-break ranks are compared. If those are all equal the hands are equal-strength, which is
  **allowed** (Back ≥ Middle ≥ Front). Example: Front `9 9 K` vs Middle `9 9 K 4 3` → equal → valid.
- **Fouls:** an arrangement violating Back ≥ Middle ≥ Front. By default the server **rejects**
  fouled submissions (`422 foul`); rooms may set `allow_foul_submission` to accept them.
  A fouled hand **loses all three comparisons against every non-fouled opponent**; two fouled
  players tie each other (0). Timeout policy `foul` marks missing hands as fouled.
- **Scoring:** each player's Front/Middle/Back vs the same hand of each of 3 opponents =
  9 comparisons; win +1, loss −1, tie 0; zero-sum. No royalties/scoop/special bonuses.
- **Timeout:** policy `auto_arrange` (default) uses `AutoArranger` (best Back of 13, best Middle of
  remaining 8, rest Front — always valid).
- **Fair shuffle:** 32-byte seed from `random_bytes`; deck = Fisher–Yates driven by
  HMAC-SHA256(seed, counter) with rejection sampling. `deck_commitment = sha256(seedHex|deck)` is
  published at the deal; the seed (stored encrypted) is revealed after completion so anyone can
  verify (`App\Game\Deck::verify`).

### State machine

```
table:   WAITING_FOR_PLAYERS → READY (4 seated) → IN_GAME → CLOSED
session: DEALING → ARRANGING → SUBMITTED → REVEALING → SCORING → COMPLETED
         (any non-final) → CANCELLED (all entries refunded, no commissions)
```

Joining reserves the entry (GAME_ENTRY player → escrow, `wallet_holds`). Leaving before the deal
refunds it. The game deals when 4 seated players are ready; unready players on a full table are
removed and refunded after `GAME_READY_TIMEOUT_SECONDS`. Every transition locks the session/table
row and re-checks state, so duplicate requests, retried jobs and the sweeper are safe.
`ResolveGameSession` (unique job) reveals → scores → settles → completes; on settlement failure the
session stays in `SCORING`, the settlement is marked `failed` with the error, and the job /
`pusoy:sweep` / admin "retry" resume it.

### Payout modes (room config, snapshotted per session)

**Winner Takes All** — `fee = floor(pot × fee_bps / 10000)`; `net = pot + carry_in − fee` goes to
the top scorer. Ties per room `tie_handling`: `split_equally` (remainder minor units one each in
seat order), `carry_forward` (net held in the room bank for the next game), or `tie_breaker`
(best Back, then Middle, then Front; still tied → split). Fee is attributed equally to the four
players for commission purposes.

**Round Bank** (initial cumulative bank strategy) — entries are pooled; each player receives
`entry + score × point_value` (point value capped at `entry / 9`, so nobody loses more than their
entry and the bank always balances). Platform fee is `fee_bps` of each **winner's gain**,
attributed to that winner. Strategy classes: `app/Game/Payout/*`; each result asserts
`Σpayouts + fee + carry_out = pot + carry_in`.

Players cannot choose payout modes. Player-created private rooms are VC-only, fee-free, and use
`PRIVATE_ROOM_PAYOUT_MODE`.

These two payout modes belong to **classic** rooms (`game_mode = classic`). The seeded classic
pooled-bank room is now called "Points Bank" so it is not confused with the Round Bank game mode below.

### Game modes: Round Bank and Banker Mode (`game_rooms.game_mode`)

| `game_mode` | Who banks | Match |
| --- | --- | --- |
| `classic` | nobody — 4 players, pairwise ±1 scoring, payout mode decides the pot | one deal |
| `round_bank` | rotates by seat after every round (first eligible seat starts; never the same player twice in a row while someone else is eligible) | `rounds_total` rounds (12) |
| `banker` | the table creator (player who hosts, or first to sit at an admin room) every round | `rounds_total` rounds (12) |

A **match is one `game_tables` row; each round is one `game_sessions` row** (`round_number`,
`banker_user_id`). Service: `App\Services\Game\BankerMatchService`; pure maths:
`App\Game\Banker\BankerRound`; Lucky Hands: `App\Game\LuckyHand`.

Round flow: `BETTING → ARRANGING → SUBMITTED → REVEALING → SCORING → COMPLETED`, then an
intermission (`BANKER_INTERMISSION_SECONDS`, 8) and the next round (`StartNextRound` job; the
sweep is the safety net). The match ends after the last round, when fewer than 2 eligible
players remain, if nobody bets, or if staff cancel a round (that round is refunded; earlier rounds
stay settled). Hosted rooms are retired with their table.

- **Start:** 2–4 seated (room `min_players`, default 2) and everyone ready. Players may join a
  running match while a seat is free; they are dealt in from the next round.
- **Eligibility each round:** connected and holding at least 2 × minimum bet. Offline players sit
  the round out; offline at the start of 2 rounds in a row → removed.
- **Banker replacement (Banker Mode):** if the banker left or is offline/short of funds at the
  start of a round, the eligible player with the **highest available wallet balance** (ties: lowest
  seat) becomes banker. It only happens between rounds, so the current round always settles first.
- **Bets:** each non-banker picks a bet in `[min_bet = entry_amount, max_bet]` (default max 10 ×
  min). The player moves **2 × bet** into escrow and the banker moves **2 × bet** of cover (two wallet
  holds, idempotency keys `bet:` / `cover:`). A bet the banker cannot cover is refused. Wallet rows
  are locked in id order before the cover check, so concurrent bets can never over-commit the
  banker (MySQL concurrency test). Connected players who don't bet by the deadline get the
  minimum bet automatically; if they can't afford it they sit out.
- **Lanes vs the banker** (fouled hand loses every lane vs a valid hand; two fouls tie):

  | Result | Pays (× bet) |
  | --- | --- |
  | 3 wins / 3 losses | +2 / −2 |
  | 2 wins 1 loss / 1 win 2 losses | +1 / −1 |
  | anything with a tie | 0 |

  Configured in `config('pusoy.banker.settlement')` and snapshotted into each round. The banker
  receives the opposite of all players combined.
- **Lucky Hands:** six pairs (trips = 1 pair, quads = 2), three flushes (3/5/5 single-suit lanes),
  three straights (A low or high). Detected on the server from the dealt cards; `POST
  games/{id}/lucky` re-checks and locks the hand as the submission before any reveal. Lucky vs
  non-lucky pays 2 × bet (either direction); lucky vs lucky = 0. Paid with ledger type
  `LUCKY_BONUS`.
- **Fee:** room `platform_fee_bps` of each positive net win (player or banker), attributed to the
  winner for agent commissions. Every settlement asserts `Σ payouts + fees = Σ reserves`.
- **Stats:** `GET profile/stats` → `rounds` (played/won/lost/tied, total bets, winnings, losses,
  lucky hands & bonuses), `banker` (rounds, bets received, payouts, winnings, losses, remaining
  rounds in the current match), balances, level. `GET wallet/transactions?role=banker` is the
  banker transaction history.

### Friends & levels

`friendships` (request → accept). `GET/POST friends`, `POST friends/{id}/accept`,
`DELETE friends/{id}`, `POST friends/{user}/invite` (invites a friend to the room you are seated
in). "Online" = `users.last_seen_at` within 2 minutes (written by `TouchLastSeen`, at most once a
minute). Levels come from `player_profiles.xp` (+10 per round, +15 per win; level n needs 100·n
more XP). The friends list shows names, level and status only — never balances.

### Mobile landscape home

`mobile/src/app/home/page.tsx` is laid out on a fixed 1600×900 stage (`LandscapeStage`) that
scales to the screen like a game canvas; artwork is original SVG (`BeachLandscape`, `HomeArt`).
In the native app the home locks to landscape (`@capacitor/screen-orientation`, status bar hidden)
and returns to portrait when you leave it; in a portrait browser the stage is rotated 90°. Every
control is live: profile/level, diamond (VC) balance with live `wallet.updated`, daily bonus,
leaderboard, notifications, Friends List (search, add, accept/decline, online/last seen, invite),
Round Bank, Banker Mode, Sound ON/OFF, Settings, Logout.

### Local testing with bots

`php artisan pusoy:bots {room} --players=2 --skip=demo4` seats demo players who heartbeat, ready,
bet, declare Lucky when they can, and submit the server's auto-arrangement until the match ends
(local only).

### Commissions

`commission = floor(fee_attributed_to_player × rate_bps / 10000)` for each player who belongs to an
agent, generated only after a completed, settled game. Unique `(agent, session, player)` prevents
duplicates; rate and fee basis are snapshotted. Rate resolution: agent+currency rule → agent rule →
platform default (seeded 40%). Status: pending → approved → paid (VC paid platform → agent
commission wallet; CP stays approved while cash payouts are disabled), or rejected / reversed.

---

## 7. Real-time (Reverb)

Channels (`routes/channels.php`):

- `presence-table.{tableId}` — seated players (and staff with `manage_games`) only.
- `private-user.{userId}` — the owner only; carries that player's dealt cards and notifications.

Auth endpoint: `/api/v1/broadcasting/auth` (session cookie or bearer token).

Events (`App\Events\Game\GameEvents`, client listens with a leading dot):
`player.joined`, `player.left`, `player.ready`, `table.full`, `game.started`, `game.timer`,
`player.submitted`, `game.all_submitted`, `game.revealed`, `game.scored`, `game.results`,
`player.disconnected`, `player.reconnected`, `game.cancelled`; banker modes add `match.started`,
`round.started`, `banker.assigned`, `player.bet`, `betting.closed`, `player.lucky`,
`round.completed`, `match.completed`. Private: `cards.dealt` (own cards + own Lucky Hand type) and
`wallet.updated` (own balance only).
Events dispatch **after commit**, never contain other players' cards before `REVEALING`, and never
contain wallet balances.

Clients treat events as signals and re-fetch authoritative state (`GET /tables/{id}`,
`GET /games/{id}`), so reconnection = normal load. Clients heartbeat every 10s; `pusoy:sweep`
marks players disconnected after 30s and broadcasts reconnection on the next heartbeat.

---

## 8. API summary (`/api/v1`)

Responses: `{ data, meta?, links?, message? }`; errors `{ message, error?, errors? }`.
Rate limits: `api` 120/min, `auth` 10/min/IP + 5/min/username, game & wallet action limits.

| Group | Endpoints |
| --- | --- |
| Auth | `POST auth/register`, `auth/login`, `auth/logout`, `GET auth/me`, `POST auth/forgot-password`, `auth/reset-password`, `GET/DELETE auth/devices` |
| Player | `GET/PATCH profile`, `PUT profile/password`, `GET profile/stats`, `profile/games`, `leaderboard`, `notifications`, `POST notifications/read` |
| Wallet | `GET wallet`, `wallet/transactions`, `POST wallet/daily-reward`, `wallet/allocate` (admin/agent), `wallet/deposit|withdraw` (disabled) |
| Rooms | `GET rooms` (`?game_mode=`), `rooms/{id}`, `POST rooms/{id}/join`, `rooms/private`, `rooms/host` (Round Bank / Banker Mode table, host seated), `rooms/{id}/invite` |
| Tables | `GET tables/current`, `tables/{id}`, `POST tables/{id}/ready|leave|heartbeat` |
| Games | `GET games/{id}`, `games/{id}/cards`, `POST games/{id}/submit`, `games/{id}/bet`, `games/{id}/lucky`, `games/{id}/preview`, `GET games/{id}/results` |
| Friends | `GET/POST friends`, `POST friends/{id}/accept`, `DELETE friends/{id}`, `POST friends/{user}/invite` |
| Push & payouts | `PUT auth/devices/push-token`; `agent/payout-requests` (GET/POST), `admin/payout-requests` (+approve/reject) — payouts disabled unless cash flags are on |
| Agent | `agent/dashboard`, `agent/players` (GET/POST), `agent/players/{id}`, `agent/wallet`, `agent/transactions`, `agent/commissions`, `agent/referral-codes` (GET/POST), `agent/activity`, `agent/reports` |
| Admin | `admin/users|players|agents|administrators` (GET/POST), `admin/users/{id}` (GET/PATCH, status, assign-agent, permissions, limits), `admin/rooms`, `admin/tables` (+close), `admin/games` (+cancel, retry), `admin/wallets` (+freeze), `admin/transactions` (+reverse), `admin/adjustments`, `admin/reconcile`, `admin/commissions` (+approve/reject/reverse), `admin/commission-rules`, `admin/reports/overview`, `admin/audit-logs`, `admin/settings` |

---

## 9. Database tables

Spec tables and where they live: `users`, `player_profiles`, `user_devices`, `roles`,
`permissions`, `permission_user`, `administrator_limits`, `agents`, `agent_players`,
`agent_referral_codes`, `agent_commission_rules`, `agent_commissions`, `agent_payout_requests`,
`game_rooms`, `game_tables`, `game_players`, `game_sessions`, `game_cards`, `game_submissions`,
`game_results`, `game_hand_results`, `wallets`, `wallet_transactions`, `wallet_holds`,
`wallet_allocations`, `wallet_adjustments`, `game_settlements`, `game_payouts`, `platform_fees`,
`notifications`, `game_invitations`, `audit_logs`, `system_settings`, `personal_access_tokens`.
`agent_wallets` / `agent_wallet_transactions` are intentionally **not** separate tables (see §5).
All timestamps are stored in UTC and shown in the viewer's local time zone.

---

## 10. Status & known gaps

Verified 2026-11-17:

- 164 Pest tests (engine, ledger, allocation, commissions, payouts, push, access control,
  multiplayer, API, every web page route per role), 5 real-MySQL concurrency tests (3 consecutive
  green runs), 11 web and 9 mobile Vitest tests.
- Manual: full 4-player games on the web client, the mobile client in a browser, and the **native
  Android debug APK on the emulator** (login, lobby, live Reverb seating, touch arrangement with
  server hand names, manual submit, results sheet). Ledger reconciliation passes.

Verified 2026-11-18 (game modes):

- 188 Pest tests (adds Lucky Hand detection, banker settlement table, 12-round Round Bank rotation
  with money conservation and reconciliation, Banker Mode replacement, bet validation, auto-bets,
  leave rules, late joiners, private cards, cancellation refunds, hosting/stats API, friends,
  levels), 6 MySQL concurrency tests (adds simultaneous bets against one banker), 13 mobile Vitest
  tests (adds betting, Lucky declaration, drag-and-drop).
- Manual (mobile build in a browser at 375×812): beach home, friends add/list, Round Bank match vs
  two bots — banker rotation, bets, drag-and-drop between lanes, timer auto-arrange, a declared
  Lucky Hand paid as `LUCKY_BONUS`, final scoreboard; hosting and abandoning a Banker Mode table.

Not done / not verified:

- The **web (Inertia) player table** has not been updated for banker rounds (no bet panel, Lucky
  button, banker badge or standings) and was not tested with them; a connected web player would
  only get the automatic minimum bet. Admins can configure the new modes in Game Rooms.
- A full 12-round match was only played end to end by the automated test; the manual run used a
  3-round table.

- **iOS** build needs macOS + Xcode; the iOS project is generated but has never been compiled.
- **Release signing** (Android AAB keystore, iOS provisioning) is yours to set up; only a debug APK
  was built. The app was not tested on a physical phone.
- **Real push delivery** needs your Firebase project; the FCM call path is tested with faked HTTP only.
- **Browser E2E** (e.g. Playwright) is not set up; component tests + manual runs cover the UI.
- **Cash features** remain disabled. The payout-request workflow exists and is tested, but only
  activates when both `FEATURE_CP_COMMISSION_PAYOUTS` and `FEATURE_CASH_WITHDRAWALS` are true.
- Local dev uses the `database` queue/cache/session drivers; production should use Redis
  (see `DEPLOYMENT.md`). The mail driver is `log` locally (reset links appear in `storage/logs`).
