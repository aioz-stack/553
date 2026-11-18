/**
 * The cartoon avatar collection (images in public/avatars/{id}.webp, 256×256).
 * Ids match the server's App\Support\Avatars exactly: boy-01…boy-09, girl-01…girl-10,
 * animal-01…animal-10. A player who never chose one gets the same default the server uses.
 */
export type AvatarCategory = 'boy' | 'girl' | 'animal';

export const AVATAR_COUNTS: Record<AvatarCategory, number> = { boy: 9, girl: 10, animal: 10 };
export const AVATAR_CATEGORY_LABEL: Record<AvatarCategory, string> = { boy: 'Boys', girl: 'Girls', animal: 'Animals' };

/** Friendly names shown under each avatar in the gallery. */
const NAMES: Record<string, string> = {
  'boy-01': 'Red Hoodie', 'boy-02': 'Backwards Cap', 'boy-03': 'Cool Shades', 'boy-04': 'Silver Hair', 'boy-05': '553 Headband',
  'boy-06': 'Smart Glasses', 'boy-07': 'Straw Hat', 'boy-08': '553 Cap', 'boy-09': 'Beanie',
  'girl-01': 'Hibiscus', 'girl-02': 'Sunny Bun', 'girl-03': '553 Beats', 'girl-04': 'Golden Shades', 'girl-05': 'Pink Buns',
  'girl-06': 'Headphones', 'girl-07': 'Flower Curls', 'girl-08': 'Bookworm', 'girl-09': '553 Cap', 'girl-10': 'Blonde Star',
  'animal-01': 'Husky', 'animal-02': 'Tabby Cat', 'animal-03': 'Panda', 'animal-04': 'Buffalo', 'animal-05': 'Monkey',
  'animal-06': 'Eagle', 'animal-07': 'Tiger', 'animal-08': 'Lion King', 'animal-09': 'Fox', 'animal-10': 'Bunny',
};

export const AVATAR_IDS: string[] = (Object.keys(AVATAR_COUNTS) as AvatarCategory[]).flatMap((c) =>
  Array.from({ length: AVATAR_COUNTS[c] }, (_, i) => `${c}-${String(i + 1).padStart(2, '0')}`),
);

export const isAvatarId = (id: string | null | undefined): id is string => !!id && AVATAR_IDS.includes(id);
export const avatarCategory = (id: string): AvatarCategory => id.split('-')[0] as AvatarCategory;
export const avatarName = (id: string): string => NAMES[id] ?? id;
export const avatarUrl = (id: string): string => `/avatars/${id}.webp`;

/** The avatar to show: the chosen one when valid, else the player's stable default (same rule as the server). */
export function avatarFor(chosen: string | null | undefined, userId?: number | null): string {
  if (isAvatarId(chosen)) return chosen;
  return AVATAR_IDS[Math.abs(userId ?? 0) % AVATAR_IDS.length];
}

/** The Single Player bots' fixed avatars. */
export const BOT_AVATARS: Record<number, string> = { 2: 'animal-02', 3: 'animal-03', 4: 'animal-08' };
