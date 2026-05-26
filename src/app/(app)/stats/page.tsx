import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { convert } from "@/lib/currency/convert";
import { recomputeFamilyAdvances } from "@/lib/settle";
import { formatMoney, CATEGORIES, CATEGORY_MAP, cn } from "@/lib/utils";
import type { Profile, Transaction, Advance, Budget } from "@/lib/db.types";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import Avatar from "@/components/Avatar";

const PERIODS = [
  { value: "30", label: "30 j", days: 30 },
  { value: "90", label: "3 mois", days: 90 },
  { value: "180", label: "6 mois", days: 180 },
  { value: "365", label: "1 an", days: 365 },
] as const;

const CAT_COLOR_BY_KEY: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.color])
);

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period = PERIODS.find((p) => p.value === periodParam) ?? PERIODS[1];

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
  await recomputeFamilyAdvances(supabase, me.family_id, parentIds);

  const since = subDays(new Date(), period.days).toISOString().slice(0, 10);
  const sincePrev = subDays(new Date(), period.days * 2)
    .toISOString()
    .slice(0, 10);

  // Current + previous period transactions in a single fetch
  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .gte("occurred_on", sincePrev)
    .order("occurred_on", { ascending: false })
    .returns<Transaction[]>();

  const { data: openAdvances } = await supabase
    .from("advances")
    .select("*")
    .neq("status", "closed")
    .returns<Advance[]>();

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("family_id", me.family_id)
    .eq("active", true)
    .returns<Budget[]>();

  const profilesById = new Map((members ?? []).map((m) => [m.id, m]));

  const currentTx = (tx ?? []).filter((t) => t.occurred_on >= since);
  const prevTx = (tx ?? []).filter(
    (t) => t.occurred_on < since && t.occurred_on >= sincePrev
  );

  // -- Helpers --
  async function sumExpenses(
    rows: Transaction[]
  ): Promise<{ total: number; count: number; biggest: number }> {
    let total = 0;
    let count = 0;
    let biggest = 0;
    for (const t of rows) {
      const a = Number(t.amount);
      if (a >= 0) continue;
      const conv = await convert(Math.abs(a), t.currency, display);
      total += conv;
      count += 1;
      if (conv > biggest) biggest = conv;
    }
    return { total, count, biggest };
  }

  const cur = await sumExpenses(currentTx);
  const prev = await sumExpenses(prevTx);
  const delta = prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : 0;
  const avgTicket = cur.count > 0 ? cur.total / cur.count : 0;

  // Total reimbursed in period (positive remboursement transactions)
  let totalReimbursed = 0;
  for (const t of currentTx) {
    if (t.category !== "remboursement") continue;
    const a = Number(t.amount);
    if (a <= 0) continue;
    totalReimbursed += await convert(a, t.currency, display);
  }

  // -- Categories breakdown (donut) --
  type CatRow = {
    key: string;
    label: string;
    emoji: string;
    color: string;
    value: number;
  };
  const byCat = new Map<string, CatRow>();
  for (const t of currentTx) {
    const a = Number(t.amount);
    if (a >= 0) continue;
    const conv = await convert(Math.abs(a), t.currency, display);
    const meta = CATEGORY_MAP[t.category];
    const cur = byCat.get(t.category) ?? {
      key: t.category,
      label: meta?.label ?? t.category,
      emoji: meta?.emoji ?? "📌",
      color: CAT_COLOR_BY_KEY[t.category] ?? "#94a3b8",
      value: 0,
    };
    cur.value += conv;
    byCat.set(t.category, cur);
  }
  const catRows = Array.from(byCat.values()).sort((a, b) => b.value - a.value);
  const totalCatExpense = catRows.reduce((s, r) => s + r.value, 0);

  // -- Per member (parents only) --
  const byMember = new Map<string, number>();
  for (const t of currentTx) {
    const a = Number(t.amount);
    if (a >= 0) continue;
    if (!t.concerns_id) continue;
    const m = profilesById.get(t.concerns_id);
    if (!m || m.role !== "child") continue;
    const conv = await convert(Math.abs(a), t.currency, display);
    byMember.set(t.concerns_id, (byMember.get(t.concerns_id) ?? 0) + conv);
  }
  const memberRows = Array.from(byMember.entries())
    .map(([id, value]) => ({ id, value, profile: profilesById.get(id)! }))
    .sort((a, b) => b.value - a.value);
  const totalMember = memberRows.reduce((s, m) => s + m.value, 0);

  // -- Top 5 expenses --
  type TopRow = Transaction & { converted: number };
  const topCandidates: TopRow[] = [];
  for (const t of currentTx) {
    const a = Number(t.amount);
    if (a >= 0) continue;
    const conv = await convert(Math.abs(a), t.currency, display);
    topCandidates.push({ ...t, converted: conv });
  }
  topCandidates.sort((a, b) => b.converted - a.converted);
  const topRows = topCandidates.slice(0, 5);

  // -- Budgets --
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

  // -- Net family open (rappel) --
  let netOpen = 0;
  for (const a of openAdvances ?? []) {
    netOpen += await convert(Number(a.remaining), a.currency, display);
  }

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-400 font-medium">
            Sur les {period.label}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-0.5">
            Stats
          </h1>
        </div>
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

      {/* Hero — total + delta */}
      <section className="bg-ink-50 rounded-3xl p-5">
        <p className="text-xs uppercase tracking-widest text-ink-500 font-medium">
          Total dépensé
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <div className="text-4xl font-semibold tracking-tight tabular-nums">
            {formatMoney(cur.total, display)}
          </div>
          {prev.total > 0 && (
            <Delta delta={delta} />
          )}
        </div>
        <p className="text-xs text-ink-400 mt-1">
          {prev.total > 0
            ? `vs ${formatMoney(prev.total, display)} sur les ${period.label} précédents`
            : "Pas de référence sur la période précédente"}
        </p>
      </section>

      {/* Mini KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <MiniKPI label="Ticket moyen" value={formatMoney(avgTicket, display)} />
        <MiniKPI label="Transactions" value={String(cur.count)} />
        <MiniKPI label="Remboursé" value={formatMoney(totalReimbursed, display)} />
      </div>

      {/* Categories — donut */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
          Par catégorie
        </h2>
        {catRows.length > 0 ? (
          <div className="flex items-center gap-5">
            <Donut data={catRows} size={150} stroke={26} centerLabel={formatMoney(totalCatExpense, display)} />
            <ul className="flex-1 space-y-1.5">
              {catRows.map((r) => {
                const pct = totalCatExpense > 0 ? (r.value / totalCatExpense) * 100 : 0;
                return (
                  <li key={r.key} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: r.color }}
                    />
                    <span className="flex-1 truncate text-ink-900">
                      {r.label}
                    </span>
                    <span className="tabular-nums text-xs text-ink-500">
                      {pct.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

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

      {/* Per child (parents only) */}
      {isParent && memberRows.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
            Par enfant
          </h2>
          <div className="space-y-2">
            {memberRows.map((r) => {
              const pct = totalMember > 0 ? (r.value / totalMember) * 100 : 0;
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

      {/* Top expenses */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
          Top 5 dépenses
        </h2>
        {topRows.length > 0 ? (
          <div className="space-y-1.5">
            {topRows.map((t) => {
              const cat = CATEGORY_MAP[t.category];
              const who = t.concerns_id
                ? profilesById.get(t.concerns_id)
                : null;
              return (
                <Link
                  key={t.id}
                  href={`/transactions/${t.id}`}
                  className="flex items-center gap-3 py-2 px-3 -mx-3 rounded-2xl hover:bg-ink-50 transition"
                >
                  <div className="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center text-lg">
                    {cat?.emoji ?? "📌"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900 truncate">
                      {t.description || cat?.label}
                    </div>
                    <div className="text-xs text-ink-400 truncate">
                      {who?.full_name.split(" ")[0] ?? "—"} ·{" "}
                      {format(parseISO(t.occurred_on), "d MMM", { locale: fr })}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-bad-600 whitespace-nowrap">
                    {formatMoney(t.converted, display)}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      {/* Reminder: open balance */}
      {netOpen > 0 && (
        <section>
          <Link
            href="/"
            className="flex items-center justify-between p-4 rounded-2xl bg-warm-500/10 hover:bg-warm-500/20 transition"
          >
            <div>
              <div className="text-xs uppercase tracking-widest text-warm-700 font-medium">
                Reste à rembourser (en cours)
              </div>
              <div className="text-xl font-semibold tabular-nums text-warm-700 mt-0.5">
                {formatMoney(netOpen, display)}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warm-700">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </section>
      )}

      <p className="text-xs text-ink-400 text-center pt-2">
        Toutes les valeurs converties en {display}.
      </p>
    </div>
  );
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-50 rounded-2xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums mt-0.5 tracking-tight truncate">
        {value}
      </div>
    </div>
  );
}

function Delta({ delta }: { delta: number }) {
  const flat = Math.abs(delta) < 0.5;
  if (flat) {
    return (
      <span className="text-xs font-medium text-ink-500 bg-ink-100 px-2 py-1 rounded-lg">
        ± 0%
      </span>
    );
  }
  const up = delta > 0;
  // For expenses, going up is "bad" (more spent), going down is "good" (less spent).
  const cls = up
    ? "text-bad-700 bg-bad-500/10"
    : "text-good-700 bg-good-500/10";
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-lg inline-flex items-center gap-0.5 ${cls}`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {up ? "+" : ""}
      {delta.toFixed(0)}%
    </span>
  );
}

function Donut({
  data,
  size,
  stroke,
  centerLabel,
}: {
  data: { value: number; color: string }[];
  size: number;
  stroke: number;
  centerLabel: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink-100)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
          Total
        </div>
        <div className="text-sm font-semibold tabular-nums tracking-tight px-2">
          {centerLabel}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-ink-50 rounded-2xl p-6 text-center text-sm text-ink-500">
      Pas de données sur cette période.
    </div>
  );
}
