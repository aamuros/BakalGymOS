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

function getMemberFormDefaults(member: {
  full_name: string;
  member_code: string;
  phone: string | null;
  status: string;
}): MemberFormValues {
  return {
    full_name: member.full_name,
    member_code: member.member_code,
    phone: member.phone ?? "",
    status: member.status === "expired" ? "inactive" : (member.status as MemberFormValues["status"]),
  };
}

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
    <div className="page-enter space-y-6">
      <div>
        <p className="text-xs font-semibold text-n-muted">
          Member Management
        </p>
        <h2 className="mt-2 text-2xl font-bold text-n-ink sm:text-3xl">
          Edit member
        </h2>
      </div>
      <Card>
        <MemberForm
          defaultValues={getMemberFormDefaults(member)}
          memberId={id}
          mode="edit"
        />
      </Card>
    </div>
  );
}
