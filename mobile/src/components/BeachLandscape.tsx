import { springStyle } from '@/lib/spring';

/**
 * Original cartoon tropical-beach backdrop for the landscape home: sky,
 * clouds, sea, palms, a hut roof, a striped umbrella, a tiled boardwalk and
 * tropical leaves/flowers in the corners. Pure SVG, 1600×900 design space.
 */
function Palm({ x, y, scale = 1, flip = false }: { x: number; y: number; scale?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <g className="lx-palm">
      <path d="M0 0 q-20 -200 40 -400" stroke="url(#bl-trunk)" strokeWidth="26" fill="none" strokeLinecap="round" />
      <g fill="url(#bl-leaf)">
        <path d="M40 -400 q-120 -60 -220 10 q100 -20 220 -10z" />
        <path d="M40 -400 q-50 -120 -170 -120 q110 50 170 120z" />
        <path d="M40 -400 q60 -120 190 -100 q-120 20 -190 100z" />
        <path d="M40 -400 q140 -10 220 80 q-110 -60 -220 -80z" />
        <path d="M40 -400 q-90 40 -140 150 q40 -100 140 -150z" />
        <path d="M40 -400 q80 50 110 160 q-50 -100 -110 -160z" />
      </g>
      <circle cx="30" cy="-392" r="13" fill="#7b4a24" />
      <circle cx="52" cy="-388" r="12" fill="#6a3d1c" />
      </g>
    </g>
  );
}

function Leaf({ x, y, r, s = 1, c = '#2fa84f' }: { x: number; y: number; r: number; s?: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M0 0 q60 -90 0 -220 q-60 130 0 220z" fill={c} />
      <path d="M0 0 v-210" stroke="#1d7a36" strokeWidth="4" />
    </g>
  );
}

function Hibiscus({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="lx-spring-icon" style={springStyle(`flower${x}`, 3, 1.5)}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-34" rx="28" ry="38" fill="#ff3d57" transform={`rotate(${a})`} />
      ))}
      <circle r="14" fill="#ffd23d" />
      <path d="M0 0 l10 -46" stroke="#ffe680" strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
}

