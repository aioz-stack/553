# Pusoy 13 Platform — Development Guide

Last updated: 2026-11-19 (Single Player: Round Bank with you + 3 bots, rotating banker, banker advantage)

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
| `player`, `demo1`…`demo12` | Players (Chips from a fresh seed: 1,000 each; Gold from the Out of Gold claim) |

Testing a full game alone: join a room as `player` in the browser, then
`php artisan pusoy:fill-table vc-starter` seats and readies three demo players, and
`php artisan pusoy:fill-table vc-starter --submit` makes them submit (dev-only command).

### Mobile app

```bash
cd mobile
cp .env.example .env.local     # local backend for `npm run dev` (REVERB key = backend REVERB_APP_KEY)
npm install
npm run dev                    # http://localhost:3000 (browser preview, uses .env.local)
npm run assets && npm run cap:sync && npm run cap:android   # build the APK project
npx cap open ios               # Xcode (macOS only)
```

**Two env files, on purpose.** `npm run dev` uses `.env.local` (your local backend). The app
build (`npm run cap:sync` → `npm run build:native`, `scripts/build-native.mjs`) uses **`.env.native`**
(the public server, `https://test.asperioscents.com`), whatever `.env.local` says — inside the APK
"localhost" is the phone itself. `build:native` refuses a localhost / `10.0.2.2` API unless you set
`ALLOW_LOCAL_API=1` (emulator testing; plain http also needs `CAP_DEV_HTTP=1 npx cap sync`).

**Static export inside Capacitor (Android).** Capacitor's local server answers every address
without a file extension (`/lobby/`, `/practice/?tier=…`) with the ROOT `index.html`, so anything
that makes the WebView load a page itself must not depend on the served HTML:
- `scripts/fix-export.mjs` (runs after every `next build`): Next.js 16 writes page prefetch data as
  `lobby/__next.lobby/__PAGE__.txt` but the router requests `lobby/__next.lobby.__PAGE__.txt`; the script
  adds copies under the requested names so client-side navigation never falls back to a page load.
- `src/lib/nativeBoot.ts` (inline head script): in the app, a page loaded on an inner address
  (Android restoring the app, a reload) is remembered, the URL reset to `/`, and the Splash page
  navigates back to it client-side.
- `src/lib/useLandscapeLock.ts`: one shared orientation manager — landscape stays locked while any
  landscape screen (Home, Lobby, Choose Your Seat, Single Player, Settings) is open, portrait returns
  400 ms after the last one closes, lock calls run in order (no portrait/landscape flip between game
  screens). Native start-up is portrait.
Icons/splash: edit `mobile/assets/*.svg`, re-render the PNGs, then `npm run assets`.

### Mobile app — native Android rebuild (`mobile2/`, Kotlin + Jetpack Compose, 2026-11-28)

The Capacitor app above drew its CSS/SVG-heavy design inside an Android WebView, which stuttered on
real phones. `mobile2/` replaces it on Android with a **native Kotlin + Jetpack Compose app** built
with Gradle / Android Studio (no Node.js, no C++ build). It uses the same `/api/v1` API (Sanctum
bearer token) and the same Reverb server, with no game or wallet logic of its own. Setup and APK
build: **`mobile2/README.md`** and **`mobile2/COMMANDS.md`**.

(The first `mobile2` was an Expo / React Native app, commits `479e8ff`–`5d61b00`. On Windows its C++
build only worked with Windows long paths enabled and CMake 3.31+; the native rebuild removes that.)

- Same screens and flows as `/mobile`: auth (invitation registration), Home (wallets, friends, avatar
  + nickname, settings, Shop), Multiplayer Lobby (tabs, search, Quick Join, Create / Join / Leave),
  Choose Your Seat (seat, bet, Start, server-timed countdown, kick, edit), the Multiplayer table
  (betting, deal, arrangement with server-saved drafts and auto-submit, Declared Luck, reveal show,
  standings), Single Player vs the three bots (Out of Gold claim), wallet / history / notifications,
  maintenance screen and "account connected elsewhere".
- Reverb: `core/Echo.kt` implements the Pusher protocol over an OkHttp WebSocket and authorises
  private / presence channels at `/api/v1/broadcasting/auth`; events trigger a re-read of the API
  state; heartbeat + polling cover reconnects.
- Design: the web app's art (exported layered WebP + manifests) in `app/src/main/assets/art`, drawn
  on a Canvas with the same keyframes, on the same 1600×900 stage. Sounds are synthesised in code.
- Backend for the build: `mobile2/.env` (`API_URL`, `REVERB_*`; old `EXPO_PUBLIC_*` names accepted).
  Emulator → this PC: `10.0.2.2`.
- App id `ph.pusoy13.game` (installs next to the Capacitor app `ph.pusoy13.app`).
- Not yet: push notifications (needs a Firebase `google-services.json`); iOS stays on `/mobile`.

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
| Wallets, reconciliation | `app/Services/Wallet/WalletService.php` |
| Convert Commission to Wallet, Team Overview | `app/Services/Agent/TeamService.php` |
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

- **Two currencies only** (`App\Enums\Currency`), two independent wallet systems:
  - **Gold (`GD`) — Single Player only:** bets, winnings, losses and the free Out of Gold reward.
  - **Chips (`CH`) — Multiplayer only:** rooms, lobbies, Round Bank / Banker Mode entry, bets, winnings,
    losses, platform fees, agent allocations and commissions.
  Neither is cash: there are no deposits, withdrawals, redemption or payouts, and the two can never be
  mixed, transferred or exchanged (`LedgerService` refuses a transfer whose wallets are not all in the
  transfer currency; every Multiplayer validator accepts only `CH` — `Currency::multiplayer()`; Single
  Player only ever touches `GD`). Cash Points, Virtual Coins and Gold Points were removed on 2026-11-19
  (migration `2026_11_19_180000_gold_and_chips_only`, see §10).
- Amounts are **BIGINT minor units** (1 point = 100). API sends/receives decimal strings
  (`"2000.50"`), converted by `App\Support\Points`. No floats touch balances.
- One `wallets` table: `(user, currency, type)` where type ∈ `player`, `allocation`,
  `commission`, plus system wallets `escrow:{GD|CH}` and `platform:{GD|CH}`. Players get a Gold and a Chips
  player wallet; admins and agents also get Chips allocation / commission wallets (never Gold). The spec's
  `agent_wallets` / `agent_wallet_transactions` are these allocation/commission wallets — there is
  deliberately no second wallet system.
- `wallet_transactions` is immutable (model blocks update/delete): unique reference, idempotency key,
  type, currency, source/destination wallet, amount, **balance before/after for both sides**,
  status, reason, created_by, approved_by, related player/agent, game session, reversal link.
  Corrections are `REVERSAL` entries (one per original). Gold and Chips histories are separate
  (`GET wallet/transactions?currency=GD|CH`; mobile Transactions has All / Gold / Chips tabs).
- `LedgerService::transfer()` runs in a DB transaction, locks wallets with `SELECT … FOR UPDATE`
  in id order, refuses negative balances and frozen sources, and is idempotent (same key → same
  transaction; same key with different parameters → 409) — so every deduction and win is processed once.
- Issuance (null source): Super Admin allocations and Single Player Gold (house reserves and the Out of Gold
  claim). The free daily Chips reward was removed (2026-11-24); old `DAILY_REWARD` rows stay readable in history.
- `php artisan pusoy:reconcile` (daily) checks every balance against the ledger and that escrow
  equals active holds + room carry-over banks + held Single Player reserves.
