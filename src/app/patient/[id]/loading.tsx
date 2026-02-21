import { Skeleton } from '@/components/ui/skeleton';

export default function PatientLoading() {
  return (
    <div className="w-full min-h-screen bg-gray-50/50">
      <div className="bg-white border-b px-6 py-4">
        <Skeleton className="h-9 w-80" />
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
