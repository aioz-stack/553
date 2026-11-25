import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { Btn, I, Panel, fieldClass, when } from "./kit";

type Scenario = "admin" | "incorporator" | "master";
type Role = "admin" | "incorporator" | "master";
type Rates = Record<Scenario, Partial<Record<Role, number>>>;

interface ShopShares {
    rates: Rates;
    can_edit: boolean;
    updated_at: string | null;
    is_default: boolean;
}

const SCENARIOS: Array<[Scenario, string, Role[]]> = [
    ["admin", "Player under an Admin", ["admin"]],
    ["incorporator", "Player under an Incorporator", ["admin", "incorporator"]],
    [
        "master",
        "Player under a Master Agent",
        ["admin", "incorporator", "master"],
    ],
];
const ROLE_LABEL: Record<Role, string> = {
    admin: "Admin",
    incorporator: "Incorporator",
    master: "Master Agent",
};

/** "40" / "40.5" → hundredths, or null when not 0–100 with at most 2 decimals. */
export function toBps(v: string): number | null {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(v.trim())) return null;
    const [w, f = ""] = v.trim().split(".");
    const bps = Number(w) * 100 + Number(f.padEnd(2, "0"));
    return bps <= 10000 ? bps : null;
}

/**
 * Admin Panel → Commission Logs: Shop revenue-sharing rates for key purchases (who gets which
 * percent of the Chips a player pays). Only the Administrator sees and saves this; each scenario
 * must total 100%. New rates apply to future purchases only.
 */
export default function ShopSharesPanel({
    onToast,
}: {
    onToast: (t: { ok: boolean; text: string }) => void;
}) {
    const { data, reload } = useApi<{ data: ShopShares }>(
        "/admin/panel/shop-shares",
    );
    const s = data?.data;
    const [form, setForm] = useState<Record<
        Scenario,
        Partial<Record<Role, string>>
    > | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (s && form === null) {
            setForm(
                Object.fromEntries(
                    SCENARIOS.map(([sc, , roles]) => [
                        sc,
                        Object.fromEntries(
                            roles.map((r) => [r, String(s.rates[sc][r] ?? 0)]),
                        ),
                    ]),
                ) as Record<Scenario, Partial<Record<Role, string>>>,
            );
        }
    }, [s, form]);

    const totals = form
        ? SCENARIOS.map(([sc, , roles]) =>
              roles.reduce<number | null>((sum, r) => {
                  const b = toBps(form[sc][r] ?? "");
                  return sum === null || b === null ? null : sum + b;
              }, 0),
          )
        : [];
    const valid = !!form && totals.every((t) => t === 10000);

    const save = async () => {
        if (!form || !valid) return;
        setSaving(true);
        try {
            const rates = Object.fromEntries(
                SCENARIOS.map(([sc, , roles]) => [
                    sc,
                    Object.fromEntries(
                        roles.map((r) => [r, Number(form[sc][r])]),
                    ),
                ]),
            );
            const r = await api.put<{ message: string }>(
                "/admin/panel/shop-shares",
                { rates },
            );
            onToast({ ok: true, text: r.data.message });
            setForm(null);
            reload();
        } catch (e) {
            onToast({ ok: false, text: errorMessage(e) });
        } finally {
            setSaving(false);
        }
    };

    const editable = !!s?.can_edit;

    return (
        <Panel
            title="Shop Revenue Sharing (Key Purchases)"
            icon={<I.percent className="h-6 w-6" />}
        >
            <div className="space-y-4 px-5 py-4">
                <p className="text-sm text-[#5b5274] dark:text-white/65">
                    Percent of the Chips a player pays for Keys, shared by the
                    player&apos;s direct upline. Each scenario must total 100%.
                    New rates apply to future key purchases only; past purchases
                    keep their rates.
                    {!editable &&
                        s &&
                        " Only the Administrator can change these rates."}
                </p>
                {form && (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {SCENARIOS.map(([sc, title, roles], i) => (
                            <div
                                key={sc}
                                className="rounded-xl border border-[#ece7f8] p-3 dark:border-white/10"
                            >
                                <h4 className="mb-2 text-sm font-extrabold text-[#1c1530] dark:text-white">
                                    {title}
                                </h4>
                                <div className="flex flex-wrap gap-3">
                                    {roles.map((r) => (
                                        <label key={r} className="block w-28">
                                            <span className="mb-1 block text-xs font-bold uppercase text-[#6b6385] dark:text-white/55">
                                                {ROLE_LABEL[r]} %
                                            </span>
                                            <input
                                                inputMode="decimal"
                                                disabled={
                                                    !editable ||
                                                    saving ||
                                                    roles.length === 1
                                                }
                                                value={form[sc][r] ?? ""}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
                                                        [sc]: {
                                                            ...form[sc],
                                                            [r]: e.target.value.replace(
                                                                /[^\d.]/g,
                                                                "",
                                                            ),
                                                        },
                                                    })
                                                }
                                                aria-label={`${title}: ${ROLE_LABEL[r]} percent`}
                                                className={fieldClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <p
                                    className={`mt-2 text-xs font-bold ${totals[i] === 10000 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                                >
                                    Total:{" "}
                                    {totals[i] === null
                                        ? "invalid"
                                        : `${(totals[i]! / 100).toString()}%`}
                                    {totals[i] !== 10000 && " — must be 100%"}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                    {editable && (
                        <Btn onClick={save} disabled={!valid || saving}>
                            {saving ? "Saving…" : "Save revenue-sharing rates"}
                        </Btn>
                    )}
                    {s && (
                        <span className="text-xs text-[#857d9c] dark:text-white/45">
                            {s.is_default
                                ? "Using the default rates."
                                : `Last changed ${when(s.updated_at ?? "")}.`}
                        </span>
                    )}
                </div>
            </div>
        </Panel>
    );
}
