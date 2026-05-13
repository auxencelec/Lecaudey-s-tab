import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-7 animate-fade-in">
      <Skeleton className="h-7 w-32" />
      <div className="text-center py-4 flex flex-col items-center gap-3">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-32" />
    </div>
  );
}
