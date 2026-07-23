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

export const calendarConnectionSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("MOCK") }),
  z.object({
    provider: z.literal("GOOGLE"),
    clientId: z.string().trim().min(10).max(500),
    clientSecret: z.string().trim().min(8).max(1000),
    refreshToken: z.string().trim().min(10).max(4000),
    calendarId: z.string().trim().min(1).max(1000),
  }),
]);

export const googleOAuthStartSchema = z.object({
  clientId: z.string().trim().min(10).max(500),
  clientSecret: z.string().trim().min(8).max(1000),
  calendarId: z.string().trim().min(1).max(1000),
});
