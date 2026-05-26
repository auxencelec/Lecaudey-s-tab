/**
 * Single source of truth for family-vs-child debts.
 *
 * Net debt is **derived** from the transactions table — never edited manually.
 * Run `recomputeFamilyAdvances` after any insert/update/delete on transactions,
 * and on every page load that reads debt state. It is idempotent and self-healing.
 *
 * The `advances` table is treated as a *snapshot*: each call closes all open
 * advances and writes one fresh advance per (child, currency) for the net.
 *
 * Transaction → debt-impact mapping:
 *   - amount < 0, concerns=child         → child paid X, family owes child +X
 *   - amount > 0, concerns=child, cat=argent_de_poche / cadeau → gift, no debt
 *   - amount > 0, concerns=child, cat=avance        → parent loan, child owes family +X
 *   - amount > 0, concerns=child, cat=remboursement → parent reimbursed, family-owes-child -X
 *   - amount > 0, concerns=parent, cat=remboursement, created_by=child → child paid parent, family-owes-child +X
 *   - everything else: no debt impact (treated as neutral)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

type TxRow = {
  id: string;
  amount: number | string;
  currency: string;
  category: string;
  concerns_id: string | null;
  created_by: string;
};

export async function recomputeFamilyAdvances(
  supabase: SupabaseClientLike,
  family_id: string,
  parent_ids: string[]
): Promise<void> {
  if (parent_ids.length === 0) return;

  // ----- Load the cast -----
  const { data: members } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("family_id", family_id);

  const childIds: string[] = (members ?? [])
    .filter((m: { role: string }) => m.role === "child")
    .map((m: { id: string }) => m.id);
  if (childIds.length === 0) return;

  const parentSet = new Set(parent_ids);
  const childSet = new Set(childIds);

  // ----- Load all transactions in the family -----
  // We need transactions involving any family member (parent or child).
  const { data: spaces } = await supabase
    .from("spaces")
    .select("id, owner_child_id")
    .eq("family_id", family_id);
  const spaceIds: string[] = (spaces ?? []).map((s: { id: string }) => s.id);
  if (spaceIds.length === 0) return;

  const { data: txList } = await supabase
    .from("transactions")
    .select("id, amount, currency, category, concerns_id, created_by")
    .in("space_id", spaceIds);

  // ----- Aggregate net per (childId, currency) -----
  // Positive = family owes child; negative = child owes family.
  const key = (childId: string, currency: string) => `${childId}|${currency}`;
  const netMap = new Map<string, number>();

  for (const tx of (txList ?? []) as TxRow[]) {
    const amount = Number(tx.amount);
    if (amount === 0) continue;

    const category = tx.category;
    const concernsId = tx.concerns_id ?? "";
    const createdBy = tx.created_by;

    let childId: string | null = null;
    let delta = 0;

    if (childSet.has(concernsId)) {
      childId = concernsId;
      if (amount < 0) {
        // Child spent money the family should cover.
        delta = Math.abs(amount);
      } else {
        switch (category) {
          case "avance":
            // Parent loan to child.
            delta = -amount;
            break;
          case "remboursement":
            // Parent reimbursed child.
            delta = -amount;
            break;
          case "argent_de_poche":
          case "cadeau":
          default:
            // Gift / no debt impact.
            delta = 0;
        }
      }
    } else if (
      parentSet.has(concernsId) &&
      amount > 0 &&
      category === "remboursement" &&
      childSet.has(createdBy)
    ) {
      // Child paid back a parent (transfer flow: concerns=parent, created_by=child).
      childId = createdBy;
      delta = amount; // increases what's owed to the child / decreases child's debt
    }

    if (childId && delta !== 0) {
      const k = key(childId, tx.currency);
      netMap.set(k, (netMap.get(k) ?? 0) + delta);
    }
  }

  // ----- Sync advances table -----
  const familyRep = parent_ids[0];
  const spaceByChild = new Map<string, string>();
  for (const s of (spaces ?? []) as { id: string; owner_child_id: string | null }[]) {
    if (s.owner_child_id) spaceByChild.set(s.owner_child_id, s.id);
  }

  // 1. Close ALL existing open advances in the family.
  await supabase
    .from("advances")
    .update({
      remaining: 0,
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .eq("family_id", family_id)
    .neq("status", "closed");

  // 2. Re-create one fresh advance per (childId, currency) with the net.
  for (const childId of childIds) {
    const space_id = spaceByChild.get(childId);
    if (!space_id) continue;

    // Find every currency that appears for this child.
    const currencies = new Set<string>();
    for (const k of netMap.keys()) {
      const [c, cur] = k.split("|");
      if (c === childId) currencies.add(cur);
    }

    for (const currency of currencies) {
      const net = netMap.get(key(childId, currency)) ?? 0;
      if (Math.abs(net) < 0.005) continue; // negligible

      if (net > 0) {
        // Family owes child.
        await supabase.from("advances").insert({
          family_id,
          space_id,
          debtor_id: familyRep,
          creditor_id: childId,
          amount: net,
          remaining: net,
          currency,
        });
      } else {
        // Child owes family.
        await supabase.from("advances").insert({
          family_id,
          space_id,
          debtor_id: childId,
          creditor_id: familyRep,
          amount: Math.abs(net),
          remaining: Math.abs(net),
          currency,
        });
      }
    }
  }
}

// Kept as alias for backward compatibility while we migrate callers.
export const compactFamilyAdvances = recomputeFamilyAdvances;