export default function BeachLandscape({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="bl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f9ae8" />
          <stop offset="0.6" stopColor="#7ed3f7" />
          <stop offset="1" stopColor="#d6f5ff" />
        </linearGradient>
        <radialGradient id="bl-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fffbe0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bl-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0aa0d0" />
          <stop offset="1" stopColor="#3fd8dc" />
        </linearGradient>
        <linearGradient id="bl-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe1a2" />
          <stop offset="1" stopColor="#efc074" />
        </linearGradient>
        <linearGradient id="bl-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3d9b5" />
          <stop offset="1" stopColor="#d9b48a" />
        </linearGradient>
        <linearGradient id="bl-trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9a5b2b" />
          <stop offset="0.5" stopColor="#cf9150" />
          <stop offset="1" stopColor="#8a4f24" />
        </linearGradient>
        <linearGradient id="bl-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#62d65c" />
          <stop offset="1" stopColor="#1f8a3a" />
        </linearGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#bl-sky)" />
      <circle className="lx-breathe" cx="1080" cy="140" r="260" fill="url(#bl-sun)" opacity="0.9" />

      {/* clouds */}
      <g fill="#fff">
        <g opacity="0.95" className="lx-drift">
          <ellipse cx="1330" cy="230" rx="120" ry="45" />
          <ellipse cx="1400" cy="205" rx="80" ry="55" />
          <ellipse cx="1260" cy="215" rx="60" ry="38" />
        </g>
        <g opacity="0.9" className="lx-drift-rev">
          <ellipse cx="1500" cy="330" rx="110" ry="40" />
          <ellipse cx="1560" cy="305" rx="70" ry="45" />
        </g>
        <g opacity="0.85" className="lx-drift" style={{ animationDuration: '30s' }}>
          <ellipse cx="760" cy="70" rx="90" ry="30" />
          <ellipse cx="800" cy="55" rx="55" ry="32" />
        </g>
        <ellipse cx="1150" cy="440" rx="140" ry="32" opacity="0.8" />
      </g>

      {/* sea + horizon */}
      <rect y="520" width="1600" height="190" fill="url(#bl-sea)" />
      <g className="lx-sea" stroke="#e8fbff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M980 570 q16 -10 32 0 t32 0" />
        <path d="M1240 600 q16 -10 32 0 t32 0" />
        <path d="M1420 560 q16 -10 32 0 t32 0" />
        <path d="M1120 640 q16 -10 32 0 t32 0" />
      </g>
      <path className="lx-sea" style={{ animationDuration: '5s' }} d="M-40 690 q200 -30 400 -10 t400 -6 t400 -10 t480 8 v40 H-40z" fill="#fff" opacity="0.75" />
      <rect y="700" width="1600" height="200" fill="url(#bl-sand)" />

      {/* boardwalk tiles in perspective */}
      <path d="M430 900 L640 700 H1240 L1460 900 Z" fill="url(#bl-tile)" />
      <g stroke="#c49a6c" strokeWidth="3" opacity="0.7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const top = 640 + i * 100;
          const bottom = 430 + i * 172;
          return <line key={i} x1={top} y1="700" x2={bottom} y2="900" />;
        })}
        <line x1="600" y1="740" x2="1285" y2="740" />
        <line x1="545" y1="790" x2="1340" y2="790" />
        <line x1="480" y1="850" x2="1405" y2="850" />
      </g>

      {/* hut roof top-left */}
      <path d="M-20 60 L180 0 L210 90 L-20 160z" fill="#d9582b" />
      <path d="M-20 160 L210 90 L215 112 L-20 184z" fill="#9c3b19" />
      <rect x="40" y="150" width="22" height="520" fill="#a8693a" />

      {/* palms */}
      <Palm x={150} y={760} scale={1.05} />
      <Palm x={1560} y={780} scale={0.95} flip />
      <Palm x={1180} y={560} scale={0.45} />

      {/* umbrella right */}
      <g transform="translate(1520 640)">
        <g className="lx-palm" style={{ animationDuration: '5s' }}>
        <rect x="-4" y="-150" width="8" height="260" fill="#8a5a2c" />
        <path d="M-150 -120 Q0 -260 150 -120 Z" fill="#ff6b3d" />
        <path d="M-150 -120 Q-60 -240 -30 -233 L-50 -120Z" fill="#fff" />
        <path d="M50 -120 L30 -233 Q90 -220 150 -120Z" fill="#fff" />
        <path d="M-150 -120 q25 18 50 0 q25 18 50 0 q25 18 50 0 q25 18 50 0 q25 18 50 0 q25 18 50 0" fill="#e5532a" />
        </g>
      </g>

      {/* floating sparkles */}
      {[[300, 120, 0], [700, 230, 0.8], [1480, 120, 1.6], [960, 500, 2.2], [420, 600, 1.2], [1260, 480, 0.4]].map(([sx, sy, d]) => (
        <g key={sx} transform={`translate(${sx} ${sy})`}>
          <path className="lx-twinkle" style={{ animationDelay: `${d}s`, animationDuration: '2.8s' }} d="M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3Z" fill="#fffbe0" />
        </g>
      ))}

      {/* corner foliage + flowers */}
      <Leaf x={40} y={920} r={-30} s={1.1} />
      <Leaf x={150} y={930} r={10} s={1} c="#38b85a" />
      <Leaf x={260} y={940} r={35} s={0.9} />
      <Leaf x={1600} y={920} r={30} s={1.1} />
      <Leaf x={1490} y={940} r={-15} s={0.95} c="#38b85a" />
      <Hibiscus x={95} y={835} s={1.25} />
      <Hibiscus x={1540} y={860} s={0.9} />
      <Hibiscus x={1430} y={890} s={0.7} />
    </svg>
  );
}
