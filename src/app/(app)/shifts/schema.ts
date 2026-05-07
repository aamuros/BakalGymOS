import { z } from "zod";

export const startShiftSchema = z.object({
  note: z.string().trim().max(500, "Note must be 500 characters or fewer.").optional(),
  starting_cash: z
    .number({ error: "Enter a starting cash amount." })
    .min(0, "Starting cash must be zero or greater."),
});

export const closeShiftSchema = z
  .object({
    actual_cash: z
      .number({ error: "Enter the actual cash counted." })
      .min(0, "Actual cash must be zero or greater."),
    expected_cash: z.number(),
    note: z.string().trim().max(500, "Note must be 500 characters or fewer.").optional(),
    shift_id: z.string().uuid("Invalid shift."),
    variance_note: z
      .string()
      .trim()
      .max(500, "Variance explanation must be 500 characters or fewer.")
      .optional(),
  })
  .refine((values) => Number((values.actual_cash - values.expected_cash).toFixed(2)) === 0 || values.variance_note, {
    message: "Explain the variance before closing the shift.",
    path: ["variance_note"],
  });

export type StartShiftValues = z.infer<typeof startShiftSchema>;
export type CloseShiftValues = z.infer<typeof closeShiftSchema>;
