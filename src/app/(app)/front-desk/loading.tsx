import { Card } from "@/components/ui/card";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ledger-line ${className}`} />;
}

export default function FrontDeskLoading() {
  return (
    <div className="ledger-rise space-y-6">
      <div>
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="mt-4 h-12 w-64 max-w-full" />
        <SkeletonBlock className="mt-3 h-5 w-80 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock className="h-32" key={index} />
        ))}
      </div>

      <Card className="rounded-3xl shadow-none">
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div>
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-4 h-10 w-56" />
            <SkeletonBlock className="mt-3 h-5 w-72 max-w-full" />
            <div className="mt-6 grid gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock className="h-11" key={index} />
              ))}
            </div>
          </div>
          <div className="grid gap-4">
            <SkeletonBlock className="h-14" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-14" />
          </div>
        </div>
      </Card>

      <Card className="rounded-3xl shadow-none">
        <SkeletonBlock className="h-10 w-64 max-w-full" />
        <SkeletonBlock className="mt-5 h-14" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock className="h-20" key={index} />
          ))}
        </div>
      </Card>
    </div>
  );
}
