import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Btn, I, Panel, Toast, fieldClass } from '../../Components/AdminPanel/kit';
import ShopSharesPanel from '../../Components/AdminPanel/ShopSharesPanel';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage } from '../../lib/api';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';

type Level = 'agent' | 'master';
const LEVELS: Array<[Level, string]> = [
  ['agent', 'Incorporators'],
  ['master', 'Master Agents'],
];

/**
 * Admin Panel → Revenue Sharing Rates (Administrator only; the Agent Panel has no such page). The
 * rate settings that used to sit on the removed Commission Logs page: game commission rates per
 * level and the Shop revenue-sharing rates for key purchases. The server allows saving only for a
 * Super Admin or an Administrator with manage_commissions.
 */
export default function RevenueRates() {
  const { auth } = usePage<SharedProps>().props;
  const canEdit = auth.user?.role === 'super_admin' || (auth.user?.role === 'admin' && (auth.user?.abilities ?? []).includes('manage_commissions'));
  const { data, reload } = useApi<{ meta: { rates: Record<Level, number> } }>('/admin/panel/commission-logs', { per_page: 5 });
  const [rates, setRates] = useState<Record<Level, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data?.meta.rates && rates === null) {
      setRates({ agent: String(data.meta.rates.agent), master: String(data.meta.rates.master) });
    }
  }, [data, rates]);

  const saveRates = async () => {
    if (!rates) return;
    setSaving(true);
    try {
      const r = await api.put<{ message: string }>('/admin/panel/commission-rates', { agent: Number(rates.agent), master: Number(rates.master) });
      setToast({ ok: true, text: r.data.message });
      reload();
    } catch (e) {
      setToast({ ok: false, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPanelLayout title="Revenue Sharing Rates" subtitle="Set centrally by the Administrator">
      <ShopSharesPanel onToast={setToast} />

      <Panel title="Game Commission Rates" icon={<I.percent className="h-6 w-6" />}>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-[#5b5274] dark:text-white/65">
            Percent of the platform fee collected from each player&apos;s game. The player&apos;s direct sponsor earns its rate; each upline level earns the difference up to its own rate (for example under a Master Agent: Master 40%, Incorporator 50−40 = 10%).{' '}
            {canEdit ? 'Individual agents can be given their own rate from the Agents page.' : 'Only the Administrator can change these rates.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {LEVELS.map(([l, label]) => (
              <label key={l} className="block w-40">
                <span className="mb-1 block text-xs font-bold uppercase text-[#6b6385] dark:text-white/55">{label} %</span>
                <input inputMode="decimal" disabled={!canEdit} value={rates?.[l] ?? ''} onChange={(e) => rates && setRates({ ...rates, [l]: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`${label} rate`} className={fieldClass} />
              </label>
            ))}
            {canEdit && (
              <Btn onClick={saveRates} disabled={saving || !rates}>
                {saving ? 'Saving…' : 'Save rates'}
              </Btn>
            )}
          </div>
        </div>
      </Panel>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
