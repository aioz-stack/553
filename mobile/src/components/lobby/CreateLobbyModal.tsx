'use client';

import { useState } from 'react';
import { api, ApiError, errorText } from '@/lib/api';
import { MIN_ENTRIES, MODE_LABEL, MODE_RULE, PREPARATION_SECONDS, fmtDiamonds, type LobbyDetail, type LobbyMode } from '@/lib/lobby';
import { play } from '@/lib/sound';
import { CandyButton, EyeButton, FieldRow, Gem, Modal, Select, TypeBadge, inputClass } from './LobbyUI';

export const NAME_MAX = 30;

/** Client-side checks (the server validates everything again). */
export function lobbyFormProblems(f: { name: string; password: string }): { name?: string; password?: string } {
  const out: { name?: string; password?: string } = {};
  const name = f.name.trim();
  if (!name) out.name = 'Enter a lobby name.';
  else if (name.length < 2) out.name = 'The lobby name needs at least 2 characters.';
  else if (name.length > NAME_MAX) out.name = `The lobby name can be at most ${NAME_MAX} characters.`;
  if (f.password && f.password.length < 4) out.password = 'A lobby password needs at least 4 characters.';
  else if (f.password.length > 32) out.password = 'A lobby password can be at most 32 characters.';
  return out;
}

/**
 * Create Lobby popup: name, optional password (empty = Public, set = Private, shown live), game type,
 * Minimum Entry, Preparation Time. The server checks your diamonds, gives the lobby its ID, seats you
 * as owner and returns the waiting room. With `edit`, the owner changes name / password / time.
 */
export default function CreateLobbyModal({
  balance,
  onClose,
  onCreated,
  edit,
}: {
  /** Your diamonds (display only; the server checks). */
  balance?: number;
  onClose: () => void;
  onCreated: (lobby: LobbyDetail) => void;
  /** Edit an existing lobby (owner, before the game). */
  edit?: LobbyDetail;
}) {
  const [name, setName] = useState(edit?.name ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  // Editing a private lobby: an empty field keeps the current password; Remove makes it public.
  const [clearPw, setClearPw] = useState(false);
  const [mode, setMode] = useState<LobbyMode>(edit?.game_mode ?? 'round_bank');
  const [minEntry, setMinEntry] = useState<number>(edit?.min_entry ?? 100);
  const [prep, setPrep] = useState<number>(edit?.preparation_seconds ?? 45);
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const type: 'public' | 'private' = password ? 'private' : edit?.type === 'private' && !clearPw ? 'private' : 'public';
  const cantAfford = !edit && balance !== undefined && balance < minEntry;

  const submit = async () => {
    if (busy) return;
    const problems = lobbyFormProblems({ name, password });
    if (problems.name || problems.password) {
      setErrors(problems);
      play('lose');
      return;
    }
    if (cantAfford) {
      setErrors({ form: `You need at least ${fmtDiamonds(minEntry)} diamonds for this Minimum Entry.` });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const body = edit
        ? { name: name.trim(), preparation_seconds: prep, ...(password ? { password } : clearPw ? { password: null } : {}) }
        : { name: name.trim(), password: password || null, game_mode: mode, min_entry: minEntry, preparation_seconds: prep };
      const r = await api<{ data: LobbyDetail }>(edit ? `/lobbies/${edit.id}` : '/lobbies', { method: edit ? 'PATCH' : 'POST', body });
      play('chip');
      onCreated(r.data);
    } catch (e) {
      const fields = e instanceof ApiError ? e.errors : undefined;
      setErrors({ name: fields?.name?.[0], password: fields?.password?.[0], form: fields?.name || fields?.password ? undefined : errorText(e) });
      play('lose');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={edit ? 'Lobby Settings' : 'Create Lobby'} onClose={onClose} width={980}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FieldRow label="Lobby Name" error={errors.name} hint={`${name.trim().length}/${NAME_MAX}`}>
          <input aria-label="Lobby Name" value={name} maxLength={NAME_MAX + 5} onChange={(e) => setName(e.target.value)} placeholder="e.g. 553 Rookie Room" className={inputClass} />
        </FieldRow>

        <FieldRow label="Password" error={errors.password} hint={edit?.type === 'private' ? (clearPw ? 'The password will be removed: anyone can join.' : 'Leave empty to keep the current password.') : 'Optional — leave empty for a public lobby.'}>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <input
                aria-label="Password"
                type={showPw ? 'text' : 'password'}
                value={password}
                maxLength={40}
                autoComplete="new-password"
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (e.target.value) setClearPw(false);
                }}
                placeholder={edit?.type === 'private' ? 'Keep current password' : 'No password'}
                className={`${inputClass} pr-16`}
              />
              <EyeButton shown={showPw} onToggle={() => setShowPw((s) => !s)} label="password" />
            </div>
            {edit?.type === 'private' && !password && (
              <button type="button" onClick={() => setClearPw((v) => !v)} className="rounded-full border-2 border-white/40 px-4 py-2 text-[19px] font-bold text-white/85">
                {clearPw ? 'Keep' : 'Remove'}
              </button>
            )}
            <span aria-label="Lobby type" aria-live="polite">
              <TypeBadge type={type} className="text-[22px]" />
            </span>
          </div>
        </FieldRow>

        {!edit && (
          <FieldRow label="Type of Game" hint={MODE_RULE[mode]}>
            <Select label="Type of Game" value={mode} onChange={setMode} options={(['banker', 'round_bank'] as LobbyMode[]).map((m) => [m, MODE_LABEL[m]])} />
          </FieldRow>
        )}

        {!edit && (
          <FieldRow label="Minimum Entry" error={cantAfford ? `You have ${fmtDiamonds(balance ?? 0)} diamonds.` : null} hint={`Players need at least this many diamonds · bet ${fmtDiamonds(minEntry / 10)} per round`}>
            <div className="flex items-center gap-3">
              <Gem size={40} />
              <div className="flex-1">
                <Select label="Minimum Entry" value={minEntry} onChange={setMinEntry} options={MIN_ENTRIES.map((v) => [v, `${fmtDiamonds(v)} Diamonds`])} />
              </div>
            </div>
          </FieldRow>
        )}

        <FieldRow label="Preparation Time" hint="Time to arrange your 13 cards each round">
          <Select label="Preparation Time" value={prep} onChange={setPrep} options={PREPARATION_SECONDS.map((v) => [v, `${v} Seconds`])} />
        </FieldRow>

        {errors.form && (
          <p role="alert" className="mb-3 rounded-full bg-[#3a0d14] px-6 py-2 text-center text-[21px] font-bold text-[#ffb3bd]">
            {errors.form}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-8">
          <CandyButton tone="dark" onClick={onClose} className="h-[84px] w-[300px] text-[34px]">
            Cancel
          </CandyButton>
          <CandyButton tone="purple" type="submit" disabled={busy} className="h-[84px] w-[380px] text-[36px]">
            {busy ? (edit ? 'Saving…' : 'Creating…') : edit ? 'Save' : 'Create Lobby'}
          </CandyButton>
        </div>
      </form>
    </Modal>
  );
}
