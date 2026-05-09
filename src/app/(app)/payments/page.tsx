import { ClipboardCheck, HandCoins, WalletCards } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/permissions";
import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function PaymentsPage() {
  const profile = await requireModuleAccess("/payments");
  const canCorrectPayments = await hasConfiguredPermission(profile.role, "correct_payments");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");
  const supabase = await createClient();
  const [
    { count: reviewCount, error: reviewError },
    { count: rejectedCount, error: rejectedError },
    { data: balancesData, error: balancesError },
  ] =
    await Promise.all([
      supabase
        .from("gcash_proofs")
        .select("id", { count: "exact", head: true })
        .in("proof_status", ["for_review", "rejected", "follow_up"]),
      supabase
        .from("gcash_proofs")
        .select("id", { count: "exact", head: true })
        .eq("proof_status", "rejected"),
      supabase
        .from("walk_in_balances")
        .select("amount, paid_amount, settled_at")
        .is("settled_at", null),
    ]);

  const error = reviewError ?? rejectedError ?? balancesError;

  if (error) {
    throw new Error(error.message);
  }

  const openBalances = balancesData ?? [];
  const utangOutstanding = openBalances.reduce((total, balance) => {
    return total + Math.max(Number(balance.amount ?? 0) - Number(balance.paid_amount ?? 0), 0);
  }, 0);
  const pesoFormatter = new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  });

  return (
    <div className="page-enter space-y-6">
      <Card className="relative overflow-hidden">
        <div className="relative">
          <div className="flex size-14 items-center justify-center rounded-xl bg-n-ink text-white">
            <WalletCards aria-hidden="true" className="size-7" />
          </div>
          <p className="mt-7 text-xs font-semibold text-n-muted">
            Payments & Utang
          </p>
          <h2 className="mt-3 text-xl font-bold leading-tight text-n-ink sm:text-2xl">
            Payment Review
          </h2>
          <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-n-dim">
            Cash remains shift-based. GCash payments allow entry immediately, then stay in a management review queue.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold text-n-muted">
            Open Utang
          </p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {openBalances.length.toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            {pesoFormatter.format(utangOutstanding)} unpaid across active balances.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-n-muted">
            GCash Review Items
          </p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {(reviewCount ?? 0).toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            Includes for-review, rejected, and follow-up items.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-n-muted">
            Rejected
          </p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {(rejectedCount ?? 0).toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            Rejected GCash payments stay visible for follow-up.
          </p>
        </Card>

        <Card className="flex flex-col justify-between lg:col-span-1">
          <div>
            <p className="text-xs font-semibold text-n-muted">
              Access
            </p>
            <p className="mt-3 text-xl font-bold text-n-ink">
              {roleLabels[profile.role]}
            </p>
          </div>
          {canRecordPayments || canCorrectPayments ? (
            <div className="mt-6 grid gap-2">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-n-ink px-5 text-sm font-bold text-white transition hover:bg-n-dark active:scale-[0.98]"
                href="/balances"
              >
                <HandCoins aria-hidden="true" className="size-4" />
                Open Utang
              </Link>
              {canCorrectPayments ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-n-border bg-white px-5 text-sm font-bold text-n-ink transition hover:bg-n-hover active:scale-[0.98]"
                  href="/payments/gcash-review"
                >
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                  GCash Review
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="mt-6 text-sm font-medium leading-6 text-n-dim">
              Management accounts review GCash proofs.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
