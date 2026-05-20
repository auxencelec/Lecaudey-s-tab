"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, cn, formatMoney } from "@/lib/utils";
import type { Profile } from "@/lib/db.types";
import CurrencySelect from "@/components/CurrencySelect";

export default function RequestForm({ me }: { me: Profile }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(me.preferred_currency);
  const [category, setCategory] = useState<string>("autre");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const childCategories = CATEGORIES.filter((c) =>
    ["argent_de_poche", "vacances", "transport", "cadeau", "autre"].includes(
      c.value
    )
  );

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
    const { error: insErr } = await supabase.from("requests").insert({
      family_id: me.family_id,
      child_id: me.id,
      amount: num,
      currency,
      category,
      description: description || null,
    });
    setLoading(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    router.refresh();
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Montant demandé
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
          Pour quoi ?
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

      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Raison
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: j'ai besoin de 50€ pour le ciné samedi"
          rows={3}
          className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition resize-none"
        />
      </div>

      {num > 0 && (
        <div className="rounded-2xl p-3 text-sm bg-accent-50 text-accent-700">
          Demande de{" "}
          <span className="font-semibold tabular-nums">
            {formatMoney(num, currency)}
          </span>{" "}
          envoyée à tes parents pour validation.
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
          {loading ? "…" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}
