import { Card } from "@/components/ui/card";

export default function EntryReconciliationLoading() {
  return (
    <div className="page-enter space-y-6">
      <Card>
        <div className="h-14 w-14 rounded-lg bg-n-border" />
        <div className="mt-7 h-4 w-48 rounded bg-n-border" />
        <div className="mt-4 h-12 w-3/4 rounded bg-n-border" />
        <div className="mt-5 h-5 w-2/3 rounded bg-n-border" />
      </Card>

      <Card>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="h-12 rounded-lg bg-n-border" key={index} />
          ))}
        </div>
      </Card>

      <Card className="p-0">
        {Array.from({ length: 7 }).map((_, index) => (
          <div className="border-b border-n-border px-5 py-5" key={index}>
            <div className="h-5 w-1/3 rounded bg-n-border" />
            <div className="mt-3 h-4 w-2/3 rounded bg-n-border" />
          </div>
        ))}
      </Card>
    </div>
  );
}
