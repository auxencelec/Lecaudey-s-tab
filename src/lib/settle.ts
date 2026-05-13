/**
 * Compact existing open advances in the family by netting opposite-direction
 * pairs (per currency, per child). Idempotent — safe to run on every page load.
 *
 * Example: if parents owe Auxence 100 EUR AND Auxence owes parents 70 EUR,
 * after compaction:
 *   - parents owe Auxence 30 EUR (single open advance net)
 *   - the other advance is closed
 */
export async function compactFamilyAdvances(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  family_id: string,
  parent_ids: string[]
): Promise<void> {
  const { data: allOpen } = await supabase
    .from("advances")
    .select("*")
    .eq("family_id", family_id)
    .neq("status", "closed");

  if (!allOpen || allOpen.length === 0) return;

  const parentSet = new Set(parent_ids);

  // Group by (currency, childId) where advance is between a parent and a child.
  type Bucket = { childOwes: Adv[]; familyOwes: Adv[] };
  type Adv = {
    id: string;
    amount: number | string;
    remaining: number | string;
    debtor_id: string;
    creditor_id: string;
    currency: string;
    created_at: string;
  };
  const groups = new Map<string, Bucket>();

  for (const a of allOpen as Adv[]) {
    const debtorIsParent = parentSet.has(a.debtor_id);
    const creditorIsParent = parentSet.has(a.creditor_id);
    let childId: string | null = null;
    if (debtorIsParent && !creditorIsParent) childId = a.creditor_id;
    else if (creditorIsParent && !debtorIsParent) childId = a.debtor_id;
    else continue;

    const key = `${a.currency}:${childId}`;
    const g = groups.get(key) ?? { childOwes: [], familyOwes: [] };
    if (creditorIsParent) g.childOwes.push(a);
    else g.familyOwes.push(a);
    groups.set(key, g);
  }

  const sortByOldest = (x: Adv, y: Adv) =>
    new Date(x.created_at).getTime() - new Date(y.created_at).getTime();

  for (const { childOwes, familyOwes } of groups.values()) {
    const totalChildOwes = childOwes.reduce(
      (s, a) => s + Number(a.remaining),
      0
    );
    const totalFamilyOwes = familyOwes.reduce(
      (s, a) => s + Number(a.remaining),
      0
    );
    const cancel = Math.min(totalChildOwes, totalFamilyOwes);
    if (cancel <= 0) continue;

    const reduceList = async (list: Adv[]) => {
      let toReduce = cancel;
      for (const adv of [...list].sort(sortByOldest)) {
        if (toReduce <= 0) break;
        const rem = Number(adv.remaining);
        if (rem <= 0) continue;
        const applied = Math.min(toReduce, rem);
        const newRem = rem - applied;
        const newStatus =
          newRem === 0
            ? "closed"
            : newRem < Number(adv.amount)
            ? "partial"
            : "open";
        await supabase
          .from("advances")
          .update({
            remaining: newRem,
            status: newStatus,
            closed_at: newStatus === "closed" ? new Date().toISOString() : null,
          })
          .eq("id", adv.id);
        toReduce -= applied;
      }
    };

    await reduceList(childOwes);
    await reduceList(familyOwes);
  }
}

/**
 * Auto-netting helper for advances.
 *
 * Whenever a new debt is created (e.g. child expense, parent loan, payment),
 * first try to settle existing advances in the OPPOSITE direction (oldest first).
 * Only the leftover amount becomes a new advance.
 *
 * Treats both parents as a single "family" entity: any opposite-direction
 * advance between the OTHER party and ANY parent is considered eligible.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type SettleArgs = {
  supabase: SupabaseClient;
  family_id: string;
  space_id: string;
  /** Who is INCREASING the debt (will owe more after this). */
  new_debtor_id: string;
  /** Who is INCREASING the credit (will be owed more after this). */
  new_creditor_id: string;
  amount: number;
  currency: string;
  description: string | null;
  source_transaction_id: string | null;
  /** All parent IDs in the family (for family-as-one matching). */
  parent_ids: string[];
};

