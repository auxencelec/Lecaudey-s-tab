import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between pt-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>

      <Skeleton className="h-32 w-full rounded-3xl" />

      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
