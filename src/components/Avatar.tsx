import { cn } from "@/lib/utils";

const sizeMap = {
  xs: "w-7 h-7 text-sm",
  sm: "w-9 h-9 text-base",
  md: "w-11 h-11 text-lg",
  lg: "w-16 h-16 text-2xl",
  xl: "w-20 h-20 text-3xl",
};

export default function Avatar({
  emoji,
  size = "md",
  className,
}: {
  emoji?: string | null;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-full bg-ink-100 flex items-center justify-center select-none",
        sizeMap[size],
        className
      )}
    >
      {emoji ?? "👤"}
    </div>
  );
}
