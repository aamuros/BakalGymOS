import { CalendarDays, Edit, QrCode, ReceiptText, UserCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { MemberCardActions } from "@/app/(app)/members/member-card-actions";
import { MemberOperations } from "@/app/(app)/members/member-operations";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { canManageMembers, canPrintMemberCards } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import {
  deriveMemberAccess,
  getManilaDateString,
  getPlanName,
  hasRemainingEntries,
  type MemberAccessStatus,
  type SubscriptionAccess,
} from "@/lib/member-access";
import { createMemberQrPayload } from "@/lib/member-qr";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

type MemberProfilePageProps = {
  params: Promise<{ id: string }>;
};

type MemberProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  member_code: string;
  qr_token: string;
  status: "active" | "inactive" | "banned" | "archived";
};

type Subscription = SubscriptionAccess & {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  entries_used: number;
  membership_plans:
    | { name: string; entry_limit: number | null; is_unlimited: boolean }
    | { name: string; entry_limit: number | null; is_unlimited: boolean }[]
    | null;
};

type PlanOption = {
  duration_days: number;
  id: string;
  name: string;
  price: number | string;
};

type EntryHistoryRow = {
  id: string;
  entered_at: string;
  settlement_type: string;
  status: string;
  notes: string | null;
};

type PaymentHistoryRow = {
  id: string;
  amount: number | string;
  payment_type: string;
  purpose: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

type UtangHistoryRow = {
  id: string;
  amount: number | string;
  paid_amount: number | string | null;
  status: string;
  note: string | null;
  created_at: string;
  settled_at: string | null;
};

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  banned: "bg-red-100 text-red-800",
  inactive: "bg-slate-200 text-slate-700",
  archived: "bg-slate-200 text-slate-700",
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function purposeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getAccessTone(status: MemberAccessStatus) {
  return status === "good" ? "active" : status === "banned" || status === "archived" ? "danger" : "warn";
}

function getAccessLabel(status: MemberAccessStatus) {
  const labels: Record<MemberAccessStatus, string> = {
    archived: "Archived",
    banned: "Banned",
    entry_limit_reached: "No entries left",
    expired: "Expired",
    good: "Active access",
    inactive: "Inactive",
  };

  return labels[status];
}

export default async function MemberProfilePage({ params }: MemberProfilePageProps) {
  const profile = await requireModuleAccess("/members");
  const { id } = await params;
  const supabase = await createClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, full_name, phone, member_code, qr_token, status")
    .eq("id", id)
    .single();

  if (memberError || !member) {
    notFound();
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("member_subscriptions")
    .select("id, starts_at, ends_at, status, entries_used, membership_plans(name, entry_limit, is_unlimited)")
    .eq("member_id", id)
    .order("ends_at", { ascending: false })
    .limit(12);

  if (subscriptionsError) {
    throw new Error(subscriptionsError.message);
  }

  const [
    balancesResult,
    entriesResult,
    paymentsResult,
    plansResult,
    operationalSettingsResult,
  ] = await Promise.all([
    supabase
      .from("walk_in_balances")
      .select("id, amount, paid_amount, status, note, created_at, settled_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("entries")
      .select("id, entered_at, settlement_type, status, notes")
      .eq("member_id", id)
      .neq("status", "voided")
      .order("entered_at", { ascending: false })
      .limit(10),
    supabase
      .from("payments")
      .select("id, amount, payment_type, purpose, status, paid_at, created_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("membership_plans")
      .select("id, name, duration_days, price")
      .eq("status", "active")
      .order("price", { ascending: true }),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "operational_settings")
      .maybeSingle(),
  ]);

  const historyError = balancesResult.error ?? entriesResult.error ?? paymentsResult.error ?? plansResult.error;

  if (historyError) {
    throw new Error(historyError.message);
  }

  const balance =
    (balancesResult.data as UtangHistoryRow[] | null)?.reduce(
      (total, entry) => total + Math.max(Number(entry.amount ?? 0) - Number(entry.paid_amount ?? 0), 0),
      0,
    ) ?? 0;
  const canEdit = canManageMembers(profile.role);
  const canPrintCard = canPrintMemberCards(profile.role);
  const memberProfile = member as MemberProfile;
  const subscriptionRows = (subscriptions ?? []) as Subscription[];
  const latestSubscription = subscriptionRows[0] ?? null;
  const opSettings = operationalSettingsResult.data?.value;
  const gracePeriodDays = opSettings && typeof opSettings === "object"
    ? Number((opSettings as { grace_period_days?: unknown }).grace_period_days ?? 0)
    : 0;
  const activeAccessSubscription = subscriptionRows.find((row) => deriveMemberAccess(memberProfile.status, row, undefined, gracePeriodDays) === "good") ?? latestSubscription;
  const accessStatus = deriveMemberAccess(memberProfile.status, activeAccessSubscription ?? null, undefined, gracePeriodDays);
  const today = getManilaDateString();
  const planOptions = ((plansResult.data ?? []) as PlanOption[]).map((plan) => ({
    duration_days: plan.duration_days,
    id: plan.id,
    name: plan.name,
    price: Number(plan.price),
  }));
  const entries = (entriesResult.data ?? []) as EntryHistoryRow[];
  const payments = (paymentsResult.data ?? []) as PaymentHistoryRow[];
  const utangRows = (balancesResult.data ?? []) as UtangHistoryRow[];
  const gymName = "GymLedger";
  const qrPayload = createMemberQrPayload(memberProfile.qr_token);
  const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 7,
  });

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-n-muted">
            Member Profile
          </p>
          <h2 className="mt-2 text-2xl font-bold text-n-ink sm:text-3xl">
            {memberProfile.full_name}
          </h2>
        </div>
        {canEdit ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-n-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-n-dark"
            href={`/members/${id}/edit`}
          >
            <Edit aria-hidden="true" className="size-4" />
            Edit member
          </Link>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-n-ink text-white">
              <UserCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Member details
              </p>
              <span
                className={cn("mt-2 inline-flex h-8 items-center rounded-xl px-3 text-xs font-bold uppercase", statusStyles[memberProfile.status])}
              >
                {memberProfile.status}
              </span>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-n-muted">Name</dt>
              <dd className="mt-1 font-bold text-n-ink">{memberProfile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Phone number
              </dt>
              <dd className="mt-1 font-bold text-n-ink">{memberProfile.phone || "No phone"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Member ID
              </dt>
              <dd className="mt-1 font-bold text-n-ink">{memberProfile.member_code}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Access
              </dt>
              <dd className="mt-1">
                <StatusBadge tone={getAccessTone(accessStatus)}>{getAccessLabel(accessStatus)}</StatusBadge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">Balance</dt>
              <dd className="mt-1 font-bold text-n-ink">{formatMoney(balance)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-n-hover text-n-muted">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Current plan
              </p>
              <p className="mt-1 font-bold text-n-ink">{getPlanName(latestSubscription)}</p>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Entries
              </dt>
              <dd className="mt-1 font-bold text-n-ink">
                {latestSubscription
                  ? hasRemainingEntries(latestSubscription)
                    ? `${latestSubscription.entries_used} used`
                    : "Limit reached"
                  : "No subscription"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Subscription status
              </dt>
              <dd className="mt-1 font-bold capitalize text-n-ink">
                {latestSubscription?.status ?? "None"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Start date
              </dt>
              <dd className="mt-1 font-bold text-n-ink">
                {formatDate(latestSubscription?.starts_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n-muted">
                Expiry date
              </dt>
              <dd className="mt-1 font-bold text-n-ink">
                {formatDate(latestSubscription?.ends_at)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="member-card-print">
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <div
            className="member-card-print-card overflow-hidden rounded-lg border border-n-border bg-white"
            id={`member-card-${memberProfile.id}`}
          >
            <div className="bg-n-ink px-5 py-4 text-white">
              <p className="text-xs font-semibold text-white">
                {gymName}
              </p>
              <h3 className="mt-1 text-lg font-bold">
                Member Card
              </h3>
            </div>
            <div className="p-5">
              <div className="rounded-lg border border-n-border bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`${memberProfile.full_name} member QR code`} className="mx-auto size-56" src={qrCodeDataUrl} />
              </div>
              <dl className="mt-5 space-y-3">
                <div>
                  <dt className="text-xs font-semibold text-n-muted">
                    Member name
                  </dt>
                  <dd className="mt-1 break-words text-lg font-bold text-n-ink">
                    {memberProfile.full_name}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs font-semibold text-n-muted">
                      Member ID
                    </dt>
                    <dd className="mt-1 font-bold text-n-ink">{memberProfile.member_code}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-n-muted">
                      Expiry
                    </dt>
                    <dd className="mt-1 font-bold text-n-ink">
                      {formatDate(latestSubscription?.ends_at)}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>

          <div className="print:hidden">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg bg-n-hover text-n-muted">
                <QrCode aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-n-muted">
                  QR member card
                </p>
                <h3 className="mt-1 text-lg font-bold text-n-ink">
                  Fast front-desk check-in
                </h3>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
              The QR code stores a random card token only. Staff still need front desk access and an active shift before check-in is allowed.
            </p>
            {canPrintCard ? (
              <div className="mt-5 print:hidden">
                <MemberCardActions
                  cardElementId={`member-card-${memberProfile.id}`}
                  memberName={memberProfile.full_name}
                />
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 print:hidden">
                Only owner, admin, or manager roles can print or download member cards.
              </div>
            )}
          </div>
        </div>
      </Card>

      <MemberOperations
        canEdit={canEdit}
        memberId={memberProfile.id}
        memberName={memberProfile.full_name}
        memberStatus={memberProfile.status}
        plans={planOptions}
        today={today}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <UserCheck aria-hidden="true" className="size-5 text-n-muted" />
            <h3 className="text-lg font-bold text-n-ink">
              Recent check-ins
            </h3>
          </div>
          <HistoryList
            empty="No check-ins yet."
            items={entries.map((entry) => ({
              detail: `${purposeLabel(entry.settlement_type)} - ${entry.status}`,
              meta: entry.notes,
              title: formatDateTime(entry.entered_at),
            }))}
          />
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <ReceiptText aria-hidden="true" className="size-5 text-n-muted" />
            <h3 className="text-lg font-bold text-n-ink">
              Payment history
            </h3>
          </div>
          <HistoryList
            empty="No payments yet."
            items={payments.map((payment) => ({
              detail: `${formatMoney(Number(payment.amount))} ${payment.payment_type.toUpperCase()} - ${payment.status}`,
              meta: formatDateTime(payment.paid_at ?? payment.created_at),
              title: purposeLabel(payment.purpose),
            }))}
          />
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <ReceiptText aria-hidden="true" className="size-5 text-n-muted" />
            <h3 className="text-lg font-bold text-n-ink">
              Utang history
            </h3>
          </div>
          <HistoryList
            empty="No utang records yet."
            items={utangRows.map((utang) => {
              const remaining = Math.max(Number(utang.amount ?? 0) - Number(utang.paid_amount ?? 0), 0);

              return {
                detail: `${formatMoney(remaining)} remaining - ${utang.status}`,
                meta: utang.note,
                title: formatDateTime(utang.created_at),
              };
            })}
          />
        </Card>
      </div>
    </div>
  );
}

function HistoryList({
  empty,
  items,
}: {
  empty: string;
  items: Array<{ detail: string; meta?: string | null; title: string }>;
}) {
  if (!items.length) {
    return (
      <p className="mt-5 rounded-lg border border-dashed border-n-border bg-white/60 px-4 py-6 text-sm font-medium text-n-dim">
        {empty}
      </p>
    );
  }

  return (
    <div className="mt-5 divide-y divide-n-border overflow-hidden rounded-lg border border-n-border bg-white/70">
      {items.map((item, index) => (
        <div className="px-4 py-3" key={`${item.title}-${index}`}>
          <p className="font-bold text-n-ink">{item.title}</p>
          <p className="mt-1 text-sm font-medium text-n-dim">{item.detail}</p>
          {item.meta ? <p className="mt-1 text-xs font-bold text-n-muted">{item.meta}</p> : null}
        </div>
      ))}
    </div>
  );
}
