import { z } from "zod";

const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(40)
  .regex(/^[+()\-\s.0-9]+$/, "Enter a valid phone number");

export const createInvitationSchema = z.object({
  invitedEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  invitedName: z.string().trim().min(1).max(120).optional(),
  invitedPhone: phone.optional(),
  realtorId: z.string().cuid().optional(),
  expiresAt: z.coerce
    .date()
    .refine((date) => date > new Date(), "Expiration must be in the future"),
  maxSubmissions: z.number().int().positive().max(100).optional(),
  verificationRequired: z.boolean().optional(),
  sendEmail: z.boolean().default(false),
});

export const registrationSchema = z
  .object({
    eventIds: z
      .array(z.string().trim().min(1).max(1024))
      .min(1)
      .max(20)
      .transform((ids) => [...new Set(ids)]),
    eventVersions: z.record(
      z.string().trim().min(1).max(1024),
      z.string().regex(/^[a-f0-9]{64}$/),
    ),
    fullName: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone,
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((input, context) => {
    for (const eventId of input.eventIds) {
      if (!input.eventVersions[eventId]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Showing details must be refreshed before registration",
          path: ["eventVersions", eventId],
        });
      }
    }
  });

export const verificationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the six-digit code"),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
