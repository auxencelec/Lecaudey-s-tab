import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { convert } from "@/lib/currency/convert";
import { formatMoney, CATEGORY_MAP } from "@/lib/utils";
import type { Profile, Budget, Transaction } from "@/lib/db.types";

export default async function BudgetsPage() {
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

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("family_id", me.family_id)
    .order("created_at", { ascending: false })
    .returns<Budget[]>();

  // For each budget, compute consumption: sum of expense transactions in that category
  // since start_date (and before end_date if set).
  const consumption = new Map<string, number>();
  for (const b of budgets ?? []) {
    const { data: tx } = await supabase
      .from("transactions")
      .select("amount, currency, occurred_on")
      .eq("category", b.category)
      .gte("occurred_on", b.start_date)
      .lte("occurred_on", b.end_date ?? "2999-12-31")
      .lt("amount", 0)
      .returns<Pick<Transaction, "amount" | "currency" | "occurred_on">[]>();
    let total = 0;
    for (const t of tx ?? []) {
      total += await convert(Math.abs(Number(t.amount)), t.currency, b.currency);
    }
    consumption.set(b.id, total);
  }

  const isParent = me.role === "parent";

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/settings"
            className="text-sm text-ink-500 hover:text-ink-700"
          >
            ← Réglages
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">
            Budgets
          </h1>
        </div>
        {isParent && (
          <Link
            href="/budgets/new"
            className="bg-ink-900 hover:bg-ink-800 text-white font-medium px-4 py-2 rounded-2xl text-sm"
          >
            + Nouveau
          </Link>
        )}
      </header>

      {budgets && budgets.length > 0 ? (
        <div className="space-y-3">
          {budgets.map((b) => {
            const used = consumption.get(b.id) ?? 0;
            const total = Number(b.amount);
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
            const overBudget = used > total;
            const cat = CATEGORY_MAP[b.category];

            const row = (
              <div className="bg-ink-50 rounded-2xl p-4 hover:bg-ink-100 transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-lg">
                    {cat?.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900">
                      {b.description || cat?.label}
                    </div>
                    <div className="text-xs text-ink-500">{cat?.label}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        overBudget ? "text-bad-600" : "text-ink-900"
                      }`}
                    >
                      {formatMoney(used, b.currency)}
                    </div>
                    <div className="text-xs text-ink-400 tabular-nums">
                      / {formatMoney(total, b.currency)}
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-white rounded-full overflow-hidden mt-3">
                  <div
                    className={`h-full rounded-full transition-all ${
                      overBudget ? "bg-bad-500" : "bg-accent-600"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-xs text-ink-500">
                  <span>{pct.toFixed(0)}% utilisé</span>
                  {overBudget && (
                    <span className="text-bad-600 font-medium">
                      Dépassé de {formatMoney(used - total, b.currency)}
                    </span>
                  )}
                </div>
              </div>
            );

            return isParent ? (
              <Link key={b.id} href={`/budgets/${b.id}`}>
                {row}
              </Link>
            ) : (
              <div key={b.id}>{row}</div>
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center">
          <div className="text-4xl mb-2 opacity-50">📭</div>
          <p className="text-sm text-ink-500">
            {isParent
              ? "Pas encore de budget. Crée le premier !"
              : "Aucun budget défini pour le moment."}
          </p>
        </div>
      )}
    </div>
  );
}
