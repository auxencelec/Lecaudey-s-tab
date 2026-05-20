import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db.types";
import BudgetForm from "../form";

export const dynamic = "force-dynamic";

export default async function NewBudgetPage() {
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
  if (!me || me.role !== "parent") redirect("/budgets");

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nouveau budget
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Définis un montant à ne pas dépasser pour une catégorie.
        </p>
      </header>
      <BudgetForm me={me} />
    </div>
  );
}
