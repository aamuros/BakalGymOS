import { Card } from "@/components/ui/card";

export default function OwnerDashboardLoading() {
  return (
    <div className="ledger-rise space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="rounded-3xl shadow-none">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-ledger-line" />
          <div className="mt-7 h-4 w-40 animate-pulse rounded bg-ledger-line" />
          <div className="mt-4 h-12 w-3/4 animate-pulse rounded bg-ledger-line" />
          <div className="mt-5 h-5 w-2/3 animate-pulse rounded bg-ledger-line" />
        </Card>
        <Card className="rounded-3xl shadow-none">
          <div className="h-4 w-24 animate-pulse rounded bg-ledger-line" />
          <div className="mt-4 h-9 w-32 animate-pulse rounded bg-ledger-line" />
          <div className="mt-8 h-16 animate-pulse rounded bg-ledger-line" />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card className="rounded-3xl shadow-none" key={index}>
            <div className="h-4 w-32 animate-pulse rounded bg-ledger-line" />
            <div className="mt-5 h-10 w-24 animate-pulse rounded bg-ledger-line" />
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card className="rounded-3xl shadow-none" key={index}>
            <div className="h-7 w-48 animate-pulse rounded bg-ledger-line" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((__, itemIndex) => (
                <div className="h-16 animate-pulse rounded-2xl bg-ledger-line" key={itemIndex} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
