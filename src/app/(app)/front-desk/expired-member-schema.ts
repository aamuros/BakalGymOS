import { z } from "zod";

export const expiredMemberActions = ["pay_walk_in", "record_utang", "owner_override"] as const;
export const expiredMemberPaymentMethods = ["cash", "gcash", "other"] as const;

export const expiredMemberActionSchema = z
  .object({
    action_type: z.enum(expiredMemberActions, {
      error: "Choose an expired member action.",
    }),
    amount: z
      .number({ error: "Amount is required." })
      .max(999999.99, "Amount is too large.")
      .optional(),
    payment_method: z.enum(expiredMemberPaymentMethods, {
      error: "Choose a valid payment method.",
    }),
    reason: z.string().trim().max(500, "Reason is too long.").optional(),
  })
  .superRefine((value, context) => {
    if (value.action_type !== "owner_override" && (!value.amount || value.amount <= 0)) {
      context.addIssue({
        code: "custom",
        message: "Amount must be greater than zero.",
        path: ["amount"],
      });
    }

    if (value.action_type !== "pay_walk_in" && !value.reason) {
      context.addIssue({
        code: "custom",
        message: "A reason is required.",
        path: ["reason"],
      });
    }
  });

export type ExpiredMemberActionValues = z.infer<typeof expiredMemberActionSchema>;
