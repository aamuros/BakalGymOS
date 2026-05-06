import { z } from "zod";

export const walkInPaymentMethods = ["cash", "gcash", "pending"] as const;

export const walkInSchema = z.object({
  amount: z
    .number({ error: "Amount is required." })
    .positive("Amount must be greater than zero.")
    .max(999999.99, "Amount is too large."),
  customer_name: z.string().trim().max(120, "Customer name is too long.").optional(),
  note: z.string().trim().max(500, "Note is too long.").optional(),
  payment_method: z.enum(walkInPaymentMethods, {
    error: "Choose a payment method.",
  }),
});

export type WalkInValues = z.infer<typeof walkInSchema>;
