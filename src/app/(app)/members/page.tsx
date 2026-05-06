import { Plus, Search, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canManageMembers } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

type MembersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type MemberListItem = {
  id: string;
  full_name: string;
  phone: string | null;
  member_code: string;
  status: "active" | "expired" | "banned" | "inactive" | "archived";
};

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-amber-100 text-amber-800",
  banned: "bg-red-100 text-red-800",
  inactive: "bg-slate-200 text-slate-700",
  archived: "bg-slate-200 text-slate-700",
};

function cleanSearchTerm(value: string) {
  return value.trim().replace(/[%,]/g, "");
}

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const profile = await requireModuleAccess("/members");
  const params = await searchParams;
  const q = cleanSearchTerm(params?.q ?? "");
  const supabase = await createClient();

  let query = supabase
    .from("members")
    .select("id, full_name, phone, member_code, status")
    .neq("status", "archived")
    .order("full_name", { ascending: true })
    .limit(50);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,member_code.ilike.%${q}%`);
  }

  const { data: members, error } = await query;
  const canEdit = canManageMembers(profile.role);

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="ledger-rise space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
            Member Management
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
            Members
          </h2>
        </div>
        {canEdit ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ledger-ink px-5 py-2.5 text-sm font-bold text-ledger-paper transition hover:bg-ledger-moss"
            href="/members/new"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add member
          </Link>
        ) : null}
      </div>

      <Card className="rounded-3xl shadow-none">
        <form className="relative" action="/members">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ledger-moss"
          />
          <Input
            className="pl-12"
            defaultValue={q}
            name="q"
            placeholder="Search by name, phone number, or member ID"
            type="search"
          />
        </form>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-ledger-line bg-ledger-paper/90 shadow-ledger">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-ledger-line px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-ledger-moss md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
          <span>Name</span>
          <span className="hidden md:block">Phone</span>
          <span className="hidden md:block">Member ID</span>
          <span>Status</span>
        </div>

        {(members as MemberListItem[] | null)?.length ? (
          (members as MemberListItem[]).map((member) => (
            <Link
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-ledger-line px-5 py-4 transition last:border-b-0 hover:bg-white/70 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]"
              href={`/members/${member.id}`}
              key={member.id}
            >
              <span className="min-w-0">
                <span className="block truncate font-black text-ledger-ink">{member.full_name}</span>
                <span className="mt-1 block text-sm font-bold text-ledger-moss md:hidden">
                  {member.member_code} · {member.phone || "No phone"}
                </span>
              </span>
              <span className="hidden text-sm font-bold text-ledger-moss md:block">
                {member.phone || "No phone"}
              </span>
              <span className="hidden text-sm font-black text-ledger-ink md:block">
                {member.member_code}
              </span>
              <span
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-xs font-black uppercase",
                  statusStyles[member.status],
                )}
              >
                {member.status}
              </span>
            </Link>
          ))
        ) : (
          <div className="flex flex-col items-center px-5 py-16 text-center">
            <UserRoundCheck aria-hidden="true" className="size-10 text-ledger-moss" />
            <p className="mt-4 font-black text-ledger-ink">No members found</p>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              {q ? "Try a different search term." : "Add the first member to start tracking records."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
