// Local-only receiver: the web app (localhost:3000) posts exported art; files land in mobile2/assets/art.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../assets/art', import.meta.url));
const cors = { 'Access-Control-Allow-Origin': 'http://localhost:3000', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method === 'GET' && req.url.startsWith('/exporter.js')) {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(readFileSync(new URL('./exporter.js', import.meta.url)));
  }
  if (req.method !== 'POST') { res.writeHead(405, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const { files } = JSON.parse(body);
      for (const f of files) {
        const rel = normalize(f.path).replace(/^(\.\.[\\/])+/, '');
        const out = join(ROOT, rel);
        mkdirSync(dirname(out), { recursive: true });
        if (f.dataUrl) writeFileSync(out, Buffer.from(f.dataUrl.split(',')[1], 'base64'));
        else writeFileSync(out, f.text);
      }
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: files.length }));
      console.log('saved', files.map((f) => f.path).join(', '));
    } catch (e) {
      res.writeHead(400, cors); res.end(String(e));
    }
  });
}).listen(8787, '127.0.0.1', () => console.log('receiver on 127.0.0.1:8787'));
