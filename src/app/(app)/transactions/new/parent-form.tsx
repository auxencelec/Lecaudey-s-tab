"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, formatMoney } from "@/lib/utils";
import type { Profile, Space } from "@/lib/db.types";
import CurrencySelect from "@/components/CurrencySelect";
import Avatar from "@/components/Avatar";
import { settleOrCreateAdvance } from "@/lib/settle";

type Kind = "allowance" | "loan";

export default function ParentGiveForm({
  me,
  parents,
  children,
  spaces,
  defaultChildId,
}: {
  me: Profile;
  parents: Profile[];
  children: Profile[];
  spaces: Space[];
  defaultChildId?: string;
}) {
  // Both parents form one "family" entity. Use the first parent (by birth order)
  // as the canonical representative for all parent↔child advances, so any
  // parent can later settle a debt regardless of who created it.
  const familyRep = parents[0] ?? me;
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("allowance");
  const [childId, setChildId] = useState<string>(
    defaultChildId ?? children[0]?.id ?? ""
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(me.preferred_currency);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const space = useMemo(
    () => spaces.find((s) => s.kind === "private" && s.owner_child_id === childId),
    [spaces, childId]
  );

  const numAmount = parseFloat(amount.replace(",", ".")) || 0;
  const child = children.find((c) => c.id === childId);

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

    setLoading(true);
    const supabase = createClient();

    // Both kinds add a positive transaction to the child's wallet record.
    const { data: txRow, error: txErr } = await supabase
      .from("transactions")
      .insert({
        space_id: space.id,
        created_by: me.id,
        concerns_id: childId,
        amount: Math.abs(numAmount),
        currency,
        category: kind === "allowance" ? "argent_de_poche" : "avance",
        description: description || null,
        occurred_on: date,
      })
      .select()
      .single();

    if (txErr) {
      setError(txErr.message);
      setLoading(false);
      return;
    }

    // For a loan, net the new debt (child owes family) against any
    // existing opposite advances (family owes child) before creating
    // a new one.
    if (kind === "loan") {
      const result = await settleOrCreateAdvance({
        supabase,
        family_id: me.family_id,
        space_id: space.id,
        new_debtor_id: childId,
        new_creditor_id: familyRep.id,
        amount: Math.abs(numAmount),
        currency,
        description: description || null,
        source_transaction_id: txRow?.id ?? null,
        parent_ids: parents.map((p) => p.id),
      });
      if (!result.ok) {
        setError(result.error ?? "Erreur d'enregistrement.");
        setLoading(false);
        return;
      }
    }

    router.refresh();
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Kind */}
      <div>
        <div className="grid grid-cols-2 gap-2 bg-ink-100 rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setKind("allowance")}
            className={cn(
              "py-2.5 rounded-xl text-sm font-medium transition",
              kind === "allowance"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500"
            )}
          >
            💵 Argent de poche
          </button>
          <button
            type="button"
            onClick={() => setKind("loan")}
            className={cn(
              "py-2.5 rounded-xl text-sm font-medium transition",
              kind === "loan"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500"
            )}
          >
            🤝 Prêt
          </button>
        </div>
        <p className="text-xs text-ink-400 mt-2 px-1">
          {kind === "allowance"
            ? "L'enfant reçoit l'argent sans rembourser."
            : "L'enfant te devra l'argent jusqu'à remboursement."}
        </p>
      </div>

      {/* Child */}
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          À qui ?
        </label>
        <div className="bg-ink-50 rounded-2xl p-3 flex items-center gap-3">
          <Avatar emoji={child?.avatar_emoji} size="sm" />
          <div className="relative flex-1">
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              className="w-full appearance-none bg-transparent font-medium outline-none pr-6"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-ink-400"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Montant
        </label>
        <div className="flex items-center gap-3 bg-ink-50 rounded-2xl px-4 py-4 focus-within:ring-2 focus-within:ring-accent-500 transition">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-3xl font-semibold tabular-nums placeholder-ink-300"
          />
          <CurrencySelect value={currency} onChange={setCurrency} />
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
            placeholder={
              kind === "allowance"
                ? "Argent de poche de Mai"
                : "Avance pour acheter X"
            }
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
        <div className="bg-accent-50 text-accent-700 rounded-2xl p-3 text-sm">
          {kind === "allowance" ? (
            <>
              <span className="font-medium">
                {child?.full_name.split(" ")[0]}
              </span>{" "}
              reçoit{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(numAmount, currency)}
              </span>{" "}
              d&apos;argent de poche.
            </>
          ) : (
            <>
              <span className="font-medium">
                {child?.full_name.split(" ")[0]}
              </span>{" "}
              te devra{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(numAmount, currency)}
              </span>
            </>
          )}
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
