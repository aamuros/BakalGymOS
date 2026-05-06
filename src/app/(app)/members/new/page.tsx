import { redirect } from "next/navigation";

import { MemberForm } from "@/app/(app)/members/member-form";
import { Card } from "@/components/ui/card";
import { canManageMembers } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";

export default async function NewMemberPage() {
  const profile = await requireModuleAccess("/members");

  if (!canManageMembers(profile.role)) {
    redirect("/unauthorized?next=/members/new");
  }

  return (
    <div className="ledger-rise space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
          Member Management
        </p>
        <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
          Add member
        </h2>
      </div>
      <Card className="rounded-3xl">
        <MemberForm mode="create" />
      </Card>
    </div>
  );
}
