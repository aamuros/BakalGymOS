import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getDefaultPathForRole } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/server";

export default async function UnauthorizedPage() {
  const profile = await getCurrentProfile();
  const homeHref = profile ? getDefaultPathForRole(profile.role) : "/login";

  return (
    <main className="page-enter flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="max-w-lg">
        <div className="flex size-12 items-center justify-center rounded-lg bg-n-ink text-white">
          <ShieldAlert aria-hidden="true" className="size-6" />
        </div>
        <p className="mt-6 text-xs font-semibold text-n-muted">
          Unauthorized
        </p>
        <h1 className="mt-2 text-2xl font-bold text-n-ink">
          This page is not available for your role.
        </h1>
        <p className="mt-4 text-sm leading-6 text-n-dim">
          GymLedger restricts routes and database rows by staff role. Ask an owner or admin if
          your access needs to change.
        </p>
        <Link
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-n-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-n-dark"
          href={homeHref}
        >
          Return to your workspace
        </Link>
      </Card>
    </main>
  );
}
