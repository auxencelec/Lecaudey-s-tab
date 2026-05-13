import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Space } from "@/lib/db.types";
import ChildExpenseForm from "./child-form";
import ParentGiveForm from "./parent-form";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; space?: string }>;
}) {
  const params = await searchParams;
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
    .order("birth_year", { ascending: true })
    .returns<Profile[]>();

  const { data: spaces } = await supabase
    .from("spaces")
    .select("*")
    .eq("family_id", me.family_id)
    .returns<Space[]>();

  const parents = (members ?? []).filter((m) => m.role === "parent");
  const children = (members ?? []).filter((m) => m.role === "child");

  if (me.role === "child") {
    return (
      <div className="space-y-7">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nouvelle dépense
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Note ce que tu viens de payer. Si c&apos;est à rembourser, tes
            parents le verront.
          </p>
        </header>
        <ChildExpenseForm
          me={me}
          parents={parents}
          spaces={spaces ?? []}
        />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nouvelle transaction
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Donner de l&apos;argent de poche ou prêter à un enfant.
        </p>
      </header>
      <ParentGiveForm
        me={me}
        parents={parents}
        children={children}
        spaces={spaces ?? []}
        defaultChildId={params.member}
      />
    </div>
  );
}
