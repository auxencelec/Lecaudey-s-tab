"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, cn } from "@/lib/utils";
import type { Transaction, Advance } from "@/lib/db.types";

export default function TransactionActions({
  tx,
  linkedAdvance,
}: {
  tx: Transaction;
  linkedAdvance: Advance | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");

  const [description, setDescription] = useState(tx.description ?? "");
  const [date, setDate] = useState(tx.occurred_on);
  const [category, setCategory] = useState(tx.category);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: upErr } = await supabase
      .from("transactions")
      .update({
        description: description || null,
        occurred_on: date,
        category,
      })
      .eq("id", tx.id);
    setLoading(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setMode("view");
    router.refresh();
  }

  async function del() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    if (linkedAdvance) {
      const { error: advErr } = await supabase
        .from("advances")
        .delete()
        .eq("id", linkedAdvance.id);
      if (advErr) {
        setError(advErr.message);
        setLoading(false);
        return;
      }
    }
    const { error: txErr } = await supabase
      .from("transactions")
      .delete()
      .eq("id", tx.id);
    setLoading(false);
    if (txErr) {
      setError(txErr.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (mode === "edit") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
            Catégorie
          </label>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value as Transaction["category"])}
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

        <p className="text-xs text-ink-400 px-1">
          Pour changer le montant ou la devise, supprime puis recrée.
        </p>

        {error && (
          <div className="text-sm text-bad-600 bg-bad-500/10 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => setMode("view")}
            className="flex-1 bg-ink-50 hover:bg-ink-100 text-ink-700 font-medium py-3.5 rounded-2xl transition"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={save}
            className="flex-1 bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium py-3.5 rounded-2xl transition"
          >
            {loading ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className="space-y-3">
        <div className="bg-bad-500/10 rounded-2xl p-4">
          <div className="font-medium text-bad-700">Supprimer cette transaction ?</div>
          <p className="text-sm text-bad-600 mt-1">
            {linkedAdvance
              ? "L'avance liée sera aussi supprimée. Le solde sera réajusté."
              : "Cette action est définitive."}
          </p>
        </div>
        {error && (
          <div className="text-sm text-bad-600 bg-bad-500/10 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("view")}
            className="flex-1 bg-ink-50 hover:bg-ink-100 text-ink-700 font-medium py-3.5 rounded-2xl transition"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={del}
            className="flex-1 bg-bad-600 hover:bg-bad-500 disabled:opacity-50 text-white font-medium py-3.5 rounded-2xl transition"
          >
            {loading ? "…" : "Supprimer"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => setMode("edit")}
        className="bg-ink-50 hover:bg-ink-100 text-ink-900 font-medium py-3.5 rounded-2xl transition"
      >
        Modifier
      </button>
      <button
        type="button"
        onClick={() => setMode("confirm-delete")}
        className="bg-bad-500/10 hover:bg-bad-500/20 text-bad-700 font-medium py-3.5 rounded-2xl transition"
      >
        Supprimer
      </button>
    </div>
  );
}
