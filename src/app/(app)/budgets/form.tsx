"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, cn } from "@/lib/utils";
import type { Profile, Budget } from "@/lib/db.types";
import CurrencySelect from "@/components/CurrencySelect";

export default function BudgetForm({
  me,
  existing,
}: {
  me: Profile;
  existing?: Budget;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(
    existing ? String(Number(existing.amount)) : ""
  );
  const [currency, setCurrency] = useState(
    existing?.currency ?? me.preferred_currency
  );
  const [category, setCategory] = useState<string>(
    existing?.category ?? "transport"
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startDate, setStartDate] = useState(
    existing?.start_date ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(existing?.end_date ?? "");

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = parseFloat(amount.replace(",", ".")) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!num || num <= 0) {
      setError("Montant invalide.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const payload = {
      family_id: me.family_id,
      category,
      amount: num,
      currency,
      description: description || null,
      start_date: startDate,
      end_date: endDate || null,
      created_by: me.id,
    };

    let err;
    if (existing) {
      const { error: upErr } = await supabase
        .from("budgets")
        .update(payload)
        .eq("id", existing.id);
      err = upErr;
    } else {
      const { error: insErr } = await supabase.from("budgets").insert(payload);
      err = insErr;
    }

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
    router.push("/budgets");
  }

  async function del() {
    if (!existing) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("budgets").delete().eq("id", existing.id);
    setDeleting(false);
    router.refresh();
    router.push("/budgets");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Montant alloué
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

      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Catégorie
        </label>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
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

      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Libellé (optionnel)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Vacances été 2026"
          className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
            Début
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
            Fin (optionnel)
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition tabular-nums"
          />
        </div>
      </div>

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
          className="flex-1 bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium py-3.5 rounded-2xl transition"
        >
          {loading ? "…" : existing ? "Enregistrer" : "Créer"}
        </button>
      </div>

      {existing &&
        (confirmDelete ? (
          <div className="space-y-2 pt-4 border-t border-ink-100">
            <p className="text-sm text-bad-700">
              Supprimer ce budget définitivement ?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 bg-ink-50 text-ink-700 py-2.5 rounded-xl text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={del}
                className="flex-1 bg-bad-600 hover:bg-bad-500 text-white py-2.5 rounded-xl text-sm"
              >
                {deleting ? "…" : "Supprimer"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full bg-bad-500/10 hover:bg-bad-500/20 text-bad-700 font-medium py-3 rounded-2xl text-sm mt-4"
          >
            Supprimer ce budget
          </button>
        ))}
    </form>
  );
}
