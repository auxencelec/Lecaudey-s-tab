import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Budget } from "@/lib/db.types";
import BudgetForm from "../form";

export const dynamic = "force-dynamic";

export default async function EditBudgetPage({
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
  if (!me || me.role !== "parent") redirect("/budgets");

  const { data: budget } = await supabase
    .from("budgets")
    .select("*")
    .eq("id", id)
    .single<Budget>();
  if (!budget) notFound();

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Modifier le budget
        </h1>
      </header>
      <BudgetForm me={me} existing={budget} />
    </div>
  );
}
