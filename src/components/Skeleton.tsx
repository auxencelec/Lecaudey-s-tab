import { cn } from "@/lib/utils";

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-ink-100 rounded-2xl animate-pulse",
        className
      )}
    />
  );
}
