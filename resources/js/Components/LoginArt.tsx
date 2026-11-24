import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';

/**
 * The Pusoy553 login artwork with a working login form laid over the fields drawn in it.
 *
 * The artwork is always shown whole: the stage box takes the artwork's own aspect ratio and the
 * largest size that fits the screen (contain — never cropped, zoomed or stretched); spare screen
 * space shows a blurred copy of the same artwork. Every control is positioned in artwork pixels
 * (converted to %), so it stays exactly on its drawn field at any size. Text sizes use container
 * units of the stage box, so they scale with the artwork too.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LoginArtLayout {
  src: string;
  width: number;
  height: number;
  /** The drawn Username / Password fields and LOG IN button. */
  user: Box;
  pass: Box;
  button: Box;
  /** The drawn eye (show / hide password) icon. */
  eye: Box;
  /** Where typing starts (just left of the drawn "Username" / "Password" label). */
  textX: number;
  /** The fields' fill colour: covers the drawn label once something is typed. */
  fieldFill: string;
  /** Where messages appear (below the button). */
  message: Box;
}

/** Web App artwork (1672 × 941), measured from the image. */
export const WEB_LOGIN_ART: LoginArtLayout = {
  src: '/images/login-art.webp',
  width: 1672,
  height: 941,
  user: { x: 521, y: 370, w: 630, h: 81 },
  pass: { x: 521, y: 475, w: 630, h: 81 },
  button: { x: 531, y: 593, w: 610, h: 94 },
  eye: { x: 1074, y: 489, w: 56, h: 52 },
  textX: 632,
  fieldFill: 'rgb(35, 20, 26)',
  message: { x: 471, y: 700, w: 730, h: 58 },
};

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function place(b: Box, layout: LoginArtLayout): CSSProperties {
  return { position: 'absolute', left: pct(b.x, layout.width), top: pct(b.y, layout.height), width: pct(b.w, layout.width), height: pct(b.h, layout.height) };
}

export interface LoginArtProps {
  layout: LoginArtLayout;
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Error (red) or notice (green) shown under the button. */
  error?: ReactNode;
  notice?: ReactNode;
}

export default function LoginArt({ layout, username, password, onUsername, onPassword, onSubmit, busy, error, notice }: LoginArtProps) {
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'user' | 'pass' | null>(null);
  const fontSize = `max(12px, ${((layout.user.h * 0.36) / layout.width) * 100}cqw)`;

  // The input covers the field from the drawn label to just before the eye (or the field's end).
  const inputBox = (field: Box, end: number): Box => {
    const inset = field.h * 0.16;
    return { x: layout.textX, y: field.y + inset, w: end - layout.textX, h: field.h - inset * 2 };
  };
  const userInput = inputBox(layout.user, layout.user.x + layout.user.w - layout.user.h * 0.45);
  const passInput = inputBox(layout.pass, layout.eye.x - 6);
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
    <div className="fixed inset-0 overflow-clip bg-[#12060f] select-none">
      {/* Ambient light far from the artwork (behind the mirrored edges): a soft, darkened copy over the whole screen. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative copy of the artwork */}
      <img src={layout.src} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl" />
      <div
        className="absolute inset-0 grid place-items-center overflow-clip"
        style={{ containerType: 'size', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
      >
        <form
          onSubmit={submit}
          className="relative"
          style={stageStyle(layout.width, layout.height, (layout.user.y + layout.button.y + layout.button.h) / 2)}
          aria-label="Sign in"
        >
          <MirrorFill src={layout.src} />
          <img src={layout.src} alt="Pusoy553" draggable={false} className="absolute inset-0 h-full w-full object-contain" fetchPriority="high" />

          <input
            name="username"
            aria-label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            onFocus={() => setFocus('user')}
            onBlur={() => setFocus(null)}
            disabled={busy}
            className="border-0 outline-none select-text"
            style={inputStyle(userInput, focus === 'user' || username !== '')}
          />
          <input
            name="password"
            aria-label="Password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            onFocus={() => setFocus('pass')}
            onBlur={() => setFocus(null)}
            disabled={busy}
            className="border-0 outline-none select-text"
            style={inputStyle(passInput, focus === 'pass' || password !== '')}
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
              // The drawn eye is crossed out (hidden); while the password shows, an open eye covers it.
              <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="none" stroke="#d9d4cf" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>

          <button
            type="submit"
            disabled={busy || !username || !password}
            aria-label={busy ? 'Signing in' : 'Log in'}
            className="rounded-full transition hover:bg-white/10 active:scale-[0.99] disabled:cursor-default"
            style={place(layout.button, layout)}
          >
            {busy && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 font-black tracking-wide text-white" style={{ fontSize }}>
                <span className="flex items-center gap-[0.6em]">
                  <span className="inline-block h-[1em] w-[1em] animate-spin rounded-full border-[0.18em] border-white/40 border-t-white" />
                  SIGNING IN…
                </span>
              </span>
            )}
          </button>

          {(error || notice) && (
            <div role={error ? 'alert' : 'status'} className="flex justify-center" style={{ ...place(layout.message, layout), height: 'auto' }}>
              <div
                className={`rounded-[0.8em] px-[1em] py-[0.35em] text-center leading-snug shadow-lg ${error ? 'bg-[#3a0a12]/95 text-[#ffe3e3] ring-1 ring-red-400/60' : 'bg-[#0f2a1c]/95 text-[#c8ffd8] ring-1 ring-emerald-400/50'}`}
                style={{ fontSize: `calc(${fontSize} * 0.72)` }}
              >
                {error ?? notice}
              </div>
            </div>
          )}
        </form>
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
        <img key={`${x}${y}`} src={src} alt="" aria-hidden draggable={false} className="select-none object-contain" style={mirrorStyle(x, y)} />
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
