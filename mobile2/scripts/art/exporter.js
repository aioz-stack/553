// Runs inside the web app (localhost:3000). Cuts SVG art into still layers + moving parts (paint order kept),
// rasterises each in the browser (fonts embedded) and posts PNGs + a JSON manifest to the local receiver.
const NS = 'http://www.w3.org/2000/svg';
const RECEIVER = 'http://127.0.0.1:8787';

let fontCssCache = null;
async function fontCss() {
  if (fontCssCache) return fontCssCache;
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    for (const r of list) if (r.type === CSSRule.FONT_FACE_RULE) rules.push(r);
  }
  const out = [];
  for (const r of rules) {
    const fam = r.style.getPropertyValue('font-family');
    const weight = r.style.getPropertyValue('font-weight') || 'normal';
    const style = r.style.getPropertyValue('font-style') || 'normal';
    const m = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue('src'));
    if (!m) continue;
    const url = new URL(m[1], r.parentStyleSheet?.href || location.href).href;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      let bin = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const range = r.style.getPropertyValue('unicode-range');
      out.push(`@font-face{font-family:${fam};font-weight:${weight};font-style:${style};${range ? `unicode-range:${range};` : ''}src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`);
    } catch { /* skip */ }
  }
  return (fontCssCache = out.join('\n'));
}

/** Inline what CSS gave text (fonts) so the standalone SVG renders the same. */
function inlineText(orig, clone) {
  const os = [orig, ...orig.querySelectorAll('*')];
  const cs = [clone, ...clone.querySelectorAll('*')];
  os.forEach((o, i) => {
    const c = cs[i];
    if (!c) return;
    c.removeAttribute('class');
    c.removeAttribute('style');
    if (o.tagName === 'text' || o.tagName === 'tspan' || o.tagName === 'g') {
      const s = getComputedStyle(o);
      if (o.tagName !== 'g' || o.querySelector('text')) {
        c.setAttribute('font-family', s.fontFamily);
        c.setAttribute('font-weight', s.fontWeight);
      }
    }
    // SMIL animations (e.g. the CandyText sweep) are dropped: the PNG is the resting frame.
    if (/^animate/.test(o.tagName)) c.remove();
  });
}

/** The element, wrapped in shallow clones of its ancestors up to (not including) root. */
function wrapped(el, root) {
  let node = el.cloneNode(true);
  inlineText(el, node);
  for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
    const shell = a.cloneNode(false);
    shell.removeAttribute('class');
    shell.removeAttribute('style');
    shell.appendChild(node);
    node = shell;
  }
  return node;
}

/** Element → root user-space matrix. */
const toRoot = (el, root) => root.getScreenCTM().inverse().multiply(el.getScreenCTM());

function boxOf(el, root) {
  let b;
  try { b = el.getBBox({ stroke: true }); } catch { b = el.getBBox(); }
  const m = toRoot(el, root);
  const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
const union = (a, b) => (!a ? b : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });
const pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

async function rasterise(root, nodes, box, scale) {
  const svg = document.createElementNS(NS, 'svg');
  const W = Math.max(1, Math.ceil(box.w * scale)), H = Math.max(1, Math.ceil(box.h * scale));
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  const style = document.createElementNS(NS, 'style');
  style.textContent = await fontCss();
  svg.appendChild(style);
  // every <defs> in the document (gradients may live in a sibling SVG)
  for (const d of document.querySelectorAll('svg defs')) svg.appendChild(d.cloneNode(true));
  for (const n of nodes) svg.appendChild(n);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/png');
}

/** Animation facts of an element while animations still run. */
function animOf(el) {
  const s = getComputedStyle(el);
  if (!s.animationName || s.animationName === 'none') return null;
  return {
    name: s.animationName.split(',')[0].trim(),
    duration: parseFloat(s.animationDuration) || 0,
    delay: parseFloat(s.animationDelay) || 0,
    timing: s.animationTimingFunction.split(',')[0].trim(),
    direction: s.animationDirection.split(',')[0].trim(),
    box: s.transformBox,
    origin: s.transformOrigin,
  };
}

