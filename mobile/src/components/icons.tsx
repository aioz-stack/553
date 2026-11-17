import { useId, type SVGProps } from 'react';
import { springStyle } from '@/lib/spring';

/**
 * Original filled icon set for the mobile app (24×24, currentColor).
 */
type P = SVGProps<SVGSVGElement>;

/** Every icon does a small idle spring bounce with its own timing. */
const Svg = ({ children, className, style, ...p }: P) => {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" {...p} className={`lx-spring-icon ${className ?? ''}`} style={{ ...springStyle(id, 2.4, 1.8), ...style }}>
      {children}
    </svg>
  );
};

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.2 2.8 10.6a1 1 0 0 0 1.25 1.56L5 11.4V19a2 2 0 0 0 2 2h3.5v-5.5h3V21H17a2 2 0 0 0 2-2v-7.6l.95.76a1 1 0 1 0 1.25-1.56L12 3.2Z" />
  </Svg>
);

export const IconSpade = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5c2.7 3.6 7 6.2 7 10.2a4.2 4.2 0 0 1-6.6 3.4l1 4.4H10.6l1-4.4A4.2 4.2 0 0 1 5 12.7c0-4 4.3-6.6 7-10.2Z" />
  </Svg>
);

export const IconHeart = (p: P) => (
  <Svg {...p}>
    <path d="M12 21c-4.8-4.2-9-7.4-9-11.6A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 9 2.8C21 13.6 16.8 16.8 12 21Z" />
  </Svg>
);

export const IconWallet = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h12a2 2 0 0 1 2 2v1.2A2.5 2.5 0 0 1 21 9.6v8.9A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5V6.5A2.5 2.5 0 0 1 5 4Zm11.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM5.5 6a.5.5 0 0 0 0 1H17V6.5a.5.5 0 0 0-.5-.5h-11Z" />
  </Svg>
);

export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <path d="M7 3h10v1.5h3.5V7a4 4 0 0 1-3.7 4A5 5 0 0 1 13 14.4V17h3v4H8v-4h3v-2.6A5 5 0 0 1 7.2 11 4 4 0 0 1 3.5 7V4.5H7V3Zm-1.5 3.5V7a2 2 0 0 0 1.5 1.9V6.5H5.5Zm11.5 0v2.4A2 2 0 0 0 18.5 7v-.5H17Z" />
  </Svg>
);

export const IconUser = (p: P) => (
  <Svg {...p}>
    <path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 10.5c4.7 0 8.5 2.4 8.5 5.4V21h-17v-2.1c0-3 3.8-5.4 8.5-5.4Z" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5a6 6 0 0 1 6 6v3.7l1.7 3.4A1 1 0 0 1 18.8 17H5.2a1 1 0 0 1-.9-1.4L6 12.2V8.5a6 6 0 0 1 6-6Zm-2.8 15.8h5.6a2.8 2.8 0 0 1-5.6 0Z" />
  </Svg>
);

export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M15.4 4.6a1.5 1.5 0 0 1 0 2.1L10.1 12l5.3 5.3a1.5 1.5 0 1 1-2.1 2.1l-6.4-6.3a1.5 1.5 0 0 1 0-2.2l6.4-6.3a1.5 1.5 0 0 1 2.1 0Z" />
  </Svg>
);

export const IconGift = (p: P) => (
  <Svg {...p}>
    <path d="M9 3a3 3 0 0 1 3 1.8A3 3 0 1 1 16.6 8H20a1 1 0 0 1 1 1v3H3V9a1 1 0 0 1 1-1h3.4A3 3 0 0 1 9 3Zm0 2a1 1 0 0 0 0 2h2V6a1 1 0 0 0-1-1H9Zm6 0a1 1 0 0 0-1 1v1h2a1 1 0 0 0 0-2h-1ZM4 13.5h7V21H6a2 2 0 0 1-2-2v-5.5Zm9 0h7V19a2 2 0 0 1-2 2h-5v-7.5Z" />
  </Svg>
);

export const IconLock = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5a5 5 0 0 1 5 5V10h.5A2.5 2.5 0 0 1 20 12.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5v-7A2.5 2.5 0 0 1 6.5 10H7V7.5a5 5 0 0 1 5-5Zm0 2.5A2.5 2.5 0 0 0 9.5 7.5V10h5V7.5A2.5 2.5 0 0 0 12 5Z" />
  </Svg>
);

