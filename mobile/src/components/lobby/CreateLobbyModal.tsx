'use client';

import { useState, type ReactNode } from 'react';
import { api, ApiError, errorText } from '@/lib/api';
import { MODE_RULE, PREPARATION_SECONDS, TIERS, entryProblem, fmtChips, keysLabel, type LobbyDetail, type LobbyTier } from '@/lib/lobby';
import { play } from '@/lib/sound';
import { CandyButton, ChipMark, EyeButton, Modal, Select, TypeBadge, inputClass } from './LobbyUI';

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

/** Compact inputs for this popup (same look as the other popups, a little smaller). */
const field = `${inputClass} !h-[52px] !rounded-[16px] !text-[22px]`;

/** A compact labelled row: label on the left, control on the right, hint / error underneath. */
function Row({ label, children, error, hint }: { label: string; children: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-4">
        <span className="w-[190px] shrink-0 font-display text-[23px] font-black text-[#ffe9b0]">{label}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {(error || hint) && <p className={`ml-[206px] mt-0.5 text-[17px] font-bold ${error ? 'text-[#ff9aa8]' : 'text-white/60'}`}>{error ?? hint}</p>}
    </div>
  );
}

/**
 * Create Lobby popup (compact: fits the screen; the fields scroll inside it while the buttons stay
 * visible). Name, optional password (empty = Public, set = Private, shown live), entry tier
 * (Minimum Entry 100 / 500 / 1,000 Chips, each with its own in-game bets and Keys fee) and
 * Preparation Time. Round Bank is the only game type. There is no bet here: bets are chosen in the
 * game, each round, from the tier's chips. The server checks your Chips and Keys, gives the lobby its
 * ID, seats you as owner and returns the waiting room. With `edit`, the owner changes name /
 * password / time.
 */
export default function CreateLobbyModal({
  balance,
  keys,
  tiers = TIERS,
  onClose,
  onCreated,
  edit,
}: {
  /** Your Chips (display only; the server checks). */
  balance?: number;
  /** Your Keys (display only; the server checks). */
  keys?: number;
  /** The entry tiers from the server (defaults to the built-in list). */
  tiers?: LobbyTier[];
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
  const [minEntry, setMinEntry] = useState<number>(edit?.min_entry ?? tiers[0]?.min_entry ?? 100);
  const tier = tiers.find((t) => t.min_entry === minEntry) ?? tiers[0];
  const [prep, setPrep] = useState<number>(edit?.preparation_seconds ?? 45);
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const type: 'public' | 'private' = password ? 'private' : edit?.type === 'private' && !clearPw ? 'private' : 'public';
  // To create (and play) you need the tier's Minimum Entry in Chips and its Keys fee.
  const problem = edit ? null : entryProblem(tier, tier.bets[0], balance, keys);

  const submit = async () => {
    if (busy) return;
    const problems = lobbyFormProblems({ name, password });
    if (problems.name || problems.password) {
      setErrors(problems);
      play('lose');
      return;
    }
    if (problem) {
      setErrors({ form: problem });
      play('lose');
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const body = edit
        ? { name: name.trim(), preparation_seconds: prep, ...(password ? { password } : clearPw ? { password: null } : {}) }
        : { name: name.trim(), password: password || null, game_mode: 'round_bank', min_entry: minEntry, preparation_seconds: prep };
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

  const footer = (
    <>
      {errors.form && (
        <p role="alert" className="mb-2 rounded-full bg-[#3a0d14] px-5 py-1.5 text-center text-[19px] font-bold text-[#ffb3bd]">
          {errors.form}
        </p>
      )}
      <div className="flex justify-center gap-6">
        <CandyButton tone="dark" onClick={onClose} className="h-[66px] w-[240px] text-[28px]">
          Cancel
        </CandyButton>
        <CandyButton tone="purple" onClick={submit} disabled={busy} className="h-[66px] w-[300px] text-[30px]">
          {busy ? (edit ? 'Saving…' : 'Creating…') : edit ? 'Save' : 'Create Lobby'}
        </CandyButton>
      </div>
    </>
  );

  return (
    <Modal title={edit ? 'Lobby Settings' : 'Create Lobby'} onClose={onClose} width={820} maxHeight={780} compact footer={footer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Row label="Lobby Name" error={errors.name} hint={`${name.trim().length}/${NAME_MAX}`}>
          <input aria-label="Lobby Name" value={name} maxLength={NAME_MAX + 5} onChange={(e) => setName(e.target.value)} placeholder="e.g. 553 Rookie Room" className={field} />
        </Row>

        <Row label="Password" error={errors.password} hint={edit?.type === 'private' ? (clearPw ? 'The password will be removed: anyone can join.' : 'Leave empty to keep the current password.') : 'Optional — leave empty for a public lobby.'}>
          <div className="flex items-center gap-3">
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
                className={`${field} pr-16`}
              />
              <EyeButton shown={showPw} onToggle={() => setShowPw((s) => !s)} label="password" />
            </div>
            {edit?.type === 'private' && !password && (
              <button type="button" onClick={() => setClearPw((v) => !v)} className="rounded-full border-2 border-white/40 px-3 py-1.5 text-[17px] font-bold text-white/85">
                {clearPw ? 'Keep' : 'Remove'}
              </button>
            )}
            <span aria-label="Lobby type" aria-live="polite">
              <TypeBadge type={type} className="text-[19px]" />
            </span>
          </div>
        </Row>

        {!edit && (
          <Row label="Type of Game" hint={MODE_RULE.round_bank}>
            <div aria-label="Type of Game" className={`${field} flex items-center`}>
              Round Bank
            </div>
          </Row>
        )}

        {!edit && (
          <Row label="Minimum Entry">
            <div className="flex items-center gap-3">
              <ChipMark size={34} />
              <div className="flex-1">
                <Select label="Minimum Entry" value={minEntry} onChange={setMinEntry} options={tiers.map((t) => [t.min_entry, `${fmtChips(t.min_entry)} Chips · ${keysLabel(t.keys)}`])} />
              </div>
            </div>
          </Row>
        )}

        {/* What this tier means in the game: its only bets, and the Keys fee paid when the game starts. */}
        {!edit && (
          <div aria-label="Tier rules" className="mb-2.5 ml-[206px] rounded-[18px] border-[3px] border-[#d9a441]/60 bg-[#1d0306]/80 px-4 py-2 text-[18px] font-bold leading-snug text-white/85">
            <p>
              In-game bets: <b className="text-[#ffe14d]">{tier.bets.map(fmtChips).join(' / ')} Chips</b> · chosen each round in the game · hold 2× your bet.
            </p>
            <p>
              Entry fee: <b className="text-[#ffe14d]">{keysLabel(tier.keys)}</b>, deducted once when the game starts.
            </p>
            {(balance !== undefined || keys !== undefined) && (
              <p className={problem ? 'text-[#ff9aa8]' : 'text-white/60'}>
                You have {balance !== undefined ? `${fmtChips(Math.floor(balance))} Chips` : '…'} · {keys !== undefined ? keysLabel(keys) : '…'}
              </p>
            )}
          </div>
        )}

        <Row label="Preparation Time" hint="Time to arrange your 13 cards each round">
          <Select label="Preparation Time" value={prep} onChange={setPrep} options={PREPARATION_SECONDS.map((v) => [v, `${v} Seconds`])} />
        </Row>
        {/* Enter submits the form. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
