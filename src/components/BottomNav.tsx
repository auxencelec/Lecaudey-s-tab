"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

function HomeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z" />
    </svg>
  );
}
function PayIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H10a4 4 0 0 0-4 4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h10a4 4 0 0 0 4-4" />
    </svg>
  );
}
function StatsIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <rect x="5" y="11" width="3" height="8" rx="1" />
      <rect x="10.5" y="6" width="3" height="13" rx="1" />
      <rect x="16" y="14" width="3" height="5" rx="1" />
    </svg>
  );
}
function UserIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();

  const tab = (
    href: string,
    label: string,
    Icon: React.FC<{ filled?: boolean }>,
    isActive: boolean
  ) => (
    <Link
      key={href}
      href={href}
      onClick={() => haptic("light")}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 h-full transition active:scale-95",
        isActive ? "text-ink-900" : "text-ink-400 hover:text-ink-600"
      )}
    >
      <Icon filled={isActive} />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </Link>
  );

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-xl border-t border-ink-100 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto h-16 grid grid-cols-5 items-center">
        {tab("/", "Accueil", HomeIcon, pathname === "/")}
        {tab("/transfers/new", "Payer", PayIcon, pathname.startsWith("/transfers"))}

        <div className="flex items-center justify-center">
          <Link
            href="/transactions/new"
            onClick={() => haptic("medium")}
            className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent-600 text-white shadow-lg shadow-accent-600/30 hover:bg-accent-700 active:scale-90 transition"
            aria-label="Nouvelle transaction"
          >
            <PlusIcon />
          </Link>
        </div>

        {tab("/stats", "Stats", StatsIcon, pathname.startsWith("/stats"))}
        {tab("/settings", "Moi", UserIcon, pathname.startsWith("/settings"))}
      </div>
    </nav>
  );
}