export async function settleOrCreateAdvance(args: SettleArgs): Promise<{
  ok: boolean;
  error?: string;
  appliedToExisting: number;
  newAdvanceAmount: number;
}> {
  const {
    supabase,
    family_id,
    space_id,
    new_debtor_id,
    new_creditor_id,
    amount,
    currency,
    description,
    source_transaction_id,
    parent_ids,
  } = args;

  if (amount <= 0) {
    return { ok: true, appliedToExisting: 0, newAdvanceAmount: 0 };
  }

  // ----- Find opposite-direction open advances -----
  // Treat parents as one entity: if NEW debtor is a parent, opposite advances
  // are any advances where ANY parent is the creditor and the new creditor is the debtor.
  // Symmetrically for the other case.
  const newDebtorIsParent = parent_ids.includes(new_debtor_id);
  const newCreditorIsParent = parent_ids.includes(new_creditor_id);

  // Opposite direction: (debtor=new_creditor or any parent if new_creditor is parent,
  //                     creditor=new_debtor or any parent if new_debtor is parent)
  // i.e., advances where the new debt would *cancel* an existing debt.
  let oppDebtorIds: string[];
  let oppCreditorIds: string[];
  if (newDebtorIsParent && !newCreditorIsParent) {
    // New: family owes other-party. Opposite: other-party owes any parent.
    oppDebtorIds = [new_creditor_id];
    oppCreditorIds = parent_ids;
  } else if (newCreditorIsParent && !newDebtorIsParent) {
    // New: other-party owes family. Opposite: any parent owes other-party.
    oppDebtorIds = parent_ids;
    oppCreditorIds = [new_debtor_id];
  } else {
    // Same role on both sides (rare) → exact match.
    oppDebtorIds = [new_creditor_id];
    oppCreditorIds = [new_debtor_id];
  }

  const { data: oppositeAdvances, error: fetchErr } = await supabase
    .from("advances")
    .select("*")
    .eq("family_id", family_id)
    .eq("currency", currency)
    .neq("status", "closed")
    .in("debtor_id", oppDebtorIds)
    .in("creditor_id", oppCreditorIds)
    .order("created_at", { ascending: true });

  if (fetchErr) {
    return {
      ok: false,
      error: fetchErr.message,
      appliedToExisting: 0,
      newAdvanceAmount: 0,
    };
  }

  let remaining = amount;
  let appliedToExisting = 0;

  for (const adv of oppositeAdvances ?? []) {
    if (remaining <= 0) break;
    const advRemaining = Number(adv.remaining);
    if (advRemaining <= 0) continue;

    const applied = Math.min(remaining, advRemaining);
    const newAdvRemaining = advRemaining - applied;
    const newStatus =
      newAdvRemaining === 0
        ? "closed"
        : newAdvRemaining < Number(adv.amount)
        ? "partial"
        : "open";

    const { error: upErr } = await supabase
      .from("advances")
      .update({
        remaining: newAdvRemaining,
        status: newStatus,
        closed_at: newStatus === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", adv.id);

    if (upErr) {
      return {
        ok: false,
        error: upErr.message,
        appliedToExisting,
        newAdvanceAmount: 0,
      };
    }

    remaining -= applied;
    appliedToExisting += applied;
  }

  // Create a new advance for whatever's left.
  if (remaining > 0) {
    const { error: insErr } = await supabase.from("advances").insert({
      family_id,
      space_id,
      debtor_id: new_debtor_id,
      creditor_id: new_creditor_id,
      amount: remaining,
      remaining,
      currency,
      description,
      source_transaction_id,
    });
    if (insErr) {
      return {
        ok: false,
        error: insErr.message,
        appliedToExisting,
        newAdvanceAmount: 0,
      };
    }
  }

  return { ok: true, appliedToExisting, newAdvanceAmount: remaining };
}
