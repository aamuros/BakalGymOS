import { Card } from "@/components/ui/card";

export default function OwnerDashboardLoading() {
  return (
    <div className="page-enter space-y-6">
      <div>
        <div className="h-7 w-36 animate-pulse rounded bg-n-border" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-n-border" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <div className="h-3 w-24 animate-pulse rounded bg-n-border" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-n-border" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-n-border" />
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Card>
          <div className="h-4 w-28 animate-pulse rounded bg-n-border" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="h-10 animate-pulse rounded bg-n-border" key={i} />
            ))}
          </div>
        </Card>
        <Card>
          <div className="h-4 w-24 animate-pulse rounded bg-n-border" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="h-10 animate-pulse rounded bg-n-border" key={i} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <div className="h-4 w-32 animate-pulse rounded bg-n-border" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div className="h-10 animate-pulse rounded bg-n-border" key={j} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
