import { z } from "zod";

export const createRealtorSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(120).optional(),
  calendarProvider: z.enum(["MOCK", "GOOGLE"]).default("MOCK"),
});

export const calendarSelectionSchema = z.object({
  calendarId: z.string().trim().min(1).max(1000),
});
