import { ClipboardCheck, WalletCards } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/permissions";
import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function PaymentsPage() {
  const profile = await requireModuleAccess("/payments");
  const canCorrectPayments = await hasConfiguredPermission(profile.role, "correct_payments");
  const supabase = await createClient();
  const [{ count: reviewCount, error: reviewError }, { count: disputedCount, error: disputedError }] =
    await Promise.all([
      supabase
        .from("gcash_proofs")
        .select("id", { count: "exact", head: true })
        .in("proof_status", ["staff_checked", "disputed", "needs_follow_up"]),
      supabase
        .from("gcash_proofs")
        .select("id", { count: "exact", head: true })
        .eq("proof_status", "disputed"),
    ]);

  const error = reviewError ?? disputedError;

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="ledger-rise space-y-6">
      <Card className="relative overflow-hidden rounded-3xl">
        <div className="relative">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
            <WalletCards aria-hidden="true" className="size-7" />
          </div>
          <p className="mt-7 text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
            Payments
          </p>
          <h2 className="mt-3 font-[var(--font-heading)] text-4xl font-black leading-tight text-ledger-ink sm:text-6xl">
            Payment Review
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-moss">
            Cash remains shift-based. GCash payments require uploaded proof and management confirmation before they become owner-confirmed.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl shadow-none">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            GCash Review Items
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-5xl font-black text-ledger-ink">
            {(reviewCount ?? 0).toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-bold leading-6 text-ledger-moss">
            Includes staff-checked, disputed, and follow-up proofs.
          </p>
        </Card>

        <Card className="rounded-3xl shadow-none">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Disputed
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-5xl font-black text-ledger-ink">
            {(disputedCount ?? 0).toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-bold leading-6 text-ledger-moss">
            Disputed GCash payments stay in the review queue.
          </p>
        </Card>

        <Card className="flex flex-col justify-between rounded-3xl shadow-none">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Access
            </p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
              {roleLabels[profile.role]}
            </p>
          </div>
          {canCorrectPayments ? (
            <Link
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ledger-ink px-5 text-sm font-black text-ledger-paper transition hover:bg-ledger-moss"
              href="/payments/gcash-review"
            >
              <ClipboardCheck aria-hidden="true" className="size-4" />
              Open GCash Review
            </Link>
          ) : (
            <p className="mt-6 text-sm font-bold leading-6 text-ledger-moss">
              Management accounts review GCash proofs.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
