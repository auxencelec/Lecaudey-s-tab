"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, cn, formatMoney } from "@/lib/utils";
import type { Profile, Space } from "@/lib/db.types";
import CurrencySelect from "@/components/CurrencySelect";
import { recomputeFamilyAdvances } from "@/lib/settle";

export default function ChildExpenseForm({
  me,
  parents,
  spaces,
}: {
  me: Profile;
  parents: Profile[];
  spaces: Space[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(me.preferred_currency);
  const [category, setCategory] = useState<string>("transport");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both parents are treated as one entity. Use the first parent as
  // the canonical "family" representative for the advance.
  const familyRep = parents[0];

  const space = useMemo(
    () => spaces.find((s) => s.kind === "private" && s.owner_child_id === me.id),
    [spaces, me.id]
  );

  // Categories shown to children — only those that make sense for a
  // reimbursable family expense.
  const childCategories = CATEGORIES.filter((c) =>
    ["vacances", "loyer", "transport", "cadeau", "autre"].includes(c.value)
  );

  const numAmount = parseFloat(amount.replace(",", ".")) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!numAmount || numAmount <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (!space) {
      setError("Espace privé introuvable.");
      return;
    }
    if (!familyRep) {
      setError("Aucun parent enregistré dans la famille.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Insert the expense. The advances table is derived from transactions —
    // recompute it right after so the dashboard reflects the new debt.
    const { error: txErr } = await supabase
      .from("transactions")
      .insert({
        space_id: space.id,
        created_by: me.id,
        concerns_id: me.id,
        amount: -Math.abs(numAmount),
        currency,
        category,
        description: description || null,
        occurred_on: date,
      });

    if (txErr) {
      setError(txErr.message);
      setLoading(false);
      return;
    }

    await recomputeFamilyAdvances(
      supabase,
      me.family_id,
      parents.map((p) => p.id)
    );

    router.refresh();
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Amount + currency */}
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Montant dépensé (à rembourser par les parents)
        </label>
        <div className="flex items-center gap-3 bg-ink-50 rounded-2xl px-4 py-4 focus-within:ring-2 focus-within:ring-accent-500 transition">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-3xl font-semibold tabular-nums placeholder-ink-300"
            autoFocus
          />
          <CurrencySelect value={currency} onChange={setCurrency} />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Catégorie
        </label>
        <div className="grid grid-cols-3 gap-2">
          {childCategories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={cn(
                "p-3 rounded-2xl flex flex-col items-center gap-1 transition",
                category === c.value
                  ? "bg-accent-600 text-white"
                  : "bg-ink-50 hover:bg-ink-100 text-ink-700"
              )}
            >
              <span className="text-lg">{c.emoji}</span>
              <span className="text-[10px] font-medium leading-tight text-center">
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Description + date */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: billet TGV Paris → Lyon"
            className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition tabular-nums"
          />
        </div>
      </div>

      {/* Preview */}
      {numAmount > 0 && (
        <div className="rounded-2xl p-3 text-sm bg-warm-500/10 text-warm-600">
          <span className="font-medium">Tes parents</span> te devront{" "}
          <span className="font-semibold tabular-nums">
            {formatMoney(numAmount, currency)}
          </span>
        </div>
      )}

      {error && (
        <div className="text-sm text-bad-600 bg-bad-500/10 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 bg-ink-50 hover:bg-ink-100 text-ink-700 font-medium py-3.5 rounded-2xl transition"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium py-3.5 rounded-2xl transition active:scale-[0.98]"
        >
          {loading ? "…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
