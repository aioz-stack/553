# Pusoy 13 — Production Deployment (Ubuntu + aaPanel, no Docker)

Templates referenced below live in `deploy/` and `.env.production.example`.
Paths assume the site lives at `/www/wwwroot/pusoy13` and PHP 8.3 under aaPanel
(`/www/server/php/83`). Adjust to your server.

> **Legal:** keep every `FEATURE_CASH_*` / `FEATURE_CP_*` flag `false` until Philippine legal,
> regulatory and payment-provider approvals are obtained. VC is free-play only.

## 1. Server software (aaPanel → App Store)

- Nginx (latest stable), MySQL 8 / MariaDB 10.11, PHP 8.3, Redis, Supervisor Manager.
- PHP extensions (aaPanel → PHP 8.3 → Install extensions): `redis`, `opcache`, `fileinfo`,
  `intl`, `bcmath`, `pcntl` (for Reverb), `sodium`. Remove `exec`, `proc_open`, `putenv`,
  `pcntl_signal`, `pcntl_alarm`, `symlink` from **disabled functions** (Composer, queue workers and
  Reverb need them).
- Composer: `curl -sS https://getcomposer.org/installer | php && mv composer.phar /usr/local/bin/composer`
- Node 20+ is only needed if you build assets on the server (you can build locally instead).

## 2. Database

aaPanel → Databases → Add: database `pusoy13` (or your name), a dedicated user with a strong
password, access **localhost only**. Never use `root` from the app. MySQL must not listen publicly
(aaPanel → Security: keep port 3306 closed).

## 3. Deploy the code

```bash
cd /www/wwwroot
git clone <your-repo> pusoy13 && cd pusoy13
composer install --no-dev --optimize-autoloader
cp .env.production.example .env      # fill every <...>
php artisan key:generate --force
npm ci && npm run build              # or upload public/build from a local build
php artisan migrate --force
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=GameRoomSeeder --force
php artisan pusoy:create-super-admin <username> <email>   # prompts for a password (min 12 chars)
php artisan storage:link
php artisan optimize                 # config, routes, views, events cache
```

Do **not** run `DevelopmentDataSeeder` in production (it only runs automatically when `APP_ENV=local`).

### Permissions

```bash
chown -R www:www /www/wwwroot/pusoy13
find /www/wwwroot/pusoy13 -type f -exec chmod 644 {} \;
find /www/wwwroot/pusoy13 -type d -exec chmod 755 {} \;
chmod -R 775 storage bootstrap/cache
chmod 640 .env
```

aaPanel → Website → site → **Site directory**: set *Running directory* to `/public` and turn
**off** "Anti-XSS (open_basedir)" if it blocks `storage/` writes.

## 4. Nginx, HTTPS & WSS

- Site root must be `/www/wwwroot/pusoy13/public` (see `deploy/nginx/pusoy13.conf`).
- Add a second site (or server block) `ws.your-domain` that proxies to Reverb on
  `127.0.0.1:8080` with the `Upgrade`/`Connection` headers shown in the template.
- SSL: aaPanel → Website → SSL → Let's Encrypt for both hostnames (or a Cloudflare Origin
  certificate when proxied). Enable *Force HTTPS*.
- `.env`: `REVERB_HOST=ws.your-domain`, `REVERB_PORT=443`, `REVERB_SCHEME=https`, while
  `REVERB_SERVER_HOST=127.0.0.1`, `REVERB_SERVER_PORT=8080` keep Reverb private.
  Rebuild assets after changing `VITE_REVERB_*` (`npm run build`).
- Set `REVERB_ALLOWED_ORIGINS` to your web domain plus the Capacitor origins
  (`https://your-domain,capacitor://localhost,https://localhost`); the default `*` is for local dev only.

## 5. Supervisor (queue workers + Reverb)

Add the programs from `deploy/supervisor/pusoy-queue.conf` and `deploy/supervisor/pusoy-reverb.conf`
via aaPanel → Supervisor Manager (or copy into `/etc/supervisor/conf.d/`), then:

```bash
supervisorctl reread && supervisorctl update
supervisorctl status
```

