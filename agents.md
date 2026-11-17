# MASTER DEVELOPMENT PROMPT — PUSOY 13 MULTIPLAYER PLATFORM

You are a senior Laravel architect, React developer, database architect, and multiplayer game developer.

I want you to build a complete Pusoy 13 (Chinese Poker) multiplayer platform with a Laravel web application and a separate Next.js + Capacitor mobile application.

This is a real development project, not a UI prototype. Build functional backend logic, database structures, APIs, real-time communication, dashboards, wallet management, game mechanics, and automated tests.

Follow the specifications below carefully.

---

# 1. PROJECT ARCHITECTURE

The project will have two separate frontend applications sharing one Laravel backend.

## Application A: Laravel Web Application

Use:
- Laravel 13
- PHP
- React
- Inertia.js
- TypeScript
- Tailwind CSS
- Existing Baseplate React dashboard template

This application will contain:
- Player-facing web application.
- Game lobby and multiplayer game interface.
- Super Admin dashboard.
- Administrator dashboard.
- Agent dashboard.
- Player management.
- Wallet and point allocation management.
- Game room management.
- Commission management.
- Reports and audit logs.

## Application B: Mobile Application

Use:
- Next.js
- React
- TypeScript
- Tailwind CSS
- Capacitor

The mobile application will be developed separately from the Laravel web application.

It will eventually be compiled into:
- Android application.
- iOS application.

The mobile application must communicate with the Laravel backend through REST APIs and Laravel Reverb for real-time game events.

Do not duplicate backend business logic in Next.js.

The Laravel backend must remain the single source of truth.

The mobile application must not require a permanent Next.js server when packaged as a native application. Use a compatible static-export architecture where possible.

## Shared Backend Services

Laravel will provide:
- REST API.
- Authentication and authorization.
- Game engine.
- Game room management.
- Multiplayer state management.
- Wallet system.
- Agent management.
- Commission calculations.
- Administrative functions.
- Database access.
- Real-time broadcasting through Laravel Reverb.
- Queue processing.

Both frontend applications must use the same backend rules, player accounts, wallets, and game sessions.

---

# 2. EXISTING BASEPLATE REACT TEMPLATE

I already have an existing React dashboard template hosted on GitLab:

https://gitlab.com/czar.gaba/baseplate-react

This repository must be used as the foundation for the Laravel web dashboard.

IMPORTANT:

Before modifying the project:

1. Inspect the Baseplate repository.
2. Review its package.json.
3. Inspect its directory and component structure.
4. Identify its React version.
5. Identify its routing system.
6. Identify its Tailwind CSS version.
7. Identify its existing layout, navigation, sidebar, tables, cards, forms, charts, dialogs, and reusable components.
8. Determine the cleanest integration strategy with Laravel and Inertia.js.

Do not assume the repository is already an Inertia application.

If the template uses a different routing or build architecture, adapt it properly rather than forcing an incompatible integration.

Preserve the original Baseplate visual design, component structure, and design system.

Do not redesign the dashboard unnecessarily.

Do not replace the template with a generic Laravel dashboard.

Reuse existing components wherever possible.

The Laravel web application should look like a complete product built on top of Baseplate.

The Next.js mobile application is a separate frontend. It does not need to reuse the Laravel web application's routing or component structure.

If GitLab access is unavailable, ask me to provide the repository files or access. Do not pretend to have inspected it.

---

# 3. LOCAL DEVELOPMENT ENVIRONMENT

I will initially develop this project locally using XAMPP.

