import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db.types";
import RequestForm from "./form";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
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

  if (me.role !== "child") redirect("/");

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nouvelle demande
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Demande à tes parents de t&apos;envoyer de l&apos;argent. Ils
          recevront la demande et pourront accepter ou refuser.
        </p>
      </header>
      <RequestForm me={me} />
    </div>
  );
}
