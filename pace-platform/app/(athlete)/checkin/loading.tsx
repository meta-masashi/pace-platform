import { Skeleton } from '@/components/ui/skeleton';

export default function CheckinLoading() {
  return (
    <div className="flex flex-col items-center space-y-8 py-12">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-[160px] w-[300px] rounded-2xl" />
      <div className="flex gap-6">
        <Skeleton className="h-12 w-12" circle />
        <Skeleton className="h-12 w-12" circle />
      </div>
      <Skeleton className="h-2 w-48 rounded-full" />
    </div>
  );
}
