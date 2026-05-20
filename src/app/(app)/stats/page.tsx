import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { convert } from "@/lib/currency/convert";
import { compactFamilyAdvances } from "@/lib/settle";
import { formatMoney, CATEGORY_MAP } from "@/lib/utils";
import type { Profile, Transaction, Advance, Budget } from "@/lib/db.types";
import { format, parseISO, subDays, subMonths, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import Avatar from "@/components/Avatar";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "30", label: "30 j", days: 30 },
  { value: "90", label: "3 mois", days: 90 },
  { value: "180", label: "6 mois", days: 180 },
  { value: "365", label: "1 an", days: 365 },
] as const;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period =
    PERIODS.find((p) => p.value === periodParam) ?? PERIODS[1]; // default 90j

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!me) redirect("/");

  const isParent = me.role === "parent";
  const display = me.preferred_currency;

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("family_id", me.family_id)
    .returns<Profile[]>();

  const parentIds = (members ?? [])
    .filter((m) => m.role === "parent")
    .map((m) => m.id);
  await compactFamilyAdvances(supabase, me.family_id, parentIds);

  const since = subDays(new Date(), period.days).toISOString().slice(0, 10);

  // Transactions for the period
  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .gte("occurred_on", since)
    .order("occurred_on", { ascending: false })
    .returns<Transaction[]>();

  // Open advances for net debt summary
  const { data: openAdvances } = await supabase
    .from("advances")
    .select("*")
    .neq("status", "closed")
    .returns<Advance[]>();

  // Active budgets (for consumption display)
  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("family_id", me.family_id)
    .eq("active", true)
    .returns<Budget[]>();

  const profilesById = new Map((members ?? []).map((m) => [m.id, m]));

  // --- Aggregations ---

  // 1. Spend by category (sum of |amount| for negative transactions = expenses)
  type CatSum = { value: number; label: string; emoji: string };
  const byCategory = new Map<string, CatSum>();
  for (const t of tx ?? []) {
    const amount = Number(t.amount);
    if (amount >= 0) continue; // only count expenses (debits)
    const converted = await convert(Math.abs(amount), t.currency, display);
    const cat = CATEGORY_MAP[t.category];
    const cur = byCategory.get(t.category) ?? {
      value: 0,
      label: cat?.label ?? t.category,
      emoji: cat?.emoji ?? "📌",
    };
    cur.value += converted;
    byCategory.set(t.category, cur);
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.value - a.value);
  const totalExpense = categoryRows.reduce((s, r) => s + r.value, 0);

  // 2. Spend per child (parents only)
  const byMember = new Map<string, number>();
  for (const t of tx ?? []) {
    const amount = Number(t.amount);
    if (amount >= 0) continue;
    if (!t.concerns_id) continue;
    const member = profilesById.get(t.concerns_id);
    if (!member || member.role !== "child") continue;
    const converted = await convert(Math.abs(amount), t.currency, display);
    byMember.set(t.concerns_id, (byMember.get(t.concerns_id) ?? 0) + converted);
  }
  const memberRows = Array.from(byMember.entries())
    .map(([id, value]) => ({ id, value, profile: profilesById.get(id)! }))
    .sort((a, b) => b.value - a.value);

  // 3. Monthly breakdown for the last 6 months (or shorter if period < 6 months)
  const monthsToShow = period.days >= 180 ? 6 : period.days >= 90 ? 3 : 2;
  const months: { key: string; label: string; value: number }[] = [];
  for (let i = monthsToShow - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(new Date(), i));
    months.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM", { locale: fr }),
      value: 0,
    });
  }
  for (const t of tx ?? []) {
    const amount = Number(t.amount);
    if (amount >= 0) continue;
    const key = format(parseISO(t.occurred_on), "yyyy-MM");
    const m = months.find((mo) => mo.key === key);
    if (!m) continue;
    const converted = await convert(Math.abs(amount), t.currency, display);
    m.value += converted;
  }
  const maxMonthly = Math.max(...months.map((m) => m.value), 1);

  // 4. Total reimbursed during the period (sum of remboursement category, credits)
  let totalReimbursed = 0;
  for (const t of tx ?? []) {
    if (t.category !== "remboursement") continue;
    const amount = Number(t.amount);
    if (amount <= 0) continue;
    totalReimbursed += await convert(amount, t.currency, display);
  }

  // 5. Net family debt (sum of open advances)
  let netFamilyOpen = 0;
  for (const a of openAdvances ?? []) {
    netFamilyOpen += await convert(Number(a.remaining), a.currency, display);
  }

  // 6. Budget consumption per budget (full lifetime, not period-bounded)
  const budgetRows: {
    id: string;
    label: string;
    emoji: string;
    used: number;
    total: number;
    currency: string;
    pct: number;
    over: boolean;
  }[] = [];
  for (const b of budgets ?? []) {
    const { data: btx } = await supabase
      .from("transactions")
      .select("amount, currency, occurred_on")
      .eq("category", b.category)
      .gte("occurred_on", b.start_date)
      .lte("occurred_on", b.end_date ?? "2999-12-31")
      .lt("amount", 0)
      .returns<Pick<Transaction, "amount" | "currency" | "occurred_on">[]>();
    let used = 0;
    for (const t of btx ?? []) {
      used += await convert(Math.abs(Number(t.amount)), t.currency, b.currency);
    }
    const total = Number(b.amount);
    const cat = CATEGORY_MAP[b.category];
    budgetRows.push({
      id: b.id,
      label: b.description || cat?.label || b.category,
      emoji: cat?.emoji ?? "📌",
      used,
      total,
      currency: b.currency,
      pct: total > 0 ? Math.min(100, (used / total) * 100) : 0,
      over: used > total,
    });
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">Récap</h1>
      </header>

      {/* Period selector */}
      <div className="grid grid-cols-4 gap-1 bg-ink-100 rounded-2xl p-1">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/stats?period=${p.value}`}
            replace
            className={cn(
              "py-2 rounded-xl text-xs font-medium text-center transition",
              p.value === period.value
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500"
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <KPI
          label="Dépenses"
          value={formatMoney(totalExpense, display)}
          tone="ink"
        />
        <KPI
          label="Remboursé"
          value={formatMoney(totalReimbursed, display)}
          tone="good"
        />
        <KPI
          label="En attente"
          value={formatMoney(netFamilyOpen, display)}
          tone="warm"
          sub={`${openAdvances?.length ?? 0} avance${
            (openAdvances?.length ?? 0) > 1 ? "s" : ""
          }`}
        />
        <KPI
          label="Transactions"
          value={String(tx?.length ?? 0)}
          tone="ink"
          sub={`sur ${period.label}`}
        />
      </div>

      {/* Budgets */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium">
            Budgets
          </h2>
          <Link href="/budgets" className="text-xs text-accent-700 hover:text-accent-900">
            Gérer →
          </Link>
        </div>
        {budgetRows.length > 0 ? (
          <div className="space-y-3">
            {budgetRows.map((b) => (
              <Link
                key={b.id}
                href={isParent ? `/budgets/${b.id}` : "/budgets"}
                className="block"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{b.emoji}</span>
                  <span className="text-sm font-medium flex-1">{b.label}</span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      b.over ? "text-bad-600" : "text-ink-900"
                    }`}
                  >
                    {formatMoney(b.used, b.currency)}
                  </span>
                  <span className="text-xs text-ink-400 tabular-nums">
                    / {formatMoney(b.total, b.currency)}
                  </span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      b.over ? "bg-bad-500" : "bg-accent-600"
                    }`}
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-ink-50 rounded-2xl p-4 text-center text-sm text-ink-500">
            Aucun budget défini.{" "}
            {isParent && (
              <Link href="/budgets/new" className="text-accent-700">
                En créer un →
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Category breakdown */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
          Par catégorie
        </h2>
        {categoryRows.length > 0 ? (
          <div className="space-y-3">
            {categoryRows.map((r) => {
              const pct = totalExpense > 0 ? (r.value / totalExpense) * 100 : 0;
              return (
                <div key={r.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{r.emoji}</span>
                    <span className="text-sm font-medium flex-1">
                      {r.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(r.value, display)}
                    </span>
                    <span className="text-xs text-ink-400 tabular-nums w-10 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-600 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      {/* Per child (parents only) */}
      {isParent && memberRows.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
            Par enfant
          </h2>
          <div className="space-y-3">
            {memberRows.map((r) => {
              const totalChildren = memberRows.reduce(
                (s, m) => s + m.value,
                0
              );
              const pct = totalChildren > 0 ? (r.value / totalChildren) * 100 : 0;
              return (
                <div key={r.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar
                      emoji={r.profile.avatar_emoji}
                      url={r.profile.avatar_url}
                      size="xs"
                    />
                    <span className="text-sm font-medium flex-1">
                      {r.profile.full_name.split(" ")[0]}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(r.value, display)}
                    </span>
                  </div>
                  <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-600 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Monthly trend */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
          Évolution mensuelle
        </h2>
        {months.some((m) => m.value > 0) ? (
          <div className="bg-ink-50 rounded-2xl p-4">
            <div className="flex items-end justify-between gap-2 h-32">
              {months.map((m) => {
                const h = maxMonthly > 0 ? (m.value / maxMonthly) * 100 : 0;
                return (
                  <div
                    key={m.key}
                    className="flex-1 flex flex-col items-center gap-1.5"
                  >
                    <div className="text-[10px] font-medium text-ink-600 tabular-nums">
                      {m.value > 0 ? Math.round(m.value) : ""}
                    </div>
                    <div className="w-full flex items-end" style={{ height: 90 }}>
                      <div
                        className="w-full bg-accent-600 rounded-t-md transition-all"
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-ink-500 capitalize">
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      <p className="text-xs text-ink-400 text-center pt-2">
        Toutes les valeurs converties en {display}.
      </p>
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "good" | "warm";
}) {
  const toneClass =
    tone === "good"
      ? "text-good-600"
      : tone === "warm"
      ? "text-warm-700"
      : "text-ink-900";
  return (
    <div className="bg-ink-50 rounded-2xl p-4">
      <div className="text-xs text-ink-500 font-medium">{label}</div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums mt-0.5 tracking-tight",
          toneClass
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-ink-50 rounded-2xl p-6 text-center text-sm text-ink-500">
      Aucune donnée sur cette période.
    </div>
  );
}