My local MySQL configuration:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=553
DB_USERNAME=root
DB_PASSWORD=
```

Use the existing database named `553`.

Do not create another database unnecessarily.

Do not change the database name.

Create Laravel migrations for all required tables and relationships.

Use migrations instead of manually creating database tables.

Use seeders for initial roles, permissions, room configurations, and development data.

Make sure the project works with my local XAMPP MySQL installation.

Do not require Docker for local development.

---

# 4. PRODUCTION DEPLOYMENT

The production environment will use my Ubuntu VPS with aaPanel.

I intend to deploy the Laravel application natively through aaPanel.

Do not make Docker mandatory.

Production requirements:

- Ubuntu VPS.
- aaPanel.
- Nginx or Apache managed through aaPanel.
- PHP-FPM.
- Composer.
- MySQL.
- Redis.
- Laravel Reverb.
- Laravel queue workers.
- Supervisor.
- SSL.
- Cloudflare compatibility.

Laravel must use its `public` directory as the document root.

Configure production environment variables separately from local development.

Production settings must include:
- APP_ENV=production
- APP_DEBUG=false
- Correct APP_URL.
- Secure database credentials.
- Redis configuration.
- Reverb configuration.
- Queue configuration.
- Mail configuration.
- Sanctum configuration.
- CORS configuration.

Provide deployment documentation for:
- Laravel deployment.
- Database setup.
- Composer installation.
- Application permissions.
- Queue workers using Supervisor.
- Laravel Reverb using Supervisor.
- Scheduler cron configuration.
- Reverse proxy configuration.
- HTTPS/WSS configuration.
- Cloudflare configuration.
- Backup and recovery.

Do not expose MySQL, Redis, or internal application services publicly.

---

# 5. LARAVEL REVERB — REAL-TIME MULTIPLAYER

Laravel Reverb is required.

The game is a real-time four-player multiplayer game. Players must receive game events without refreshing the browser or mobile application.

Use:
- Laravel Reverb.
- Laravel Broadcasting.
- Laravel Echo.
- Redis where appropriate.
- Queue workers.

Implement real-time events for:

- Player joining a room.
- Player leaving a room.
- Player ready status.
- Room becoming full.
- Game starting.
- Card dealing.
- Game timer updates.
- Player submission status.
- All players submitting.
- Game reveal.
- Score calculation completion.
- Final results.
- Player disconnection.
- Player reconnection.
- Game cancellation.

Security requirements:

- Use private or presence channels where appropriate.
- Authenticate channel subscriptions.
- Ensure players can only subscribe to authorized rooms and sessions.
- Never broadcast another player's private cards before the reveal stage.
- Never trust client-submitted game results.
- Never broadcast sensitive wallet information to other players.

The backend controls all game state transitions.

Use queues for asynchronous operations where appropriate, but ensure critical game state and wallet settlement operations are reliable.

Implement reconnection and state recovery so players can reconnect without corrupting the game.

Document how to run Reverb locally and under Supervisor in aaPanel production.

---

# 6. USER ROLES AND ACCESS CONTROL

Implement the following hierarchy:

Super Admin → Administrators → Agents → Players

## Super Admin

Full platform access.

Can:
- Manage administrators.
- Manage agents.
- Manage players.
- Assign players to agents.
- Manage all game rooms.
- Configure payout modes.
- Allocate CP and VC.
- View all wallets and transactions.
- Configure commissions.
- Manage platform fees.
- View game history.
- View platform reports.
- Manage system settings.
- Review audit logs.

Only Super Admin can create other Super Admin accounts.

## Administrator

Permissions must be configurable.

Can be authorized to:
- Manage players.
- Manage agents.
- Allocate points.
- Manage game rooms.
- Review transactions.
- View reports.
- Manage assigned operational areas.

Administrators cannot exceed their assigned permissions or allocation limits.

## Agent

Each agent manages their own registered players.

Can:
- Register players.
- Generate referral codes.
- View their own players.
- View player activities.
- Allocate available CP and VC to their own players.
- View allocation balances.
- View transactions.
- View commission earnings.
- View agent reports.

Agents cannot:
- Create other agents.
- Create administrators.
- Access other agents' players.
- Modify their own allocation balances.
- Modify commission rates.
- Edit transaction history.
- Approve their own commission payouts.

## Player

Can:
- Join game rooms.
- Play Pusoy 13.
- View profile.
- View wallet balances.
- View transaction history.
- View game history.
- View leaderboard.
- Receive notifications.

Players cannot manually credit their own wallets.

Use Laravel Policies, Gates, middleware, and proper role-based permissions.

---

# 7. PLAYER WALLET AND CURRENCY SYSTEM

Implement two separate currencies.

## Cash Points (CP)

CP is PHP-denominated accounting points.

Requirements:
- Separate wallet balance.
- Separate ledger.
- Administrative allocation.
- Agent allocation.
- Player credit/debit.
- Transaction history.
- Administrative adjustments.
- Audit logs.

IMPORTANT LEGAL AND SECURITY REQUIREMENT:

Keep actual money deposits, withdrawals, cash redemption, and real-money wagering disabled by default.

Do not assume that using the term Cash Points makes real-money gaming legally permissible.

Any actual cash-related functionality must remain behind disabled feature flags until applicable Philippine legal, regulatory, and payment-provider approvals have been obtained.

## Virtual Coins (VC)

VC is free-play currency.

Requirements:
- Separate wallet.
- Free-play room entry.
- Virtual game rewards.
- Administrative allocation.
- Agent allocation.
- Virtual transaction history.
- Optional free daily rewards.

VC must never be:
- Withdrawable.
- Redeemable for money.
- Converted into CP.

Never combine CP and VC balances.

---

# 8. ADMIN AND AGENT POINT ALLOCATION

Implement a controlled point allocation system.

Workflow:

1. Super Admin allocates CP or VC to an authorized Administrator or Agent.
2. The recipient receives an available allocation balance.
3. The Agent distributes points to their own registered players.
4. The player's wallet is credited.
5. The Agent's available allocation balance is reduced.
6. Every transaction is recorded in the ledger.

Example:

Super Admin allocates 10,000 VC to Agent A.

Agent A distributes:
- Player 1: 2,000 VC.
- Player 2: 1,000 VC.
- Player 3: 500 VC.

Remaining Agent A allocation: 6,500 VC.

Requirements:

- Agents cannot distribute more than their available balance.
- Agents cannot allocate to players outside their ownership.
- Agents cannot generate unlimited points.
- Players cannot credit themselves.
- Administrators must respect their configured limits.
- All operations must be atomic.
- Prevent duplicate transactions.
- Never allow negative balances.
- Use database transactions and row locking.
- Record the actor, recipient, amount, currency, reason, and reference.
- Support allocation freezing by authorized administrators.

Agent commission earnings must remain separate from distributable allocation balances.

---

# 9. WALLET LEDGER

Implement immutable wallet transaction records.

Every transaction should include:

- Unique transaction reference.
- Transaction type.
- Currency.
- Source account.
- Destination account.
- Amount.
- Balance before.
- Balance after.
- Status.
- Reason.
- Created by.
- Approved by, if applicable.
- Related player.
- Related agent.
- Related game session.
- Timestamp.

Suggested transaction types:

- ADMIN_ALLOCATION
- AGENT_ALLOCATION
- PLAYER_CREDIT
- PLAYER_DEBIT
- GAME_ENTRY
- GAME_REFUND
- GAME_REWARD
- PLATFORM_FEE
- MANUAL_ADJUSTMENT
- REVERSAL

Never directly change balances without corresponding ledger entries.

Implement:
- Atomic transactions.
- Row-level locking.
- Idempotency keys.
- Unique references.
- Duplicate prevention.
- Rollback on errors.
- Ledger reconciliation.
- Audit logs.

Completed transaction records must never be edited or deleted. Use reversal entries to correct mistakes.

---

# 10. AGENT COMMISSION SYSTEM

Create a separate agent commission system.

Recommended commission basis:

Percentage of eligible platform fees actually collected.

Illustrative example:

- Eligible platform fee: 10 VC.
- Agent commission: 40%.
- Agent earns: 4 VC.
- Platform retains: 6 VC.

Requirements:

- Super Admin configures commission rates.
- Agents cannot modify their own rates.
- Commissions are generated only for eligible completed games.
- Cancelled or refunded games must not generate payable commissions.
- Prevent duplicate commission records.
- Store the commission rate and calculation basis at the time of calculation.
- Support reversal.
- Track pending, approved, paid, reversed, and rejected states.
- Keep commission earnings separate from agent allocation balances.

Do not enable cash commission payouts without appropriate legal and regulatory approval.

---

# 11. GAME ROOM MANAGEMENT

Create an administrative Game Room Management module.

Super Admin and authorized administrators can create and manage rooms.

Each room must support:

- Room name.
- Description.
- Currency type (CP or VC).
- Entry amount.
- Payout mode.
- Platform fee.
- Maximum players.
- Minimum players.
- Arrangement timer.
- Tie handling.
- Room visibility.
- Room status.

Every Pusoy 13 table must have exactly four players.

## Payout Modes

Payout mode must be controlled by the room configuration.

Players cannot select their own payout mode.

Available values:

```text
round_bank
winner_takes_all
```

### Round Bank

The room uses a configured bank distribution rule.

Do not assume that Round Bank and Winner Takes All are identical.

Implement the actual bank calculation as a configurable, documented strategy.

Support an initial cumulative bank implementation, where eligible player contributions are pooled and the winner distribution follows the configured rules.

Make tie handling configurable.

### Winner Takes All

The eligible net prize pool is awarded to the highest-scoring player.

Define how ties are handled:
- Split equally.
- Carry forward, if enabled.
- Apply a configured tie-breaker.

Do not silently award a tied prize to an arbitrary player.

Store the room payout configuration as a snapshot in every game session.

Changing a room's configuration must never alter an active or previously completed game.

For real-money-related modes, keep functionality disabled until appropriate approvals. Virtual Coins can be used for free-play functionality without cash redemption.

---

# 12. PUSOY 13 GAME RULES

Implement standard Pusoy 13 / Chinese Poker.

Game configuration:

- Four players.
- Standard 52-card deck.
- No jokers.
- Thirteen cards per player.
- Three hand arrangements.

Each player arranges:

- Front: 3 cards.
- Middle: 5 cards.
- Back: 5 cards.

Hand ordering:

Back must be at least as strong as Middle, and Middle must be at least as strong as Front, according to the configured Pusoy ranking rules.

Implement and document the exact comparison behavior for equal-strength hands.

Five-card hand rankings:

1. Royal Flush.
2. Straight Flush.
3. Four of a Kind.
4. Full House.
5. Flush.
6. Straight.
7. Three of a Kind.
8. Two Pair.
9. One Pair.
10. High Card.

Three-card Front hand rankings:

1. Three of a Kind.
2. One Pair.
3. High Card.

Do not allow five-card straight or flush rankings in the Front hand.

Implement:
- Proper kicker comparisons.
- Deterministic hand evaluation.
- Arrangement validation.
- Foul detection.
- Tie detection.
- Score calculation.

Initial scoring configuration:

- Win: +1.
- Loss: -1.
- Tie: 0.

Compare Front, Middle, and Back hands against each of the other three players.

This produces nine pairwise hand comparisons per player.

Do not add royalties, scoop bonuses, or special-hand bonuses unless explicitly configured in a future feature.

Use zero-sum scoring.

Implement foul handling as a documented and configurable rule. Initially, a fouled hand should lose all three comparisons against each opponent.

All game rules must be enforced by the backend.

---

# 13. MULTIPLAYER GAME FLOW

Implement the following state machine:

- WAITING_FOR_PLAYERS
- READY
- DEALING
- ARRANGING
- SUBMITTED
- REVEALING
- SCORING
- COMPLETED
- CANCELLED

Game flow:

1. Players enter a room.
2. The system validates their eligibility and available balance.
3. Entry amounts are reserved safely.
4. Four players fill the table.
5. The table locks.
6. The backend creates a game session.
7. The backend securely shuffles the deck.
8. Each player receives only their own thirteen cards.
9. Players arrange their Front, Middle, and Back hands.
10. The backend validates submissions.
11. Once all players submit or the timer expires, reveal the arrangements.
12. Validate fouls.
13. Compare all hands.
14. Calculate final scores.
15. Calculate the configured room payout.
16. Settle eligible virtual wallet transactions.
17. Generate eligible agent commissions.
18. Save the completed game results.

Handle:
- Disconnections.
- Reconnection.
- Timeouts.
- Duplicate submissions.
- Player abandonment.
- Cancellation.
- Interrupted server operations.
- Failed settlement attempts.

Use secure random shuffling.

Never trust the client to shuffle cards, determine winners, calculate scores, or settle wallets.

Consider a server-side shuffle commitment mechanism for fairness and auditability.

---

# 14. LARAVEL API

All business logic must be accessible through versioned APIs.

Use:

```text
/api/v1
```

Provide endpoints for:

Authentication:
- Register.
- Login.
- Logout.
- Current user.
- Forgot password.
- Reset password.

Player:
- Profile.
- Statistics.
- Game history.
- Wallet.
- Wallet transactions.

Rooms:
- List rooms.
- Room details.
- Join room.
- Leave room.
- Create private room.
- Invite players.

Games:
- Game details.
- Current game state.
- My cards.
- Submit arrangement.
- Game results.

Wallet:
- Wallet balances.
- Transaction history.
- Allocation.
- Credit.
- Debit.
- Adjustments.

Admin:
- Users.
- Players.
- Agents.
- Administrators.
- Rooms.
- Wallets.
- Transactions.
- Commissions.
- Reports.
- Audit logs.

Agent:
- Dashboard.
- My players.
- Register player.
- Allocate points.
- Wallet.
- Transactions.
- Commissions.
- Reports.

Use:
- Laravel API Resources.
- Form Requests.
- Sanctum.
- Policies.
- Pagination.
- Consistent response structures.
- Rate limiting.
- Proper validation.

The web app and mobile app must use the same backend business logic.

For web authentication, use a secure session-based approach where appropriate. For mobile, use Sanctum bearer tokens with proper device/session management.

---

# 15. LARAVEL WEB APPLICATION PAGES

Build the following pages using the existing Baseplate template.

## Player Application

- Login.
- Registration.
- Dashboard.
- Game lobby.
- Game rooms.
- Waiting room.
- Game table.
- Game results.
- Wallet.
- Transactions.
- Game history.
- Leaderboard.
- Profile.
- Settings.
- Notifications.

## Super Admin Dashboard

- Overview.
- Administrators.
- Agents.
- Players.
- Game rooms.
- Active tables.
- Game sessions.
- Game results.
- Wallet management.
- CP management.
- VC management.
- Allocations.
- Transactions.
- Commissions.
- Reports.
- Audit logs.
- System settings.

## Agent Dashboard

- Overview.
- My players.
- Register player.
- Referral codes.
- Point allocation.
- Allocation balances.
- Transactions.
- Player activity.
- Commissions.
- Reports.
- Profile.

Navigation and permissions must be role-specific.

---

# 16. NEXT.JS + CAPACITOR MOBILE APPLICATION

Build a separate mobile-first application.

Use:
- Next.js.
- TypeScript.
- Tailwind CSS.
- Capacitor.

Screens:

- Splash.
- Onboarding.
- Login.
- Registration.
- Home.
- Lobby.
- Game rooms.
- Waiting room.
- Game table.
- Card arrangement.
- Game results.
- Wallet.
- Transactions.
- Game history.
- Leaderboard.
- Profile.
- Settings.
- Notifications.

Game table requirements:

- Portrait-oriented layout.
- Four player positions.
- Poker-style table.
- Card arrangement interaction.
- Front, Middle, Back sections.
- Countdown timer.
- Player ready indicators.
- Submission indicators.
- Result overlay.
- Touch-friendly cards.
- Small Android screen support.
- Safe-area handling.
- Network reconnect handling.

Use Laravel APIs and Reverb events.

The mobile app must not independently calculate final game scores or wallet settlements.

Configure:
- Capacitor app ID.
- Application name.
- App icon.
- Splash screen.
- Status bar.
- Keyboard behavior.
- Network behavior.
- Android and iOS builds.

Do not use default Capacitor branding as the final application identity.

---

# 17. DATABASE DESIGN

Inspect existing migrations and models first.

Create or extend the required database structures without duplicating existing functionality.

Expected core tables include:

- users
- player_profiles
- user_devices
- roles and permissions
- agents
- agent_players
- agent_referral_codes
- agent_wallets
- agent_wallet_transactions
- agent_commission_rules
- agent_commissions
- agent_payout_requests
- game_rooms
- game_tables
- game_players
- game_sessions
- game_cards
- game_submissions
- game_results
- game_hand_results
- wallets
- wallet_transactions
- wallet_holds
- wallet_allocations
- wallet_adjustments
- game_settlements
- game_payouts
- platform_fees
- notifications
- game_invitations
- audit_logs

Use appropriate foreign keys, indexes, unique constraints, and safe numeric storage.

Implement proper relationships and model scopes.

Do not create duplicate wallet or user systems.

Use UTC for stored timestamps and localize display times appropriately.

---

# 18. TESTING REQUIREMENTS

Create automated tests for:

## Game Engine
- Unique 52-card deck.
- Thirteen cards per player.
- No duplicate cards.
- Hand rankings.
- Kicker comparisons.
- Three-card rankings.
- Arrangement validation.
- Fouls.
- Ties.
- Scoring.
- Zero-sum totals.

## Multiplayer
- Four-player capacity.
- Simultaneous joining.
- Duplicate joining.
- Disconnection.
- Reconnection.
- Timeout.
- Duplicate submissions.
- Private card visibility.
- State recovery.

## Wallet
- CP/VC separation.
- Allocation.
- Credit.
- Debit.
- Insufficient balances.
- Double-spend protection.
- Concurrent requests.
- Idempotency.
- Settlement.
- Refund.
- Commission calculation.
- Ledger reconciliation.

## Access Control
- Super Admin permissions.
- Administrator permissions.
- Agent ownership.
- Player restrictions.
- Unauthorized API access.
- Agent isolation.

## Frontend
- Authentication.
- Dashboard navigation.
- Room joining.
- Game interaction.
- Wallet display.
- Agent allocation workflow.

Never claim a feature is complete unless its implementation and relevant tests have been verified.

---

# 19. DEVELOPMENT PHASES

Work in phases, but aim to implement the complete architecture.

Phase 1 — Project inspection and foundation:
- Inspect Baseplate React repository.
- Inspect Laravel environment.
- Establish Laravel and Inertia integration.
- Configure database `553`.
- Configure authentication.
- Implement roles and permissions.

Phase 2 — Core backend:
- Database migrations.
- Models and relationships.
- API architecture.
- Wallet ledger.
- Point allocation.
- Agent management.

Phase 3 — Game engine:
- Deck.
- Shuffle.
- Hand rankings.
- Arrangement validation.
- Fouls.
- Scoring.
- Automated tests.

Phase 4 — Multiplayer:
- Reverb.
- Broadcasting.
- Redis.
- Queue workers.
- Room lifecycle.
- Game sessions.
- Reconnection.

Phase 5 — Economy:
- CP and VC.
- Room entry.
- Payout modes.
- Settlement.
- Platform fees.
- Agent commissions.
- Cash functionality remains disabled.

Phase 6 — Laravel web application:
- Player application.
- Super Admin dashboard.
- Admin dashboard.
- Agent dashboard.
- Game interface.

Phase 7 — Mobile:
- Separate Next.js project.
- API integration.
- Reverb integration.
- Capacitor.
- Android/iOS configuration.

Phase 8 — Production:
- aaPanel deployment.
- PHP-FPM.
- MySQL.
- Redis.
- Supervisor.
- Reverb.
- Queue workers.
- SSL/WSS.
- Security hardening.
- Backups.

---

# 20. IMPORTANT DEVELOPMENT INSTRUCTIONS

1. Inspect before implementing.
2. Do not assume the Baseplate repository structure.
3. Preserve existing components and design.
4. Do not replace working functionality unnecessarily.
5. Laravel is the single source of truth.
6. Next.js is a separate frontend, not another backend.
7. Reverb is required for real-time multiplayer.
8. Both applications must share the same API, database, authentication rules, and game logic.
9. Never trust client-side game scoring or wallet calculations.
10. Never expose private cards before reveal.
11. Never allow agents to access another agent's players.
12. Never allow unauthorized wallet modifications.
13. Keep cash-related functionality disabled until applicable approvals are obtained.
14. Do not require Docker.
15. Keep the application compatible with local XAMPP development and native aaPanel deployment.
16. Write clean, maintainable, documented code.
17. Use migrations and automated tests.
18. Keep `DEVELOPMENT.md` updated.

Before writing code, provide a concise architecture assessment based on the actual Baseplate repository and current Laravel project.

Then proceed with implementation, resolving compatibility issues rather than silently skipping requirements.

If an essential decision or repository access is missing, explain the blocker clearly instead of inventing details.

The final objective is a complete, secure, real-time Pusoy 13 platform with a Laravel web application, a separate Next.js + Capacitor mobile application, an administrator-controlled room and payout system, agent management, player point allocation, virtual wallets, and a tested multiplayer game engine.