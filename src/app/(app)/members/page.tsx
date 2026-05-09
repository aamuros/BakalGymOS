import { Plus, Search, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { canManageMembers } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { deriveMemberAccess, getPlanName, type MemberAccessStatus, type SubscriptionAccess } from "@/lib/member-access";
import { createClient } from "@/lib/supabase/server";

type MembersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type MemberListItem = {
  id: string;
  full_name: string;
  phone: string | null;
  member_code: string;
  status: "active" | "inactive" | "banned" | "archived";
};

type MemberSubscriptionRow = SubscriptionAccess & {
  member_id: string;
};

function cleanSearchTerm(value: string) {
  return value.trim().replace(/[%,]/g, "");
}

function getStatusTone(status: string): "active" | "danger" | "neutral" {
  if (status === "active") return "active";
  if (status === "banned") return "danger";
  return "neutral";
}

function getAccessTone(status: MemberAccessStatus): "active" | "danger" | "warn" {
  return status === "good" ? "active" : status === "banned" || status === "archived" ? "danger" : "warn";
}

function getAccessLabel(status: MemberAccessStatus) {
  const labels: Record<MemberAccessStatus, string> = {
    archived: "Archived",
    banned: "Banned",
    entry_limit_reached: "No entries",
    expired: "Expired",
    good: "Active",
    inactive: "Inactive",
  };

  return labels[status];
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

  const memberRows = (members ?? []) as MemberListItem[];
  const memberIds = memberRows.map((member) => member.id);
  const [subscriptionsResult, operationalSettingsResult] = await Promise.all([
    memberIds.length
      ? supabase
        .from("member_subscriptions")
        .select("member_id, starts_at, ends_at, status, entries_used, membership_plans(name, entry_limit, is_unlimited)")
        .in("member_id", memberIds)
        .order("ends_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "operational_settings")
      .maybeSingle(),
  ]);

  const subscriptions = subscriptionsResult.data;
  const subscriptionsError = subscriptionsResult.error;

  if (subscriptionsError) {
    throw new Error(subscriptionsError.message);
  }

  const latestSubscriptionByMember = ((subscriptions ?? []) as MemberSubscriptionRow[]).reduce<Record<string, MemberSubscriptionRow>>((lookup, subscription) => {
    if (!lookup[subscription.member_id]) {
      lookup[subscription.member_id] = subscription;
    }

    return lookup;
  }, {});

  const opSettings = operationalSettingsResult.data?.value;
  const gracePeriodDays = opSettings && typeof opSettings === "object"
    ? Number((opSettings as { grace_period_days?: unknown }).grace_period_days ?? 0)
    : 0;

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-n-muted">
            Member Management
          </p>
          <h2 className="mt-2 text-xl font-bold text-n-ink sm:text-2xl">
            Members
          </h2>
        </div>
        {canEdit ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-n-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-n-dark active:scale-[0.98]"
            href="/members/new"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add member
          </Link>
        ) : null}
      </div>

      <Card>
        <form className="relative" action="/members">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-n-dim"
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

      <div className="overflow-hidden rounded-lg border border-n-border bg-white shadow-n">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-n-border px-5 py-4 text-xs font-semibold text-n-muted md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
          <span>Name</span>
          <span className="hidden md:block">Phone</span>
          <span className="hidden md:block">Plan</span>
          <span className="hidden md:block">Member status</span>
          <span>Status</span>
        </div>

        {memberRows.length ? (
          memberRows.map((member) => {
            const subscription = latestSubscriptionByMember[member.id] ?? null;
            const accessStatus = deriveMemberAccess(member.status, subscription, undefined, gracePeriodDays);

            return (
            <Link
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-n-border px-5 py-4 transition last:border-b-0 hover:bg-white/70 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]"
              href={`/members/${member.id}`}
              key={member.id}
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-n-ink">{member.full_name}</span>
                <span className="mt-1 block text-sm font-medium text-n-dim md:hidden">
                  {member.member_code} · {member.phone || "No phone"}
                </span>
              </span>
              <span className="hidden text-sm font-medium text-n-dim md:block">
                {member.phone || "No phone"}
              </span>
              <span className="hidden text-sm font-bold text-n-ink md:block">
                {getPlanName(subscription)}
              </span>
              <StatusBadge className="hidden md:inline-flex" tone={getStatusTone(member.status)}>
                {member.status}
              </StatusBadge>
              <StatusBadge tone={getAccessTone(accessStatus)}>
                {getAccessLabel(accessStatus)}
              </StatusBadge>
            </Link>
          );
          })
        ) : (
          <div className="flex flex-col items-center px-5 py-16 text-center">
            <UserRoundCheck aria-hidden="true" className="size-10 text-n-dim" />
            <p className="mt-4 font-bold text-n-ink">No members found</p>
            <p className="mt-1 text-sm font-medium text-n-dim">
              {q ? "Try a different search term." : "Add the first member to start tracking records."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
