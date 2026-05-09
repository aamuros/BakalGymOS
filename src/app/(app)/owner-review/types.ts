export type SourceType = "exception" | "gcash_proof" | "shift" | "balance";

export type IssueType =
  | "cash_variance"
  | "gcash_rejected"
  | "payment_dispute"
  | "owner_override"
  | "gcash_missing_proof"
  | "large_utang"
  | "expired_member_allowed"
  | "gcash_duplicate"
  | "staff_correction"
  | "gcash_pending_review"
  | "gcash_follow_up";

export type Priority = "high" | "medium" | "low";

export type ReviewItemStatus = "open" | "approved" | "rejected" | "resolved" | "follow_up";

export type ReviewItem = {
  amount: number | null;
  date: string;
  id: string;
  issueType: IssueType;
  memberCode: string | null;
  note: string | null;
  personName: string;
  priority: Priority;
  reason: string;
  relatedPath: string;
  shiftId: string | null;
  sourceId: string;
  sourceType: SourceType;
  staffName: string;
  status: ReviewItemStatus;
};

export const UTANG_THRESHOLD = 500;

export const issueTypeLabels: Record<IssueType, string> = {
  cash_variance: "Cash Variance",
  expired_member_allowed: "Expired Member Allowed",
  gcash_duplicate: "Duplicate GCash Ref",
  gcash_follow_up: "GCash Follow Up",
  gcash_missing_proof: "Missing GCash Proof",
  gcash_pending_review: "GCash Pending Review",
  gcash_rejected: "GCash Rejected",
  large_utang: "Large Unpaid Utang",
  owner_override: "Owner Override",
  payment_dispute: "Payment Dispute",
  staff_correction: "Staff Correction",
};

export const issueTypePriority: Record<IssueType, Priority> = {
  cash_variance: "high",
  expired_member_allowed: "medium",
  gcash_duplicate: "medium",
  gcash_follow_up: "low",
  gcash_missing_proof: "medium",
  gcash_pending_review: "low",
  gcash_rejected: "high",
  large_utang: "medium",
  owner_override: "medium",
  payment_dispute: "high",
  staff_correction: "medium",
};

export const priorityOrder: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const priorityTone: Record<Priority, "danger" | "neutral" | "warn"> = {
  high: "danger",
  medium: "warn",
  low: "neutral",
};

export const priorityLabels: Record<Priority, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
};

export const sourceActions: Record<
  SourceType,
  Array<{ label: string; value: string; variant: "ghost" | "primary" | "secondary" }>
> = {
  balance: [],
  exception: [
    { label: "Approve", value: "approve", variant: "primary" },
    { label: "Reject", value: "reject", variant: "secondary" },
    { label: "Resolve", value: "resolve", variant: "ghost" },
  ],
  gcash_proof: [
    { label: "Verify", value: "verify", variant: "primary" },
    { label: "Reject", value: "reject", variant: "secondary" },
    { label: "Follow Up", value: "follow_up", variant: "ghost" },
  ],
  shift: [{ label: "Acknowledge", value: "acknowledge", variant: "primary" }],
};

export function mapExceptionStatus(status: string): ReviewItemStatus {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "resolved") return "resolved";
  return "open";
}

export function mapGcashProofStatus(status: string): ReviewItemStatus {
  if (status === "verified") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "follow_up") return "follow_up";
  return "open";
}

export function mapShiftStatus(status: string): ReviewItemStatus {
  if (status === "reviewed") return "resolved";
  return "open";
}

export function mapExceptionToIssueType(exceptionType: string): IssueType {
  switch (exceptionType) {
    case "expired_but_allowed":
      return "expired_member_allowed";
    case "owner_allowed":
    case "owner_approved_free_entry":
    case "free_entry":
    case "guest_entry":
    case "trial_session":
      return "owner_override";
    case "disputed_payment":
    case "member_dispute":
      return "payment_dispute";
    case "gcash_pending":
      return "gcash_pending_review";
    case "staff_error":
    case "system_issue":
    default:
      return "staff_correction";
  }
}
