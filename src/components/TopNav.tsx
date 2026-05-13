import { createClient } from "@/lib/supabase/server";

export default async function TopNav({ title }: { title?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="max-w-md mx-auto px-5 h-14 flex items-center">
        <h1 className="text-base font-semibold tracking-tight text-ink-900">
          {title ?? "Trésor"}
        </h1>
      </div>
    </header>
  );
}
