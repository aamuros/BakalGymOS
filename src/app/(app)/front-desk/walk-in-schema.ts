import { z } from "zod";

export const walkInPaymentMethods = ["cash", "gcash", "pending"] as const;

export const walkInSchema = z
  .object({
    amount: z
      .number({ error: "Amount is required." })
      .positive("Amount must be greater than zero.")
      .max(999999.99, "Amount is too large."),
    customer_name: z.string().trim().max(120, "Customer name is too long.").optional(),
    gcash_reference_number: z.string().trim().max(80, "Reference number is too long.").optional(),
    note: z.string().trim().max(500, "Note is too long.").optional(),
    payment_method: z.enum(walkInPaymentMethods, {
      error: "Choose a payment method.",
    }),
  })
  .superRefine((value, context) => {
    if (value.payment_method === "pending" && !value.customer_name) {
      context.addIssue({
        code: "custom",
        message: "Customer name is required for utang.",
        path: ["customer_name"],
      });
    }

    if (value.payment_method === "pending" && !value.note) {
      context.addIssue({
        code: "custom",
        message: "Reason is required for utang.",
        path: ["note"],
      });
    }
  });

export type WalkInValues = z.infer<typeof walkInSchema>;
