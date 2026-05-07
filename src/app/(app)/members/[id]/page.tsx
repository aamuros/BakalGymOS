import { CalendarDays, Edit, QrCode, ReceiptText, UserCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { MemberCardActions } from "@/app/(app)/members/member-card-actions";
import { Card } from "@/components/ui/card";
import { canManageMembers, canPrintMemberCards } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
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
  status: string;
};

type Subscription = {
  starts_at: string;
  ends_at: string;
  status: string;
  membership_plans: { name: string } | { name: string }[] | null;
};

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-amber-100 text-amber-800",
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

function getPlanName(subscription: Subscription | null) {
  const plan = subscription?.membership_plans;

  if (Array.isArray(plan)) {
    return plan[0]?.name ?? "No current plan";
  }

  return plan?.name ?? "No current plan";
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

  const { data: subscription } = await supabase
    .from("member_subscriptions")
    .select("starts_at, ends_at, status, membership_plans(name)")
    .eq("member_id", id)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: balances } = await supabase
    .from("walk_in_balances")
    .select("amount, paid_amount")
    .eq("member_id", id);

  const balance =
    balances?.reduce(
      (total, entry) => total + Math.max(Number(entry.amount ?? 0) - Number(entry.paid_amount ?? 0), 0),
      0,
    ) ?? 0;
  const canEdit = canManageMembers(profile.role);
  const canPrintCard = canPrintMemberCards(profile.role);
  const memberProfile = member as MemberProfile;
  const latestSubscription = (subscription as Subscription | null) ?? null;
  const gymName = "GymLedger";
  const qrPayload = createMemberQrPayload(memberProfile.qr_token);
  const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 7,
  });

  return (
    <div className="ledger-rise space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
            Member Profile
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
            {memberProfile.full_name}
          </h2>
        </div>
        {canEdit ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ledger-ink px-5 py-2.5 text-sm font-bold text-ledger-paper transition hover:bg-ledger-moss"
            href={`/members/${id}/edit`}
          >
            <Edit aria-hidden="true" className="size-4" />
            Edit member
          </Link>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-3xl">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
              <UserCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                Member details
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex h-8 items-center rounded-full px-3 text-xs font-black uppercase",
                  statusStyles[memberProfile.status],
                )}
              >
                {memberProfile.status}
              </span>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">Name</dt>
              <dd className="mt-1 font-black text-ledger-ink">{memberProfile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                Phone number
              </dt>
              <dd className="mt-1 font-black text-ledger-ink">{memberProfile.phone || "No phone"}</dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                Member ID
              </dt>
              <dd className="mt-1 font-black text-ledger-ink">{memberProfile.member_code}</dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">Balance</dt>
              <dd className="mt-1 font-black text-ledger-ink">{formatMoney(balance)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="rounded-3xl">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                Current plan
              </p>
              <p className="mt-1 font-black text-ledger-ink">{getPlanName(latestSubscription)}</p>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                Start date
              </dt>
              <dd className="mt-1 font-black text-ledger-ink">
                {formatDate(latestSubscription?.starts_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                Expiry date
              </dt>
              <dd className="mt-1 font-black text-ledger-ink">
                {formatDate(latestSubscription?.ends_at)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="member-card-print rounded-3xl shadow-none">
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <div
            className="member-card-print-card overflow-hidden rounded-3xl border border-ledger-line bg-white"
            id={`member-card-${memberProfile.id}`}
          >
            <div className="bg-ledger-ink px-5 py-4 text-ledger-paper">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-ledger-lime">
                {gymName}
              </p>
              <h3 className="mt-1 font-[var(--font-heading)] text-2xl font-black">
                Member Card
              </h3>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-ledger-line bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`${memberProfile.full_name} member QR code`} className="mx-auto size-56" src={qrCodeDataUrl} />
              </div>
              <dl className="mt-5 space-y-3">
                <div>
                  <dt className="text-xs font-black uppercase tracking-[0.16em] text-ledger-moss">
                    Member name
                  </dt>
                  <dd className="mt-1 break-words font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                    {memberProfile.full_name}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.16em] text-ledger-moss">
                      Member ID
                    </dt>
                    <dd className="mt-1 font-black text-ledger-ink">{memberProfile.member_code}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.16em] text-ledger-moss">
                      Expiry
                    </dt>
                    <dd className="mt-1 font-black text-ledger-ink">
                      {formatDate(latestSubscription?.ends_at)}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>

          <div className="print:hidden">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
                <QrCode aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                  QR member card
                </p>
                <h3 className="mt-1 font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                  Fast front-desk check-in
                </h3>
              </div>
            </div>
            <p className="mt-4 text-sm font-bold leading-6 text-ledger-moss">
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
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 print:hidden">
                Only owner, admin, or manager roles can print or download member cards.
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-3xl shadow-none">
          <div className="flex items-center gap-3">
            <UserCheck aria-hidden="true" className="size-5 text-ledger-moss" />
            <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
              Recent check-ins
            </h3>
          </div>
          <p className="mt-5 rounded-2xl border border-dashed border-ledger-line bg-white/60 px-4 py-6 text-sm font-bold text-ledger-moss">
            Check-in history will appear here.
          </p>
        </Card>

        <Card className="rounded-3xl shadow-none">
          <div className="flex items-center gap-3">
            <ReceiptText aria-hidden="true" className="size-5 text-ledger-moss" />
            <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
              Payment history
            </h3>
          </div>
          <p className="mt-5 rounded-2xl border border-dashed border-ledger-line bg-white/60 px-4 py-6 text-sm font-bold text-ledger-moss">
            Payment history will appear here.
          </p>
        </Card>
      </div>
    </div>
  );
}