/**
 * Export one SVG: `name` is the folder, `scale` the raster scale (pixels per design unit).
 * Returns the manifest (also saved as <name>/manifest.json).
 */
export async function exportSvg(root, name, scale = 1.5, { split = true } = {}) {
  // 1) record animations while they run
  const anims = new Map();
  if (split) for (const el of root.querySelectorAll('*')) { const a = animOf(el); if (a) anims.set(el, a); }
  // 2) freeze everything so geometry is the resting pose
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
  document.head.appendChild(freeze);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const vb = root.viewBox.baseVal;
    const size = vb && vb.width ? { w: vb.width, h: vb.height } : { w: root.width.baseVal.value, h: root.height.baseVal.value };
    const hasAnim = (el) => anims.has(el) || [...el.querySelectorAll('*')].some((d) => anims.has(d));
    const seq = [];
    const walk = (node) => {
      for (const ch of node.children) {
        if (ch.tagName === 'defs' || ch.tagName === 'style' || /^animate/.test(ch.tagName)) continue;
        if (anims.has(ch)) seq.push({ kind: 'anim', el: ch });
        else if (split && hasAnim(ch)) walk(ch);
        else seq.push({ kind: 'still', el: ch });
      }
    };
    walk(root);
    // group consecutive stills
    const groups = [];
    for (const it of seq) {
      const last = groups[groups.length - 1];
      if (it.kind === 'still' && last?.kind === 'still') last.els.push(it.el);
      else groups.push(it.kind === 'still' ? { kind: 'still', els: [it.el] } : it);
    }
    const files = [];
    const layers = [];
    let i = 0;
    for (const g of groups) {
      const els = g.kind === 'still' ? g.els : [g.el];
      let box = null;
      for (const e of els) { try { const b = boxOf(e, root); if (b.w > 0 && b.h > 0) box = union(box, b); } catch { /* no geometry */ } }
      if (!box) continue;
      box = pad(box, 4);
      const file = `${name}/${String(i).padStart(2, '0')}-${g.kind}.png`;
      const dataUrl = await rasterise(root, els.map((e) => wrapped(e, root)), box, scale);
      files.push({ path: file, dataUrl });
      const layer = { file: file.split('/')[1], kind: g.kind, x: +box.x.toFixed(2), y: +box.y.toFixed(2), w: +box.w.toFixed(2), h: +box.h.toFixed(2) };
      if (g.kind === 'anim') {
        const el = g.el;
        const a = anims.get(el);
        // pivot in root units: fill-box → relative to the element's own box; otherwise the viewport origin
        const [ox, oy] = a.origin.split(' ').map((v) => parseFloat(v) || 0);
        const m = toRoot(el, root);
        let p;
        if (a.box === 'fill-box') { const bb = el.getBBox(); p = new DOMPoint(bb.x + ox, bb.y + oy).matrixTransform(m); }
        else p = new DOMPoint(ox, oy).matrixTransform(m);
        const unit = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; // local units → root units
        const flip = m.a * m.d - m.b * m.c < 0;
        Object.assign(layer, { anim: a.name, duration: a.duration, delay: a.delay, timing: a.timing, pivotX: +p.x.toFixed(2), pivotY: +p.y.toFixed(2), unit: +unit.toFixed(4), flip });
      }
      layers.push(layer);
      i++;
    }
    const manifest = { name, width: size.w, height: size.h, scale, layers };
    files.push({ path: `${name}/manifest.json`, text: JSON.stringify(manifest, null, 1) });
    // post in small batches
    for (let k = 0; k < files.length; k += 6) {
      const r = await fetch(`${RECEIVER}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: files.slice(k, k + 6) }) });
      if (!r.ok) throw new Error(await r.text());
    }
    return { name, layers: layers.length, anims: layers.filter((l) => l.kind === 'anim').length };
  } finally {
    freeze.remove();
  }
}
