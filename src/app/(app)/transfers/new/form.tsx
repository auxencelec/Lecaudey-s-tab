"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, cn } from "@/lib/utils";
import type { Profile, Space, Advance } from "@/lib/db.types";
import Avatar from "@/components/Avatar";
import CurrencySelect from "@/components/CurrencySelect";

export default function TransferForm({
  me,
  members,
  spaces,
  openAdvances,
  defaultToId,
  defaultFromId,
  presetAdvance,
}: {
  me: Profile;
  members: Profile[];
  spaces: Space[];
  openAdvances: Advance[];
  defaultToId?: string;
  defaultFromId?: string;
  presetAdvance: Advance | null;
}) {
  const router = useRouter();

  const fromInitial = defaultFromId ?? me.id;
  const toInitial =
    defaultToId ??
    members.find((m) => m.id !== fromInitial && m.role === "parent")?.id ??
    members.find((m) => m.id !== fromInitial)?.id ??
    "";

  const [fromId, setFromId] = useState(fromInitial);
  const [toId, setToId] = useState(toInitial);
  const [amount, setAmount] = useState(
    presetAdvance ? String(Number(presetAdvance.remaining)) : ""
  );
  const [currency, setCurrency] = useState(
    presetAdvance?.currency ?? me.preferred_currency
  );
  const [description, setDescription] = useState(
    presetAdvance ? `Remboursement: ${presetAdvance.description ?? "avance"}` : ""
  );
  const [settleAdvanceId, setSettleAdvanceId] = useState<string | null>(
    presetAdvance?.id ?? null
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = members.find((m) => m.id === fromId);
  const to = members.find((m) => m.id === toId);
  const parentIds = useMemo(
    () => new Set(members.filter((m) => m.role === "parent").map((m) => m.id)),
    [members]
  );

  // Family-as-one-entity matching:
  // an advance counts as "this from→to direction" if either
  //   (debtor=from, creditor=to)   exact, or
  //   (from is a parent and debtor is any parent, creditor=to)  any parent paying child, or
  //   (debtor=from, to is a parent and creditor is any parent)  child paying any parent.
  const matches = (a: Advance) => {
    const fromIsParent = parentIds.has(fromId);
    const toIsParent = parentIds.has(toId);
    const debtorIsParent = parentIds.has(a.debtor_id);
    const creditorIsParent = parentIds.has(a.creditor_id);
    if (fromIsParent && toIsParent === false) {
      // parent → child: family owes child
      return debtorIsParent && a.creditor_id === toId;
    }
    if (toIsParent && fromIsParent === false) {
      // child → parent: child owes family
      return a.debtor_id === fromId && creditorIsParent;
    }
    return a.debtor_id === fromId && a.creditor_id === toId;
  };

  const matchingAdvance = useMemo(() => {
    return openAdvances.find((a) => matches(a) && a.id === settleAdvanceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAdvances, fromId, toId, settleAdvanceId, parentIds]);

  const suggestedAdvances = useMemo(() => {
    return openAdvances.filter(matches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAdvances, fromId, toId, parentIds]);

  // Pick the right private space: prefer the child's space involved.
  const targetSpace = useMemo(() => {
    const childId =
      from?.role === "child" ? from.id : to?.role === "child" ? to.id : null;
    if (!childId) return spaces.find((s) => s.kind === "group") ?? spaces[0];
    return spaces.find(
      (s) => s.kind === "private" && s.owner_child_id === childId
    );
  }, [from, to, spaces]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fromId === toId) {
      setError("Tu ne peux pas te transférer à toi-même.");
      return;
    }
    const num = parseFloat(amount.replace(",", "."));
    if (!num || num <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (!targetSpace) {
      setError("Aucun espace disponible pour ce transfert.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // 1. Auto-settle matching advances (oldest first) up to the payment amount.
    //    "Matching" = same currency + same direction (family-as-one logic).
    const sameCurrencyMatches = [...openAdvances]
      .filter(matches)
      .filter((a) => a.currency === currency)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    let remainingPayment = Math.abs(num);
    for (const adv of sameCurrencyMatches) {
      if (remainingPayment <= 0) break;
      const advRemaining = Number(adv.remaining);
      if (advRemaining <= 0) continue;

      const applied = Math.min(remainingPayment, advRemaining);
      const newRemaining = advRemaining - applied;
      const newStatus =
        newRemaining === 0
          ? "closed"
          : newRemaining < Number(adv.amount)
          ? "partial"
          : "open";

      const { error: upErr } = await supabase
        .from("advances")
        .update({
          remaining: newRemaining,
          status: newStatus,
          closed_at: newStatus === "closed" ? new Date().toISOString() : null,
        })
        .eq("id", adv.id);

      if (upErr) {
        setError(upErr.message);
        setLoading(false);
        return;
      }

      remainingPayment -= applied;
    }

    // 2. Record the payment as a transaction (for the history feed).
    const wasReimbursement = remainingPayment < Math.abs(num);
    const { error: insErr } = await supabase.from("transactions").insert({
      space_id: targetSpace.id,
      created_by: me.id,
      concerns_id: toId,
      amount: Math.abs(num),
      currency,
      category: wasReimbursement ? "remboursement" : "autre",
      description:
        description ||
        `${from?.full_name.split(" ")[0]} → ${to?.full_name.split(" ")[0]}`,
    });

    if (insErr) {
      setError(insErr.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/");
  }

  // Show only members the user can pay to/from (everyone in the family).
  const candidates = members;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* From / To */}
      <div className="space-y-3">
        <PartyPicker
          label="De la part de"
          value={fromId}
          onChange={setFromId}
          options={candidates}
        />
        <div className="flex justify-center -my-1">
          <button
            type="button"
            onClick={() => {
              const a = fromId;
              setFromId(toId);
              setToId(a);
            }}
            className="w-9 h-9 rounded-full bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500"
            aria-label="Inverser"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4v16M3 16l4 4 4-4M17 20V4M21 8l-4-4-4 4" />
            </svg>
          </button>
        </div>
        <PartyPicker
          label="Pour"
          value={toId}
          onChange={setToId}
          options={candidates.filter((m) => m.id !== fromId)}
        />
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Montant
        </label>
        <div className="flex items-center gap-3 bg-ink-50 rounded-2xl pl-4 pr-4 py-3.5 focus-within:ring-2 focus-within:ring-accent-500 transition">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-2xl font-semibold tabular-nums placeholder-ink-300"
          />
          <CurrencySelect value={currency} onChange={setCurrency} />
        </div>
      </div>

      {/* Suggested advances */}
      {suggestedAdvances.length > 0 && !presetAdvance && (
        <div>
          <p className="text-xs font-medium text-ink-500 mb-2 px-1">
            Solder une avance existante ?
          </p>
          <div className="space-y-1.5">
            {suggestedAdvances.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  if (settleAdvanceId === a.id) {
                    setSettleAdvanceId(null);
                  } else {
                    setSettleAdvanceId(a.id);
                    setAmount(String(Number(a.remaining)));
                    setCurrency(a.currency);
                    if (!description)
                      setDescription(
                        `Remboursement: ${a.description ?? "avance"}`
                      );
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-2xl text-left transition",
                  settleAdvanceId === a.id
                    ? "bg-accent-50 ring-2 ring-accent-500"
                    : "bg-ink-50 hover:bg-ink-100"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-warm-500/10 text-warm-600 flex items-center justify-center text-sm">
                  ⏳
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {a.description || "Avance"}
                  </div>
                  <div className="text-xs text-ink-500">
                    Restant : {formatMoney(Number(a.remaining), a.currency)}
                  </div>
                </div>
                {settleAdvanceId === a.id && (
                  <span className="text-accent-600 text-sm">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
          Motif (optionnel)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: billet TGV Paris → Lyon"
          className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
        />
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
          className="flex-1 bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium py-3.5 rounded-2xl transition active:scale-[0.98]"
        >
          {loading ? "…" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}

function PartyPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Profile[];
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <div className="bg-ink-50 rounded-2xl p-3 flex items-center gap-3">
      <div className="text-xs font-medium text-ink-500 w-20 shrink-0">
        {label}
      </div>
      <Avatar emoji={selected?.avatar_emoji} size="sm" />
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-transparent font-medium text-ink-900 outline-none pr-6"
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
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
  );
}
