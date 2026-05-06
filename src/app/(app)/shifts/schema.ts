import { z } from "zod";

export const startShiftSchema = z.object({
  note: z.string().trim().max(500, "Note must be 500 characters or fewer.").optional(),
  starting_cash: z
    .number({ error: "Enter a starting cash amount." })
    .min(0, "Starting cash must be zero or greater."),
});

export type StartShiftValues = z.infer<typeof startShiftSchema>;
