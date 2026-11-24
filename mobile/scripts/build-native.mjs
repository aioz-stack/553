// Builds the static export for the native app (APK / iOS) against the backend in .env.native.
//
// `next build` normally bakes in .env.local, which points at your LOCAL backend for `npm run dev`.
// Inside the app on a phone, "localhost" is the phone itself, so such a build cannot reach any
// server. This script loads .env.native instead (process variables beat .env.local), refuses a
// localhost address, then runs `next build` and the export fix (scripts/fix-export.mjs).
//
//   npm run build:native            → uses .env.native
//   ALLOW_LOCAL_API=1 npm run ...   → allow 10.0.2.2 / LAN addresses for emulator testing
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = fileURLToPath(new URL('../.env.native', import.meta.url));

if (!existsSync(envFile)) {
  console.error('build-native: mobile/.env.native is missing. Copy .env.example to .env.native and set the server address.');
  process.exit(1);
}

const env = {};
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const api = env.NEXT_PUBLIC_API_URL ?? '';
let host = '';
try {
  host = new URL(api).hostname;
} catch {
  console.error(`build-native: NEXT_PUBLIC_API_URL in .env.native is not a valid URL ("${api}").`);
  process.exit(1);
}

const local = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '10.0.2.2'].includes(host) || host.endsWith('.local');
if (local && process.env.ALLOW_LOCAL_API !== '1') {
  console.error(`build-native: refusing to build the app against ${api} — a phone cannot reach it.`);
  console.error('Set NEXT_PUBLIC_API_URL in mobile/.env.native to your public server (e.g. https://your-domain),');
  console.error('or run with ALLOW_LOCAL_API=1 for emulator testing (plain http also needs CAP_DEV_HTTP=1 npx cap sync).');
  process.exit(1);
}
if (api.startsWith('http://') && process.env.CAP_DEV_HTTP !== '1') {
  console.warn('build-native: warning — the app is served over https; a plain-http API is blocked unless you sync with CAP_DEV_HTTP=1.');
}

console.log(`build-native: building the app against ${api} (Reverb ${env.NEXT_PUBLIC_REVERB_SCHEME ?? '?'}://${env.NEXT_PUBLIC_REVERB_HOST ?? '?'}:${env.NEXT_PUBLIC_REVERB_PORT ?? '?'})`);

const run = (cmd, args) => {
  // Only `npx` needs a shell on Windows; node itself is run directly (its path may contain spaces).
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx', env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npx', ['next', 'build']);
run(process.execPath, ['scripts/fix-export.mjs']);
