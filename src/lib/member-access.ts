type PlanAccess = {
  entry_limit: number | null;
  is_unlimited: boolean;
  name?: string;
};

export type SubscriptionAccess = {
  entries_used: number;
  ends_at: string;
  starts_at: string;
  status: string;
  membership_plans: PlanAccess | PlanAccess[] | null;
};

export type MemberOperationalStatus = "active" | "inactive" | "banned" | "archived";

export type MemberAccessStatus =
  | "good"
  | "expired"
  | "entry_limit_reached"
  | "inactive"
  | "banned"
  | "archived";

export function getManilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(date);
}

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(d);
}

export function relatedPlan(subscription: SubscriptionAccess | null) {
  const plan = subscription?.membership_plans;

  return Array.isArray(plan) ? plan[0] ?? null : plan;
}

export function hasRemainingEntries(subscription: SubscriptionAccess | null) {
  const plan = relatedPlan(subscription);

  if (!subscription || !plan) {
    return false;
  }

  return plan.is_unlimited || plan.entry_limit === null || subscription.entries_used < plan.entry_limit;
}

export function isUsableSubscription(subscription: SubscriptionAccess | null, today = getManilaDateString(), gracePeriodDays = 0) {
  if (!subscription || subscription.status !== "active" || subscription.starts_at > today) {
    return false;
  }

  const graceEnd = addDays(subscription.ends_at, gracePeriodDays);

  return graceEnd >= today && hasRemainingEntries(subscription);
}

export function deriveMemberAccess(
  memberStatus: MemberOperationalStatus,
  subscription: SubscriptionAccess | null,
  today = getManilaDateString(),
  gracePeriodDays = 0,
): MemberAccessStatus {
  if (memberStatus === "banned") {
    return "banned";
  }

  if (memberStatus === "archived") {
    return "archived";
  }

  if (memberStatus === "inactive") {
    return "inactive";
  }

  if (!subscription || subscription.status !== "active" || subscription.starts_at > today) {
    return "expired";
  }

  const graceEnd = addDays(subscription.ends_at, gracePeriodDays);

  if (graceEnd < today) {
    return "expired";
  }

  return hasRemainingEntries(subscription) ? "good" : "entry_limit_reached";
}

export function getPlanName(subscription: SubscriptionAccess | null) {
  return relatedPlan(subscription)?.name ?? "No current plan";
}
