'use client';

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useLandscapeLock } from '@/lib/useLandscapeLock';

/**
 * The Pusoy553 login artwork (landscape) with a working login form laid over the fields drawn in
 * it. The artwork is always shown whole: the stage takes the artwork's aspect ratio and the
 * largest size that fits the screen inside the safe areas (contain — never cropped, zoomed or
 * stretched); spare space shows a blurred copy. Controls sit on the drawn fields in artwork pixels
 * (as %), and text uses container units, so everything scales with the artwork. The phone is
 * locked to landscape; a portrait browser rotates the stage.
 */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mobile Game artwork (1672 × 941), measured from the image. */
export const LOGIN_ART = {
  src: '/login-art.webp',
  width: 1672,
  height: 941,
  user: { x: 482, y: 404, w: 708, h: 89 },
  pass: { x: 482, y: 518, w: 708, h: 88 },
  button: { x: 489, y: 645, w: 689, h: 108 },
  eye: { x: 1098, y: 536, w: 58, h: 52 },
  textX: 612,
  fieldFill: 'rgb(47, 27, 27)',
  message: { x: 440, y: 760, w: 792, h: 62 },
};

type Layout = typeof LOGIN_ART;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const place = (b: Box, l: Layout): CSSProperties => ({ position: 'absolute', left: pct(b.x, l.width), top: pct(b.y, l.height), width: pct(b.w, l.width), height: pct(b.h, l.height) });

export interface LoginArtProps {
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error?: ReactNode;
}

