import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Space, Advance } from "@/lib/db.types";
import TransferForm from "./form";

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; from?: string; advance?: string }>;
}) {
  const sp = await searchParams;
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

  const { data: spaces } = await supabase
    .from("spaces")
    .select("*")
    .eq("family_id", me.family_id)
    .returns<Space[]>();

  const { data: openAdvances } = await supabase
    .from("advances")
    .select("*")
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .returns<Advance[]>();

  let preset: Advance | undefined;
  if (sp.advance) {
    preset = openAdvances?.find((a) => a.id === sp.advance);
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payer</h1>
        <p className="text-sm text-ink-500 mt-1">
          Transférer ou rembourser quelqu&apos;un de la famille.
        </p>
      </header>

      <TransferForm
        me={me}
        members={members ?? []}
        spaces={spaces ?? []}
        openAdvances={openAdvances ?? []}
        defaultToId={preset?.creditor_id ?? sp.to}
        defaultFromId={preset?.debtor_id ?? sp.from}
        presetAdvance={preset ?? null}
      />
    </div>
  );
}
