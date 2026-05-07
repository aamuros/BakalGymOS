import { Card } from "@/components/ui/card";

export default function EntryReconciliationLoading() {
  return (
    <div className="ledger-rise space-y-6">
      <Card className="rounded-3xl shadow-none">
        <div className="h-14 w-14 rounded-2xl bg-ledger-line" />
        <div className="mt-7 h-4 w-48 rounded bg-ledger-line" />
        <div className="mt-4 h-12 w-3/4 rounded bg-ledger-line" />
        <div className="mt-5 h-5 w-2/3 rounded bg-ledger-line" />
      </Card>

      <Card className="rounded-3xl shadow-none">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="h-12 rounded-2xl bg-ledger-line" key={index} />
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl p-0 shadow-none">
        {Array.from({ length: 7 }).map((_, index) => (
          <div className="border-b border-ledger-line px-5 py-5" key={index}>
            <div className="h-5 w-1/3 rounded bg-ledger-line" />
            <div className="mt-3 h-4 w-2/3 rounded bg-ledger-line" />
          </div>
        ))}
      </Card>
    </div>
  );
}