export default function LoginArt({ username, password, onUsername, onPassword, onSubmit, busy, error }: LoginArtProps) {
  useLandscapeLock();
  const layout = LOGIN_ART;
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'user' | 'pass' | null>(null);
  const fontSize = `max(12px, ${((layout.user.h * 0.36) / layout.width) * 100}cqw)`;

  const inputBox = (field: Box, end: number): Box => {
    const inset = field.h * 0.16;
    return { x: layout.textX, y: field.y + inset, w: end - layout.textX, h: field.h - inset * 2 };
  };
  const inputStyle = (box: Box, covered: boolean): CSSProperties => ({
    ...place(box, layout),
    fontSize,
    background: covered ? layout.fieldFill : 'transparent',
    borderRadius: '0.6em',
    paddingLeft: '0.4em',
    color: '#fff',
    caretColor: '#f5c542',
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && username && password) onSubmit();
  };

  return (
    <div className="fixed inset-0 overflow-clip bg-[radial-gradient(ellipse_at_center,#5a2036_0%,#261020_45%,#12060f_100%)]">
      <div className="absolute left-1/2 top-1/2 h-[100dvh] w-[100dvw] -translate-x-1/2 -translate-y-1/2 overflow-clip portrait:h-[100dvw] portrait:w-[100dvh] portrait:rotate-90">
        <div
          className="absolute inset-0 grid place-items-center overflow-clip"
          style={{ containerType: 'size', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
        >
          <form onSubmit={submit} className="relative" aria-label="Sign in" style={stageStyle(layout.width, layout.height, (layout.user.y + layout.button.y + layout.button.h) / 2)}>
            <MirrorFill src={layout.src} />
            {/* eslint-disable-next-line @next/next/no-img-element -- static export: plain image */}
            <img src={layout.src} alt="Pusoy553" width={layout.width} height={layout.height} decoding="async" fetchPriority="high" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />

            <input
              name="username"
              aria-label="Username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              value={username}
              onChange={(e) => onUsername(e.target.value)}
              onFocus={() => setFocus('user')}
              onBlur={() => setFocus(null)}
              disabled={busy}
              className="border-0 outline-none"
              style={inputStyle(inputBox(layout.user, layout.user.x + layout.user.w - layout.user.h * 0.45), focus === 'user' || username !== '')}
            />
            <input
              name="password"
              aria-label="Password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              onFocus={() => setFocus('pass')}
              onBlur={() => setFocus(null)}
              disabled={busy}
              className="border-0 outline-none"
              style={inputStyle(inputBox(layout.pass, layout.eye.x - 6), focus === 'pass' || password !== '')}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
              className="grid place-items-center rounded-full"
              style={{ ...place(layout.eye, layout), background: show ? layout.fieldFill : 'transparent' }}
            >
              {show && (
                <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="none" stroke="#e5ded6" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>

            <button type="submit" disabled={busy || !username || !password} aria-label={busy ? 'Signing in' : 'Log in'} className="rounded-full active:bg-white/10 disabled:cursor-default" style={place(layout.button, layout)}>
              {busy && (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 font-black tracking-wide text-white" style={{ fontSize }}>
                  <span className="flex items-center gap-[0.6em]">
                    <span className="inline-block h-[1em] w-[1em] animate-spin rounded-full border-[0.18em] border-white/40 border-t-white" />
                    SIGNING IN…
                  </span>
                </span>
              )}
            </button>

            {error && (
              <div role="alert" className="flex justify-center" style={{ ...place(layout.message, layout), height: 'auto' }}>
                <div className="rounded-[0.8em] bg-[#3a0a12]/95 px-[1em] py-[0.35em] text-center leading-snug text-[#ffe3e3] shadow-lg ring-1 ring-red-400/60" style={{ fontSize: `calc(${fontSize} * 0.72)` }}>
                  {error}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen fill without touching the artwork: mirrored copies of the artwork on every side
 * continue its own edges (curtains, lights, floor) seamlessly into any spare screen space, and
 * fade into the background away from the seam. The artwork itself is never cropped, stretched or
 * zoomed. Decorative only (aria-hidden, not clickable).
 */
const MIRRORS: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
// Only a short strip next to the seam: further out the ambient layer takes over (no mirrored logo or panel).
// Sides (curtains, banners) and bottom (floor) mirror well; the top edge has the logo close by, so only a sliver.
const FADE = '#000 0%, #000 4%, transparent 20%';
const FADE_TOP = '#000 0%, transparent 5%';

function mirrorStyle(x: number, y: number): CSSProperties {
  // Masks are drawn before the mirror transform, so the seam is the copy's own near edge.
  const masks = [x === -1 && `linear-gradient(to right, ${FADE})`, x === 1 && `linear-gradient(to left, ${FADE})`, y === -1 && `linear-gradient(to bottom, ${FADE_TOP})`, y === 1 && `linear-gradient(to top, ${FADE})`].filter(Boolean).join(', ');
  const both = x !== 0 && y !== 0;
  return {
    position: 'absolute',
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: '100%',
    height: '100%',
    transform: `scale(${x ? -1 : 1}, ${y ? -1 : 1})`,
    maskImage: masks,
    WebkitMaskImage: masks,
    maskComposite: both ? 'intersect' : undefined,
    WebkitMaskComposite: both ? 'source-in' : undefined,
    pointerEvents: 'none',
  } as CSSProperties;
}

function MirrorFill({ src }: { src: string }) {
  return (
    <>
      {MIRRORS.map(([x, y]) => (
        // eslint-disable-next-line @next/next/no-img-element -- decorative copy of the artwork
        <img key={`${x}${y}`} src={src} alt="" aria-hidden width={LOGIN_ART.width} height={LOGIN_ART.height} decoding="async" draggable={false} className="select-none object-contain" style={mirrorStyle(x, y)} />
      ))}
    </>
  );
}

/**
 * Stage size and position: the largest artwork that fits (scaled by the tighter dimension) and,
 * when there is spare height, shifted so the login panel sits at the screen's centre — never
 * further than the spare space, so the whole artwork always stays on screen.
 */
function stageStyle(width: number, height: number, panelCenterY: number): CSSProperties {
  const ratio = width / height;
  const h = `min(calc(100cqw / ${ratio}), 100cqh)`;
  const k = panelCenterY / height - 0.5;
  return {
    width: `min(100cqw, calc(100cqh * ${ratio}))`,
    aspectRatio: `${width} / ${height}`,
    containerType: 'inline-size',
    transform: k > 0 ? `translateY(calc(-1 * min((100cqh - ${h}) / 2, ${h} * ${k.toFixed(4)})))` : undefined,
  };
}
