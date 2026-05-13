import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
