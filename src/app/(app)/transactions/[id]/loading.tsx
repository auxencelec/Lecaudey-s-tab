import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <Skeleton className="h-4 w-16" />
      <div className="flex flex-col items-center gap-2 pt-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
