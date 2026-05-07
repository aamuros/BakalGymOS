export type BalanceStatus = "unpaid" | "partially_paid" | "paid" | "overdue";

export type BalancePaymentMethod = "cash" | "gcash" | "other";

export type BalancePaymentMode = "full" | "partial";

export type BalanceListRow = {
  id: string;
  entry_id: string;
  member_id: string | null;
  customer_name: string | null;
  amount: number | string;
  paid_amount: number | string | null;
  due_at: string | null;
  last_payment_at: string | null;
  settled_at: string | null;
  note: string | null;
  created_at: string;
  members: { full_name: string; member_code: string } | { full_name: string; member_code: string }[] | null;
  entries: { entered_at: string } | { entered_at: string }[] | null;
};

export type BalancePaymentRow = {
  id: string;
  balance_id: string | null;
  amount: number | string;
  paid_at: string | null;
  payment_type: BalancePaymentMethod;
  notes: string | null;
  status: string;
  shift_id: string | null;
  received_by_profile:
    | { full_name: string }
    | { full_name: string }[]
    | null;
};

export type BalanceHistory = {
  id: string;
  amount: number;
  paidAt: string;
  paymentMethod: BalancePaymentMethod;
  notes: string | null;
  receivedBy: string | null;
  shiftId: string | null;
};

export type BalanceViewModel = {
  id: string;
  memberId: string | null;
  entryId: string;
  displayName: string;
  memberCode: string | null;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: BalanceStatus;
  daysUnpaid: number;
  lastCheckIn: string | null;
  lastPaymentAt: string | null;
  lastPaymentBy: string | null;
  lastPaymentShiftId: string | null;
  notes: string | null;
  dueAt: string | null;
  createdAt: string;
  settledAt: string | null;
  latestPayment: BalanceHistory | null;
};

