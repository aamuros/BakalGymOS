import { z } from "zod";

export const balancePaymentModes = ["full", "partial"] as const;
export const balancePaymentMethods = ["cash", "gcash", "other"] as const;

export const balancePaymentSchema = z
  .object({
    payment_mode: z.enum(balancePaymentModes, {
      error: "Choose a payment mode.",
    }),
    payment_method: z.enum(balancePaymentMethods, {
      error: "Choose a valid payment method.",
    }),
    amount: z
      .number({ error: "Amount is required." })
      .positive("Amount must be greater than zero.")
      .max(999999.99, "Amount is too large.")
      .optional(),
    note: z.string().trim().max(500, "Note is too long.").optional(),
  })
  .superRefine((value, context) => {
    if (value.payment_mode === "partial" && (!value.amount || value.amount <= 0)) {
      context.addIssue({
        code: "custom",
        message: "Enter a partial payment amount.",
        path: ["amount"],
      });
    }
  });

export type BalancePaymentValues = z.infer<typeof balancePaymentSchema>;

