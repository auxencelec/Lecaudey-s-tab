import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

import { recomputeFamilyAdvances } from "@/lib/settle";
import type { Profile, Transaction } from "@/lib/db.types";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { HistoryItem, dayLabel } from "@/components/HistoryItem";

export default async function HistoriquePage() {
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

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("family_id", me.family_id)
    .returns<Profile[]>();

  const parentIds = (members ?? [])
    .filter((m) => m.role === "parent")
    .map((m) => m.id);
  await recomputeFamilyAdvances(supabase, me.family_id, parentIds);

  // RLS already scopes to what the viewer can see:
  //   - child: their own private space
  //   - parent: all family spaces
  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Transaction[]>();

  const profilesById = new Map((members ?? []).map((m) => [m.id, m]));
  const parentSet = new Set(parentIds);
  const childSet = new Set(
    (members ?? []).filter((m) => m.role === "child").map((m) => m.id)
  );

  // Group by day for headers
  const groups = new Map<string, Transaction[]>();
  for (const t of tx ?? []) {
    const key = t.occurred_on; // YYYY-MM-DD
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  // Group days by month for monthly headers
  const months = new Map<string, [string, Transaction[]][]>();
  for (const [day, items] of groups) {
    const m = format(parseISO(day), "yyyy-MM");
    const arr = months.get(m) ?? [];
    arr.push([day, items]);
    months.set(m, arr);
  }

  return (
    <div className="space-y-7">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-400 font-medium">
          {me.role === "parent" ? "Famille" : "Mon espace"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mt-0.5">
          Historique
        </h1>
      </header>

      {tx && tx.length > 0 ? (
        <div className="space-y-8">
          {Array.from(months.entries()).map(([month, days]) => (
            <section key={month}>
              <h2 className="text-xs uppercase tracking-widest text-ink-400 font-medium mb-3 sticky top-14 bg-white/90 backdrop-blur py-1 -mx-5 px-5">
                {format(parseISO(month + "-01"), "MMMM yyyy", { locale: fr })}
              </h2>
              <div className="space-y-5">
                {days.map(([day, items]) => (
                  <div key={day}>
                    <div className="text-xs text-ink-400 mb-1 px-1">
                      {dayLabel(day)}
                    </div>
                    <div className="divide-y divide-ink-100">
                      {items.map((t) => (
                        <HistoryItem
                          key={t.id}
                          tx={t}
                          viewer={me}
                          profilesById={profilesById}
                          parentIds={parentSet}
                          childIds={childSet}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <div className="text-4xl mb-2 opacity-50">📭</div>
          <p className="text-sm text-ink-500">
            Pas encore de transactions à afficher.
          </p>
        </div>
      )}
    </div>
  );
}
