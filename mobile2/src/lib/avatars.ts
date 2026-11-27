/**
 * Cartoon avatars (assets/img/avatars/{id}.webp). Ids match the server's App\Support\Avatars:
 * boy-01…09, girl-01…10, animal-01…10. A player without a choice gets the server's default.
 */
export const AVATARS: Record<string, number> = {
  'boy-01': require('../../assets/img/avatars/boy-01.webp'),
  'boy-02': require('../../assets/img/avatars/boy-02.webp'),
  'boy-03': require('../../assets/img/avatars/boy-03.webp'),
  'boy-04': require('../../assets/img/avatars/boy-04.webp'),
  'boy-05': require('../../assets/img/avatars/boy-05.webp'),
  'boy-06': require('../../assets/img/avatars/boy-06.webp'),
  'boy-07': require('../../assets/img/avatars/boy-07.webp'),
  'boy-08': require('../../assets/img/avatars/boy-08.webp'),
  'boy-09': require('../../assets/img/avatars/boy-09.webp'),
  'girl-01': require('../../assets/img/avatars/girl-01.webp'),
  'girl-02': require('../../assets/img/avatars/girl-02.webp'),
  'girl-03': require('../../assets/img/avatars/girl-03.webp'),
  'girl-04': require('../../assets/img/avatars/girl-04.webp'),
  'girl-05': require('../../assets/img/avatars/girl-05.webp'),
  'girl-06': require('../../assets/img/avatars/girl-06.webp'),
  'girl-07': require('../../assets/img/avatars/girl-07.webp'),
  'girl-08': require('../../assets/img/avatars/girl-08.webp'),
  'girl-09': require('../../assets/img/avatars/girl-09.webp'),
  'girl-10': require('../../assets/img/avatars/girl-10.webp'),
  'animal-01': require('../../assets/img/avatars/animal-01.webp'),
  'animal-02': require('../../assets/img/avatars/animal-02.webp'),
  'animal-03': require('../../assets/img/avatars/animal-03.webp'),
  'animal-04': require('../../assets/img/avatars/animal-04.webp'),
  'animal-05': require('../../assets/img/avatars/animal-05.webp'),
  'animal-06': require('../../assets/img/avatars/animal-06.webp'),
  'animal-07': require('../../assets/img/avatars/animal-07.webp'),
  'animal-08': require('../../assets/img/avatars/animal-08.webp'),
  'animal-09': require('../../assets/img/avatars/animal-09.webp'),
  'animal-10': require('../../assets/img/avatars/animal-10.webp'),
};

export const AVATAR_IDS = Object.keys(AVATARS);

/** The avatar to show: the chosen one when valid, else the player's stable default (server rule). */
export function avatarFor(chosen: string | null | undefined, userId?: number | null): string {
  if (chosen && AVATARS[chosen]) return chosen;
  return AVATAR_IDS[Math.abs(userId ?? 0) % AVATAR_IDS.length];
}

/** The Single Player bots' fixed avatars. */
export const BOT_AVATARS: Record<number, string> = { 2: 'animal-02', 3: 'animal-03', 4: 'animal-08' };
