"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, CATEGORY_MAP } from "@/lib/utils";
import { recomputeFamilyAdvances } from "@/lib/settle";
import type { MoneyRequest, Profile } from "@/lib/db.types";
import Avatar from "@/components/Avatar";

export default function RequestRow({
  request,
  child,
  parents,
  viewerIsParent,
  viewerId,
}: {
  request: MoneyRequest;
  child: Profile | undefined;
  parents: Profile[];
  viewerIsParent: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cat = CATEGORY_MAP[request.category];

  async function approve() {
    if (!child) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // Find the child's private space.
    const { data: space } = await supabase
      .from("spaces")
      .select("id")
      .eq("kind", "private")
      .eq("owner_child_id", child.id)
      .maybeSingle();
    if (!space) {
      setError("Espace privé introuvable.");
      setLoading(false);
      return;
    }

    // Create transaction crediting the child (gift, no advance).
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        space_id: space.id,
        created_by: viewerId,
        concerns_id: child.id,
        amount: Number(request.amount),
        currency: request.currency,
        category: request.category,
        description: request.description ?? "Demande approuvée",
      })
      .select("id")
      .single();

    if (txErr) {
      setError(txErr.message);
      setLoading(false);
      return;
    }

    // Mark request approved.
    const { error: upErr } = await supabase
      .from("requests")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: viewerId,
        approved_transaction_id: tx?.id ?? null,
      })
      .eq("id", request.id);

    // Rebuild advances based on the (just-inserted) transaction.
    if (request.family_id) {
      await recomputeFamilyAdvances(
        supabase,
        request.family_id,
        parents.map((p) => p.id)
      );
    }

    setLoading(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    router.refresh();
  }

  async function reject() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: upErr } = await supabase
      .from("requests")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: viewerId,
      })
      .eq("id", request.id);
    setLoading(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    router.refresh();
  }

  async function cancel() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: upErr } = await supabase
      .from("requests")
      .update({ status: "cancelled" })
      .eq("id", request.id);
    setLoading(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-ink-50 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        {viewerIsParent && child ? (
          <Avatar emoji={child.avatar_emoji} url={child.avatar_url} size="md" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center text-lg">
            {cat?.emoji ?? "📌"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-900">
            {viewerIsParent ? (
              <>
                <span className="font-medium">
                  {child?.full_name.split(" ")[0] ?? "?"}
                </span>{" "}
                <span className="text-ink-500">demande</span>
              </>
            ) : (
              <span className="font-medium">
                {cat?.label ?? "Demande"}
              </span>
            )}
          </div>
          {request.description && (
            <div className="text-xs text-ink-500 truncate">
              {request.description}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums text-ink-900">
            {formatMoney(Number(request.amount), request.currency)}
          </div>
          <div className="text-xs text-ink-400">{cat?.label}</div>
        </div>
      </div>

      {viewerIsParent && (
        <div className="flex gap-2 mt-3">
          <button
            disabled={loading}
            onClick={reject}
            className="flex-1 bg-white border border-ink-200 hover:border-bad-500 hover:text-bad-600 text-ink-700 font-medium py-2 rounded-xl text-sm transition"
          >
            Refuser
          </button>
          <button
            disabled={loading}
            onClick={approve}
            className="flex-1 bg-good-600 hover:bg-good-500 disabled:opacity-50 text-white font-medium py-2 rounded-xl text-sm transition"
          >
            {loading ? "…" : "Approuver"}
          </button>
        </div>
      )}

      {!viewerIsParent && request.status === "pending" && (
        <button
          disabled={loading}
          onClick={cancel}
          className="mt-3 w-full bg-white border border-ink-200 hover:border-ink-400 text-ink-600 font-medium py-2 rounded-xl text-xs transition"
        >
          Annuler ma demande
        </button>
      )}

      {error && (
        <div className="text-sm text-bad-600 bg-bad-500/10 rounded-xl px-3 py-2 mt-2">
          {error}
        </div>
      )}
    </div>
  );
}
