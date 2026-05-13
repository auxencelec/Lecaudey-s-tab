import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { convert } from "@/lib/currency/convert";
import { formatMoney, CATEGORY_MAP } from "@/lib/utils";
import type { Profile, Transaction, Advance } from "@/lib/db.types";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import Avatar from "@/components/Avatar";

export default async function MemberPage({
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

  const { data: member } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single<Profile>();

  if (!me || !member) notFound();

  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .eq("concerns_id", id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Transaction[]>();

  const { data: advances } = await supabase
    .from("advances")
    .select("*")
    .neq("status", "closed")
    .or(`creditor_id.eq.${id},debtor_id.eq.${id}`)
    .returns<Advance[]>();

  const display = me.preferred_currency;

  // Net debt for this member, signed.
  // net > 0: member owes family/me net   (they are net debtor)
  // net < 0: family/me owes member       (they are net creditor)
  let net = 0;
  for (const a of advances ?? []) {
    const r = Number(a.remaining);
    if (r <= 0) continue;
    const converted = await convert(r, a.currency, display);
    if (a.debtor_id === id) net += converted;
    if (a.creditor_id === id) net -= converted;
  }

  // Group transactions by month
  const groups = new Map<string, Transaction[]>();
  for (const t of tx ?? []) {
    const key = format(parseISO(t.occurred_on), "yyyy-MM");
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const isMe = member.id === me.id;
  const isParentViewing = me.role === "parent";
  const memberIsChild = member.role === "child";

  return (
    <div className="space-y-7">
      <Link
        href="/"
        className="text-sm text-ink-500 hover:text-ink-700 inline-flex items-center gap-1"
      >
        ← Retour
      </Link>

      {/* Hero */}
      <div className="text-center pt-2">
        <Avatar emoji={member.avatar_emoji} size="xl" className="mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight mt-3">
          {member.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-ink-500 mt-0.5">
          {member.role === "parent" ? "Parent" : "Enfant"} ·{" "}
          {member.preferred_currency}
        </p>
      </div>

      {/* Net debt — single card */}
      <div>
        {net < 0 ? (
          <div className="bg-good-500/10 rounded-3xl p-5 text-center">
            <p className="text-xs uppercase tracking-widest text-good-600 font-medium">
              {isMe
                ? "Tes parents te doivent"
                : isParentViewing
                ? "Tu lui dois"
                : "On lui doit"}
            </p>
            <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-good-600">
              {formatMoney(-net, display)}
            </div>
            {isParentViewing && memberIsChild && !isMe && (
              <Link
                href={`/transfers/new?to=${member.id}&from=${me.id}`}
                className="inline-block mt-3 bg-good-600 hover:bg-good-500 text-white font-medium px-4 py-2 rounded-xl text-sm"
              >
                Rembourser
              </Link>
            )}
          </div>
        ) : net > 0 ? (
          <div className="bg-warm-500/10 rounded-3xl p-5 text-center">
            <p className="text-xs uppercase tracking-widest text-warm-600 font-medium">
              {isMe
                ? "Tu dois"
                : isParentViewing
                ? "Il/Elle te doit"
                : "Doit à la famille"}
            </p>
            <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-warm-700">
              {formatMoney(net, display)}
            </div>
            {isMe && (
              <Link
                href="/transfers/new"
                className="inline-block mt-3 bg-warm-600 hover:bg-warm-700 text-white font-medium px-4 py-2 rounded-xl text-sm"
              >
                Rembourser →
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-ink-50 rounded-3xl p-5 text-center text-sm text-ink-500">
            Comptes équilibrés ✓
          </div>
        )}
      </div>

      {/* Quick actions for parents viewing a child */}
      {isParentViewing && memberIsChild && !isMe && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/transactions/new?member=${member.id}`}
            className="flex items-center gap-2 justify-center py-3 rounded-2xl bg-accent-600 hover:bg-accent-700 text-white font-medium text-sm transition"
          >
            💵 Donner
          </Link>
          <Link
            href={`/transfers/new?to=${member.id}&from=${me.id}`}
            className="flex items-center gap-2 justify-center py-3 rounded-2xl bg-ink-50 hover:bg-ink-100 text-ink-900 font-medium text-sm transition"
          >
            💸 Rembourser
          </Link>
        </div>
      )}

      {/* History */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
          Historique
        </h2>
        {groups.size > 0 ? (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([month, items]) => (
              <div key={month}>
                <div className="text-xs text-ink-400 font-medium uppercase mb-2 px-1">
                  {format(parseISO(month + "-01"), "MMMM yyyy", { locale: fr })}
                </div>
                <div className="space-y-1">
                  {items.map((t) => {
                    const cat = CATEGORY_MAP[t.category];
                    const amount = Number(t.amount);
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-2xl hover:bg-ink-50"
                      >
                        <div className="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center">
                          {cat?.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {t.description || cat?.label}
                          </div>
                          <div className="text-xs text-ink-400">
                            {cat?.label} ·{" "}
                            {format(parseISO(t.occurred_on), "d MMM", {
                              locale: fr,
                            })}
                          </div>
                        </div>
                        <div
                          className={`tabular-nums font-semibold text-sm whitespace-nowrap ${
                            amount < 0 ? "text-bad-600" : "text-good-600"
                          }`}
                        >
                          {amount >= 0 ? "+" : ""}
                          {formatMoney(amount, t.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="text-4xl mb-2 opacity-40">📭</div>
            <p className="text-sm text-ink-500">Pas encore de transaction.</p>
          </div>
        )}
      </section>
    </div>
  );
}
