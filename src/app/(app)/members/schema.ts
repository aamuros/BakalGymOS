import { z } from "zod";

export const memberStatuses = ["active", "expired", "banned", "inactive"] as const;

export const memberFormSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters."),
  phone: z.string().trim().min(5, "Phone number must be at least 5 characters."),
  member_code: z.string().trim().min(2, "Member ID must be at least 2 characters."),
  status: z.enum(memberStatuses),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;