export const IconUsers = (p: P) => (
  <Svg {...p}>
    <path d="M9 4a3.8 3.8 0 1 1 0 7.6A3.8 3.8 0 0 1 9 4Zm8 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM9 13c4 0 7 2 7 4.6V20H2v-2.4C2 15 5 13 9 13Zm8.5.6c2.6.3 4.5 1.9 4.5 3.9V20h-4.5v-2.4c0-1.6-.6-3-1.7-4h1.7Z" />
  </Svg>
);

export const IconClock = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 4a1 1 0 0 0-1 1V12a1 1 0 0 0 .4.8l3 2.3a1 1 0 0 0 1.2-1.6L13 11.5v-4a1 1 0 0 0-1-1Z" />
  </Svg>
);

export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M10.4 2.5h3.2l.5 2.4 1.5.7 2.1-1.3 2.3 2.3-1.3 2.1.7 1.5 2.4.5v3.2l-2.4.5-.7 1.5 1.3 2.1-2.3 2.3-2.1-1.3-1.5.7-.5 2.4h-3.2l-.5-2.4-1.5-.7-2.1 1.3-2.3-2.3 1.3-2.1-.7-1.5-2.4-.5v-3.2l2.4-.5.7-1.5-1.3-2.1 2.3-2.3 2.1 1.3 1.5-.7.5-2.4ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
  </Svg>
);

export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M4 4.5h3v3H4v-3Zm5 .5h11v2H9V5Zm-5 5.5h3v3H4v-3Zm5 .5h11v2H9v-2Zm-5 5.5h3v3H4v-3Zm5 .5h11v2H9v-2Z" />
  </Svg>
);

export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6L13.5 2Z" />
  </Svg>
);

export const IconCrown = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19.5 18h-15L3 7.5ZM5 19.5h14V21H5v-1.5Z" />
  </Svg>
);

export const IconBank = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5 21.5 7.5V10h-19V7.5L12 2.5ZM4.5 11.5h3v6h-3v-6Zm6 0h3v6h-3v-6Zm6 0h3v6h-3v-6ZM3 19h18v2.5H3V19Z" />
  </Svg>
);

export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5 20 5.5v6c0 4.8-3.4 9-8 10.5-4.6-1.5-8-5.7-8-10.5v-6l8-3Zm3.3 6.2L11 13l-2.3-2.3-1.4 1.4L11 15.8l5.7-5.7-1.4-1.4Z" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M10.5 4h3v6.5H20v3h-6.5V20h-3v-6.5H4v-3h6.5V4Z" />
  </Svg>
);

export const IconSoundOn = (p: P) => (
  <Svg {...p}>
    <path d="M4 9h3.5L12 5v14l-4.5-4H4V9Zm11.5-1.8a6 6 0 0 1 0 9.6l-1.2-1.6a4 4 0 0 0 0-6.4l1.2-1.6Zm2.6-3a9.6 9.6 0 0 1 0 15.6l-1.2-1.6a7.6 7.6 0 0 0 0-12.4l1.2-1.6Z" />
  </Svg>
);

export const IconSoundOff = (p: P) => (
  <Svg {...p}>
    <path d="M4 9h3.5L12 5v14l-4.5-4H4V9Zm11.3.1 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3-2.3-2.3Z" />
  </Svg>
);

export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M10 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8v-2h8V5h-8V3Zm-.6 4.6 1.4 1.4L8.8 11H16v2H8.8l2 2-1.4 1.4L5 12l4.4-4.4Z" />
  </Svg>
);

export const IconRotate = (p: P) => (
  <Svg {...p}>
    <path d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4.5L15 9h2.2A6 6 0 0 0 6.3 10l-1.9-.6A8 8 0 0 1 12 4Zm-6.5 6.5L9 15H6.8a6 6 0 0 0 10.9 1l1.9.6A8 8 0 0 1 4.6 15H2l3.5-4.5Z" />
  </Svg>
);

export const IconUserPlus = (p: P) => (
  <Svg {...p}>
    <path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10c4.4 0 8 2 8 4.5V20H1v-1.5C1 16 4.6 14 9 14Zm10-7h2v2.5h2.5v2H21V14h-2v-2.5h-2.5v-2H19V7Z" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m9.5 15.6 9.2-9.2 1.6 1.6L9.5 18.8 3.7 13l1.6-1.6 4.2 4.2Z" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
  </Svg>
);

export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M3 20.5 21.5 12 3 3.5V10l13 2-13 2v6.5Z" />
  </Svg>
);

export const IconStar = (p: P) => (
  <Svg {...p}>
    <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z" />
  </Svg>
);
