import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { formatMoney, CATEGORY_MAP } from "@/lib/utils";
import type { Profile, Transaction, Advance } from "@/lib/db.types";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import Avatar from "@/components/Avatar";
import TransactionActions from "./actions";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single<Transaction>();
  if (!tx) notFound();

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("family_id", me.family_id)
    .returns<Profile[]>();
  const profilesById = new Map((members ?? []).map((m) => [m.id, m]));

  // Linked advance (if any)
  const { data: linkedAdvance } = await supabase
    .from("advances")
    .select("*")
    .eq("source_transaction_id", id)
    .maybeSingle<Advance>();

  const cat = CATEGORY_MAP[tx.category];
  const concerns = tx.concerns_id ? profilesById.get(tx.concerns_id) : null;
  const creator = profilesById.get(tx.created_by);
  const amount = Number(tx.amount);
  const isCredit = amount >= 0;

  // Parents: full access.
  // Children: only on their own transactions, and only while any linked
  // advance is still open (not fully reimbursed).
  const advanceIsClosed = linkedAdvance?.status === "closed";
  const canModify =
    me.role === "parent" ||
    (tx.created_by === me.id && !advanceIsClosed);

  const lockReason =
    me.role === "parent"
      ? null
      : tx.created_by !== me.id
      ? "Tu ne peux modifier que tes propres transactions."
      : advanceIsClosed
      ? "Cette transaction est verrouillée car le remboursement a été effectué."
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="text-sm text-ink-500 hover:text-ink-700 inline-flex items-center gap-1"
      >
        ← Retour
      </Link>

      {/* Amount hero */}
      <div className="text-center pt-2">
        <div className="text-4xl mb-1">{cat?.emoji ?? "📌"}</div>
        <div
          className={`text-5xl font-semibold tracking-tight tabular-nums ${
            isCredit ? "text-good-600" : "text-bad-600"
          }`}
        >
          {isCredit ? "+" : ""}
          {formatMoney(amount, tx.currency)}
        </div>
        <div className="text-sm text-ink-500 mt-1">{cat?.label}</div>
      </div>

      {/* Details */}
      <div className="bg-ink-50 rounded-2xl p-4 space-y-3">
        {tx.description && (
          <Row label="Description" value={tx.description} />
        )}
        <Row
          label="Date"
          value={format(parseISO(tx.occurred_on), "EEEE d MMMM yyyy", {
            locale: fr,
          })}
        />
        {concerns && (
          <Row
            label="Concerne"
            valueNode={
              <span className="inline-flex items-center gap-2">
                <Avatar
                  emoji={concerns.avatar_emoji}
                  url={concerns.avatar_url}
                  size="xs"
                />
                {concerns.full_name}
              </span>
            }
          />
        )}
        {creator && creator.id !== concerns?.id && (
          <Row
            label="Ajouté par"
            valueNode={
              <span className="inline-flex items-center gap-2">
                <Avatar
                  emoji={creator.avatar_emoji}
                  url={creator.avatar_url}
                  size="xs"
                />
                {creator.full_name.split(" ")[0]}
              </span>
            }
          />
        )}
      </div>

      {/* Linked advance status */}
      {linkedAdvance && (
        <div
          className={`rounded-2xl p-4 ${
            linkedAdvance.status === "closed"
              ? "bg-good-500/10 text-good-700"
              : "bg-warm-500/10 text-warm-700"
          }`}
        >
          <div className="text-xs uppercase tracking-widest font-medium">
            Avance liée
          </div>
          <div className="mt-1 text-sm">
            {linkedAdvance.status === "closed"
              ? "✓ Soldée"
              : `Restant à rembourser : ${formatMoney(
                  Number(linkedAdvance.remaining),
                  linkedAdvance.currency
                )}`}
          </div>
        </div>
      )}

      {canModify ? (
        <TransactionActions tx={tx} linkedAdvance={linkedAdvance ?? null} />
      ) : (
        <div className="bg-ink-50 rounded-2xl p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-ink-100 mx-auto mb-2 flex items-center justify-center text-ink-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <p className="text-sm text-ink-600">{lockReason}</p>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-xs font-medium text-ink-500 w-24 shrink-0 pt-0.5">
        {label}
      </div>
      <div className="text-sm text-ink-900 flex-1">{valueNode ?? value}</div>
    </div>
  );
}
