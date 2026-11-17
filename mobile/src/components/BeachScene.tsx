/**
 * Original cartoon tropical-beach backdrop for the player home: sky, sun,
 * clouds, a distant island, sea with waves, sand and palm trees. Pure SVG
 * (scales to any phone without image assets).
 */
export default function BeachScene({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2aa7ea" />
          <stop offset="0.55" stopColor="#7fd4f7" />
          <stop offset="1" stopColor="#d8f6ff" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.45" stopColor="#ffe36b" />
          <stop offset="1" stopColor="#ffe36b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13b6d9" />
          <stop offset="0.6" stopColor="#0a8fc0" />
          <stop offset="1" stopColor="#36d3d6" />
        </linearGradient>
        <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde4a6" />
          <stop offset="1" stopColor="#efbd6b" />
        </linearGradient>
        <linearGradient id="trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9a5b2b" />
          <stop offset="0.5" stopColor="#c98a4b" />
          <stop offset="1" stopColor="#8a4f24" />
        </linearGradient>
        <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fd35a" />
          <stop offset="1" stopColor="#1f8a3a" />
        </linearGradient>
      </defs>

      <rect width="400" height="860" fill="url(#sky)" />

      {/* sun + rays */}
      <circle cx="318" cy="118" r="110" fill="url(#sun)" />
      <circle cx="318" cy="118" r="42" fill="#fff3a8" />

      {/* clouds */}
      <g fill="#fff" opacity="0.95" className="animate-[float_9s_ease-in-out_infinite]">
        <ellipse cx="78" cy="96" rx="46" ry="20" />
        <ellipse cx="108" cy="84" rx="30" ry="22" />
        <ellipse cx="52" cy="88" rx="24" ry="16" />
      </g>
      <g fill="#fff" opacity="0.85" className="animate-[float_12s_ease-in-out_infinite]">
        <ellipse cx="220" cy="190" rx="38" ry="15" />
        <ellipse cx="244" cy="180" rx="24" ry="17" />
      </g>

      {/* distant island */}
      <path d="M210 402 q30 -40 70 -36 q34 2 64 36 z" fill="#3aa86b" opacity="0.85" />
      <path d="M262 368 q2 -26 -6 -44" stroke="#7b4a24" strokeWidth="3" fill="none" />
      <path d="M256 324 q-18 -4 -26 8 M256 324 q16 -8 26 2 M256 324 q-4 -16 -16 -18" stroke="#2f9a4d" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* sea */}
      <rect y="400" width="400" height="260" fill="url(#sea)" />
      <g stroke="#e6fbff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M24 440 q12 -8 24 0 t24 0" />
        <path d="M150 470 q12 -8 24 0 t24 0" />
        <path d="M290 452 q12 -8 24 0 t24 0" />
        <path d="M70 520 q12 -8 24 0 t24 0" />
        <path d="M230 545 q12 -8 24 0 t24 0" />
      </g>

      {/* shoreline foam */}
      <path d="M0 640 q50 -26 100 -6 t100 -4 t100 -8 t100 6 v40 H0z" fill="#ffffff" opacity="0.75" />

      {/* sand */}
      <path d="M0 650 q60 -30 130 -10 t140 -6 t130 -12 V860 H0z" fill="url(#sand)" />
      <g fill="#e2a95a" opacity="0.6">
        <circle cx="60" cy="740" r="3" />
        <circle cx="160" cy="790" r="2.5" />
        <circle cx="300" cy="760" r="3" />
        <circle cx="350" cy="820" r="2" />
      </g>
      {/* starfish + shell */}
      <path d="M318 712 l6 12 13 2 -10 9 3 13 -12 -7 -12 7 3 -13 -10 -9 13 -2z" fill="#ff7a59" />
      <path d="M96 780 q14 -22 28 0 z" fill="#ffd3e0" />

      {/* left palm */}
      <path d="M30 860 q22 -160 70 -290" stroke="url(#trunk)" strokeWidth="18" fill="none" strokeLinecap="round" />
      <g fill="url(#leaf)">
        <path d="M100 570 q-60 -40 -110 -10 q50 -6 110 10z" />
        <path d="M100 570 q-20 -70 -90 -80 q60 30 90 80z" />
        <path d="M100 570 q30 -70 100 -60 q-70 10 -100 60z" />
        <path d="M100 570 q70 -10 110 40 q-60 -30 -110 -40z" />
        <path d="M100 570 q-40 20 -70 80 q20 -50 70 -80z" />
      </g>
      <circle cx="94" cy="580" r="8" fill="#7b4a24" />
      <circle cx="108" cy="582" r="7" fill="#6a3d1c" />

      {/* right palm */}
      <path d="M392 860 q-16 -120 -64 -220" stroke="url(#trunk)" strokeWidth="14" fill="none" strokeLinecap="round" />
      <g fill="url(#leaf)">
        <path d="M328 640 q50 -40 90 -10 q-40 -8 -90 10z" />
        <path d="M328 640 q10 -60 70 -70 q-50 26 -70 70z" />
        <path d="M328 640 q-40 -50 -100 -36 q60 6 100 36z" />
        <path d="M328 640 q-60 0 -84 46 q40 -30 84 -46z" />
      </g>
    </svg>
  );
}
