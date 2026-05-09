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
    <div className="page-enter space-y-6">
      <div>
        <p className="text-xs font-semibold text-n-muted">
          Member Management
        </p>
        <h2 className="mt-2 text-2xl font-bold text-n-ink sm:text-3xl">
          Add member
        </h2>
      </div>
      <Card>
        <MemberForm mode="create" />
      </Card>
    </div>
  );
}
