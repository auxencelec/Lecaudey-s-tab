import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { convert } from "@/lib/currency/convert";
import { compactFamilyAdvances } from "@/lib/settle";
import { formatMoney, CATEGORY_MAP } from "@/lib/utils";
import type { Profile, Transaction, Advance } from "@/lib/db.types";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import Avatar from "@/components/Avatar";

function relativeLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "d MMM", { locale: fr });
}

export default async function DashboardPage() {
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

  if (!me) {
    return (
      <div className="pt-20 text-center">
        <div className="text-5xl mb-4">🤷</div>
        <p className="text-ink-600">
          Ton compte est créé mais ton profil famille n&apos;existe pas. Un parent
          doit l&apos;ajouter.
        </p>
      </div>
    );
  }

  const display = me.preferred_currency;
  const isParent = me.role === "parent";

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("family_id", me.family_id)
    .order("role")
    .order("birth_year", { ascending: true })
    .returns<Profile[]>();

  // Self-healing: net out any opposite-direction open advances first.
  const parentIds = (members ?? [])
    .filter((m) => m.role === "parent")
    .map((m) => m.id);
  await compactFamilyAdvances(supabase, me.family_id, parentIds);

  const { data: openAdvances } = await supabase
    .from("advances")
    .select("*")
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .returns<Advance[]>();

  const { data: recent } = await supabase
    .from("transactions")
    .select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<Transaction[]>();

  const profilesById = new Map((members ?? []).map((m) => [m.id, m]));

  // ---- Compute NET per "other party" ----
  // Convention: netByOther.get(X) > 0  →  I owe X (positive amount)
  //             netByOther.get(X) < 0  →  X owes me
  const netByOther = new Map<string, number>();
  for (const a of openAdvances ?? []) {
    const r = Number(a.remaining);
    if (r <= 0) continue;
    const converted = await convert(r, a.currency, display);

    if (a.creditor_id === me.id) {
      // someone owes me (the debtor is "other")
      netByOther.set(
        a.debtor_id,
        (netByOther.get(a.debtor_id) ?? 0) - converted
      );
    } else if (a.debtor_id === me.id) {
      // I owe someone (the creditor is "other")
      netByOther.set(
        a.creditor_id,
        (netByOther.get(a.creditor_id) ?? 0) + converted
      );
    } else if (isParent) {
      // Family-wide advance not directly involving me — bucket under the child.
      const cred = profilesById.get(a.creditor_id);
      const deb = profilesById.get(a.debtor_id);
      const child =
        cred?.role === "child"
          ? cred.id
          : deb?.role === "child"
          ? deb.id
          : null;
      if (!child) continue;
      if (a.creditor_id === child) {
        // child is owed → "I" (family) owe child → positive
        netByOther.set(child, (netByOther.get(child) ?? 0) + converted);
      } else {
        netByOther.set(child, (netByOther.get(child) ?? 0) - converted);
      }
    }
  }

  // Sum across all "others" for the viewer's hero card.
  let totalNet = 0;
  for (const v of netByOther.values()) totalNet += v;
  // totalNet > 0: I owe   ;  < 0: I'm owed

  const firstName = me.full_name.split(" ")[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-400 font-medium">
            {isParent ? "Vue parents" : "Mon espace"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-0.5">
            Bonjour {firstName}
          </h1>
        </div>
        <Link href="/settings">
          <Avatar emoji={me.avatar_emoji} size="md" />
        </Link>
      </header>

      {/* Hero — net status (child viewer) */}
      {!isParent && (
        <section>
          {totalNet < 0 ? (
            <div className="bg-good-500/10 rounded-3xl p-5">
              <p className="text-xs uppercase tracking-widest text-good-600 font-medium">
                Tes parents te doivent
              </p>
              <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums text-good-600">
                {formatMoney(-totalNet, display)}
              </div>
              <p className="text-xs text-ink-500 mt-1">
                En attente de remboursement
              </p>
            </div>
          ) : totalNet > 0 ? (
            <div className="bg-warm-500/10 rounded-3xl p-5">
              <p className="text-xs uppercase tracking-widest text-warm-600 font-medium">
                Tu dois à tes parents
              </p>
              <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums text-warm-700">
                {formatMoney(totalNet, display)}
              </div>
              <Link
                href="/transfers/new"
                className="inline-block mt-3 bg-warm-600 hover:bg-warm-700 text-white font-medium px-4 py-2 rounded-xl text-sm"
              >
                Rembourser →
              </Link>
            </div>
          ) : (
            <div className="bg-ink-50 rounded-3xl p-5">
              <p className="text-xs uppercase tracking-widest text-ink-400 font-medium">
                Comptes équilibrés
              </p>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-ink-500">
                Tout est à jour ✨
              </div>
            </div>
          )}
        </section>
      )}

      {/* Per-child summary (parent viewer) */}
      {isParent && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium">
              Enfants
            </h2>
            <span className="text-xs text-ink-400">soldes en {display}</span>
          </div>
          <div className="space-y-2">
            {(members ?? [])
              .filter((m) => m.role === "child")
              .map((m) => {
                const net = netByOther.get(m.id) ?? 0;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-ink-50"
                  >
                    <Link
                      href={`/members/${m.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <Avatar emoji={m.avatar_emoji} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink-900 truncate">
                          {m.full_name.split(" ")[0]}
                        </div>
                        <div className="text-xs mt-0.5">
                          {net > 0 ? (
                            <span className="text-warm-700">
                              Tu lui dois{" "}
                              <span className="font-semibold tabular-nums">
                                {formatMoney(net, display)}
                              </span>
                            </span>
                          ) : net < 0 ? (
                            <span className="text-good-700">
                              Il te doit{" "}
                              <span className="font-semibold tabular-nums">
                                {formatMoney(-net, display)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-ink-400">À jour ✓</span>
                          )}
                        </div>
                      </div>
                    </Link>
                    {net > 0 && (
                      <Link
                        href={`/transfers/new?to=${m.id}&from=${me.id}`}
                        className="text-xs bg-warm-600 hover:bg-warm-700 text-white font-medium px-3 py-2 rounded-xl whitespace-nowrap"
                      >
                        Rembourser
                      </Link>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3">
          Activité récente
        </h2>
        {recent && recent.length > 0 ? (
          <div className="space-y-1.5">
            {recent.map((t) => {
              const cat = CATEGORY_MAP[t.category];
              const concerns = t.concerns_id
                ? profilesById.get(t.concerns_id)
                : null;
              const amount = Number(t.amount);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-2xl hover:bg-ink-50 transition"
                >
                  <div className="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center text-lg">
                    {cat?.emoji ?? "📌"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900 truncate">
                      {t.description || cat?.label}
                    </div>
                    <div className="text-xs text-ink-400 truncate">
                      {concerns?.full_name.split(" ")[0] ?? "Groupe"} ·{" "}
                      {relativeLabel(t.occurred_on)}
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
        ) : (
          <div className="py-12 text-center">
            <div className="text-4xl mb-2 opacity-50">📭</div>
            <p className="text-sm text-ink-500">Pas encore d&apos;activité.</p>
            <Link
              href="/transactions/new"
              className="mt-3 inline-block text-sm text-accent-700"
            >
              {isParent
                ? "Ajouter une transaction →"
                : "Ajouter ta première dépense →"}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
