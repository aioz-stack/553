// Post-build step for the static export (runs after `next build`).
//
// Next.js 16 writes each page's prefetch data into a folder, e.g.
//   out/lobby/__next.lobby/__PAGE__.txt
//   out/lobby/room/__next.lobby/room/__PAGE__.txt
// but the client router requests the same path with dots instead of slashes:
//   /lobby/__next.lobby.__PAGE__.txt
//   /lobby/room/__next.lobby.room.__PAGE__.txt
// On a web host the miss is hidden (Next falls back to fetching the page's HTML). Inside the
// Capacitor app that fallback gets the ROOT index.html (Capacitor answers every extensionless
// path with it), so navigation can land on the wrong page. This adds a copy of every such file
// under the requested name, so the data is found and navigation stays client-side.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { fileURLToPath } from 'node:url';

// The export folder (default: mobile/out); a path argument overrides it.
const out = process.argv[2] ?? fileURLToPath(new URL('../out/', import.meta.url));
let added = 0;

/** Every file below `dir`, as absolute paths. */
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** Walk the export; for each `__next.*` folder, add flattened copies next to it. */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory() || name === '_next') continue;

    if (name.startsWith('__next.')) {
      for (const file of files(p)) {
        const flat = join(dir, `${name}.${relative(p, file).split(sep).join('.')}`);
        if (!existsSync(flat)) {
          copyFileSync(file, flat);
          added++;
        }
      }
      continue;
    }

    walk(p);
  }
}

if (!existsSync(out)) {
  console.error(`fix-export: ${out} not found — run next build first.`);
  process.exit(1);
}

walk(out);
console.log(`fix-export: added ${added} page data file(s) under the names the router requests.`);
