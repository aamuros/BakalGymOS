import { AlertTriangle, ClipboardCheck, Image as ImageIcon, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";

import { GcashReviewControls } from "@/app/(app)/payments/gcash-review/gcash-review-controls";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
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

const proofStatusTone: Record<string, "active" | "danger" | "neutral" | "warn"> = {
  awaiting_proof: "warn",
  follow_up: "neutral",
  for_review: "warn",
  rejected: "danger",
  verified: "active",
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
    .in("proof_status", ["for_review", "rejected", "follow_up"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const proofs = (data ?? []) as GcashProofRow[];
  const rejectedCount = proofs.filter((proof) => proof.proof_status === "rejected").length;

  return (
    <div className="page-enter space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="relative overflow-hidden">
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-lg bg-n-ink text-white">
              <WalletCards aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-xs font-semibold text-n-muted">
              Owner Review Queue
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight text-n-ink sm:text-3xl">
              GCash Review
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 font-medium text-n-dim">
              Staff-recorded GCash payments allow entry immediately, then stay here for batch verification.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-n-muted">
              Open Items
            </p>
            <p className="mt-3 text-2xl font-bold text-n-ink">
              {proofs.length.toLocaleString("en-PH")}
            </p>
          </div>
          <p className="mt-6 text-sm font-medium leading-6 text-n-dim">
            {roleLabels[profile.role]} access. {rejectedCount.toLocaleString("en-PH")} rejected item
            {rejectedCount === 1 ? "" : "s"} remain visible here.
          </p>
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-4 border-b border-n-border px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-n-ink">
              Proof review items
            </h3>
            <p className="mt-1 text-sm font-bold text-n-dim">
              Proof images are served through authenticated routes, not public storage URLs.
            </p>
          </div>
          <ClipboardCheck aria-hidden="true" className="hidden size-6 text-n-dim sm:block" />
        </div>

        {proofs.length ? (
          <div className="divide-y divide-n-border">
            {proofs.map((proof) => {
              const payment = relatedOne(proof.payments);
              const member = relatedOne(payment?.members ?? null);
              const uploadedBy = relatedOne(proof.uploaded_by_profile);
              const reviewedBy = relatedOne(proof.reviewed_by_profile);

              return (
                <div className="grid gap-5 px-5 py-5 xl:grid-cols-[20rem_1fr_22rem]" key={proof.id}>
                  <div className="overflow-hidden rounded-lg border border-n-border bg-white">
                    {proof.storage_path.startsWith("pending-proofs/") ? (
                      <div className="flex aspect-[4/3] items-center justify-center text-n-dim">
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
                      <h4 className="break-words font-bold text-n-ink">
                        {member?.full_name ?? "Walk-in GCash"}
                      </h4>
                      <span className="text-sm font-bold text-n-dim">
                        {member?.member_code ?? "Guest / non-member"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-n-ink">
                      {formatAmount(payment?.amount)} · {labelize(payment?.purpose ?? "walk_in_entry")}
                    </p>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <ReviewFact label="Reference" value={proof.gcash_reference_number ?? "Not provided"} />
                      <ReviewFact label="Sender" value={proof.sender_name ?? "Not provided"} />
                      <ReviewFact label="Mobile" value={proof.sender_mobile ?? "Not provided"} />
                      <ReviewFact label="File" value={`${proof.file_name ?? "Proof image"} · ${formatFileSize(proof.file_size)}`} />
                    </dl>
                    {proof.owner_note ? (
                      <p className="mt-4 rounded-lg bg-n-hover px-4 py-3 text-sm font-bold leading-6 text-n-ink">
                        {proof.owner_note}
                      </p>
                    ) : null}
                    <p className="mt-4 text-xs font-semibold text-n-muted">
                      Uploaded by {uploadedBy?.full_name ?? "Unknown staff"} ·{" "}
                      {dateTimeFormatter.format(new Date(proof.created_at))}
                      {reviewedBy ? ` · Reviewed by ${reviewedBy.full_name}` : ""}
                    </p>
                  </div>

                  <div className="space-y-4 xl:text-right">
                    <StatusBadge tone={proofStatusTone[proof.proof_status] ?? "neutral"}>
                      {labelize(proof.proof_status)}
                    </StatusBadge>
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
            <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-n-dim" />
            <p className="mt-4 font-bold text-n-ink">No GCash proofs need review</p>
            <p className="mt-1 text-sm font-bold text-n-dim">
              For-review, rejected, and follow-up GCash items will appear here.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-n-border bg-n-hover px-4 py-3">
      <dt className="text-xs font-semibold text-n-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-n-ink">{value}</dd>
    </div>
  );
}
