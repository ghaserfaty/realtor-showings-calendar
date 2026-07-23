import "server-only";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z
      .string()
      .default(
        "postgresql://showings:showings@localhost:5434/showings?schema=public",
      ),
    APP_URL: z.string().url().default("http://localhost:3000"),
    PLATFORM_ADMIN_API_KEY: z
      .string()
      .min(24)
      .default("local-platform-admin-key-change-me"),
    SESSION_SECRET: z
      .string()
      .min(32)
      .default("local-session-secret-change-before-production"),
    CREDENTIAL_ENCRYPTION_KEY: z
      .string()
      .default("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
    EMAIL_PROVIDER: z.enum(["console", "webhook"]).default("console"),
    EMAIL_WEBHOOK_URL: z.string().url().or(z.literal("")).default(""),
    EMAIL_WEBHOOK_API_KEY: z.string().default(""),
    SHOWING_FILTER_MODE: z
      .enum(["dedicated_calendar", "extended_property", "title_prefix"])
      .default("dedicated_calendar"),
    SHOWING_EVENT_TYPE: z.string().min(1).default("property_showing"),
    SHOWING_TITLE_PREFIX: z.string().min(1).default("[SHOWING]"),
    SHOWING_OPEN_TITLE_PREFIX: z.string().min(1).default("[ABIERTA]"),
    SHOWING_CLOSED_TITLE_PREFIX: z.string().min(1).default("[CERRADA]"),
    SHOWING_PUBLIC_BLOCK_START: z.string().min(1).default("PUBLIC_SHOWING"),
    SHOWING_PUBLIC_BLOCK_END: z.string().min(1).default("END_PUBLIC_SHOWING"),
    ALLOW_REGISTRATION_CANCELLATION: booleanString.default("true"),
    EXPOSE_GOOGLE_MEET_LINKS: booleanString,
    ADD_REGISTRANTS_AS_ATTENDEES: booleanString,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production") {
      const unsafeDefaults = [
        ["PLATFORM_ADMIN_API_KEY", env.PLATFORM_ADMIN_API_KEY],
        ["SESSION_SECRET", env.SESSION_SECRET],
        ["CREDENTIAL_ENCRYPTION_KEY", env.CREDENTIAL_ENCRYPTION_KEY],
      ] as const;
      for (const [key, value] of unsafeDefaults) {
        if (
          value.includes("local-") ||
          value.includes("change-me") ||
          value.includes("replace-with") ||
          (key === "CREDENTIAL_ENCRYPTION_KEY" &&
            value === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} must be replaced in production`,
            path: [key],
          });
        }
      }
      if (env.EMAIL_PROVIDER === "webhook" && !env.EMAIL_WEBHOOK_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "EMAIL_WEBHOOK_URL is required for the webhook email provider",
          path: ["EMAIL_WEBHOOK_URL"],
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  cachedConfig ??= envSchema.parse(process.env);
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = undefined;
}
