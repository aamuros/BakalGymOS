import { z } from "zod";

export const exceptionTypes = [
  "free_entry",
  "guest_entry",
  "trial_session",
  "pending_payment",
  "gcash_pending",
  "expired_but_allowed",
  "owner_allowed",
  "disputed_payment",
] as const;

export const exceptionSchema = z
  .object({
    amount: z.number().min(0, "Amount cannot be negative.").optional(),
    exception_type: z.enum(exceptionTypes, {
      error: "Choose an exception type.",
    }),
    member_id: z.string().uuid("Choose a valid record.").optional(),
    person_name: z.string().trim().max(120, "Person name is too long.").optional(),
    reason: z.string().trim().min(3, "Reason is required.").max(500, "Reason is too long."),
    related_entry_id: z.string().uuid("Choose a valid record.").optional(),
  })
  .refine((values) => values.member_id || values.person_name, {
    message: "Add the person or member involved.",
    path: ["person_name"],
  });

export const exceptionReviewSchema = z.object({
  action: z.enum(["approve", "reject", "resolve"]),
  exceptionId: z.string().uuid("Invalid exception ID."),
  ownerNote: z.string().trim().max(500, "Owner note is too long.").optional(),
});

export type ExceptionValues = z.infer<typeof exceptionSchema>;
export type ExceptionReviewValues = z.infer<typeof exceptionReviewSchema>;
