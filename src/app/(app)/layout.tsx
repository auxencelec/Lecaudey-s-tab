import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <main className="max-w-md mx-auto px-5 pt-6 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
