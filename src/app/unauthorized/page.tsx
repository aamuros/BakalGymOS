import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getDefaultPathForRole } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/server";

export default async function UnauthorizedPage() {
  const profile = await getCurrentProfile();
  const homeHref = profile ? getDefaultPathForRole(profile.role) : "/login";

  return (
    <main className="ledger-rise flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="max-w-lg">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
          <ShieldAlert aria-hidden="true" className="size-7" />
        </div>
        <p className="mt-7 text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
          Unauthorized
        </p>
        <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
          This page is not available for your role.
        </h1>
        <p className="mt-4 text-sm leading-6 text-ledger-moss">
          GymLedger restricts routes and database rows by staff role. Ask an owner or admin if
          your access needs to change.
        </p>
        <Link
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-ledger-ink px-5 py-2.5 text-sm font-bold text-ledger-paper transition hover:bg-ledger-moss"
          href={homeHref}
        >
          Return to your workspace
        </Link>
      </Card>
    </main>
  );
}