- **Sync:** every wallet change pushes the owner's new balance on their private `user.{id}` channel
  (`wallet.updated`); the mobile app also reloads balances after every deal / settlement / claim / leave
  (`pusoy:wallet` window event), on Multiplayer game steps, on lobby changes and when the app returns to the
  foreground. Home, the Lobby, Choose Your Seat, the Multiplayer table, the Single Player table, Profile and
  Wallet all read the server (`useBalance` for Chips, `useGoldWallet` for Gold's Total Amount).

Allocation workflow (Chips): Super Admin → Admin/Agent allocation wallet (or a player) → Agent → own
players. Records in `wallet_allocations`; manual credits/debits (Gold or Chips) in `wallet_adjustments`.

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

Players cannot choose payout modes. Player-created private rooms play for Chips, fee-free, and use
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
- **Lucky Hands (Declared Luck):** any ONE of three flushes (3/5/5 single-suit lanes), no face cards
  (no J, Q or K among the 13 cards) or six pairs (trips = 1 pair, quads = 2). Detected on the server from the dealt cards; `POST
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
control is live: profile/level, Gold (gold coins) and Chips (casino chip) balances shown separately with
live `wallet.updated` (each "+" opens the wallet — there is no deposit),
leaderboard, notifications, Friends List (search, add, accept/decline, online/last seen, invite),
Single Player, Multiplayer, Sound ON/OFF, Settings, Logout.

**Card design** (`CardArt.tsx`, kept identical in `mobile/src/components/` and `resources/js/Components/`):
every card in both apps — `PlayingCard`, the deal and reveal animations, the bots' fans
(`CardBack553`) — is drawn by `CardFaceArt` / `CardBackArt`, pure SVG on a 100 × 140 card (no image
files). Face: pearl-cream with gold filigree top-right and bottom-left, serif corner index repeated
upside down, standard pip layouts for 2–10, Aces with a large suit emblem, crown and gold "553", and
illustrated Jack / Queen / King portraits in red and gold robes; crimson for hearts / diamonds,
near-black for spades / clubs. Back: deep red lattice, ornate gold frame, crowned "553" laurel
medallion. Tiny cards (`size="xs"`) show one large index and suit so they stay readable.

**Avatars** (the 553 cartoon collection): 29 images in `mobile/public/avatars/` — `boy-01…09`,
`girl-01…10`, `animal-01…10` (256×256 WebP, cut from the supplied sheet, which has 9 boys). The ids are
the same in `App\Support\Avatars` (server) and `mobile/src/lib/avatars.ts` (names, categories, URLs).
`users.avatar` stores the choice; null means a stable per-player default (`ids[userId % 29]`, same rule
on both sides), so every player always has a valid avatar. `PUT /api/v1/profile/avatar` (`avatar` must be
a catalogue id) saves it, writes `user.avatar_changed` to the audit log and, if you are seated, sends
`player.updated` to your table (the Lobby list, Choose Your Seat and game table refresh). The avatar id is
in every player payload: `auth/me`, friends, leaderboard, lobby seats, table players, revealed hands,
results and match standings. `components/AvatarPicker.tsx` (All / Boys / Girls / Animals, preview,
Confirm / Cancel; a portal, so it opens from any screen) is reached from the Home portrait's ✎ badge,
the Lobby portrait and Profile → Change Avatar. `Avatar` (`components/game.tsx`) draws it everywhere,
lazy-loaded and sized, falling back to the default image and then initials, never a broken image.
Single Player bots use fixed animals (LuckyBot cat, CardBot panda, AceBot lion). The old drawn faces
(`TableArt` `Face`) are gone.

**Settings panel** (`mobile/src/components/SettingsPanel.tsx`; opened by the home Settings tile, also
at `/settings/`, whose Close returns to `/home/`; signed-in devices moved to `/settings/devices/`):
- **Audio:** BGM ON/OFF (`lib/music.ts` — a looping pentatonic tune synthesised with Web Audio, no audio
  files; starts on the first tap because browsers block audio before one, pauses in the background,
  stops at once when off) and Sound Effects ON/OFF (`lib/sound.ts`).
- **Motion Effects:** Low / Medium / High (`lib/motion.ts` → `<html data-quality>` + `data-motion`).
  Low = no animations (same as reduced motion: deal / reveal shows skipped, CSS animations off);
  Medium = game animations without travelling card shadows, with half the explosion particles and no
  screen shake, ambient sparkle / shine / petal loops off; High = everything. Before a level is chosen
  the older auto/on/off choice decides (auto follows the device's reduce-motion setting).
- **Saved with the account:** `users.preferences` JSON (`bgm`, `sfx`, `motion`; defaults on / on /
  high), `GET|PUT /api/v1/profile/preferences`, also returned as `user.preferences` by `auth/me` and
  login. `lib/prefs.ts` applies a change on this device at once and saves it; `lib/auth.tsx` applies
  the saved settings whenever you sign in, so they are the same after logging out and in again.
- **Change Password:** current / new / confirm with show-hide eyes. The form checks the fields first;
  `PUT /api/v1/profile/password` (throttled 10/min) verifies the current password, requires 8+
  characters with letters and numbers, a matching confirmation and a different password, stores it
  hashed (User `password` cast) and writes an `user.password_changed` audit log.

`mobile/.env.local` points the dev app at the **hosted** backend. To run against local Laravel,
start the `mobile-local` entry in `.claude/launch.json` (it overrides `NEXT_PUBLIC_*` with the
local API/Reverb values), or set those variables yourself before `npm run dev`.

### Single Player — Round Bank Pusoy: you + 3 bots

The home's **Single Player** tile opens the difficulty picker (`mobile/src/components/SinglePlayerPicker.tsx`):
Beginner, Intermediate, Advance, Mastery from `config('pusoy.practice.tiers')` via `GET practice/tiers`
(min gold, bet options, `eligible`). Tapping an affordable card goes to `/practice/?tier=…`; a tier the
player cannot afford shows a "Not enough gold" notification. Bets are information only on the picker.

**Rules** (`App\Services\Game\PracticeService`, `PracticeController`):

- **Four seats:** seat 1 = you, seats 2-4 = **LuckyBot, CardBot, AceBot**, added automatically to every
  match. A **match** (`practice_matches`) is **12 rounds** (`pusoy.practice.rounds`).
- **Banker rotation:** seat by seat — round 1 you, 2 LuckyBot, 3 CardBot, 4 AceBot, 5 you, … (each seat
  banks 3 times; `PracticeMatch::bankerFor`). Shown as "Round N / 12 · X banks" and a BANKER badge.
- **Betting:** the **banker places no bet** — it is the counterparty and covers every other seat's bet.
  Each non-banker bets its own amount (`practice_games.bets`, seat => bet): **you** with a chip from the
  tier's options (when you bank there are no chips, just **Deal**, and any `bet` sent is ignored), **each
  bot** with its own pick (mostly the lower options). With Gold wagering on and you banking, the bots step
  their bets down so 2 × their total fits your balance. The round shows each seat's bet and, when you bank,
  `covered` (the total you cover). `POST practice/matches/{id}/deal {bet?, request_id}`; a repeated
  `request_id` returns the same round, a second deal while one is open is 409 `round_in_progress`, after
  round 12 409 `match_over`.
- **Deal:** every round — round 1 included — starts from the complete ordered 52-card deck, a fresh
  256-bit CSPRNG seed and a full Fisher–Yates reshuffle, then deals one card at a time clockwise
  (You 1 → LuckyBot 2 → CardBot 3 → AceBot 4), starting with the seat after the banker and ending on the
  banker (`Deck::deal($deck, 4, 13, PracticeService::firstToDeal($banker))`, i.e. `banker % 4 + 1`), until
  every seat holds 13; each hand is stored in the order its cards were received. Before the deal is
  saved `PracticeService::assertFullDeal` checks 52 distinct cards, 13 per seat, nothing missing or
  duplicated; nothing (seed, order, hands) carries over between rounds (rounds are `practice_games` rows:
  `round_number`, `banker` = seat).
- **Bots:** arranged by the server at deal time. **Every bot at every level** uses **`App\Game\BotArranger`**
  (no random play): it evaluates all 1,287 five-card and 286 three-card hands of its 13 cards once, encodes each
  as one integer strength (category, then tie-break ranks — the exact `HandValue` order, Front vs Middle
  included), and searches **every** valid split (~72,000; fouls skipped) for the highest expected Round Bank
  result: lane win chances × the settlement table (3-0 = +2, 2-1 = +1, 1-2 = −1, 0-3 = −2), ties to the
  stronger Back/Middle/Front. ~50 ms per hand. Lane win chances come from **measured percentiles of real bot
  arrangements** (`App\Game\BotStrength` reading the generated `BotStrengthTable`): re-run
  `php artisan pusoy:calibrate-bots` (self-play, `--deals`, `--passes`) after changing the arranger or hand
  rules. Same cards played both ways over 300 deals: +1.84 bets per pairing vs random valid play, +0.63 vs the
  greedy `AutoArranger`, +0.07 vs the previous BotArranger. Bots declare their own Lucky Hands (checked
  before the arrangement is used). Their cards stay hidden until settlement.
- **Shuffle-and-deal animation** (`mobile/src/components/table/DealAnimation.tsx`): after a deal, the table
  plays GATHER → FORM DECK → SPLIT → RIFFLE SHUFFLE → MERGE & SQUARE → DECK READY → DEAL CLOCKWISE →
  DISTRIBUTION COMPLETE (~5.5 s: the shuffle runs at `SHUFFLE_SPEED` 0.275 of its design pace, ~2 s; then a card leaves the deck
  every 0.055 s, each toss 0.21 s, ~3 s for all 52), then opens the manual
  arrangement popup automatically right after your cards turn over (no tap needed). It is display only: card p from
  the top of the server's deck flies to `dealOrder(banker)[p % 4]` (the server's own order), bot cards stay
  face down, and your 13 land face down and turn over (your real cards, in received order) once all 52 are
  out. Per-seat counters count to 13. Rendering is one CSS 3D scene (perspective, translateZ for deck height
  and the toss arc) with one Web Animations timeline per card built up front — transform/opacity only, so
  it is GPU-composited and nothing runs per frame on the main thread; low-end devices
  (`hardwareConcurrency ≤ 4` or `deviceMemory ≤ 2`) drop the travelling shadows. It plays once per round
  (`sessionStorage pusoy.dealt.<roundId>`; a resumed round goes straight to arrangement), has a Skip button,
  and finishes at once under reduced motion (Settings → Motion) or without Web Animations support.
- **Reveal show** (`mobile/src/components/table/RevealShow.tsx`): after SUBMIT the server has already
  settled the round; the table then plays ALL PLAYERS SUBMITTED → FRONT (each seat's 3 cards flip one at a
  time, clockwise from the seat after the banker) → FRONT RESULT (hand names + win/loss) → MIDDLE → BACK,
  then the special effects, then the final results and Gold. `revealPlan(players, banker)` is a pure
  timeline (52 flips 50 ms apart, 0.26 s flips, 0.65 s result holds); `useRevealClock` plays it with one
  timer per moment and everything moves with CSS transforms (`rv-*` in globals.css). Effects, from the
  settled result only: **PUSOY!** — a bomb thrown at each non-banker that lost all three lanes, or at the
  banker when a player swept it (explosion, smoke, sparks, debris, stage shake, the 2× bet); **ARAYYY
  KOOOO!** — lightning on a misplaced hand, striking the out-of-order lanes (`players[].misplaced`, from
  `PracticeService::misplacedLanes`), with the 2× penalty (a misplaced hand gets no bomb as well). Sounds:
  `flip`, `boom`, `zap`. Plays once per round (`sessionStorage pusoy.revealed.<roundId>`), not after a
  Declared Luck, has Skip, and is off under reduced motion. Chips and results wait until it ends.
- **Clean card state per round (table):** dealing a round, settling it and starting a match clear all
  arrangement state — lanes, selection, preview, lock and the arrangement popup — so the popup opens with
  only the new round's 13 cards. Late answers (Autoplay suggestion, hand-name preview) for a round no longer
  on the table are ignored, lanes are cleared of any card not in the current hand, and Submit never sends
  a card from another hand.
- **No time limit, at every level (Beginner, Intermediate, Advance, Mastery):** no countdown, deadline or
  timeout. You can move, swap and rearrange your cards for as long as you like; a dealt round stays open
  until you press **SUBMIT** (in the arrangement popup or on the table) or declare luck. Nothing
  auto-submits — not the table, the popup, Autoplay Arrange, nor `pusoy:sweep` (it never touches
  `practice_games`). Arrangement timers apply to multiplayer tables only.
- **You** arrange Front 3 / Middle 5 / Back 5. **A misplaced (fouled) hand is accepted** and penalised in
  settlement: it loses every lane, so as a player you pay **2 × bet** to the banker, and as banker you pay
  **2 × bet to every opponent** (both misplaced → the banker still wins, per the banker advantage). The
  result carries `misplaced: true`; one settlement per round, so no double penalty.
- **Settlement** — `App\Game\Banker\BankerRound` with **banker advantage** (`pusoy.practice.banker_wins_ties`):
  each non-banker's Front / Middle / Back is compared with the banker's; **an identical lane goes to the
  banker** (no ties). Win 3 = +2 × bet, win 2 = +1 ×, lose 2 = −1 ×, lose 3 = −2 × (`pusoy.banker.settlement`).
  Declared Luck — any ONE of Three Flushes / No Face Cards / Six Pairs — replaces the comparison and pays
  2 × bet (both lucky = 0). **A failed declaration** (none of the three) settles the round at once and loses
  2 × bet in every pairing the player is in (`BankerRound` `$failed`): as a non-banker 2 × your bet to the
  banker, as the banker 2 × each bot's bet; results carry `lucky_failed`, audit `practice.lucky_failed`.
  Bots only declare with a qualifying hand, so they never fail. (Multiplayer Banker Mode still answers a
  non-qualifying declaration with 422 `not_lucky` and no penalty.) Bot-vs-bank results between bots are computed too (standings), every round is
  zero-sum, and each round settles once (row lock + status).
- **Gold Wallet (automatic, `App\Services\Game\GoldService`):** Single Player always plays for **Gold (`GD`)**;
  no Multiplayer room, lobby, allocation, commission or payout accepts it, and Chips are never used here. Every
  deal reserves your worst case (2 × your bet, or 2 × the bots' total when you bank) from your Gold wallet, and
  the house's matching reserve is issued into Gold escrow (`GAME_ENTRY`, keys `sp:{round}:reserve:*`);
  settlement pays both out of escrow (`GAME_REWARD` / `GAME_REFUND`, keys `sp:{round}:payout:*`; the house share
  lands in `platform:GD`). So winnings are credited and losses deducted automatically, the balance can never go
  negative, a round settles exactly once (row lock + status + ledger idempotency keys), and the new balance is
  pushed on `user.{id}` (`wallet.updated`).
- **Leaving / disconnecting:** `POST practice/matches/{id}/leave` (the table's Leave button) ends the match; a
  round you have not submitted is void and both reserves are returned in full (`sp:{round}:release:*`, once).
  Closing the app or losing the connection does not settle anything: the open round stays resumable (no
  timer) with its reserve held, and the Gold display counts it as "in play". Starting a new match abandons
  the old one the same way.
- **Out of Gold (Single Player only):** you can no longer keep playing when **mid-match** your Gold can't cover
  the next round's smallest reserve (2 × the tier's lowest bet, or 2 × three lowest bets when you bank) or
  **between matches** it is below the lowest tier minimum (Beginner, 1,000). Zero and negative always count; a
  held reserve never does. When a settled round leaves you Out of Gold the server ends the match at once
  (`practice_matches.status = out_of_gold`, audit `practice.out_of_gold`); deal and new match answer 409
  `out_of_gold`. The tier minimum applies when a match **starts**; mid-match a deal only needs its reserve, and
  `GET practice/tiers` keeps the tier of a match in progress `eligible` while your Gold covers its next round.
- **Free 1,000 Gold:** `POST practice/gold/claim {request_id}` credits `pusoy.practice.out_of_gold_reward`
  (1,000, env `SINGLE_PLAYER_GOLD_REWARD`) **straight into Gold**, only while you are Out of Gold
  (`OUT_OF_GOLD_REWARD`, key `out-of-gold:{user}:{request_id}`, serialised on the user row, audit
  `gold.claimed`). The popup sends one `request_id`, so repeated clicks, refreshes and retried requests return
  the same claim (200, same reference); with Gold left a new claim gets 409 `not_eligible`.
  `GET practice/gold` → `{gold, reserved, total, out_of_gold, can_claim, claim_amount, minimum_to_start}`;
  the same object is in `GET practice/tiers` (`meta.gold_wallet`) and every match (`gold_wallet`, `out_of_gold`).
- **Total Amount in game:** `total` = spendable Gold + `reserved` (Gold held for your open round), so the number
  does not dip while you arrange. `mobile/src/lib/useGoldWallet.ts` is the one Gold source for Home, Profile,
  Wallet, the table and the arrangement popup: it loads that endpoint and reloads it (never computes) on
  `wallet.updated` (GD), on `pusoy:wallet` and when the app returns to the foreground; one request at a time,
  plus one follow-up for changes that arrive meanwhile. `components/table/GoldWalletHud.tsx` (Total Gold,
  "N in play"; fixed size, flashes on change) sits on the table header and inside the arrangement popup beside
  SUBMIT, clear of the cards.
- **Mobile:** When a round leaves you Out of Gold the table shows the result, then an "Out of Gold!" banner,
  and once the reveal is over (or skipped) returns you to `/home/?gold=out`. Home then opens `OutOfGoldPopup`
  (title, message, CLAIM 1,000 GOLD → "Play Single Player"). Tapping Single Player while Out of Gold opens the
  same popup instead of the level picker. Multiplayer never checks Gold or shows the popup.
- API: `GET practice/tiers`, `POST practice/matches {tier}` (abandons any active match),
  `GET practice/matches/current`, `GET practice/matches/{id}` (history, standings per seat, running gold),
  `POST practice/matches/{id}/deal`, `POST practice/matches/{id}/leave`, `GET practice/{round}`,
  `POST practice/{round}/preview|suggest|lucky|submit`, `GET practice/gold`, `POST practice/gold/claim`.
  Owner-only (404 for others). Migration `2026_11_19_110000` closed free-play matches from the brief
  one-bot format.

#### Single Player table (`mobile/src/app/practice/page.tsx`)

Landscape table on the 1600×900 `LandscapeStage` (rotates itself on portrait browsers; the native app
locks landscape via `lib/useLandscapeLock.ts`). Original SVG art in `components/table/TableArt.tsx`.

- Seats: LuckyBot left, CardBot top, AceBot right, you at the bottom; the banker's tile is blue with a
  BANKER badge. Top right: Bet pill, round / banker, tier, match Gold and the Total Gold wallet card.
- Betting: tap a chip to bet and deal; after each round the chips return for the next round's bet.
  Resuming: an open round of the active match at the same tier continues.
- **Dragging cards** (`components/table/useCardDrag.tsx`, used by the arrangement popup and the table
  rows/hand): the lifted card is the same card at exactly its slot's size (measured from the slot, drawn
  in stage units inside the stage, so the stage's scale/rotation never resizes it) — lifting shows as a
  small rise and a deeper shadow, never scaling. It stays under the finger at the grab point and pivots
  there: a requestAnimationFrame loop follows the pointer with slight weight, tilts up to ±14° with
  sideways speed and swings upright when you stop (transform only, no React render per frame). A drop on
  a target commits the move, then FLIP animations glide the dropped card from where it was released into
  its new slot (straightening) and slide the displaced card across; elsewhere it springs back to its slot
  (with a timed fallback so a card is never left hidden). Listeners are subscribed once (state in refs),
  so re-renders mid-drag cannot interrupt it. Low motion quality: no tilt or glide.
- **Manual arrangement, cards directly in the rows** (`components/table/LuckPopup.tsx`): there is no
  separate card panel. After the deal (and when you come back to an open round) your 13 cards sit
  directly in **Front 3 / Middle 5 / Back 5, in dealt order** (cards 1-3, 4-8, 9-13) — nothing is sorted
  or arranged by strength. Each row always holds exactly its 3 / 5 / 5 (counts shown), so moving a card
  is a swap:
  - **Click-to-select / click-to-place:** tap a card to pick it up, then tap any other card to swap them
    (across rows to move them, within a row to reorder); tap it again to put it down. Tapping a full row
    while holding a card says to tap one of its cards.
  - **Drag and drop:** drop a card on another card to swap the two.
  - ⇅ swaps Middle and Back. There are no "Dealt order" or "Auto Arrange" buttons: only you move cards.
  - Hand names and ✓ / ✗ order marks per row come from the server preview (Pusoy rules); **SUBMIT** sends
    the rows exactly as you left them (a misplaced hand pays the 2× penalty).
  - The old "Autoplay Arrange" switch is gone (an old saved setting is ignored). The table's own hand
    strip is hidden while the popup is open.
  - Declared Luck, the bet info and the opponents' card fans are in the popup; no close button, no portraits.
- Reveal: every bot's hand at its seat with WIN / LOSS per lane against the banker, its Gold for the
  round (and Lucky Hand), your hand and your result ("You banked · beat 2 of 3", "2-1 vs CardBot · 1× bet").
  After round 12 a **Match results** panel shows the standings of all four players and the 12-round history.
- Back (asks during a round; the match is kept), Settings (sound, autoplay), ? (rules).

### Multiplayer — the 553 Lobby (player-created Chips lobbies)

Home → Multiplayer opens `/lobby/` (mobile, 1600×900 stage). Built on the existing rooms → tables →
12-round banker matches (BankerMatchService); `App\Services\Game\LobbyService` adds the lobby layer.

- **A lobby** is a `game_room` with `lobby_code` (unique 6-digit Lobby ID), `lobby_password` (bcrypt
  hash, never returned; set = Private, empty = Public), `min_entry` (Chips you must **hold** to enter —
  nothing is deducted on entry), `owner_starts` (true) and `min_players` = 4. Currency: Chips (`CH`).
  Minimum bet per round = Minimum Entry ÷ 10, so holding the entry always covers a round (worst case as
  banker vs three players: 6 × bet). Preparation Time = the room's arrangement timer.
- **Game type:** Banker Mode = the lobby owner banks all 12 rounds (if they leave, the richest player takes
  over — unchanged rules); Round Bank = the owner banks first, then the banker rotates clockwise by seat
  (`chooseBanker` now picks the table creator for the first Round Bank round).
- **Create** (`POST lobbies`): validates fields and your Chips, locks your user row (no double create),
  refuses if you are already seated, creates the room, seats you in seat 1 as owner. **Join**: private
  lobbies check the password (`Hash::check`, throttled `lobby-join` 15/min); `TableService` locks and
  re-checks seats (max 4) and balance (`min_entry` and the 2× minimum-bet reserve); joining again is a
  no-op. **Quick Join**: public lobbies only, affordable (`min_entry` and reserve ≤ your Chips), with free
  seats, fullest first then oldest; tries the next if one fills meanwhile; 404 `no_lobby` when none.
- **Choose Your Seat** (`/lobby/room/?id=`; Create and Join both land here with a zoom-and-fade
  transition): seats 1 top, 2 left, 3 right, 4 bottom. A player who joins holds one seat (**Reserved**,
  `game_players.seat_confirmed = false`); tapping a glowing **Available** seat glides your avatar there
  (**Selected**), **Confirm Seat** saves it (`POST lobbies/{id}/seat`, row-locked; the unique
  (table, seat) index makes two players on one seat impossible) → **Occupied**. Change Seat undoes a pick.
- **Start:** hidden until all four seats are confirmed; then **every** player presses START
  (`POST lobbies/{id}/start`, `ready: false` withdraws). When all four have, the server sets
  `game_tables.countdown_ends_at` = now + 3 s (`match.countdown`); clients show 3 → 2 → 1 → GO aligned to
  the server clock (`server_time`). `LobbyService::tick` (run on every `GET lobbies/{id}`, which is also
  the heartbeat, and by `pusoy:sweep`) starts the match when it ends (`maybeStart(byOwner: true)`; lobby
  tables never auto-start) — or cancels it and resets every Start if anyone withdraws, leaves or has not
  been heard from for 6 s (`match.countdown_cancelled`). Seats are locked during the countdown and kept
  for the match. `tables/{id}/ready` is refused for lobby tables (`use_lobby_start`).
- **Presence:** the seat screen polls `GET lobbies/{id}` every 3 s (0.4 s in the countdown); a player
  silent 6 s shows offline; one gone `pusoy.lobby.seat_release_seconds` (60) loses the seat before the
  match. Back (←) returns to the lobby list keeping your seat ("You are in a lobby — tap to return");
  Leave Lobby (with a confirm) gives it up. The owner can Edit the lobby and Remove players before the
  countdown. Owner leaving → ownership (and the creator/banker role) passes to the next seated player;
  last player leaving → the lobby closes. On start every client zooms out into `/play/?table=`.
- **Money:** unchanged banker-match money — each round's bets are held in escrow from Chips wallets and
  settled with idempotent ledger entries (BankerMatchService); balances never come from the client.
- **Live:** every lobby change (and table join/leave/ready/start/end at a lobby) broadcasts
  `lobby.updated` on the public `lobbies` channel (`LobbyEvent`, public info only); the Lobby polls every
  5 s without a socket (20 s with one), the Waiting Room listens on `table.{id}` and polls every 3 s, with
  a 10 s heartbeat. Game broadcasts are sent immediately (see "synchronized match start"); run Reverb for live updates and `php artisan queue:work`
  for the match timers (betting close, arrangement timeout) to advance.
- **UI:** `app/lobby/page.tsx` (top bar, sidebar Friends / Ranking / Rewards / Daily Spin, Quick Join,
  Create Lobby, tabs with counts, search, table — Lobby Name + ID, Game Type (the mode the creator chose:
  Round Bank / Banker Mode, same label as the lobby details), Bet, Min. Entry, Prep, Players, Mode, Status —
  « ‹ Page n of m › », hidden for one page),
  `components/lobby/CreateLobbyModal.tsx` (also the owner's settings), `components/lobby/LobbyUI.tsx`.
  The game itself is the existing `/play` table (not yet restyled to the 553 look).

### Local testing with bots

`php artisan pusoy:bots {room} --players=2 --skip=demo4` seats demo players who heartbeat, ready,
bet, declare Lucky when they can, and submit the server's auto-arrangement until the match ends
(local only).

### Commissions

Generated only after a completed, settled game, up the hierarchy of each player
(`App\Services\Agent\CommissionService`):

- **Rates** (percent of the platform fee attributed to the player): an agent's own rule (`agent_commission_rules.agent_id`),
  else its **level default** — Agent **50%**, Master Agent **40%**, Silver Agent **30%** (`agent_commission_rules.level`,
  set in Admin Panel → Commission Logs) — else the platform default.
- **Differential overrides:** the player's direct sponsor earns its rate; each upline agent earns the difference between its
  rate and the highest rate already paid below it (never negative). Under a Silver Agent: Silver 30%, Master 40−30 = 10%,
  Agent 50−40 = 10% — the chain never takes more than the top rate; the platform keeps the rest. A player directly under
  the Administrator earns nobody a commission; inactive agents are skipped (their share stays with the platform).
- `commission = floor(fee × share_bps / 10000)`; one row per `(agent, session, player)` (no duplicates on retries); the share,
  fee basis and `note` (`direct` / `override`) are snapshotted. Status: pending → approved → paid (Chips from the platform into
  the agent's commission wallet), or rejected / reversed.
- **Withdrawals** (`App\Services\Agent\PayoutService`, `agent_payout_requests`): an agent requests an amount (pending requests
  reserve the balance); staff with `manage_commissions` approve — the Chips move from the commission wallet into the agent's
  **own Chips wallet** (`COMMISSION_WITHDRAWAL`, key `commission-withdrawal:{id}`, once) — or reject. Staff can also withdraw
  directly from an agent's row. Nothing leaves the platform; no cash.

### Admin Panel (web `/admin`, API `/api/v1/admin/panel/*`)

Premium dashboard for the Super Admin and Administrators (`resources/js/Layouts/AdminPanelLayout.tsx`,
`resources/js/Pages/AdminPanel/*`, kit in `resources/js/Components/AdminPanel/kit.tsx`; API
`App\Http\Controllers\Api\V1\Admin\PanelController`). Every number is read from the database and every action goes
through a service (validation, row locks, ledger, idempotency keys, audit log). Tests: `tests/Feature/AdminPanelTest.php`.

- **Hierarchy:** Administrator → **Agent** (shown as **Incorporator**) → **Master Agent** → **Silver Agent**; Players can sit under any of them.
  `agents.level` (`App\Enums\AgentLevel`) and `agents.parent_agent_id`; `users.sponsor_id` is the permanent referrer.
  The old `admin/users/{id}/assign-agent` only assigns players that have no sponsor yet (409 `sponsor_locked` otherwise).
- **Permanent referral links:** every account has one code (`users.referral_code`) and two links,
  `{APP_URL}/register/player?ref=CODE` and `{APP_URL}/register/agent?ref=CODE` (Administrator → Agents, Agent → Master
  Agents, Master → Silver Agents; Silver Agents have no Agent link). `GET auth/referral/{code}?type=` shows who invites and
  what is created; the server resolves sponsor and level (`App\Services\Users\ReferralService`). Older agent codes still
  register players.
- **Approval:** every registration (`POST auth/register` with `referral_code` + `account_type`, or the web form) is
  **pending**: no token, sign-in refused (`account_pending`), every request refused (`EnsureActiveAccount`). Pending Users →
  Approve activates it and builds the hierarchy (agent row with level + upline, or the player's link to its agent);
  Delete removes a pending registration (never one with ledger history).
- **Statuses:** `UserStatus` = active, pending, suspended, banned, archived. Ban / suspend (reason required), reactivate,
  archive, restore (`App\Services\Users\AccountStatusService`): blocked accounts are signed out at once (tokens + sessions)
  and refused; nothing is deleted — wallets, ledger, commissions and referral relationships stay.
- **Chips:** an account's Chips are its player wallet (players) or allocation wallet (agents, administrators). The
  **Super Admin issues** new Chips into their own wallet (Overview → Issue Chips; the platform's only issuance); every
  **Load Chips** (row icon, `accounts/{id}/load`) draws on the loader's own Chips (`AllocationService::allocate`), and
  **Withdraw Chips** (`accounts/{id}/withdraw`) moves them back into the staff member's wallet (`CHIP_WITHDRAWAL`). Agents
  can **Request Chips** (`POST agent/chip-requests`, Pending in the Load Logs); staff approve (loaded from their own Chips) or
  reject. All are recorded in `chip_loads` (reference, sender, account, account type, amount, status, administrator,
  ledger transaction).
- **Sections:** Overview (My Total Chips, active agents by level, active players, both links with copy buttons, recent
  Load / Commission / Withdrawal transactions); Load Logs (search, status / type / account filters, details with ledger
  balances, approve / reject requests); Commission Logs (breakdown and rate per level, editable rates, search / level /
  status filters); Commission Withdrawal (available, withdrawn, pending; approve / reject); Agents (Load, Withdraw, Withdraw
  Commission, view, ban, archive, own commission rate), Active Players (Load, Withdraw, view, ban, archive), Pending Users
  (Approve / Delete), Ban Users (reactivate), Archive (details with transaction history, restore); Change Password
  (`PUT profile/password`); Logout. The existing tools (rooms, tables, sessions, wallets, ledger, reports, audit logs,
  administrators, settings) sit under **Platform** in the same shell.
- **Light / Dark:** header toggle; saved in the browser and on the account (`PUT profile/preferences {theme}`, shared to
  Inertia as `auth.user.theme`), so it survives refreshes and new sign-ins. Every component has light and dark colours.
- **Agent Panel** (`/agent`, API `/api/v1/agent/panel/*`, `AgentPanelController`): Agents, Master Agents and Silver Agents
  get the Admin Panel itself — same shell, pages and components (`resources/js/Pages/AdminPanel/*`), titled "Agent Panel",
  "Master Agent Panel" or "Silver Agent Panel". `lib/panel.ts` (`usePanel`) picks the API base and hides Administrator-only
  controls. `AgentPanelController` extends `PanelController` and overrides its scope hooks (`scopeLoads`,
  `scopeCommissions`, `scopeWithdrawals`, `scopeAccounts`), so every list and detail covers only the agent and its
  downline (`TeamService::downline`); anything else answers 404.
  - Overview: My Total Chips (+ Request Chips), My Downline Agents, My Active Players, registration links, Convert
    Commission to Wallet, Team Overview, recent transactions, My Chips Requests.
  - Load Logs (own + downline, Request Chips), Commission Logs (own + downline agents; rates read-only), Commission
    Withdrawal (own + downline; Withdraw Commission request), My Agents (not for Silver Agents), My Players (Load Chips
    only to players registered to the agent: `POST agent/panel/accounts/{user}/load` — `ChipLoadService::load` allows
    agents, `AllocationService` enforces ownership), Pending Users (read-only), Change Password.
  - Agents have no Platform / Agent Tools panel: the old agent pages and APIs (dashboard, players, Register Player,
    Referral Codes, allocate, balances, transactions, activity, commissions, reports) were removed (404), and
    `wallet/allocate` is staff-only. My Players has **Load Chips** and **Withdraw Chips** for players registered to the
    agent (`POST agent/panel/accounts/{user}/load|withdraw`; `ChipLoadService` checks ownership).
  - Not available to agents (no routes; the services refuse them too): approving or rejecting registrations, Chips
    requests and withdrawals, ban / suspend / archive, commission rates, issuing Chips, password resets.
- **Row actions** (Agents, Active Players, Ban Users, Archive — Admin and Agent Panels) are labeled buttons (`ActionButton`:
  icon + name), always in this order: Load Chips, Withdraw Chips, Withdraw Commission, View, Reset Password, Ban, Archive /
  Reactivate — each shown only when the role may use it.
- **Reset Password** (`/admin/reset-password`, Super Admin and Administrators): search every agent and player
  (`GET admin/panel/accounts?kind=all&q=` — username, account ID, name, email), check the account, enter and confirm a new
  password (8+ characters, letters and numbers), confirm. `PUT admin/panel/accounts/{user}/password` hashes it (model
  cast), revokes the account's API tokens and database sessions, never returns or logs it, and writes
  `user.password_reset` to the audit log (actor, target, time). Administrators and Super Admins cannot be reset there.
- **Account hierarchy** (`App\Services\Users\Hierarchy` — the one rule every creation path uses):

  | Creator | May create (always directly under itself) |
  | --- | --- |
  | Admin (Super Admin / Administrator) | Agents (an Administrator also needs `manage_agents`) |
  | Agent | Master Agents, Players |
  | Master Agent | Silver Agents, Players |
  | Silver Agent | Players only |
  | Player | nothing |

  Super Admins also create Super Admins and Administrators (platform staff, outside the agent hierarchy). Enforced in
  `ReferralService` (links: an Admin has only an Agent link, a Silver Agent only a Player link; `resolve` refuses
  anything else; `approve` checks again and refuses registrations without a sponsor), in
  `UserManagementService::create` (the new agent's level and parent come from the creator; players are linked to the
  creating agent) and in the staff API (no player/agent creation). The request can never choose a role, level, sponsor
  or parent. Existing accounts keep their sponsor and place (nothing is reassigned).
- **Registration only through links:** `referral_code` is required for every registration (web, API, mobile);
  only the permanent links (`users.referral_code`) work — the retired per-agent referral codes no longer register
  anyone. `/register` without a link shows "invitation only" and no form. Staff cannot create players or agents
  directly (`POST admin/users` with those roles → 422; `POST admin/players|agents` removed). The mobile app's Register
  screen asks for the registration link (or its code) and sends its code and type.
- **Real time:** `PanelActivityObserver` (ChipLoad, AgentCommission, AgentPayoutRequest, User status) and the
  `LedgerService` (every Chips transfer) broadcast `PanelUpdated` (`panel.updated`, no data) after commit to the
  accounts concerned and their whole upline — sponsor and agent chains, worked out in the queue worker —
  (`private-user.{id}`) and to `private-staff` (Super Admin / Administrators). So Team Overview totals follow wallet
  balance changes (game settlements included). `AdminPanelLayout` listens and every
  open panel page refetches (`usePanelRefresh`); returning to the browser tab refetches too. Needs Reverb and a queue
  worker (the event is queued).
- **Convert Commission to Wallet** (Admin Overview and Agent Overview, directly below the registration links;
  `TeamService`): shows total accumulated commission, available (balance − pending withdrawal requests) and converted
  so far. The modal (Commission Amount, Amount to Convert, Minimum Conversion, Cancel / Confirm Conversion) posts
  `commission/convert`; the server enforces the 10-Chip minimum and the available limit, locks the user row, and moves
  commission wallet → own Chips wallet as one `COMMISSION_CONVERSION` ledger transfer. The idempotency key is
  `commission-convert:{user}:{request_id}` (one per opened modal), so a double click or retry converts once. Audit:
  `commission.converted`.
- **Team Overview** (below it; `GET team/overview`): Total Player Wallets and Total Agent Wallets (Chips wallets),
  computed live from the database over the user's whole downline: one walk over both trees until nothing new turns up —
  `users.sponsor_id`, sub-agents (`agents.parent_agent_id`) and the `agent_players` of every agent reached — so an
  Administrator's totals include the players of its agents, their Master and Silver Agents, at every level. Each account
  counts once; the user never; the Super Admin sees the whole platform. (The "Converted So Far" and "Agents Commission"
  cards were removed; commission records are unchanged.)
- Migration `2026_11_19_190000_admin_panel_hierarchy` backfills a code for every account, players' sponsors from their
  agents, and the level rates. Tests use a `superAdmin()` helper that issues the Super Admin a 1,000,000-Chip float.

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
| Wallet | `GET wallet`, `wallet/transactions`, `wallet/allocate` (admin/agent; Chips only). No deposit / withdraw routes |
| Commission & team | `GET commission/wallet`, `POST commission/convert {amount, request_id}`, `GET team/overview` (Super Admin, Administrator, every agent level; players 403) |
| Rooms | `GET rooms` (`?game_mode=`), `rooms/{id}`, `POST rooms/{id}/join`, `rooms/private`, `rooms/host` (Round Bank / Banker Mode table, host seated), `rooms/{id}/invite` |
| Tables | `GET tables/current`, `tables/{id}`, `POST tables/{id}/ready|leave|heartbeat` |
| Games | `GET games/{id}`, `games/{id}/cards`, `POST games/{id}/submit`, `games/{id}/bet`, `games/{id}/lucky`, `games/{id}/preview`, `GET games/{id}/results` |
| Multiplayer lobbies | `GET lobbies` (`tab` all/public/private, `search`, `page`; 5 per page + counts), `POST lobbies` (`name`, `password?`, `game_mode` banker/round_bank, `min_entry` 100/250/500/1000/2000, `preparation_seconds` 30/45/60/75), `POST lobbies/quick-join`, `GET lobbies/{id}` (also the heartbeat), `PATCH lobbies/{id}` (owner: name/password/time), `POST lobbies/{id}/join` (`password?`), `POST lobbies/{id}/seat` (`seat` 1–4), `POST lobbies/{id}/start` (`ready?`; every player), `POST lobbies/{id}/kick` (owner, `user_id`); leave uses `tables/{id}/leave` |
| Single Player | `GET practice/tiers`, `POST practice/matches` (`tier`), `GET practice/matches/current`, `GET practice/matches/{id}`, `POST practice/matches/{id}/deal` (`bet`, `request_id`), `GET practice/{round}`, `POST practice/{round}/{preview, suggest, lucky, submit}`, `POST practice/matches/{id}/leave`, `GET practice/gold`, `POST practice/gold/claim` (`request_id`) — Round Bank, you + 3 bots; plays for Gold only |
| Friends | `GET/POST friends`, `POST friends/{id}/accept`, `DELETE friends/{id}`, `POST friends/{user}/invite` |
| Push & payouts | `PUT auth/devices/push-token`; `agent/payout-requests` (GET/POST), `admin/payout-requests` (+approve/reject) — payouts disabled unless cash flags are on |
| Agent | `agent/panel/*` (overview, load-logs, commission-logs, withdrawals, accounts, accounts/{id}/load, accounts/{id}/withdraw — own downline only), `agent/chip-requests` (POST), `agent/payout-requests` (GET/POST commission withdrawals). The old agent tool endpoints were removed |
| Admin Panel | `admin/panel/overview`, `admin/panel/issue` (Super Admin), `admin/panel/load-logs` (+`/{id}`, `/approve`, `/reject`), `admin/panel/commission-logs`, `admin/panel/commission-rates` (PUT), `admin/panel/withdrawals` (+approve/reject), `admin/panel/accounts?kind=agents|players|pending|banned|archived`, `admin/panel/accounts/{id}` (GET, DELETE pending), `.../load`, `.../withdraw`, `.../withdraw-commission`, `.../commission-rate` (PUT), `.../approve`, `.../status` (`ban|suspend|reactivate|archive|restore`) |
| Admin | `admin/users|players|agents|administrators` (GET/POST), `admin/users/{id}` (GET/PATCH, status, assign-agent, permissions, limits), `admin/rooms`, `admin/tables` (+close), `admin/games` (+cancel, retry), `admin/wallets` (+freeze), `admin/wallets/summary` (total points per currency × wallet type), `admin/transactions` (+reverse), `admin/adjustments` (Super Admin point deposit/withdraw by `wallet_id` or `user_id`+`currency`), `admin/reconcile`, `admin/commissions` (+approve/reject/reverse), `admin/commission-rules`, `admin/reports/overview`, `admin/audit-logs`, `admin/settings` |

---

## 9. Database tables

Spec tables and where they live: `users`, `player_profiles`, `user_devices`, `roles`,
`permissions`, `permission_user`, `administrator_limits`, `agents`, `agent_players`,
`agent_referral_codes`, `agent_commission_rules`, `agent_commissions`, `agent_payout_requests`,
`game_rooms`, `game_tables`, `game_players`, `game_sessions`, `game_cards`, `game_submissions`,
`game_results`, `game_hand_results`, `wallets`, `wallet_transactions`, `wallet_holds`,
`wallet_allocations`, `wallet_adjustments`, `game_settlements`, `game_payouts`, `platform_fees`,
`notifications`, `game_invitations`, `audit_logs`, `system_settings`, `personal_access_tokens`,
`practice_matches`, `practice_games` (Single Player Round Bank: matches and rounds).
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

Verified 2026-11-18 (admin deposit/withdraw + wallet totals):

- Admin → CP / VC Management (`resources/js/pages/Admin/Wallets.tsx`): "Total wallet points" cards
  (CP and VC separately, with player / allocation split) and a per-type total line; Super Admin
  **Deposit** / **Withdraw** buttons in the header (search a user, pick CP or VC) and on each wallet
  row. These are point adjustments only (`MANUAL_ADJUSTMENT` credit / `PLAYER_DEBIT` debit, with a
  `wallet_adjustments` row and `wallet.adjust` audit entry, idempotency key, no negative balances);
  Super Admin wallets are excluded. Real-money deposit/withdraw (`wallet/deposit|withdraw`) stay
  disabled by the cash feature flags.
- 198 Pest tests (adds AdminDepositWithdrawTest). Manual: totals and buttons on the CP page, the
  Deposit modal's user search; a deposit was not submitted from the browser (covered by Pest).
- Dev data: Super Admin allocated 1,000,000 CP to `admin` (Platform Admin) — ref TX01M7P2T3MSFRQTMYPFRSMQF22F.

Verified 2026-11-18 (Single Player difficulty picker):

- 195 Pest tests (adds tiers + eligibility, tier/bet/min-gold validation, request-id idempotency,
  casual vs strong bots), 21 mobile Vitest tests (adds the picker: single selection, locked tiers,
  restore, Back/Close/Escape, load error + retry; practice redirects to the picker without a level).
- Manual (mobile dev build, demo1 with 0 CP): picker renders with all tiers locked; with tiers
  patched eligible in-page, selecting Intermediate 1,000 highlights one bet and enables Continue;
  Continue → server refuses with "You need at least 10,000 gold"; Change level reopens the picker.
  A successful paid-tier deal in the browser was not run (no seeded player has CP); Pest covers it.

Verified 2026-11-18 (Single Player + home rework):

- 191 Pest tests (adds practice: private bot hands, zero-sum scoring, seed verification, no wallet
  transactions, duplicate submit, foreign cards, owner-only access, abandon on new deal), 14 mobile
  Vitest tests (adds the practice screen).
- Manual (mobile dev build against local Laravel): landscape home with coin + diamond pills and
  Single Player / Multiplayer tiles; a full practice round at 375×812 (server hand names, results,
  scores summing to 0, no ledger rows); Multiplayer lobby with mode cards.

Not done / not verified:

- **Single Player is mobile-only**; the web (Inertia) player app has no practice screen yet.

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

### 2026-11-19 — Gold & Chips only

- The game now has exactly two currencies: **Gold** (Single Player) and **Chips** (Multiplayer); see §5.
  Cash Points (CP), Virtual Coins (VC) and Gold Points (GP) are gone from the backend, database, web
  dashboard and mobile app. Cash feature flags, `wallet/deposit|withdraw` and commission payouts were removed
  (payout requests always answer 403). The daily reward pays Chips.
- Migration `2026_11_19_180000_gold_and_chips_only` (irreversible): Gold Points balances moved into Gold 1:1
  (`OUT_OF_GOLD_REWARD` rows); every CP / VC / GP wallet, ledger row, hold, allocation, adjustment, fee,
  payout and commission deleted; rooms, sessions, admin limits and commission rules moved to `CH`; CP-only
  rooms removed. **Chips start at zero** — an administrator allocates them. Backup of the database before the
  migration: `storage/backups/553-before-gold-chips-2026-11-19.sql` (git-ignored); restore it to go back.
- Out of Gold now credits 1,000 Gold directly; Single Player Leave settles on the server (void round,
  reserves returned). Mobile shows a casino-chip icon for Chips everywhere diamonds were.
- Verified: 241 Pest, 11 web Vitest and 91 mobile Vitest tests; live on demo11 — Home / Lobby / Choose Your
  Seat / Profile / Wallet show the same Gold (600, incl. 100 in play) and Chips (1,000, allocated by the
  super admin for the check); Leave returned both 100-Gold reserves; ledger reconciles.

### 2026-11-19 — Admin Panel

- New Admin Panel (see §6 "Admin Panel"): hierarchy Administrator → Agent → Master Agent → Silver Agent with permanent
  referral links, approval of every registration, bans / archive, Chips load / withdraw / requests with Load Logs,
  hierarchical commissions (50 / 40 / 30% with differential overrides) and in-platform commission withdrawals, light / dark.
- Behaviour changes: registration no longer signs in (pending until approved, web and mobile); the Super Admin's loads
  come from their own Chips (Issue Chips first); commission withdrawals are back on (into the agent's own Chips).
- Verified: 259 Pest, 11 web Vitest, 91 mobile Vitest; live as superadmin — Issue Chips (5,000,000), an Agent registered
  through the admin's Agent link, approved from Pending Users, loaded 50,000 Chips; dark mode across panel pages and the
  existing Platform tools; theme saved on the account; agent overview shows its Player and Master Agent links.

### 2026-11-24 — APK fixes

- The APK was built from `mobile/.env.local`, which points at the local backend (`http://localhost:8000`);
  on a phone that is the phone itself. App builds now use `mobile/.env.native` (server) and refuse localhost.
- Android static-export routing: missing Next 16 page data files added after each build; inner-page loads
  restored client-side; orientation locking made race-free. Verified in an emulation of Capacitor's routing
  (Splash → Onboarding → Login → Home → Lobby, Single Player with a query string, reload on an inner page:
  all client-side, no 404s); 96 mobile tests.

### 2026-11-24 — Commission conversion, Team Overview, no daily Chips

- Convert Commission to Wallet and Team Overview sections for Administrators, Agents, Master Agents and Silver Agents
  (see Admin Panel). Players get 403 on the new routes.
- The free daily Chips reward is gone everywhere: `POST wallet/daily-reward`, `WalletService::claimDailyReward`, the
  `FEATURE_DAILY_CHIPS_REWARD` / `DAILY_CHIPS_REWARD_AMOUNT` settings, `GET wallet` meta, the web Dashboard button,
  the mobile Home gift button and the Lobby "Daily Spin". Remove those two keys from any `.env`. The Out of Gold claim
  (Single Player) is unrelated and unchanged.
- Tests: `tests/Feature/TeamTest.php`, `resources/js/Components/AdminPanel/TeamSections.test.tsx`; ledger test now checks
  the daily route is gone.
- Dummy test data: `php artisan db:seed --class=DummyAgentsSeeder` (local only — refuses to run when `APP_ENV=production`,
  not part of `DatabaseSeeder`). Creates `dummyagent` → `dummymaster` → `dummysilver` → `dummyplayer` (password
  "password") through the referral + approval flow, and gives each dummy agent 200 Chips of Paid commission (an
  issued `COMMISSION_PAYMENT` into its commission wallet plus a commission record with `game_session_id` 0). Safe to re-run.

### 2026-11-24 — Agent / Master Agent / Silver Agent Panels

- The agent dashboards now use the Admin Panel's design, layout and pages, limited to each agent's downline (see Admin
  Panel → Agent Panel). Agents can load Chips to their own players from My Players; the old Agent Overview page and
  `AgentNetworkCard` were replaced by the shared Overview (`GET agent/panel` still answers, now with the overview data).
- Real-time `panel.updated` refresh for the Admin and Agent Panels.
- Tests: `tests/Feature/AgentPanelTest.php` (scoping per level, own-player loads, no Administrator actions, real-time
  event); WebPagesTest covers the new agent pages.

### 2026-11-24 — Wallet totals, Reset Password, link-only registration, labeled actions

- Removed the "Converted So Far" and "Agents Commission" cards. Total Player / Agent Wallets cover the whole downline
  through both trees, counted once, and refresh in real time on every Chips balance change.
- Agents, Master Agents and Silver Agents lost the Platform (Agent Tools) panel; its pages and APIs are gone. Agents can
  now Withdraw Chips from their own players.
- Admin Panel → Reset Password (Super Admin + Administrators) with audit logging.
- Registration only through registration links (Register Player and Referral Codes removed everywhere).
- Agents / Players actions are labeled buttons; Withdraw Chips sits right after Load Chips for every role that has it.
- Tests: AgentPanelTest (withdraw, reset password), TeamTest (multi-level totals), AccessControlTest, AdminPanelTest,
  WebPagesTest; web navigation + TeamSections; mobile registration-link parser.

### 2026-11-24 — Strict account-creation hierarchy

- One rule (`Hierarchy`): Admin → Agents; Agent → Master Agents + Players; Master Agent → Silver Agents + Players;
  Silver Agent → Players. Admins no longer have a Player Registration Link and their code no longer registers players;
  approval re-checks the rule; direct creation (`UserManagementService`) follows it; the legacy staff "Add agent / Add
  player" buttons are gone (Add administrator stays, Super Admin only). Links a role may not use are hidden, not shown
  disabled. Existing accounts are unchanged.
- Tests: `tests/Feature/HierarchyTest.php` (links per role, registration per role with tampered requests, approval
  re-check, direct creation matrix, staff API, existing data untouched).

### 2026-11-24 — Player sign-in switched off

- `PLAYER_LOGIN_ENABLED` (config `pusoy.features.player_login`, default **false**): while off, players cannot sign in on
  the web or in the app (`403 player_login_disabled`, "Player sign-in is temporarily disabled"), and players already
  signed in are refused on every request (web sessions are signed out; app tokens are kept, so phones work again once
  it is back on). Admins and all agent levels are unaffected; registration still works (accounts wait for approval).
  Re-enable: set `PLAYER_LOGIN_ENABLED=true` in `.env`, then `php artisan config:clear` (or `config:cache` on the server).
- The test suite runs with it on (`phpunit.xml`); `tests/Feature/PlayerLoginSwitchTest.php` covers it off and on.

### 2026-11-24 — Maintenance control (Admin Panel only)

- **Admin Panel → Maintenance** (`/admin/maintenance`; Super Admin and Administrators; `GET|PUT /api/v1/admin/maintenance`).
  One mode at a time, stored in `system_settings` (`maintenance_mode`), changed with a confirmation that lists what is
  affected, audited as `maintenance.mode` (admin, time, previous → new), with a "Recent changes" list.

  | Mode | Mobile game, matchmaking, table entry, gameplay | Agent / Master / Silver / Player transactions |
  | --- | --- | --- |
  | Full Maintenance (`full`) | closed — full-screen artwork, landscape | disabled (panels viewable) |
  | Mobile Game (`mobile_game`) | closed — full-screen artwork, landscape | normal |
  | Agents/Players (`agents_players`) | normal | disabled (notice in the panels) |
  | OFF (`off`) | normal | normal |

- **Server enforcement** (`App\Services\System\MaintenanceService`, `App\Enums\MaintenanceMode`):
  - Game routes (rooms, lobbies, tables, games, Single Player, friend invites) sit behind the `game.open` middleware →
    `503 {error: "maintenance", maintenance: {...}}`; app sign-in (`platform` android/ios) of players is refused too.
  - Transactions: `assertTransactionsAllowed()` runs inside the database transaction of every agent/player money
    operation — Load / Withdraw Chips (`AllocationService::allocate`, `ChipLoadService`), Chips requests and their
    approval, manual adjustments, commission conversion (`TeamService`), commission withdrawals (`PayoutService`),
    commission approval / reversal and ledger reversals. It reads the setting with a shared lock while a mode change
    takes an exclusive lock, so no transaction slips past a switch. Admin-only movements (issuing, loading an
    Administrator) stay open; settlements of games already in play finish normally. Balances and history are untouched.
- **Live sync:** `GET /api/v1/status` (public) and the public Reverb channel `maintenance` (`maintenance.updated`, sent
  right after commit, best effort). Panels (`resources/js/lib/maintenance.tsx`) follow it — notice banner, disabled
  transaction buttons, every 30 s and on tab focus as a fallback. The mobile app's `MaintenanceGate` wraps the whole app:
  while the game is closed it shows only `public/maintenance.webp` (object-contain, never stretched, landscape lock;
  rotated in a portrait browser), learns of changes from `/status` at start-up, every 30 s, on resume, from Reverb and
  from any 503 "maintenance" answer, and returns to normal by itself on OFF (no reinstall).
- Tests: `tests/Feature/MaintenanceTest.php` (admin-only, audit, the full mode matrix, every blocked transaction,
  viewing still allowed), WebPagesTest, mobile `MaintenanceGate.test.tsx`.
- The APK must be rebuilt (`npm run assets && npm run cap:sync && npm run cap:android`) for phones to get the screen.

### 2026-11-24 — Users / Employees and Loader Accounts

- **Admin Panel → Users / Employees** (`/admin/employees`; `GET|POST admin/employees`, `PATCH admin/employees/{id}`,
  `PUT …/permissions`, `POST …/status`, `PUT …/password`, `GET …/activity`, `DELETE …`; `EmployeeService`):
  search (name, username, email, role, status), create with own sign-in, edit details, permissions, activate /
  deactivate (deactivating revokes app tokens and web sessions at once), reset password, activity (audit trail and
  counts), delete only when the account never did anything (otherwise 409 — deactivate, history stays attributed).
  Any Admin (Super Admin / Administrator) manages Loader Accounts; only the Super Admin manages Administrators; nobody
  manages themselves or a Super Admin here. All changes are audited (`employee.*`).
- **Loader Account** — role `loader` (`Role::Loader`) with only the three `LoaderPermission`s (stored in `permissions`,
  never mixed with Administrator abilities; migration `2026_11_24_120000_add_loader_accounts` adds the rows):
  - `loader_loads` → Load Transactions: all Chips loads and requests (search, details), **Load Chips** to agents and
    players and approve / reject Chips requests. Loads use the Chips of the Admin who created the Loader (its
    employer, `users.created_by`) under that Admin's rules and limits; the Loader is recorded as processor (Load Logs
    `processed_by`, ledger `created_by` / `approved_by`, metadata `funds_from`, audit log). Same idempotency, ledger and
    maintenance rules as everyone. If the employer is inactive, loads answer 409 `no_employer`.
  - `loader_commissions` → Commission Logs (read-only, rates read-only) and Commission Withdrawal (approve / reject the
    agents' commission → own Chips requests).
  - `loader_passwords` → Reset Password for Agents, Master Agents, Silver Agents and Players only (never staff; hashed;
    tokens and sessions ended; audited).
  - **Loader Panel** (`/loader`, API `/api/v1/loader/panel/*`, `LoaderPanelController` extends `PanelController`): Overview
    (load and commission figures, employer Chips, recent activity) plus the three modules, each behind
    `can:loader_*` on the page and on the API. Everything else — Admin dashboard, Maintenance, settings, rates,
    hierarchy, agent creation, withdrawing Chips, Employees — answers 403 / 404. Sign-in lands on `/loader`.
- Tests: `tests/Feature/LoaderAccountTest.php` (creation rules, permission filtering, blocked Admin areas, loads from the
  employer with attribution and idempotency, commission withdrawals, password resets, deactivation / reactivation,
  delete safeguard, maintenance) and the updated HierarchyTest / WebPagesTest.

### 2026-11-24 — Web App / Mobile Game login restrictions

| Account | Web App (browser session, `POST /login`) | Mobile Game (app token, `POST /api/v1/auth/login`) |
| --- | --- | --- |
| Super Admin, Administrator, Loader | allowed | blocked — 403 `web_only` "Mobile Game Access Restricted…" |
| Agent, Master Agent, Silver Agent | allowed | blocked — 403 `web_only` |
| Player | blocked — "Mobile App Required" | allowed (subject to status, `PLAYER_LOGIN_ENABLED`, maintenance) |

- The platform is how the account is authenticated, never a request field: Web App = session, Mobile Game = Sanctum
  app token (`App\Support\PlatformAccess`). Both sign-ins check the role; `EnsurePlatformAccess` (web and api groups)
  checks again on every request: a non-player's app token is refused and revoked (so older tokens die), a player's
  browser session is signed out (web pages redirect to login with the message; API calls get 403 `mobile_only`).
  Logging out is always allowed. No accounts are changed; new accounts follow their role automatically.
- `PLATFORM_LOGIN_LOCK` (default true). `PLAYER_LOGIN_ENABLED` now defaults to **true** (players sign in through the
  Mobile Game); set it to false to shut players out again. Web registration tells players to sign in with the app.
- The test suite runs with the lock off (`phpunit.xml`, most tests act as players over a session);
  `tests/Feature/PlatformAccessTest.php` turns it on and tests every role on both platforms, token reuse, session
  reuse, maintenance and the player switch.

### 2026-11-24 — Login screens (Web App redesigned 2026-11-27; Mobile Game artwork)

- **Web App** (`resources/js/Pages/Auth/Login.tsx`): rebuilt on Baseplate's split-screen login — a form column on the
  left using the template's input / button / alert tokens (leading field icons, show / hide password, Caps Lock hint,
  submit disabled until both fields are filled, loading state) and a Pusoy 13 brand panel on the right
  (`bg-brand-950`, Baseplate grid shapes, royal-flush card fan from `Components/CardArt.tsx`, feature list, live
  multiplayer badge, theme toggle). Below `lg` the brand panel is hidden and the form column keeps the logo, a
  `Web App` badge and the footer. Server messages are shown as Baseplate alerts; the one-session error opens a
  Baseplate alert dialog ("Account already connected" / "Signed out"). The old artwork overlay
  (`Components/LoginArt.tsx`) was removed; `public/images/login-art.webp` is no longer used by the web app.
  Tests: `resources/js/Pages/Auth/Login.test.tsx` (form gating, password reveal, credential / platform errors,
  session dialog, flash notices) and `tests/Feature/AuthAndCrudTest.php`.
- **Mobile Game** (`mobile/src/app/login/page.tsx` + `mobile/src/components/LoginArt.tsx`): unchanged Pusoy553 login
  artwork with a working form laid over the fields drawn in it — Username, Password, show / hide password, LOG IN.
  Artwork `mobile/public/login-art.webp`, landscape lock (a portrait browser rotates the stage).
- Mobile artwork layout: full screen, never cropped — the stage box has the artwork's aspect ratio (1672 × 941) and the
  largest size that fits the screen inside the safe areas (`min(100cqw, 100cqh × ratio)` — scaled by the tighter
  dimension; the image is `object-contain`). Spare space (screens of another shape) is filled edge to edge by mirrored
  copies of the artwork's own edges, seamless at the border and fading out (sides and floor ~20 %, top only a sliver so
  the logo never repeats), over a soft ambient copy. When there is spare height, the stage moves up so the login panel
  sits at the screen's centre, never further than the spare space. Input text is at least 12 px.
  The root uses `overflow: clip` so focusing a field can never scroll the artwork. Controls are positioned in artwork
  pixels (measured from the image, see `LOGIN_ART`) and text uses container units, so they stay on the drawn fields at
  any size. While a field is focused or filled, its fill colour covers the drawn label.
- Both: same endpoints (`POST /login`, `POST /api/v1/auth/login`) and the same server messages (wrong credentials,
  pending / suspended / banned, platform rules, maintenance). The register / forgot-password pages still exist for
  registration links and password resets but are not linked from either login screen. Mobile test:
  `mobile/src/app/login/page.test.tsx`.

## Account type name: Agent → Incorporator

- The top hierarchy level below the Administrator is now **displayed** as **Incorporator**:
  Administrator → **Incorporator** → Master Agent → Silver Agent → Players.
- Display-only rename: `AgentLevel::Agent->label()`, `User::accountTypeLabel()`, `PanelController::typeLabel()` and the
  web `TYPE_LABEL` map (`Components/AdminPanel/kit.tsx`). Internal values stay `agent` (role, `agents.level`, API
  `account_type`, routes `/agent`), so no migration or data change. "Agent" as the generic word for every agent level
  (Agents / Players menu, Agent Panel, Agent Registration Link) is unchanged.
- The Administrator's registration link, its invite banner ("registering as Incorporator"), pending approvals,
  account lists, sponsor labels and the Overview's active-agent breakdown all use the new name.

## Main Lobby (mobile Home) — profile, balances, notifications

- **Profile (upper left) is display only**: the avatar, nickname and level bar are no longer a link. Only the
  pencil badge is clickable; it opens **Choose Your Avatar** (`components/AvatarPicker.tsx`).
- **Choose Your Avatar** shows the current avatar and, below the picture, the **Nickname** field with a
  **Change Nickname** button (tap → edit → Save Nickname, or Enter). Confirm saves the avatar and any edited
  nickname. Both apply at once (`refresh()` of the signed-in user; table seats get `player.updated`).
- **API:** `PUT /api/v1/profile/nickname` `{nickname}` → `player_profiles.display_name`. Whitespace is collapsed;
  2–20 characters, starting with a letter/number, then letters, numbers, spaces, `.` `_` `-`. Audit log
  `user.nickname_changed`. Test: `tests/Feature/AvatarTest.php`.
- **Balances:** the green "+" (wallet) buttons beside Gold and Chips are gone; the pills only display balances.
- **Leaderboard / Rankings** trophy button removed from the Home screen (the `/leaderboard` page itself still exists).
- **Notifications:** the bell (now alone, under the right end of the Chips pill) opens `components/NotificationsPanel.tsx`,
  a pop-up instead of navigating. It shows the **System announcement** (Admin → Settings → Lobby announcement, now
  also returned as `meta.announcement` by `GET /notifications`) pinned on top, then the player's notifications with
  a type badge (Account = Chips received, Game = room invitation, Friends, Alert = anything else). Opening it marks
  everything read. The red dot updates live from broadcast notifications on `user.{id}`
  (`lib/useUnreadNotifications.ts`). Tests: `src/app/home/page.test.tsx`, `src/components/AvatarPicker.test.tsx`.

## Notifications — Multiplayer Lobby bell (shared pop-up)

- The Multiplayer Lobby's message envelope is now a **bell** (`app/lobby/page.tsx`). It shows a red unread badge and
  rings while there are unread notifications. Tapping it opens `components/NotificationsPanel.tsx` inside the lobby.
  (Both lobby bells were later removed — see "Notification bells removed" below.)
- **Content** (all from `GET /api/v1/notifications`, newest first, last 50):
  - pinned **Maintenance** announcement while maintenance is on (`meta.maintenance`: label, message — Admin Settings
    `maintenance_message` or a default — and game / transaction flags);
  - pinned **System announcement** (`meta.announcement`, Admin → Settings → Lobby announcement);
  - the player's notifications, tagged by type: **Account** (`PointsReceived`, new `ChipsWithdrawn` when an agent or
    staff withdraws a player's Chips), **Lobby** (`RoomInvitation`, new `RemovedFromLobby` when the owner kicks you),
    **Friends** (`FriendRequest`), **Alert** (anything else).
- **Reading:** opening no longer marks anything read. Tapping a notification calls `POST /notifications/{id}/read`
  (own notifications only, 404 otherwise) and the returned unread count updates the bell. **Mark all as read** calls
  `POST /notifications/read`.
- **Actions when tapped:** invitation → joins that lobby and opens Choose Your Seat (from Home it goes via
  `/lobby/?join=ID`); friend request → Friends; Chips received/withdrawn → wallet; announcements and other items expand.
- **Invitations into private lobbies:** a pending, unexpired `game_invitations` row lets the invitee join a private
  lobby without its password (`LobbyService::join`); it is marked `accepted` on join. Everyone else still needs the
  password; expired invitations do not work.
- **Real time:** new notifications arrive on the private `user.{id}` channel (Laravel broadcast notifications);
  `lib/useUnreadNotifications.ts` bumps the badge and re-dispatches `pusoy:notification` so an open pop-up reloads.
  The pop-up also reloads on `maintenance.updated`. The count is reloaded when the app returns to the foreground.
- Tests: `tests/Feature/NotificationsTest.php`, `mobile/src/app/lobby/page.test.tsx`, `mobile/src/app/home/page.test.tsx`.

## Multiplayer in-game table — chips, 12 rounds, clockwise banker with reserve check

- **Start Game → table:** when the lobby countdown ends the waiting room goes to `/play/?table=ID`. For Round Bank /
  Banker Mode tables that is now the landscape table `mobile/src/components/table/MultiplayerTable.tsx`, built like
  the Single Player table. It shows a short "Entering the table…" cover and is driven only by server state
  (`useTable`: REST + Reverb `table.{id}`). Classic tables keep the portrait screen.
- **Chips 1:1:** `config/pusoy.php` `lobby.bet_chip_percents` = `[5, 10, 15]` % of the lobby's Minimum Entry,
  with no multiplier: Minimum Entry 100 → **5 / 10 / 15 Chips** (250 → 12.50 / 25 / 37.50).
  - `GameRoom::betChips()` / `minBet()` / `maxBet()`.
  - Snapshotted into each round (`config.bet_chips`, `min_entry`).
  - `BankerMatchService::placeBet` refuses anything else (`invalid_bet`). Auto bets use the smallest chip.
- **12 rounds:** `rounds_total` 12 from `pusoy.banker.rounds`. Each round is one `game_session` (`round_number` 1–12);
  `startRound` is locked and idempotent, and after round 12 the table closes with `end_reason = completed`.
- **Banker eligibility:** to bank, a player's Chips balance must be ≥ `banker_reserve_multiple` (6) × the maximum
  permitted bet (`GameRoom::bankerReserve()`, e.g. 90 Chips for Minimum Entry 100).
  - **Round Bank:** the creator banks first. The turn then passes clockwise by seat number from the previous banker,
    who is checked last.
  - Each candidate is checked in that order; anyone below the reserve is skipped, so an underfunded player is never
    banker.
  - **Banker Mode:** the creator continues while eligible, otherwise the eligible player with the highest balance.
  - If nobody qualifies the match ends with `end_reason = no_eligible_banker`.
- **History:** every round stores `config.seat_order` and `config.banker_selection` (reason, required reserve, each
  check with balance). The API (`GET /games/{id}`) returns the checks without balances. The `banker.assigned` event
  carries `skipped_user_ids` and the reserve, and the table marks skipped players "Can't bank".
- **Table UI:** shows Round X / 12 with "NAME banks", the BANKER badge, room name, Minimum Entry and mode, and your
  Total Chips. Other players' wallet balances are not shown; their seats show this round's bet / ready state and match net.
  - Betting is the room's chips only. The banker sees "Covering N".
  - Arranging uses the shared `LuckPopup` with `previewPath` `/games/{id}/preview` and a Chips HUD.
  - The reveal shows every hand with lane WIN/LOSS against the banker; final standings appear after round 12.
  - Offline seats are greyed out, and the Back button (leave) works between rounds only.
- **Local note:** rounds advance through queued jobs (`CloseBetting`, `ExpireArrangement`, `ResolveGameSession`,
  `StartNextRound`); run `php artisan queue:work` locally or betting and timers will not move on.
- Tests: `tests/Feature/MultiplayerMatchTest.php` (chips, skip-and-record, no eligible banker, exactly 12 rounds),
  `LobbyTest`, `BankerModesTest`, `mobile/src/components/table/MultiplayerTable.test.tsx`. The lobby test helpers moved
  to `tests/Pest.php`.

## Disconnection, timeout, saved arrangements and reconnection (multiplayer)

- **Saved arrangement:** while you arrange, the app sends every move to `PUT /api/v1/games/{id}/draft`. It is
  debounced at 400 ms and sent at once when the app goes to the background or the page closes.
  - The server keeps only a **valid** arrangement (`GameEngine::saveDraft`): all 13 of your cards in 3 / 5 / 5, in
    order, or misplaced only where the room allows misplaced hands. Anything else leaves the last valid one in place.
  - Stored in `game_cards.draft` / `draft_saved_at` (migration `2026_11_25_120000_add_draft_to_game_cards`).
  - Locked once you submit or the timer ends (409).
- **Timer expiry** (`ExpireArrangement` → `GameEngine::expire`, row-locked so a repeat run does nothing): every missing
  hand is submitted as the player's **last saved arrangement**. It is never reset or randomised, and is marked
  `is_auto` with event `player.submitted` `{auto: true, source: 'saved_arrangement'}`.
  - Only a player who never saved a valid arrangement falls back to the room's timeout policy
    (`source: 'auto_arranged'`).
  - The timer is server-side, so it runs on whether the player is online, offline or gone, and the others are never held up.
- **Offline players:**
  - The heartbeat (`/tables/{id}/heartbeat`) runs every 10 s, plus at once on open, on app resume and when the network returns.
  - `pusoy:sweep` marks a player disconnected after `GAME_DISCONNECT_AFTER_SECONDS` (30) and broadcasts
    `player.disconnected` / `player.reconnected`.
  - An offline player's dealt round still finishes (their saved hand is played and settled). They sit out the next
    rounds, are not dealt in or made banker, and are dealt back in at the next round after they return. Completed rounds
    are never replayed.
- **Removed after staying away:** after `pusoy.banker.max_missed_rounds` (2) rounds in a row offline, the player leaves
  the match. They get the `RemovedFromMatch` notification, and their finished rounds stay settled.
  - The app then gets 403 for the table (`useTable().removed`): `/play` says so and returns to the Multiplayer Lobby.
  - When the match ends the table closes, and on return the player sees the final results, then the lobby.
- **Reconnecting:** Home and the Multiplayer Lobby call `useResumeMatch` (on open, app resume and network back). If
  `/tables/current` is a match being played (`IN_GAME`), the player goes straight to `/play/?table=ID`.
  - The table restores the current round, your cards and your saved arrangement (`my_draft` in `GET /games/{id}`).
  - Your submission, if any, stays locked: no duplicates.
- Tests: `tests/Feature/ReconnectTest.php`, `mobile/src/app/home/page.test.tsx` (resume),
  `mobile/src/components/table/MultiplayerTable.test.tsx` (restore + save).

## Main Lobby redesign — wallet stack, Keys, Shop

- **Wallets (upper right, stacked):** Gold, Chips, Keys (`mobile/src/components/lobby/WalletStack.tsx`). Each is a
  fixed-width card with its own theme (gold / red / purple) and a small icon. The balance uses comma formatting in
  tabular figures, with room for 7 digits: 9,999,999 leaves ~44px spare, so the layout never shifts.
  - Values are the player's server balances: Gold Total Amount (`useGoldWallet`), Chips and Keys (`useBalance`). They
    update live through `wallet.updated` and `pusoy:wallet`, and count up or down with a green/red flash.
  - Tapping a card opens the Wallet history. Keys (+), inside the Keys bar at its far right (bars are 356px wide), opens **Get Keys** (`LobbyPanels.tsx`): your Keys, how Keys are
    given, your latest Keys ledger entries (`GET /wallet/transactions?currency=KY`) and a link to the wallet.
- **Keys = third currency (`KY`, `App\Enums\Currency`):** a separate player wallet with no allocation or commission
  wallet, never bet or exchanged, and never cash.
  - Only a Super Admin loads or removes Keys, through the existing audited adjustment (`POST /admin/adjustments`,
    currency `KY`; web Admin → Wallets → Keys tab). It is ledgered (MANUAL_ADJUSTMENT / PLAYER_DEBIT), idempotent and
    cannot overdraw.
  - Player wallets are created on demand (`WalletService::provision`), so existing players get one automatically.
  - Test: `tests/Feature/KeysWalletTest.php`.
- **Layout (1600×900 stage):**
  - No notification bell on the Main Lobby (removed). Single Player and Multiplayer keep their full 520×350 size, moved 6px lower to
    clear the wallets.
  - The bottom row is Shop, Settings and Logout. Sound moved into Settings, which already has the Sound Effects switch.
  - Shop opens a "Coming soon" panel; nothing can be bought.

## Notification bells removed (Main Lobby and Multiplayer Lobby)

- Neither lobby shows a notification bell any more. The pop-up (`NotificationsPanel.tsx`) and its unread hook
  (`useUnreadNotifications.ts`) were removed with them, and so was the `/lobby/?join=ID` hand-off they used.
- The server side is unchanged: notifications are still stored and broadcast (`GET /notifications`,
  `POST /notifications/{id}/read`, `POST /notifications/read`, `RemovedFromLobby`, `RemovedFromMatch`,
  `ChipsWithdrawn`…), private lobbies still accept an invited player, and the `/notifications` screen still exists.

## Shop — Keys → Gold exchange (Main Lobby pop-up)

- **Shop button → pop-up** (`mobile/src/components/lobby/ShopModal.tsx`):
  - Centered, 80% × 80% of the screen over a dark overlay, with Close (X).
  - Every size uses container units of the pop-up, so it scales on any screen without clipping.
  - Shows the Keys tab, your recent exchanges, four package cards (golden keys → Gold), your Keys balance (+ opens
    Get Keys) and the IMPORTANT NOTICE (non-refundable, no Gold → Keys, final, confirm before completing).
- **Packages** (`config('pusoy.shop.key_packages')`): 1 Key → 5 Gold, 2 → 10, 5 → 25, 10 → 50.
- **Exchanging:**
  - Too few Keys → a warning and no request.
  - Otherwise a confirmation with a required acknowledgement checkbox.
  - On confirm: one `POST /api/v1/shop/key-exchanges {package, idempotency_key, confirmed: true}`. A double tap
    reuses the same key. The buttons are disabled while it runs.
  - Success / failure / network messages are shown. The new balances come from the server, and `pusoy:wallet` plus
    `wallet.updated` keep the lobby wallets in step.
- **Server** (`App\Services\Wallet\KeyExchangeService`), all in one DB transaction:
  - It locks the player and the Keys wallet and re-checks the Keys balance.
  - It moves Keys out of the Keys wallet and Gold into the Gold wallet: two ledger rows, `KEY_EXCHANGE`, with
    deterministic idempotency keys.
  - It writes `key_exchanges` (player, package, Keys, Gold, both transactions, status, time) and an audit entry
    `shop.key_exchange`.
  - Any failure rolls everything back. The same idempotency key returns the first result (200) and never deducts
    twice.
- **Refusals:** too few Keys is refused (422 `insufficient_keys`) and logged as a `rejected` row with nothing moved.
  Players only, and blocked during Agents/Players or Full maintenance.
- **Policy:** there is no refund and no Gold → Keys path. Gold received this way is ordinary Single Player Gold.
- Migration `2026_11_25_140000_create_key_exchanges_table`.
- Tests: `tests/Feature/ShopKeyExchangeTest.php`, `mobile/src/components/lobby/ShopModal.test.tsx`.

## Shop now exchanges Keys for Chips (was Gold)

- Packages: 1 Key → 5 Chips, 2 → 10, 5 → 25, 10 → 50 (`config('pusoy.shop.key_packages')`, key `chips`).
- `KeyExchangeService` moves Keys out and Chips into the player's Chips wallet in one transaction (two
  `KEY_EXCHANGE` ledger rows, KY and CH). The rest is unchanged: idempotent, final, logged and audited.
- `key_exchanges` columns are now currency-neutral: `reward_amount`, `reward_currency`, `reward_transaction_id`
  (migration `2026_11_25_150000_shop_exchanges_reward_chips`). Earlier exchanges keep `reward_currency = GD`, so
  the history still shows them as Gold.
- API: `GET /shop` returns `packages[].chips`, `balances.chips` and `history[].amount` + `currency`. The pop-up
  shows Chips icons and wording, and its notice and confirmation say Chips can't be converted back into Keys.
- Keys are still loaded only by a Super Admin, so the Chips that can enter through the Shop are capped by the Keys
  issued.

## Silver Agent removed

- **Hierarchy now:** Super Admin / Administrator → **Incorporator** → **Master Agent** → Players.
  - Admins create Incorporators.
  - Incorporators create Master Agents and Players.
  - Master Agents create Players only: no Agent Registration Link, and no "My Agents" list in their panel.
  - Earlier sections of this file that mention Silver Agents describe the old hierarchy.
- **Removed in code:** `AgentLevel::Silver` (`AgentLevel::tryFrom('silver')` is null, so the API can't use it), and
  `Master → recruits()` is now null.
  - `Hierarchy::assertCanCreate` refuses agents from Master Agents for every path: links, approval and direct creation.
  - Request validators no longer accept `silver` (account / level filters).
  - Commission level rates are Incorporator and Master Agent only; the overview counts and the panel/menu logic for
    the silver level are gone.
  - On the web: level pickers, the commission rates form, overview tiles, the panel name and maintenance / reset
    texts. The Employees list's Loader pill now has its own `loader` style.
- **Migration** `2026_11_25_160000_remove_silver_agent_level`: every Silver Agent becomes a **Master Agent** under
  the Incorporator above its old Master Agent (`agents.parent_agent_id` and `users.sponsor_id` updated).
  - Unchanged: login, wallets and balances, all ledger and commission history, and its players (`agent_players`).
  - Each change gets an audit row (`agent.silver_level_removed`) with the old level, parent and sponsor.
  - The Silver level commission rule is deactivated, not deleted. Existing commission records keep the rate they
    were paid at.
  - Not reversible. Locally `dummysilver` became a Master Agent under `dummyagent`.
- `DummyAgentsSeeder` now builds dummyagent → dummymaster → dummyplayer.
- Tests: `HierarchyTest` (no Silver anywhere, plus the migration keeps players, wallets and history),
  `AdminPanelTest`, `AgentPanelTest`, `TeamTest`, `PlatformAccessTest`, `LoaderAccountTest`.

## Shop: players buy Keys with Chips (5 Chips = 1 Key) + hierarchy revenue sharing

This replaces the earlier Keys → Gold / Keys → Chips direction (the sections above describe that history).

- **Packages** (`config('pusoy.shop')`): 5 Chips → 1 Key, 10 → 2, 25 → 5, 50 → 10. The price is always Keys ×
  `chips_per_key` (5).
- **Revenue sharing** (`shop.revenue_shares`, by the player's direct upline, always 100% in total):

  | Direct upline | Admin | Incorporator | Master Agent |
  |---|---|---|---|
  | Admin | 100% | – | – |
  | Incorporator | 40% | 60% | – |
  | Master Agent | 40% | 10% | 50% |

  - "Admin" is the Super Admin or Administrator who sponsors the Incorporator (or the player, when the player sits
    directly under an Admin).
  - **Finding the Admin:** the Incorporator's sponsor; otherwise the Admin who created the Incorporator
    (\`agents.created_by\` / \`users.created_by\`, for older accounts without a recorded sponsor); otherwise the platform's
    Super Admin (first active). So the Admin share always reaches an Admin's Chips wallet, never the platform wallet.
    A missing Incorporator's share goes to the Admin.
  - Any rounding remainder goes to the first recipient, so the shares always equal the Chips paid.
  - Shares go into each recipient's **Chips wallet** (the Allocation / "My Chips" wallet staff and agents load from),
    never a Keys wallet.
- **Server** (`KeyExchangeService::exchange`), one DB transaction:
  1. Lock the player and their Chips wallet; check the player, package, frozen wallet and balance (insufficient →
     422 `insufficient_chips`, logged as rejected, nobody earns).
  2. Snapshot the hierarchy, then move one ledger row per share (`KEY_EXCHANGE`) from the player's Chips wallet
     into each recipient's Chips wallet.
  3. Credit the Keys (`KEY_EXCHANGE`, KY).
  4. Write `key_exchanges` (player id and username, Chips, Keys, direct upline, scenario, hierarchy path, status, time)
     and one `key_exchange_shares` row per recipient (role, percent, amount, Chips wallet, ledger transaction).
  5. Audit `shop.chips_to_keys`.

  Idempotency keys stop double clicks and retries from moving anything twice (200 instead of 201). Any failure rolls
  everything back. Balances can't go negative. Players only, and not during maintenance.
- **Migration** `2026_11_25_170000_chips_to_keys_exchange` (new columns and the `key_exchange_shares` table).
  Earlier exchanges are kept as `direction = keys_out` and still show in the history the old way.
- **Pop-up:**
  - It shows "5 Chips = 1 Key", your Chips and Keys, and cards with Keys to receive, "= N Chips" and "BUY · N CHIPS"
    ("NEED N CHIPS" when short).
  - The confirmation says "Pay N CHIPS → get M KEYS", with Chips after, Keys after and the final, non-refundable
    acknowledgement.
  - The notice says Chips spent are non-refundable and Keys can't go back into Chips.
- Tests: `tests/Feature/ShopKeyExchangeTest.php` (all three scenarios, refusals, double clicks, maintenance,
  reconciliation), `mobile/src/components/lobby/ShopModal.test.tsx`.

### Fix: Admin shares that went to the platform wallet

Older Incorporators (e.g. `agent`, `agent2`) had no recorded sponsor, so the first version paid the Admin's 40%
into the platform's Chips wallet. Migration `2026_11_25_180000_move_platform_shop_shares_to_admin` moves every such
share to the right Admin's Chips wallet with a new `KEY_EXCHANGE` ledger entry (the original is kept). It also
re-points the share row, adds the Admin to the exchange's hierarchy snapshot and audits `shop.share_moved_to_admin`.
Locally, 4 shares (12 Chips) moved to `superadmin`.

### Choosing an Incorporator's Admin: `pusoy:assign-admin`

```
php artisan pusoy:assign-admin <incorporator> <admin> [--move-shop-shares]
```

- Makes the Admin (Super Admin or Administrator) the Incorporator's sponsor (audited `agent.admin_assigned`). From
  then on its players' Shop purchases pay the Admin share to that Admin.
- `--move-shop-shares` also moves Admin shares already paid for that Incorporator's players to a different Admin.
  Each move is a new `KEY_EXCHANGE` ledger entry from the old Admin's Chips to the new Admin's (the original is
  kept). The share row and hierarchy snapshot are updated and audited (`shop.share_moved_to_admin`).
  - Re-running moves nothing twice.
  - A share is skipped with a warning if the old Admin no longer has those Chips.
- Locally: `agent` and `agent2` were put under the Administrator `admin`. 5 shares (16 Chips) moved from
  `superadmin` to `admin`.

## Overview: commission conversion removed; Share Amount feature retired

- **"Convert Commission to Wallet" is gone** from the Overview of the Admin, Incorporator and Master Agent panels.
  `Components/AdminPanel/TeamSections.tsx` renders only Team Overview and no longer calls `/commission/wallet`.
- **The conversion API is disabled:** the `POST /commission/convert` route, `TeamController::convert` and
  `TeamService::convert` are removed (404).
  - `GET /commission/wallet` stays, read only.
  - Commission records and balances, Commission Logs, Commission Withdrawal and revenue sharing are unchanged.
  - Past `COMMISSION_CONVERSION` entries stay as history.
- **"Convert to Chips" / Share Amount** (never committed) is retired; Shop revenue shares are paid into Chips wallets.
  - Migration `2026_11_26_120000_retire_share_wallets` handles databases that ran it (local development only).
  - It moves any Share wallet balance into the same person's Chips wallet through the ledger (audit
    `share.retired_to_chips`), drops `share_conversions` and removes the deleted migration's record. Elsewhere it
    does nothing.
  - `WalletType::Share` and `TransactionType::ShareConversion` remain as history-only values so old rows still
    load.
  - Locally `admin` received 2.00 and `agent` 6.00 Chips.
- Tests: `TeamSections.test.tsx`, `TeamTest` (route gone, commission untouched), `MaintenanceTest` (uses commission
  withdrawal requests instead).

## Overview cards: Total Revenue and the two-column layout

- The Admin, Incorporator and Master Agent Overview now shows six cards, two per row on desktop and stacked on small
  screens:

  | Left | Right |
  |---|---|
  | My Total Chips Amount | **Total Revenue** |
  | Total Active Agents | Total Active Players |
  | Total Player Wallets | Total Agent Wallets |

  The Team Overview panel's two figures became the last two cards. `TeamSections.tsx` was removed.
- **Total Revenue** comes from `TeamService::overview` (`GET /team/overview`), reusing its downline scope.
  - It is the Chips paid in completed Shop exchanges (Chips → Keys, `key_exchanges`) by the players in the user's
    scope: every player for a Super Admin, the user's downline otherwise. Refused attempts don't count.
  - The card's footer shows "Your share": what those exchanges paid this user (`key_exchange_shares`).
  - The cards refresh live with the panel (`panel.updated` from wallet changes) and show "—" if the figures can't load.
- Active agent / player counts and wallet totals keep their existing logic. For an Administrator the agent / player
  counts are platform-wide, as before, while wallet totals and revenue cover their own downline.
- Test: `TeamTest` (revenue per scope, shares, refused attempts excluded).

### Master Agent Overview: no downline-agents or agent-wallet cards

- The Master Agent panel's Overview no longer shows **My Downline Agents** or **Total Agent Wallets**. Master Agents
  recruit no agents. Its cards are My Total Chips | Total Revenue, then My Active Players | Total Player Wallets
  (2 × 2, no gaps).
- This is display only (`Overview.tsx`, `panel.level === 'master'`). The Admin and Incorporator panels, the hierarchy,
  agent management, wallet records and the APIs are unchanged.

## Admin Overview: Player Registration Link

- Admins (Super Admin and Administrator) now have a **Player Registration Link** on the Overview, next to the
  Incorporator link. The rule is `Hierarchy::canRegisterPlayersByLink()`: Admins and every agent level. Creating
  players directly from the staff API is still agents-only (`canCreatePlayers`).
- The link is permanent: it uses the account's one `users.referral_code`, created once by `ReferralService::codeFor`
  and never regenerated when the Overview loads. URL: `/register/player?ref=<code>`.
- Registration follows the usual rules: the account is created **pending** with `sponsor_id` = the Admin, and goes
  through approval. On approval the player sits directly under the Admin. No `agent_players` row is made, because
  there is no agent.
- Tracking: `links.player_registrations` counts the players who registered through the account's link (pending,
  active or later blocked). The card shows it under the URL.
- Card (`CopyLink` with `shareable` and `concealable`, in `kit.tsx`):
  - The URL is masked by default; View / Hide toggles the full URL.
  - Copy uses the clipboard.
  - Share opens the device share sheet (`navigator.share`) and falls back to copying.
  - The buttons wrap under the field on narrow screens.
  - The same card is used for the agents' Player link.
- Tests: `AdminPanelTest` (permanent link, pending, then approved under the Admin, the count) and `HierarchyTest`
  (links and registrations per role).

## Overview: Self Convert Revenue to Chips

- **Where:** the Admin, Incorporator and Master Agent Overview. A centered icon and label sit directly under the
  registration links (`Components/AdminPanel/RevenueConvert.tsx`).
- **The confirmation shows:**
  - Current Total Revenue: every Shop share ever earned, including Revenue already converted.
  - Available Revenue for Conversion.
  - Current My Total Chips Amount.
  - The conversion rate.
  - Total Chips to Receive.
- **Confirm Conversion** converts the whole available Revenue. There is no amount field. With no Revenue the
  Confirm button is disabled and a message explains why.
- **Revenue balance:** Shop revenue shares (`KeyExchangeService`) are now paid into each recipient's **Revenue
  wallet**: `WalletType::Share`, Chips currency, one per account. They no longer go straight into Chips.
  - Shares paid before this change are already in Chips and are not convertible again.
  - The platform's share of a missing recipient still goes to the platform wallet.
- **Rate:** `config('pusoy.revenue_conversion.rate_bps')`, env `REVENUE_TO_CHIPS_RATE_BPS`. The default is 10000,
  meaning 1 Revenue = 1 Chip.
- **Server (`RevenueConversionService`, `GET /api/v1/revenue`, `POST /api/v1/revenue/convert {request_id}`):**
  - Routes are limited to `super_admin`, `admin` and `agent`, and the service checks the role again. Players,
    Loader Accounts and guests are refused. Each account converts only its own Revenue.
  - Everything runs in one database transaction. The user row and both wallets are locked, the whole Revenue is
    debited, the Chips are credited (`TransactionType::RevenueConversion`) and a `revenue_conversions` row is
    written. Any failure rolls everything back.
  - A 1:1 rate is a single ledger transfer. Any other rate burns the Revenue and mints the Chips, so the ledger
    still reconciles.
  - Idempotent per (user, `request_id`): a double click returns the first conversion. Once Revenue is converted it
    has left the Revenue wallet, so it can't be converted twice.
  - The service respects maintenance mode and writes an audit entry (`revenue.converted`).
- **Record (`revenue_conversions`):**
  - reference (`RV…`), account, role and agent level
  - Revenue converted, rate, Chips credited
  - Revenue and Chips balances before and after
  - status and timestamps
- **Overview after a conversion:**
  - A success toast shows the Revenue converted and the Chips credited.
  - The cards refresh, and live through `panel.updated`.
  - The new **Revenue Conversions** tab in Recent Transactions lists the latest conversions, with a detail view.
- `pusoy:assign-admin --move-shop-shares` now moves a share out of the wallet it was paid into: Revenue for new
  shares, Chips for older ones.
- **Tests:** `RevenueConversionTest` covers:
  - full conversion and the record
  - each role converting its own Revenue
  - no Revenue, double clicks, a client-sent amount being ignored
  - access and maintenance
  - a rate other than 1:1
  - rollback on failure

  `ShopKeyExchangeTest` now checks that shares land in the Revenue wallet.
- **Deploy:** run `php artisan migrate --force`, which creates `revenue_conversions`, then rebuild the web assets.

## Overview: Total Revenue and Available Revenue cards

- On the Admin, Incorporator and Master Agent Overview the order is:
  1. the registration links
  2. Self Convert Revenue to Chips, centered
  3. **Total Revenue** and **Available Revenue**, side by side (stacked on small screens)

  The Total Revenue card left the top card grid.
- Both cards show the account's **own** figures, for every role. This was the user's choice: an Incorporator or
  Master Agent never sees or converts the Admin's revenue. The figures come from `GET /api/v1/revenue`
  (`RevenueConversionService::summary`), and the cards refresh live.
  - **Total Revenue** (`total_revenue`) is every Shop share the account has ever earned (`key_exchange_shares` of
    completed exchanges), including shares paid into Chips before the Revenue wallet existed. It is cumulative, and
    a conversion never reduces it. Its footer still shows the Shop sales of the user's scope (`team/overview`).
  - **Available Revenue** (`available_revenue`) is the account's Revenue wallet: what Self Convert can still move
    into Chips. It drops to 0 after a conversion. Its footer shows the total already converted and the rate.
- Test: `RevenueConversionTest` checks that Total Revenue is unchanged after conversions, Available Revenue drops
  to 0, and each role sees only its own figures.

## Self Convert Revenue to Chips: amount-based conversion (minimum 20)

- This replaces the earlier whole-balance conversion. The modal (`RevenueConvert.tsx`) shows:
  - **Available Revenue**, with My Total Chips and the rate.
  - An **Amount to Convert** field (numbers only), with a "Use all" shortcut and a live "You will receive N Chips"
    hint.
  - **Cancel** and **Confirm Conversion** buttons, with icons.
- Confirm stays disabled until the amount is valid:
  - a number with at most 2 decimals
  - at least **20** (`pusoy.revenue_conversion.min_amount`)
  - at most the Available Revenue

  An invalid amount shows a clear message under the field. While a conversion is processing, the button shows a
  spinner. Errors appear in the modal; success shows a toast.
- **API:** `POST /api/v1/revenue/convert {amount, request_id}`.
  - The server checks the amount again against the locked Revenue wallet:
    - `below_minimum` (422)
    - `insufficient_revenue` (422)
    - a badly formed amount gives a validation error
  - The same request id returns the first conversion, so a double click can't pay twice. A refused request gets a
    new id in the modal so it can be retried.
  - `GET /api/v1/revenue` now also returns `min_amount`, and `can_convert` is true only when Available Revenue is
    at least the minimum.
- **Records:** `revenue_conversions.revenue_before` is the Revenue balance before the conversion; `revenue_after`
  is the balance left after it. The ledger, audit log, rollback and live refresh are unchanged. Total Revenue
  stays cumulative.
- **Tests:**
  - `RevenueConversionTest`, 7 tests: partial amount, minimum and maximum, bad input, double clicks, roles and
    access, maintenance, rate, rollback.
  - `RevenueConvert.test.ts`: the modal's validation.

## Commission and revenue-sharing rates: Administrator only

- Only the **Administrator** sets rates: a Super Admin, or an Administrator with the `manage_commissions` ability.
  Incorporators, Master Agents, players and Loader Accounts can never change a rate.
  - **UI:** the Agent Panel's Commission Logs page no longer shows any rate settings, only the commission history.
    Admins without the ability see the rates read-only.
  - **Server:**
    - The rate routes are staff-only (`can:staff`) and each service checks again.
    - Shop revenue-sharing rates: `ShopRevenueShares::canEdit`.
    - Game commission level rates: `CommissionService::setLevelRates`.
    - Per-agent rate and commission rules: `PanelController::setAccountRate`, `CommissionController::storeRule`.
- **Shop revenue-sharing rates for key purchases are now managed by the Administrator.** They used to be fixed in
  `config/pusoy.php`.
  - Admin Panel → Commission Logs → **Shop Revenue Sharing (Key Purchases)** edits the percent for each role in
    each scenario:
    - player under an Admin: Admin 100%, locked
    - player under an Incorporator: Admin / Incorporator
    - player under a Master Agent: Admin / Incorporator / Master Agent
  - Every scenario must total exactly 100%. Rates go from 0% to 100% with up to 2 decimals.
  - API: `GET` / `PUT /api/v1/admin/panel/shop-shares` with `{rates: {scenario: {role: percent}}}`.
  - Storage: `system_settings` key `shop.revenue_shares`, in basis points. Each save is written to the audit log
    (`shop.revenue_shares`). Until the first save, the config values are the defaults.
  - `KeyExchangeService` reads the current rates for each purchase. They apply to **future** purchases only; past
    exchanges keep their own `key_exchange_shares.percent_bps`.
- Tests: `ShopRevenueSharesTest`:
  - saving applies only to new purchases
  - totals and validation
  - every non-Admin role is refused on every rate endpoint
  - an Administrator needs `manage_commissions`

## Revenue Logs and Revenue Commission Withdrawal (replace Commission Logs / Commission Withdrawal)

- In the Admin, Incorporator and Master Agent panels, **Commission Logs** and **Commission Withdrawal** were
  removed: their menu items, web pages (`/admin|agent/commission-logs`, `/commission-withdrawals`, now 404) and
  the Agent Panel's `commission-logs` / `withdrawals` API.
  - All existing commission and withdrawal records stay in the database.
  - The Administrators' commission API and the Loader Panel's Commission Transactions pages are unchanged.
- **Revenue Logs** (`/admin|agent/revenue-logs`, API `GET …/panel/revenue-logs`) is a read-only history of
  **completed Shop Buy-Ins only**: `key_exchanges` with direction `chips_to_keys` and status `completed`.
  - Each row shows:
    - Transaction ID (`SB` + id)
    - player username and ID
    - upline (Master Agent → Incorporator → Admin, from the hierarchy snapshot stored with the purchase)
    - Buy-In in Chips, Keys purchased, payment method (Chips)
    - date and time, status
  - No commission percentages. Refused attempts, conversions, withdrawals and other wallet entries never appear.
- **Revenue Commission Withdrawal** (`/admin|agent/revenue-withdrawals`, API `GET …/panel/revenue-conversions`) is
  a read-only history of **completed Self Convert Revenue to Chips** (`revenue_conversions`).
  - Each row shows: Conversion ID (`RV…`), account username and ID, role (Admin / Incorporator / Master Agent),
    Revenue converted, date and time, status, and the ledger reference number (`TX…`).
  - It has no request, approve, reject or payment actions, and no write routes.
- **Filters:**
  - search: player, ID, upline or transaction ID; or account, ID or reference
  - From / To dates, in the viewer's timezone (`tz`)
  - status (Revenue Logs) or role (conversions)
  - sort: newest, oldest, highest or lowest amount
  - pagination

  Both pages show summary totals, an empty state, a loading state and an error message with retry.
- **Scope** (shared trait `RevenueHistoryEndpoints`; the Agent Panel overrides the scope hooks):
  - The Admin Panel sees the whole platform.
  - An Incorporator or Master Agent sees Buy-Ins by the players in its downline, and conversions by itself and the
    agents below it.
  - Agents get 403 on the Admin endpoints, and players get 403 on both.
- The Overview's Recent Transactions tabs are now **Load Logs · Revenue Logs · Revenue Commission Withdrawal**, the
  latest 5 from the same endpoints.
- The rate settings that lived on Commission Logs moved to a new Admin-only page, **Revenue Sharing Rates**
  (`/admin/revenue-rates`): Shop revenue sharing and game commission rates. The Agent Panel has no such page.
- Tests: `RevenueHistoryTest` (strict separation, filters, sorting, hierarchy scoping, access, read-only), plus
  `WebPagesTest` and `AgentPanelTest` updated for the removed pages.

## Create Lobby: entry tiers, Keys fee, Round Bank only

- **Tiers** (`config('pusoy.lobby.tiers')`, enforced by `LobbyEntryService`):

  | Minimum Entry | Allowed bets | Keys fee |
  |---|---|---|
  | 100 Chips | 5 / 10 / 15 | 1 Key |
  | 500 Chips | 20 / 30 / 40 | 2 Keys |
  | 1,000 Chips | 50 / 75 / 100 | 5 Keys |

  - The 250 and 2,000 Chip entries are gone, along with the old bets-as-a-percentage rule for new lobbies.
  - The bets and Keys fee are stored on each lobby (`game_rooms.bet_options`, `entry_keys`), so a later config
    change never alters an existing lobby. Older lobbies keep their percentage bets and have no Keys fee.
- **Round Bank only:** `POST /lobbies` accepts only `game_mode=round_bank` (or none); `banker` is refused. Existing
  Banker Mode tables still run with their old rules.
- **Selected bet** (`game_players.selected_bet`):
  - It is chosen on create, on join (`bet`), or later with `POST /lobbies/{room}/bet` before the countdown, which
    withdraws your Start.
  - Quick Join uses the lobby's smallest bet and skips lobbies whose Chips or Keys you lack.
  - A player needs Chips ≥ the Minimum Entry and ≥ **2× the selected bet**, plus Keys ≥ the fee.
  - These are checked on create, join, Quick Join, bet change and Start, and again with wallets locked right
    before the game starts. If anyone fails, the countdown is cancelled (`requirements_not_met`, with who and
    why), nobody pays, and Start then reports the reason.
  - In-game, a player who no longer covers 2× their bet sits the round out. An auto-bet uses the selected bet.
- **Keys fee** (`LOBBY_ENTRY_FEE`):
  - It is deducted from all four players in the same transaction that starts the game, into the platform Keys
    wallet: once per player and table (`lobby-keys:{table}:{user}`), never on join.
  - If the match ends before any round is completed, every fee is refunded once (`LOBBY_ENTRY_REFUND`). After a
    completed round there is no refund.
  - Both are written to the ledger and the audit log.
- **Banker (Round Bank):** 12 rounds, rotating clockwise and skipping players below 6× the maximum bet; the
  previous banker is checked last. Each round's history records the order, the checks and the banker.
  - New: when nobody qualifies, the match **pauses** instead of ending. The table gets `paused_at` /
    `pause_reason`, `match.paused` is sent, and the game state's `table.paused` carries a message.
  - It retries every `pause_retry_seconds` (15) and resumes (`match.resumed`) as soon as someone qualifies. It
    ends with `no_eligible_banker` after `pause_timeout_seconds` (300).
- **Mobile:**
  - Create Lobby shows the three tiers with their Keys, Round Bank as a fixed label, a "Your Bet" picker and an
    entry summary (Minimum Entry, bet, required wallet, Keys fee and when it is deducted, your Chips and Keys).
  - Join opens a "Join Lobby" confirmation with the bet picker, the same summary and the password for private
    lobbies. Confirm Join is disabled until you qualify.
  - The waiting room shows the bets, Keys fee and "Your Bet" (changeable before the countdown) with its
    requirement.
  - The game table shows a "Game paused — no eligible banker" banner.
- Tests: `LobbyEntryTest` (tiers, invalid tier and bet combinations, 2× rule, Keys checks, a single deduction at
  start, no start on failing requirements, refund, bet change, Quick Join), and `MultiplayerMatchTest` (pause,
  resume, timeout). The lobby tests and the mobile Create Lobby, Lobby and Choose Your Seat tests were updated.
- **Deploy:** run `php artisan migrate --force`, then rebuild the mobile app.

## Create Lobby popup: compact, no bet; bets chosen in the game

- **The Create Lobby popup is compact** (`Modal compact`: 820 px wide, at most 780 px tall on the 1600×900 stage).
  - Smaller padding, rows and inputs.
  - The fields scroll inside the popup while the title and the Cancel / Create buttons stay visible, so it never
    runs off the screen.
  - A small box explains the tier: its in-game bets (chosen each round, hold 2× your bet), the Keys fee and when
    it is deducted, and your Chips and Keys.
- **"Your Bet" was removed** from Create Lobby, along with its state and handlers. `POST /lobbies` no longer
  accepts `bet`; a sent one is ignored. The creator's wallet is checked against the tier's smallest bet.
- **Bets happen in the game, each round**, from the tier's chips only:
  - 100 Chips → 5 / 10 / 15
  - 500 → 20 / 30 / 40
  - 1,000 → 50 / 75 / 100

  The chips come from the round's server config (`bet_chips`, stored on the lobby). There is no custom amount.
- **On the table:** a chip your Chips cannot cover twice is disabled, with "Needs N Chips (2× the bet)". With less
  than 2× the smallest chip, it says what is needed.
- **Server** (`BankerMatchService::placeBet`, `POST /games/{session}/bet`):
  - It rejects any amount that is not one of the tier's chips (`invalid_bet`).
  - It locks and checks the wallet against 2× the bet (`insufficient_balance`).
  - It accepts one bet per round (`already_bet`), so a double tap or retry never holds Chips twice. The bet and
    its holds are recorded in the ledger.
- Lobbies created before the tiers keep their own chips. Active games are untouched.
- Tests:
  - `LobbyEntryTest`: every tier in the actual game through the API (allowed and refused amounts, the 2× wallet,
    a single hold).
  - `MultiplayerTable.test`: the 500-tier chips, chips disabled when the wallet is too low.
  - `CreateLobbyModal.test`: no bet field, tier rules shown, request without a bet.

## New playing-card design

- `CardArt.tsx` was redrawn; the same file is used in both apps (`mobile/src/components/` and
  `resources/js/Components/`, kept identical). Its exports, props and every caller are unchanged: the table,
  arrangement popup, deal and reveal animations, and lobby art.
  - **Faces:** a white card in a thick gold frame with a fine inner line and gold flourishes in all four
    corners. A large bold serif rank (Times New Roman, even digits) sits over a large suit symbol; hearts and
    diamonds are red, spades and clubs black. Every rank uses the same layout. The old pips, Ace emblem and
    J / Q / K portraits were removed.
  - **Back:** black with a gold quilted diamond lattice, a gold double frame with corner scrolls, a crown in a
    gold medallion inside a laurel wreath, and gold fleurs-de-lis above and below. This replaces the red back.
- The card wrappers (`PlayingCard`, `TableArt`, `DealAnimation`, lobby fan) now use a white or black base and
  the new corner radius (`rounded-[9%/6.5%]`), so no old colour shows at the corners.
- The laurel positions are rounded to 2 decimals, so server and browser render the same numbers (no hydration
  mismatch).

## Game table redesign (Single Player and Multiplayer)

- **One shared layout** for both modes (mobile `components/table/TableLayout.tsx`, 1600×900 stage), following the
  reference image:
  - **Opponents:** top (avatar left of the panel), left (avatar on the far left) and right (avatar on the far
    right).
  - **You:** bottom centre, with your avatar inside a red-and-gold panel.
  - **Centre:** the PUSOY 553 crest with crown and laurels, the **ROUND X / 12** badge (it pops on change) and a
    one-line status. The status hides during the reveal show.
  - **Top HUD:** Back, Settings, Help, logo, Total Gold or Chips, Bet or Covering, Round and banker, match /
    room. **Bottom right:** Skip (reveal show) and Sort (Single Player). These are unchanged.
- **`HandPanel`:** an emerald panel with a gold border (red for you) holding three rows: Front 3 · Middle 5 ·
  Back 5.
  - **Before the deal:** faint slots.
  - **Once dealt:** card backs (other players' cards stay private).
  - **After the engine reveals:** the real cards, each lane's hand rank (`RankPill`) and WIN / LOSE / TIE vs the
    banker (`OutcomePill`). Lucky Hand and Misplaced tags appear under the rows.
  - In Single Player the cards flip at their moment of the reveal show (`isUp` / `laneShown`), with the zap shake
    on misplaced lanes.
- **Banker:** the banker's panel and avatar glow gold with a crowned BANKER tag. When you bank, the large
  **BANKER (YOU)** ribbon with crown and laurels sits above your panel (`BankerRibbon`). All of this comes from
  the round's banker (server rotation).
- **Statuses** come from the game state, under each name: Betting / Bet N / Covering, Arranging, ✓ Ready /
  Submitted, round and match net, Offline, Can't bank.
- **Your panel's content:**
  - **Betting:** the tier's chips (Multiplayer: 5/10/15, 20/30/40, 50/75/100; disabled below 2× the bet), or Deal
    when you bank.
  - **Arranging:** your 13 cards when the popup is closed (Single Player); the arrangement popup itself is
    unchanged.
  - **After the reveal:** your hand. In Single Player the next round's chips or Deal (and Results at the end) sit
    in a tray beside it.
- **Multiplayer** places the real players clockwise from you (left, top, right); an empty seat shows "Empty".
  **Single Player** keeps LuckyBot left, CardBot top, AceBot right.
- No engine change: dealing, shuffling, bots, private cards, banker rotation, ranking, scoring, payouts and every
  action still come from the server.
- Removed the old `SeatTile`, `Revealed` / `RevealedHand`, the face-down stacks and the old centre text.
- Verified locally:
  - Single Player: Beginner round, deal, arrange, reveal, results, next bet.
  - Multiplayer: four players, private backs, Ready, reveal with WIN / LOSE, nets.
- The Laravel web app's own player table (`resources/js/Pages/Player/Table`) was not changed.

## Home wallets: information only; Keys (+) opens the Shop

- The Gold, Chips and Keys bars on Home (`WalletStack`) are now plain display groups, not buttons: no tap action,
  no pointer cursor, no press animation, and they no longer open the wallet page. They still update live (server
  balances, `pusoy:wallet`).
- The only control is the green **(+) inside the Keys bar** (`Buy Keys in the Shop`). It opens the existing
  **Shop** popup (`ShopModal`, the same one as the Shop tile), with its packages, prices, confirmation,
  idempotency key (no duplicate purchases), success or error message and live balances.
- The old "Get Keys" info panel is no longer opened from Home (`GetKeysPanel` is still in `LobbyPanels.tsx`).
- Test: `home/page.test.tsx` checks that only the Keys (+) is a button, that tapping the bars does nothing, and
  that the (+) opens the Shop.

## Multiplayer Lobby: Leave button, Shop, no Ranking / Rewards / Chips (+)

- **Chips balance** in the lobby's top bar is display only. The (+) link to the wallet was removed; balances
  still update live.
- **Sidebar:** Ranking and Rewards were removed from this lobby (the leaderboard and wallet pages still exist).
  **Shop** sits directly below Friends and opens the existing `ShopModal`, with its packages, confirmation,
  idempotent purchase, feedback and live balances.
- **Leave Multiplayer Lobby** (door icon, text, arrow) replaces the back arrow and goes to Home:
  - Not seated in a lobby, or seated in a match already in progress: goes straight Home. A running match is
    never abandoned from here; Home brings you back to it.
  - Seated in a lobby that has not started: a **Leave Lobby?** confirmation says what happens (the lobby closes
    when you were the only player; otherwise the others are told live and, if you owned it, ownership passes
    on). **Stay** keeps you seated. **Leave Lobby** calls `POST /tables/{id}/leave`, the same server rules as the
    waiting room's Leave, with live updates to the other players. Then it goes Home.
- Tests: `lobby/page.test.tsx` covers Chips display only, no Ranking / Rewards, Shop below Friends opening the
  Shop, Leave going Home, and the confirmation with Stay / Leave calling the server.

## Web Settings: Signed-in Devices removed

- The web app's Settings page (`resources/js/Pages/Account/Settings.tsx`, shared by every web role) no longer has
  the "Signed-in mobile devices" card. Its device list, Sign out button, data loading and Device type were
  removed; the page keeps Appearance (dark mode, time zone) and its layout.
- The section had no route or menu item of its own, so nothing else is reachable.
- The device API (`/api/v1/auth/devices…`) stays: the mobile app's own Settings → Devices screen and push
  notifications still use it.

## Players can sign in to the Web App

- `PlatformAccess::allowsWeb()` now allows every role. Players sign in at `/` (POST `/login`) with their username
  and password and land on the **player dashboard** (`/dashboard`).
  - The dashboard shows Chips, Gold, games played and total score; the menu has Game Lobby, Game Rooms, Game
    History, Leaderboard, Wallet, Transactions, Notifications, Profile and Settings.
  - Logout invalidates the session and returns to the login page.
- **Unchanged checks:**
  - wrong credentials ("The provided credentials do not match our records.")
  - pending / suspended / banned / archived accounts
  - the Admin "player sign-in" switch, which now also applies to the web sign-in
  - the session is regenerated on login, and `last_login_at` is recorded
  - throttling on `/login`
- Players can never reach the Admin, Incorporator / Master Agent or Loader panels. The pages and their APIs answer
  403 through the `staff` / `agent` / `loader` gates, and the services check again.
- The Mobile Game is unchanged: players only. Staff and agents remain web only.
- The registration message now says players can sign in on the web or in the app.
- Revenue Logs search: `SB…` searches a transaction ID; a plain number searches a player ID (it used to match both).
- Tests: `PlatformAccessTest`:
  - the login matrix
  - player web login, dashboard and logout
  - wrong / pending credentials
  - panels refused for players
  - the switch applies to the web

  `RevenueHistoryTest` now uses a fixed admin username so the numeric search test is deterministic.

## Join Lobby: no bet choice

- The **Join Lobby** popup (mobile `lobby/page.tsx`, `JoinLobbyModal`) no longer has "Choose Your Bet" or its bet
  buttons. It shows the lobby, a requirements box and, for a private lobby, the password, with Cancel / Confirm
  Join.
  - The requirements box (`EntryTerms`) lists: Minimum Entry, In-game bets (e.g. 20 / 30 / 40), your Chips, the
    Key Entry Fee, your Keys, and a note that the bet is chosen in the game each round and the Keys are deducted
    when the game starts.
- Confirm Join sends no bet. The server checks the Minimum Entry and Keys as before and records the tier's
  smallest bet, as for the creator.
- `BetPicker` was removed: neither Create nor Join uses it any more.
- Bets are placed in the game each round, from the tier's chips only (5/10/15, 20/30/40, 50/75/100). The server
  enforces those amounts and 2× the bet. Unchanged.
- The waiting room still has its "Your Bet" chips; unchanged.
- Test: `lobby/page.test.tsx`: no bet buttons, requirements shown, join request without a bet.

## Betting timeout: automatic minimum bet (AUTO / MANUAL)

- When the betting timer runs out (`CloseBetting` job at the deadline, plus the `pusoy:sweep` fallback; the
  server decides, never the browser), every participant who has not bet gets the **minimum bet of the table's
  entry tier**: 100 Chips → 5, 500 → 20, 1,000 → 50. Before this it used the waiting-room bet. The player is
  dealt in and plays the round normally.
- **Same checks as a manual bet:**
  - 2× the bet in Chips (wallet locked)
  - the banker can cover it
  - only the tier's chips
- **Exactly once:** the round row is locked, a player can only have one bet per round, and the ledger
  idempotency keys are per player and round. Firing the timeout again, or a late manual tap, changes nothing:
  manual bets after the deadline are refused with `betting_closed`.
- **Recorded as AUTO:**
  - `game_bets.is_auto`
  - ledger metadata `bet_type: AUTO|MANUAL`, with the round, table, amount and time, and a reason starting
    "Auto-bet (time expired)"
  - the `player.bet` event, and the game state: `my_bet_type`, each player's `bet_type`
- **Cannot afford the minimum:** no bet is placed, and the player sits that round out (as before). The reason is
  kept with the round (`config.auto_bet_skipped`), sent to the player (`bet.auto_skipped`) and shown in the game
  state (`my_auto_bet_skipped`).
- Players who are offline at the deadline are still not auto-bet (unchanged; the missed-rounds rule applies).
- **Mobile table:**
  - a one-time notice per round: "Time expired — minimum bet of N chips automatically placed." (or "Time
    expired — no automatic bet: …")
  - "(auto)" on the bet pill, your panel, the arrangement popup and other players' seat status
- Tests: `LobbyEntryTest` (all three tiers, manual vs auto, a late tap, a duplicate timeout, ledger and state,
  the can't-afford case) and `MultiplayerTable.test` (notice, "(auto)", the skipped message).

## One active login per Player account

- Enforced on the server by `App\Services\Users\PlayerSessions`, which is called by both sign-ins before access is
  granted: the Mobile Game API (`POST /api/v1/auth/login`, app tokens) and the Web App (`POST /login`, browser
  sessions). It covers every device, browser and tab. Staff and agents are not affected.
- **Active session:** an app token or browser session (database sessions) used within
  `pusoy.sessions.active_minutes` (env `PLAYER_SESSION_ACTIVE_MINUTES`, default 15).
- **Signing in while another session is active (a duplicate):**
  - Every session of the account is signed out, the new attempt included. All app tokens (and their
    `user_devices` rows) are deleted and all browser sessions removed.
  - The sign-in is refused: API 409 `account_already_connected`; web: a `session` error.
  - Open apps are told at once with `account.disconnected` on the player's private channel.
  - It is audited (`player.sessions_disconnected`).
  - The player then signs in again. Nothing is active any more, so that works, and becomes the only session.
  - A third login during an active session triggers the same thing again.
- **Only stale sessions** (e.g. an old phone that never logged out): they are revoked quietly, and their next
  request is told "signed in on another device" (`session_replaced`).
- **Every revoked token / browser session is remembered for 24 h** (cache, by token id / session id):
  - its API calls get 401 with `account_already_connected` (or `session_replaced`) and the title and message,
    instead of a bare 401 (exception renderer in `bootstrap/app.php`)
  - its web pages are sent once to the login page with the reason (`NoticeDisconnectedSession` middleware)
- **Popup "Account Already Connected"**, with the exact message:
  - **Mobile:** `components/SessionDisconnected.tsx` in the root layout covers the whole app (no game, wallet or
    lobby actions behind it). It is raised by the API answer (`lib/api` → `pusoy:disconnected`) or by the live
    event; the token is cleared, and "OK — Log in again" goes to the login screen.
  - **Web:** the login page shows the same popup. The web API client sends a disconnected browser back to the
    login page.
- Tests:
  - `PlayerSessionsTest`: a duplicate disconnects both, logging in again works, a third login, stale replacement,
    web vs app, the disconnected browser notice, staff not limited
  - `PlatformAccessTest` (signs out between logins)
  - mobile `api.test` and `SessionDisconnected.test`
- Local check: active in the mobile app, then signing in on the web was refused with the popup. The mobile app's
  next request showed the popup with its token cleared, and logging in again worked.

## Force-ending a table: `php artisan pusoy:terminate-table {table}`

- Ends a table's game immediately and sends its players home. Balances stay exactly as they are:
  - A round in progress is cancelled through `GameEngine::cancel` (now with an optional end reason). Every Chip
    held for that round goes back to its owner (ledger refunds, once per hold); nobody wins or loses it.
    Already-settled rounds stay settled.
  - The match ends with `end_reason = terminated_by_admin`. The lobby closes and nobody is seated any more. A
    table still waiting to start is simply closed.
  - The lobby **Keys entry fee is not refunded** (`--refund-keys` refunds it when no round was completed).
  - Players are told (`table.terminated`, and the table state). It is audited (`table.terminated`). Running it
    again does nothing.
- **Mobile:** a player on that table's game screen sees "This game was ended by the administrator. Any Chips held
  for the round are back in your wallet. Returning to Game Home…" and goes to **Game Home** (`/home/`) after
  about 2.5 s, instead of the match-over sheet.
- Tests: `TerminateTableTest` (mid-round holds returned, Keys untouched, nobody seated, state, audit, idempotent,
  waiting table, unknown table).

## Multiplayer in-game sequence (same as Single Player)

Multiplayer now plays each round in Single Player's order and with its presentation:
Start → Shuffle → Clockwise Deal → Arrange → View → Submit → Reveal → Winner/Loser → Results → Next Round.
Multiplayer keeps its own rules: the server deals, judges and settles, players are human, and betting, timeouts and auto-bets work as before. There is no bot logic.

Server (`BankerMatchService::deal`):
- Cards are dealt the way the animation shows them: one at a time, clockwise round the four seats, starting with the seat after the banker (`Deck::deal($deck, 4, 13, $bankerSeat % 4 + 1)`). Each player keeps their own seat's 13 cards.
- The arranging deadline is `arrangement_seconds + pusoy.banker.deal_animation_seconds` (default 6, env `BANKER_DEAL_ANIMATION_SECONDS`), so the deal animation never uses up arranging time.
- `pusoy.banker.intermission_seconds` now defaults to 14, long enough for the reveal show before the next round.

Mobile (`components/table/MultiplayerTable.tsx`, reusing Single Player's `DealAnimation` and `RevealShow`):
- Seats are seen from you, numbered as in Single Player: 1 you, 2 left, 3 top, 4 right (clockwise).
- **Deal:** when a round reaches ARRANGING, the shuffle and clockwise deal play once (with Skip). Seats stay empty and the status reads "Shuffling and dealing…". The arrangement popup opens only after the deal ends.
- **Reveal:** when the round you were playing is judged (a live ARRANGING/SUBMITTED → REVEALING/COMPLETED change), the cards turn lane by lane. The centre banner shows each lane's result, with the PUSOY! / ARAYYY KOOOO! effects and Skip. Net results and winner glow appear only after the show. The crest status is hidden while it runs.
- Each show plays once per round. Reloading or reconnecting does not replay it (sessionStorage keys `pusoy.mp.dealt.{session}` and `pusoy.mp.revealed.{session}`). Opening an already-judged round shows the results directly. Low quality or reduced motion skips both shows.

Tests:
- `tests/Feature/MultiplayerDealTest.php`: the clockwise deal from the seat after the banker, 52 unique cards, and the deadline including the animation time.
- `MultiplayerTable.test.tsx`: the deal comes before the arrangement and does not replay; the reveal banner and Skip appear; no replay for an already-judged round.

## Card submission, misarrangement penalty and Lucky Hand rules (Single Player and Multiplayer)

All of this is server-side: the engine, settlement and ledger. The screens only display it.

**Lucky Hand** (`App\Game\LuckyHand`): only four hands qualify, always checked on the player's actual 13 dealt cards:
- **No Faces**: no J, Q or K (Aces are not faces).
- **3-Straight**: the cards split into a 3-card straight Front and 5-card straight Middle and Back. The Ace plays high or low (A-2-3, Q-K-A, A-2-3-4-5, T-J-Q-K-A).
- **3-Flushes**: each lane is one suit.
- **6 Pairs** (added 2026-11-26): six distinct pairs, meaning six different ranks each held at least twice (12 cards). The 13th card never invalidates it, even when it turns one pair into trips. Four of a kind counts as one pair of that rank, not two.

The type keys `three_flushes` / `three_straights` / `no_face_cards` / `six_pairs` are stored on submissions and results. A declared hand is announced as "<LABEL> – LUCKY HAND" (`LuckyHand::announcement`, e.g. "6 PAIRS – LUCKY HAND") in the declaration message, the Single Player popup and the result badges; the ledger reason names it ("Lucky Hand (6 Pairs) round N").

**Declaring:**
- A valid declaration pays **2× the bet** (`lucky_multiplier`; as the banker, 2× each player's bet).
- A declaration that does not qualify is **accepted**, locks the hand and costs **2× the bet**. Multiplayer records it in `game_submissions.lucky_failed` and `game_results.lucky_failed` (migration `2026_11_30_100000_lucky_failed_and_exact_timeout`); Single Player in its round results.
- The rows on screen are sent with the declaration (`POST games/{id}/lucky` / `practice/{id}/lucky`) and kept exactly as they were for the reveal.
- A declaration decides the round: the arrangement is not also judged, so a player never owes more than the 2× reserved (decision of 2026-11-26).

**Misarranged hands** (Back weaker than Middle, or Middle weaker than Front):
- They can always be submitted (`GameEngine::submit`, drafts included).
- They are kept as they are, marked `is_foul`, and lose every lane, which is **2× the bet** against a properly arranged banker. A misarranged banker pays 2× every player's bet.
- If both are misarranged the two penalties cancel (0), in both modes (`BankerRound`).
- The room options *Allow fouled submission* and *When the timer expires* no longer change anything and are removed from the room form.

**Timeout (Multiplayer):**
- `GameEngine::expire` submits each player's arrangement exactly as it is on the table: their last saved rows (saved as they move cards, and again in the timer's last second), or the cards as dealt (1-3 Front, 4-8 Middle, 9-13 Back) if they never moved one (`GameEngine::asDealt`).
- Nothing is sorted, optimised or corrected; misarranged means penalised.
- Single Player has no arrangement timer, by decision.

**Settlement:** penalties and rewards come out of the existing reserves (2× bet per side) in the single, idempotent settlement (`GameSettlement` per round, idempotency keys per payout), so retries, reconnects and repeated events never pay or charge twice.

**Results:**
- Results carry `penalty` (`misarranged` / `false_lucky`) and `lucky_failed`.
- Multiplayer hands show **MISARRANGED −2× BET**, **FALSE LUCKY −2× BET** or **LUCKY · type +2× BET**. Single Player shows the same badges plus its NO LUCK popup.
- The web arrangement board no longer blocks a misarranged Submit; it warns that it costs 2× the bet.

Tests:
- `tests/Feature/CardRulesTest.php` (new).
- Updated: `LuckyHandTest`, `BankerModesTest`, `MultiplayerTest`, `ReconnectTest`, `PracticeTest`.
- UI: `MultiplayerTable.test.tsx`, `practice/page.test.tsx`, `ArrangementBoard.test.tsx`.

### Fix: a Multiplayer round stuck at 0s ("The arrangement timer has expired.")

**Cause.** Moving a round past its deadlines depended only on queued jobs (`ExpireArrangement`, `ResolveGameSession`, `CloseBetting`, `StartNextRound`) and the `pusoy:sweep` scheduler. Without a running `queue:work` / `schedule:work` (typical locally), a round reached 0s and stayed there. The server also refused SUBMIT, because the time had passed.

**Fix:**
- **`App\Services\Game\TableClock::tick`** runs whenever a player's app looks at the table (`GET tables/{id}`, `POST tables/{id}/heartbeat`, `GET games/{id}`). It does the same idempotent, row-locked steps as the jobs and the sweep: close betting, expire arranging, resolve (reveal, score, settle), start the next round. A per-table cache lock keeps it to one at a time; errors are reported and never fail the request. Jobs and the sweep stay as they are, and whichever runs first wins.
- **Submit grace** (`pusoy.game.submit_grace_seconds`, default 3, env `GAME_SUBMIT_GRACE_SECONDS`): a SUBMIT tapped at 0s, or delayed by the network, still counts. Expiry (`GameEngine::expiresAt`, used by `expire`, `ExpireArrangement` and the sweep) waits for it, so a last-second submit is never overtaken.
- **The app at 0s** submits the rows on screen itself, exactly as they are, once. If the server answers that time is up, it shows "Time's up — your cards were submitted as they are." and catches up with the table instead of leaving the popup open.

Tests:
- `CardRulesTest`: no queue worker, the round finishes from the players' polling; grace accepted, after-grace refused.
- `MultiplayerTable.test.tsx`: auto-submit at 0s once; a late refusal catches up.

Reverb, the queue worker and the scheduler are still recommended locally for instant updates (see the Reverb / queue sections); they are no longer needed for a round to finish.

## Performance pass (2026-11-26): measured, root causes fixed

Measured first (local XAMPP, warm OPcache-less CLI), then fixed what the numbers showed. No rules, payouts, animations or features changed.

**Game engine:**
- `LuckyHand::threeStraights` now works on rank counts (at most 10 × 10 five-card rank runs) instead of every 5-card subset with re-parsed cards. 3-Straight: **7.3 ms → 0.013 ms**; full Lucky Hand detection: **7.5 ms → 0.23 ms**. Detection runs on every game-state poll while arranging, on each declaration, and for each Single Player bot. A 4,000-hand comparison against the old brute force found 0 differences, and the unit test now checks no card is used twice.
- `BotArranger::arrange` does the same exhaustive search with flat lookups, an inline expected-value sum in the original order, cached masks and the cards parsed once: **43 ms → 21 ms** per bot, with identical arrangements on 60 sample hands. A Single Player deal arranges three bots.

**Backend:**
- `TableClock::tick` checks whether anything is due before taking its lock, so a normal heartbeat or poll writes nothing. Heartbeat **17.5 → 7.2 ms** (17 → 13 queries); `GET tables/{id}` **21.8 → 12.7 ms**.
- `GameStatePresenter::session` reads seat connection state in one query instead of one per player. Together with the Lucky Hand fix, `GET games/{id}` went from **39.9 → 16.9 ms**.
- Indexes were already in place for every hot query (checked); no migration.
- Production already uses OPcache, `php artisan optimize` and Redis for cache, sessions and queues (DEPLOYMENT.md). Locally the cache is the database, so the rate limiter adds a few small queries per request.

**Mobile app:**
- `useSecondsLeft` re-renders the table screen only when the shown second changes (it was 4 renders a second). The lobby countdown likewise (it was 10 a second).
- `useTable`: real-time event bursts (submitted ×3, all submitted, revealed…) are merged into one refresh. A refresh asked for while one is running now runs once more afterwards; before, it was dropped and the screen could stay stale until the next poll.
- **Bug fixed:** leaving a table called `echo.leave('user.{id}')`, which unsubscribed the whole private channel. That silently stopped live wallet updates and the "Account Already Connected" notice. Now only the table's own listener is removed.
- The lobby list and waiting-room subscriptions no longer leak when the screen closes before the socket connects.
- **Waiting-room countdown polls once a second** (it was every 0.4 s, about 150 requests a minute, over the 120/minute API limit, so players were refused right at match start), plus one look right as the countdown ends.
- Home's balance count-up re-renders only the wallet badges, not the whole screen each frame. Home and the resume-match check share one `/tables/current` request.

**Web app:**
- Test files are excluded from the page bundle (a stale test chunk had been built).
- ApexCharts (~1 MB) loads on demand inside the chart component, so admin pages render before the chart library arrives.

**Not changed:**
- Mobile assets are already small (880 KB, all WebP).
- The always-on decorative CSS loops (gold shimmer, rotating rims, glow pulses) animate paint-heavy properties. They need on-device profiling to judge, and the existing Medium / Low motion quality settings already switch them off.

Tests: `mobile/src/lib/useTable.test.ts` (refresh merging; per-second rendering); the Lucky Hand unit test checks no card is used twice.

### Decorative animation profiling (2026-11-26)

Method: headless Chrome over the DevTools protocol with GPU compositing on, a phone-sized landscape screen (915×412 at DPR 2.625), and the CPU slowed 4×. Run against the production build. Each run was checked for the page it landed on, the motion setting in effect, and the number of animations actually running.

| Screen | High (default) | Medium | Low |
|---|---|---|---|
| Home | 14.6 fps (158 animations) | 26 fps (69) | 56 fps (0) |
| Home + Single Player picker | 9 fps (250) | 15 fps (102) | 35 fps (0) |

**Cause.** No single effect: it's the number of animations that need the main thread every frame. Switching off only those kinds, and keeping the plain move/fade animations the GPU runs alone, takes Home to 42.6 fps (37 still running) and the picker to 22 fps. About 120 of Home's 158 animations are main-thread kinds:
- SVG artwork motion inside the illustrations (about 80 on Home; browsers never GPU-composite SVG parts);
- the gold shimmer (`background-position`) and orbiting rim glint (a registered custom property), about 0.9 ms each per frame;
- glow filters, text glows and text sweeps;
- the clip-path glitter flecks.

**Tried and rejected:**
- *Gold shimmer and rim as GPU layers* (a sliding gradient strip, and a rotating conic layer in the ring mask). No frame-rate gain while the other main-thread animations still run, and Chrome's layer-tree estimate went from 374 MB to 1,137 MB of GPU textures. Reverted.
- *Removing the reduce-mode `[class*='lx-']` substring selectors.* 3 paired runs: no measurable difference (a single earlier run suggesting ~25% was noise). Unchanged.
- *The picker's backdrop blur.* No difference.

**What works without code changes:** the existing Motion Effects settings. Medium nearly doubles the frame rate on slow phones; Low reaches 35–56 fps.

### Motion Effects default: Medium on weak phones (2026-11-26)

Until a player picks a Motion Effects level, a **weak phone starts on Medium** instead of High. Weak means 4 GB of memory or less, or 4 CPU cores or fewer, as the browser reports them (`weakDevice()` in `lib/motion.ts`, the same rule in the inline boot script in `lib/motionBoot.ts`, so it applies before first paint). Any level the player picks in Settings → Motion Effects, High included, always wins and follows the account. A device that asks for reduced motion still gets Low. Settings shows "Set automatically for this device" while nobody has chosen.

**Account flag.** `motion_chosen` is set when a level is saved through `PUT /profile/preferences` and is returned with the preferences (`User::gamePreferences`).
- Before this, every account returned the default `motion: high`. The app applied it at sign-in, and saving any other setting also stored `high`. So the default High is never treated as a choice.
- An older saved Medium or Low counts as chosen; an older saved High can't be told apart from the default, so it counts as not chosen.
- When the account says not chosen, the app drops a High that older versions copied into local storage (`clearQuality`).

**Checked** on the production build in headless Chrome (CPU 4× slower, phone screen, no reduced-motion preference, `player` account never chose):
- Reporting 4 cores, the app started on Medium: Home 26.6 fps, Single Player picker 14.6 fps.
- Reporting 8 cores, it stayed on High: 14.6 and 8.2 fps.

Tests: `mobile/src/lib/motion.test.ts` (device rule, the boot script agreeing, the player's choice winning, never-chosen account prefs); `tests/Feature/SettingsTest.php` (the `motion_chosen` flag).

## Leave Game only in the Betting Phase (Multiplayer and Single Player)

**Rule:** `CanLeaveGame = (current round is BETTING)`. It's decided on the server from the round state (`BankerMatchService::leaveBlock`) and enforced in the same transaction that removes the seat (`assertCanLeave`, called by `TableService::leave`).

**Multiplayer:**
- **Betting Phase, nothing at stake:** the player may leave. The seat is freed and they are not auto-bet or dealt in.
- **Betting Phase with Chips at stake:** refused until the round is complete. This applies to a player who placed a bet, or the banker once any bet is covered. No rule exists to cancel or refund a bet on leaving, so none was added; the player leaves in the next Betting Phase.
- **Banker before any bet:** may leave. Nothing is held, so that round is voided (`CANCELLED`, `cancel_reason = banker_left`, not counted) and the next round starts at once with another banker. With fewer than 2 players left, the match ends as before.
- **Everything after Betting** (dealing, arranging, submitted, reveal, scoring, results, and the pause before the next round): refused for everyone seated with 409 `leave_not_allowed`: "You cannot leave the game once the betting phase has ended. Please wait until the round is complete." A Betting round past its deadline counts as over even before the server closes it.
- **Not in a round:** the existing rules apply. This covers the lobby before the match, a match paused for lack of an eligible banker, and a closed table.
- **Races:** `TableService::leave` locks the current round before the table (the order `closeBetting` and `resolve` use), so a leave and the end of betting can't interleave or deadlock. A second leave answers 404 "not seated".
- **Disconnections** are unchanged and separate: a disconnected player stays in the round.

**Single Player:** `PracticeService::leave` refuses (same message, 409) while a dealt round is open. The Betting Phase is the bet chooser, before the deal and after the reveal.

**App:**
- `GET tables/{id}` returns `leave: {allowed, reason}` for the seated viewer, from the same check.
- The Multiplayer Leave panel enables Leave only when allowed, and shows the server's reason otherwise. Locally, betting is over at its countdown's 0 even before the next refresh.
- Single Player's panel during a round or the reveal shows the message with only Stay; the leave that used to void a round was removed.
- The Android back button on game screens opens that panel (`pusoy:back` from NativeShell) instead of navigating away.

**Also fixed here:** a hand could be auto-submitted at the very start of a round. `useSecondsLeft` (performance pass) reported the previous value, 0, on the render where a new deadline arrived, which triggered the 0-second automatic submit. It now always computes the value for the current deadline, and the automatic submit also requires the deadline to have actually passed.

Tests:
- `tests/Feature/LeaveRulesTest.php` (new).
- Updated: `BankerModesTest`, `GoldWalletTest`.
- App: `MultiplayerTable.test.tsx` (Leave panel; no submit on a stale 0), `useTable.test.ts` (late deadline), `practice/page.test.tsx`.

## Multiplayer starts with 2 players (2–4 seated)

A lobby match starts with **at least 2** seated players (`LobbyService::MIN_PLAYERS`); the table still seats 4. The existing readiness rules are unchanged: every seated player confirms a seat and presses Start, the server runs the 3-second countdown, then rechecks Chips, Keys and presence before starting.

**Server:**
- `pressStart` refuses fewer than 2 seated players with 409 `not_enough_players`: "At least 2 players are required to start the game." It refuses unconfirmed seats as before.
- The countdown is cancelled when fewer than 2 remain, or anyone seated is not started, confirmed or connected.
- Nobody can join during a running countdown (409 `countdown_running`): with free seats, a late joiner would only cancel the start.
- A match starts once: the table and round rows are locked and the state rechecked, so a repeated Start changes nothing.
- Lobby rooms are created with `min_players = 2` (`BankerMatchService::minPlayers`). Migration `2026_12_01_100000_lobbies_start_with_two_players` sets 2 on existing lobby rooms; matches in progress are unaffected.
- Lobby state adds `seated_count` and `min_players`; `start_hint` shows the 2-player message.

**Dealing only to occupied seats.** `Deck::dealTo` deals one card at a time, clockwise from the seat after the banker, to the round's seats only: 26 cards for 2 players, 39 for 3. With four seats it's exactly the previous deal (tested). Keys are charged to the seated players only; banker rotation, betting and settlement are unchanged, since they already handled 2–3 players.

**App:**
- The lobby room shows "N/4 Players" and "All N seats confirmed · R/N pressed Start". Start appears once 2 or more seats are confirmed; alone, it shows the 2-player message.
- On the table, empty seats show "Empty seat".
- The deal animation (`DealAnimation`, `seats` prop) shuffles the whole deck but deals only to occupied seats; the rest stays in the deck, and it ends sooner.

Tests:
- `tests/Feature/LobbyMinPlayersTest.php`: alone refused; 2 and 3 players start; dealt to the two only; Keys from the two; no joining during the countdown; leaving stops the start; double Start.
- `tests/Unit/Game/DeckDealToTest.php`.
- `DealAnimation.test.tsx` (2-seat order, timing, counters).
- Updated: `LobbyTest.php`.

## Mobile Settings: Devices screen removed

The mobile app's Devices screen (`/settings/devices`: connection status and the signed-in devices list) and its "Signed-in devices ›" link at the bottom of the Settings panel are removed, as on the web Settings earlier. The `GET/DELETE /api/v1/auth/devices` endpoints remain on the server but no app uses them. One-login-per-player (`PlayerSessions`) still signs out other sessions automatically.

## Mobile: Ranks (Leaderboard) removed

The Ranks tab in the bottom bar, the Ranks shortcut on the Me screen and the Leaderboard screen (`/leaderboard`) are removed from the mobile app. The Wallet tab was removed too (Game Home already shows the Gold, Chips and Keys wallet), and then the **whole bottom tab bar** (Home · Play · Me): `Screen` no longer draws one (its `tabs` prop is gone). Screens that had no back button (Me, Wallet) now have one. Back goes to the previous screen, or to Game Home when there is none (e.g. opened from a notification). The Wallet screen (`/wallet`, with Transaction History) stays, opened from the balances on the Me screen and from wallet notifications; Multiplayer is reached from Game Home. Test: `components/Screen.test.tsx`. The server's leaderboard endpoint and the web app's leaderboard are unchanged.

**Me screen removed too.** The mobile Me screen (`/profile`: avatar, balances, stats, edit name, History and Settings shortcuts) is removed. The header avatar is no longer a link. Avatar and nickname are still changed from Game Home and the Lobby (AvatarPicker); the server's profile endpoints are unchanged. The Wallet screen (balances and Transaction History) is now opened only from wallet notifications. Game Home shows the Gold, Chips and Keys badges (display-only), and a separate Wallet tile there was tried and removed as redundant.

### Motion Effects default: High on every device (supersedes the automatic Medium above)

Until a player picks a level in Settings → Motion Effects, the level is **High** on every device. Weak phones no longer start on Medium, and a device asking for reduced motion no longer starts on Low (`quality()` in `lib/motion.ts` and the boot script in `lib/motionBoot.ts`). A level the player picks still wins and follows the account (`motion_chosen` on the server is unchanged). Only the older explicit "motion off" choice still means Low. The Settings note "Set automatically for this device" is removed. Test: `mobile/src/lib/motion.test.ts`.

## Multiplayer Lobby: Keys wallet beside Chips

The Multiplayer Lobby top bar shows a Keys wallet beside the Chips wallet: the same gold-framed pill with a purple inside and the Keys icon used on Game Home (`KeyIcon`). It shows your Keys balance, live from `useBalance` like Chips. It is display only, like the lobby's Chips pill; Keys are bought from the Shop button under Friends. Test: `app/lobby/page.test.tsx`.

## Multiplayer: synchronized match start

All seated players now move from the Waiting Room into the game together, on one server signal.

- **The server starts the match at 0.** When everyone seated has pressed Start, `LobbyService::pressStart` starts the 3 s countdown and queues `StartLobbyMatch` (`app/Jobs`) delayed to `countdown_ends_at`. At 0 the job runs `LobbyService::tick()`, which starts the match (row-locked and idempotent). Before, the match started only when a player's app next asked for the lobby, or when the per-minute `pusoy:sweep` ran. The players' own lobby requests at 0 and the sweep still work as safety nets, and only the first of them starts the match.
- **Game events are sent at once, to everyone.** `GameBroadcast` (every table and lobby event) is now `ShouldBroadcastNow`, so events go to Reverb in the same request, not through the queue. With `afterCommit` queued broadcasts each player got `match.started`, `cards.dealt` and the phase changes whenever a worker picked them up (up to the worker's sleep, about 3 s each). It is also:
  - `ShouldDispatchAfterCommit`: sent only after the transaction commits, never for a rolled-back change.
  - `ShouldRescue`: if Reverb is down the failure is reported and the request still succeeds, because the state is saved and the apps also poll.
  - Other broadcasts (`PanelUpdated`) are still queued.
- **Apps (`/mobile` `lib/lobby.ts`, mobile2 `screens/Room.kt`).** At 0 they look at the lobby straight away and then a few more times in quick succession (about 3 s in total) instead of once followed by the 1 s poll. mobile2 opens the table as soon as the lobby is `IN_GAME` (the 400 ms pause is removed). /mobile keeps its 650 ms exit animation, which is the same on every phone.
- A queue worker is still needed for `StartLobbyMatch` and the round timers: `php artisan queue:work --sleep=1`. On the database queue, `--sleep=1` keeps a delayed job within about 1 s of its time.
- Tests: `tests/Feature/LobbyStartSyncTest.php`.

## Leave Game restriction: closing the app, and mobile2's Leave panel

The Betting-Phase-only rule (see "Leave Game only in the Betting Phase") is enforced on the server. These checks and fixes complete it:

- **Every way off a table goes through `assertCanLeave`:** `POST tables/{id}/leave`, the lobby owner's kick (before the match only), and the release of long-gone seats (lobby, before the match only). The inactive-player removal in `startRound` runs when a new round opens, at the start of its Betting Phase.
- **Closing the app, refreshing, navigating away or losing the connection never removes a player.** The sweep marks them disconnected; they stay seated, their hand is auto-arranged when the timer runs out, and the round settles normally. A leave request in the meantime gets 409 `leave_not_allowed`. Leave works again in the next round's Betting Phase.
- **mobile2:** the Leave panel now matches /mobile: Stay and Leave buttons in every phase, with Leave disabled outside the Betting Phase and the server's reason shown. The "Game Home" button that let a player walk away from the table mid-round is removed. The Android back button opens this panel.
- Test: `LeaveRulesTest` "closing the app or refreshing mid-round is not a way out".
