import { cn } from "@/lib/utils";

const sizeMap = {
  xs: { wrap: "w-7 h-7 text-sm", img: "w-7 h-7" },
  sm: { wrap: "w-9 h-9 text-base", img: "w-9 h-9" },
  md: { wrap: "w-11 h-11 text-lg", img: "w-11 h-11" },
  lg: { wrap: "w-16 h-16 text-2xl", img: "w-16 h-16" },
  xl: { wrap: "w-20 h-20 text-3xl", img: "w-20 h-20" },
} as const;

export default function Avatar({
  emoji,
  url,
  alt,
  size = "md",
  className,
}: {
  emoji?: string | null;
  url?: string | null;
  alt?: string;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  const s = sizeMap[size];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt ?? "Avatar"}
        className={cn("rounded-full object-cover bg-ink-100", s.img, className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-ink-100 flex items-center justify-center select-none",
        s.wrap,
        className
      )}
    >
      {emoji ?? "👤"}
    </div>
  );
}
