import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-7 animate-fade-in">
      <Skeleton className="h-4 w-16" />
      <div className="text-center pt-2 flex flex-col items-center gap-3">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-32 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