After every deploy: `php artisan queue:restart` and `supervisorctl restart pusoy-reverb`.

## 6. Scheduler (cron)

aaPanel → Cron → Shell script, every minute:

```bash
cd /www/wwwroot/pusoy13 && /www/server/php/83/bin/php artisan schedule:run >> /dev/null 2>&1
```

This runs `pusoy:sweep` every minute (timer expiry safety net, stuck settlement retries,
disconnects, ready timeouts), `pusoy:reconcile` daily at 03:00 UTC, and token pruning.

## 7. Redis

aaPanel → Redis → Configuration: `bind 127.0.0.1`, set `requirepass`, `maxmemory-policy
noeviction` (queues must not be evicted). Put the password in `REDIS_PASSWORD`. Port 6379 must not
be open in the firewall.

## 8. Cloudflare

- DNS: proxy (orange cloud) `your-domain` and `ws.your-domain`. WebSockets are supported on all
  plans; keep the default 100s idle timeout in mind (Echo pings keep connections alive).
- SSL/TLS mode **Full (strict)** with a valid origin certificate.
- `bootstrap/app.php` already trusts proxy headers (`trustProxies('*')`); for tighter security,
  restrict to Cloudflare IP ranges and add `real_ip_header CF-Connecting-IP;` +
  `set_real_ip_from <cloudflare ranges>;` in Nginx so rate limits and audit logs see real IPs.
- Do not cache `/api/*` or `/broadcasting/*` (Cache Rules → bypass).

## 9. Firewall

Allow only 22 (SSH, ideally key-only / non-default), 80, 443 and the aaPanel port (restricted to
your IP). Keep 3306, 6379 and 8080 closed — they are reached only via 127.0.0.1.

## 10. Backups & recovery

- `deploy/backup.sh` dumps the database (`--single-transaction`) and archives `.env` +
  `storage/app`; schedule nightly via aaPanel Cron and sync the folder off-server.
- Also enable aaPanel's database backup to remote storage.
- **Restore:** deploy code → restore `.env` → `gunzip < db-*.sql.gz | mysql <db>` →
  `php artisan migrate --force` → `php artisan optimize` → restart Supervisor programs →
  run `php artisan pusoy:reconcile` and confirm "Ledger is balanced" before reopening.
- Games interrupted by a restart resume automatically (`pusoy:sweep`); staff can retry or cancel
  (refund) any stuck game from Admin → Game Sessions.

## 11. Mobile app release

```bash
cd mobile
# .env.local (or CI env): NEXT_PUBLIC_API_URL=https://your-domain,
#   NEXT_PUBLIC_REVERB_HOST=ws.your-domain, NEXT_PUBLIC_REVERB_PORT=443, NEXT_PUBLIC_REVERB_SCHEME=https,
#   NEXT_PUBLIC_REVERB_APP_KEY=<REVERB_APP_KEY>
npm ci && npm run build && npx cap sync
npx cap open android   # Android Studio → Build → Generate Signed Bundle (AAB); JDK 25 needs the Gradle 9.1 wrapper (included)
npx cap open ios       # Xcode (macOS) → set Team/signing → Archive
```

App id `ph.pusoy13.app`, name "Pusoy 13" (`capacitor.config.ts`). The native app needs no Next.js
server — it ships the static export. Make sure `CORS_ALLOWED_ORIGINS` includes
`capacitor://localhost,https://localhost`.

## 12. Deploy checklist

- [ ] `APP_ENV=production`, `APP_DEBUG=false`, correct `APP_URL`, HTTPS forced
- [ ] Strong DB/Redis credentials; MySQL/Redis/Reverb ports not public
- [ ] `php artisan optimize` after each deploy; `queue:restart`; Reverb restarted
- [ ] Cron `schedule:run` every minute; Supervisor programs running
- [ ] `REVERB_ALLOWED_ORIGINS` restricted; Cloudflare Full (strict)
- [ ] `DB_ISOLATION_LEVEL` is READ COMMITTED (default); FCM credentials file is root/www-readable only and outside `public/`
- [ ] Cash feature flags all `false`
- [ ] `php artisan pusoy:reconcile` passes
