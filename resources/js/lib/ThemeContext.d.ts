import type { JSX, ReactNode } from 'react';

/** Type declarations for Baseplate's ThemeContext.jsx. */
export declare function ThemeProvider(props: { children: ReactNode }): JSX.Element;
export declare function useTheme(): { isDark: boolean; toggle: () => void };
