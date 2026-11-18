'use client';

import { useRouter } from 'next/navigation';
import LandscapeStage from '@/components/LandscapeStage';
import SettingsPanel from '@/components/SettingsPanel';
import { LanternRoom } from '@/components/table/TableArt';
import { Screen } from '@/components/ui';
import { useLandscapeLock } from '@/lib/useLandscapeLock';

/** Settings as its own screen (e.g. "More settings" from a table); Close returns to the game homepage. */
export default function Settings() {
  const router = useRouter();
  useLandscapeLock();
  return (
    <Screen title="Settings" immersive>
      <LandscapeStage background={<LanternRoom className="h-full w-full" />}>
        <SettingsPanel onClose={() => router.push('/home/')} />
      </LandscapeStage>
    </Screen>
  );
}
