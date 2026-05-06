import { notFound, redirect } from "next/navigation";

import { MemberForm } from "@/app/(app)/members/member-form";
import type { MemberFormValues } from "@/app/(app)/members/schema";
import { Card } from "@/components/ui/card";
import { canManageMembers } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type EditMemberPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditMemberPage({ params }: EditMemberPageProps) {
  const profile = await requireModuleAccess("/members");

  if (!canManageMembers(profile.role)) {
    redirect("/unauthorized?next=/members");
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("members")
    .select("full_name, phone, member_code, status")
    .eq("id", id)
    .single();

  if (error || !member) {
    notFound();
  }

  return (
    <div className="ledger-rise space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
          Member Management
        </p>
        <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
          Edit member
        </h2>
      </div>
      <Card className="rounded-3xl">
        <MemberForm
          defaultValues={member as MemberFormValues}
          memberId={id}
          mode="edit"
        />
      </Card>
    </div>
  );
}
