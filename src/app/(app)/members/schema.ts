import { z } from "zod";

export const memberStatuses = ["active", "inactive", "banned", "archived"] as const;
export const paymentMethods = ["cash", "gcash", "other"] as const;

export const memberFormSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters."),
  phone: z.string().trim().min(5, "Phone number must be at least 5 characters."),
  member_code: z.string().trim().min(2, "Member ID must be at least 2 characters."),
  status: z.enum(memberStatuses),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;

export const memberRenewalSchema = z.object({
  gcash_reference_number: z.string().trim().max(80, "Reference number is too long.").optional(),
  payment_method: z.enum(paymentMethods),
  plan_id: z.string().uuid("Choose a membership plan."),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
});

export const memberPaymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  gcash_reference_number: z.string().trim().max(80, "Reference number is too long.").optional(),
  note: z.string().trim().max(240, "Note is too long.").optional(),
  payment_method: z.enum(paymentMethods),
});

export const memberUtangSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  reason: z.string().trim().min(2, "Reason is required.").max(240, "Reason is too long."),
});

export type MemberRenewalValues = z.infer<typeof memberRenewalSchema>;
export type MemberPaymentValues = z.infer<typeof memberPaymentSchema>;
export type MemberUtangValues = z.infer<typeof memberUtangSchema>;
