import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-7 animate-fade-in">
      <div className="space-y-2 pt-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
