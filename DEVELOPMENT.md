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
  a 10 s heartbeat. Broadcasts are queued: run `php artisan queue:work` (and Reverb) for instant updates
  and for the match timers (betting close, arrangement timeout) to advance.
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

- **Hierarchy:** Administrator → **Agent** → **Master Agent** → **Silver Agent**; Players can sit under any of them.
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
  - Agent Tools (the existing pages, now in the same shell through `PageShell`): Register Player, Load Chips, Referral
    Codes, Transactions, Player Activity, Reports.
  - Not available to agents (no routes; the services refuse them too): approving or rejecting registrations, Chips
    requests and withdrawals, withdrawing Chips, ban / suspend / archive, commission rates, issuing Chips.
- **Real time:** `PanelActivityObserver` (ChipLoad, AgentCommission, AgentPayoutRequest, User status) broadcasts
  `PanelUpdated` (`panel.updated`, no data) after commit to the accounts concerned and their whole upline
  (`private-user.{id}`) and to `private-staff` (Super Admin / Administrators). `AdminPanelLayout` listens and every
  open panel page refetches (`usePanelRefresh`); returning to the browser tab refetches too. Needs Reverb and a queue
  worker (the event is queued).
- **Convert Commission to Wallet** (Admin Overview and Agent Overview, directly below the registration links;
  `TeamService`): shows total accumulated commission, available (balance − pending withdrawal requests) and converted
  so far. The modal (Commission Amount, Amount to Convert, Minimum Conversion, Cancel / Confirm Conversion) posts
  `commission/convert`; the server enforces the 10-Chip minimum and the available limit, locks the user row, and moves
  commission wallet → own Chips wallet as one `COMMISSION_CONVERSION` ledger transfer. The idempotency key is
  `commission-convert:{user}:{request_id}` (one per opened modal), so a double click or retry converts once. Audit:
  `commission.converted`.
- **Team Overview** (below it; `GET team/overview`): Total Player Wallets (Chips player wallets), Total Agent Wallets
  (agents' Chips wallets) and Agents Commission (commissions earned by downline agents, excluding rejected/reversed),
  computed live from the database over the user's own downline only: the `users.sponsor_id` tree, plus for agents the
  `agents.parent_agent_id` tree and those agents' `agent_players`. The user is never counted; the Super Admin sees the
  whole platform.
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
| Agent | `agent/panel` (links, level, Chips, commission, downline), `agent/chip-requests` (POST), `agent/payout-requests` (GET/POST commission withdrawals), `agent/dashboard`, `agent/players` (GET/POST), `agent/players/{id}`, `agent/wallet`, `agent/transactions`, `agent/commissions`, `agent/referral-codes` (GET/POST), `agent/activity`, `agent/reports` |
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
