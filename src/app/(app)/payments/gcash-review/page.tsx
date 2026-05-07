import { AlertTriangle, ClipboardCheck, Image as ImageIcon, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";

import { GcashReviewControls } from "@/app/(app)/payments/gcash-review/gcash-review-controls";
import { Card } from "@/components/ui/card";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type RelatedMember = {
  full_name: string;
  member_code: string;
};

type RelatedProfile = {
  full_name: string;
};

type PaymentRow = {
  id: string;
  amount: number | string;
  created_at: string;
  paid_at: string | null;
  purpose: string;
  status: string;
  members: RelatedMember | RelatedMember[] | null;
};

type GcashProofRow = {
  id: string;
  file_name: string | null;
  file_size: number | null;
  gcash_reference_number: string | null;
  mime_type: string | null;
  owner_note: string | null;
  proof_status: string;
  reviewed_at: string | null;
  sender_mobile: string | null;
  sender_name: string | null;
  storage_path: string;
  created_at: string;
  payments: PaymentRow | PaymentRow[] | null;
  uploaded_by_profile: RelatedProfile | RelatedProfile[] | null;
  reviewed_by_profile: RelatedProfile | RelatedProfile[] | null;
};

const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  style: "currency",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const statusStyles: Record<string, string> = {
  disputed: "bg-red-100 text-red-800",
  needs_follow_up: "bg-blue-100 text-blue-800",
  owner_confirmed: "bg-green-100 text-green-800",
  pending_proof: "bg-amber-100 text-amber-900",
  staff_checked: "bg-amber-100 text-amber-900",
};

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAmount(value: number | string | null | undefined) {
  return pesoFormatter.format(Number(value ?? 0));
}

function formatFileSize(value: number | null) {
  if (!value) {
    return "Unknown size";
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export default async function GcashReviewPage() {
  const profile = await requireModuleAccess("/payments");

  if (!managementRoles.has(profile.role)) {
    redirect("/unauthorized?next=/payments/gcash-review");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gcash_proofs")
    .select(
      "id, storage_path, file_name, mime_type, file_size, gcash_reference_number, sender_name, sender_mobile, proof_status, owner_note, reviewed_at, created_at, payments(id, amount, status, purpose, paid_at, created_at, members(full_name, member_code)), uploaded_by_profile:profiles!gcash_proofs_uploaded_by_fkey(full_name), reviewed_by_profile:profiles!gcash_proofs_reviewed_by_fkey(full_name)",
    )
    .in("proof_status", ["staff_checked", "disputed", "needs_follow_up"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const proofs = (data ?? []) as GcashProofRow[];
  const disputedCount = proofs.filter((proof) => proof.proof_status === "disputed").length;

  return (
    <div className="ledger-rise space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="relative overflow-hidden rounded-3xl">
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
              <WalletCards aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
              Owner Review Queue
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-4xl font-black leading-tight text-ledger-ink sm:text-6xl">
              GCash Review
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-moss">
              Uploaded GCash proofs stay pending until management confirms, disputes, or marks them for follow-up.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between rounded-3xl shadow-none">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Open Items
            </p>
            <p className="mt-3 font-[var(--font-heading)] text-5xl font-black text-ledger-ink">
              {proofs.length.toLocaleString("en-PH")}
            </p>
          </div>
          <p className="mt-6 text-sm font-bold leading-6 text-ledger-moss">
            {roleLabels[profile.role]} access. {disputedCount.toLocaleString("en-PH")} disputed item
            {disputedCount === 1 ? "" : "s"} remain visible here.
          </p>
        </Card>
      </div>

      <Card className="rounded-3xl p-0 shadow-none">
        <div className="flex items-center justify-between gap-4 border-b border-ledger-line px-5 py-4">
          <div>
            <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
              Proof review items
            </h3>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Proof images are served through authenticated routes, not public storage URLs.
            </p>
          </div>
          <ClipboardCheck aria-hidden="true" className="hidden size-6 text-ledger-moss sm:block" />
        </div>

        {proofs.length ? (
          <div className="divide-y divide-ledger-line">
            {proofs.map((proof) => {
              const payment = relatedOne(proof.payments);
              const member = relatedOne(payment?.members ?? null);
              const uploadedBy = relatedOne(proof.uploaded_by_profile);
              const reviewedBy = relatedOne(proof.reviewed_by_profile);

              return (
                <div className="grid gap-5 px-5 py-5 xl:grid-cols-[20rem_1fr_22rem]" key={proof.id}>
                  <div className="overflow-hidden rounded-2xl border border-ledger-line bg-ledger-paper">
                    {proof.storage_path.startsWith("pending-proofs/") ? (
                      <div className="flex aspect-[4/3] items-center justify-center text-ledger-moss">
                        <ImageIcon aria-hidden="true" className="size-10" />
                      </div>
                    ) : (
                      <img
                        alt={`GCash proof ${proof.gcash_reference_number ?? proof.id}`}
                        className="aspect-[4/3] w-full object-contain"
                        src={`/front-desk/gcash-proofs/${proof.id}/image`}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="break-words font-black text-ledger-ink">
                        {member?.full_name ?? "Walk-in GCash"}
                      </h4>
                      <span className="text-sm font-bold text-ledger-moss">
                        {member?.member_code ?? "Guest / non-member"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-black text-ledger-ink">
                      {formatAmount(payment?.amount)} · {labelize(payment?.purpose ?? "walk_in_entry")}
                    </p>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <ReviewFact label="Reference" value={proof.gcash_reference_number ?? "Not provided"} />
                      <ReviewFact label="Sender" value={proof.sender_name ?? "Not provided"} />
                      <ReviewFact label="Mobile" value={proof.sender_mobile ?? "Not provided"} />
                      <ReviewFact label="File" value={`${proof.file_name ?? "Proof image"} · ${formatFileSize(proof.file_size)}`} />
                    </dl>
                    {proof.owner_note ? (
                      <p className="mt-4 rounded-2xl bg-ledger-lime/45 px-4 py-3 text-sm font-bold leading-6 text-ledger-ink">
                        {proof.owner_note}
                      </p>
                    ) : null}
                    <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                      Uploaded by {uploadedBy?.full_name ?? "Unknown staff"} ·{" "}
                      {dateTimeFormatter.format(new Date(proof.created_at))}
                      {reviewedBy ? ` · Reviewed by ${reviewedBy.full_name}` : ""}
                    </p>
                  </div>

                  <div className="space-y-4 xl:text-right">
                    <span
                      className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black uppercase ${
                        statusStyles[proof.proof_status] ?? "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {labelize(proof.proof_status)}
                    </span>
                    <GcashReviewControls
                      initialNote={proof.owner_note}
                      proofId={proof.id}
                      status={proof.proof_status}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-ledger-moss" />
            <p className="mt-4 font-black text-ledger-ink">No GCash proofs need review</p>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Staff-checked and disputed GCash proofs will appear here.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ledger-line bg-ledger-paper/70 px-4 py-3">
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-ledger-ink">{value}</dd>
    </div>
  );
}
