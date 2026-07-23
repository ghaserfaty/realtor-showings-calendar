import "server-only";
import { google } from "googleapis";
import type { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  randomOpaqueToken,
  secureCompare,
  sha256,
} from "@/lib/security/crypto";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/security/encryption";
import type { googleOAuthStartSchema } from "@/lib/validation/realtor";
import { setCalendarConnection } from "@/services/realtor.service";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

type GoogleOAuthStartInput = z.infer<typeof googleOAuthStartSchema>;

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
}): string {
  const auth = new google.auth.OAuth2(
    input.clientId,
    input.clientSecret,
    input.redirectUri,
  );
  return auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: [GOOGLE_CALENDAR_SCOPE],
    state: input.state,
  });
}

export async function startGoogleOAuth(
  realtorId: string,
  input: GoogleOAuthStartInput,
): Promise<{ authorizationUrl: string }> {
  const state = randomOpaqueToken();
  const attemptId = randomOpaqueToken(18);
  const redirectUri = new URL(
    "/api/admin/google-oauth/callback",
    getConfig().APP_URL,
  ).toString();
  const encrypt = (field: string, value: string) =>
    encryptCredential(value, `${realtorId}:oauthAttempt:${attemptId}:${field}`);

  await prisma.$transaction([
    prisma.googleOAuthAttempt.deleteMany({
      where: {
        OR: [{ realtorId }, { expiresAt: { lte: new Date() } }],
      },
    }),
    prisma.googleOAuthAttempt.create({
      data: {
        id: attemptId,
        realtorId,
        stateHash: sha256(state),
        encryptedClientId: encrypt("clientId", input.clientId),
        encryptedClientSecret: encrypt("clientSecret", input.clientSecret),
        encryptedCalendarId: encrypt("calendarId", input.calendarId),
        redirectUri,
        expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
      },
    }),
  ]);

  return {
    authorizationUrl: buildGoogleAuthorizationUrl({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri,
      state,
    }),
  };
}

async function consumeAttempt(state: string) {
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(state)) return null;
  const stateHash = sha256(state);
  return prisma.$transaction(async (transaction) => {
    const attempt = await transaction.googleOAuthAttempt.findUnique({
      where: { stateHash },
    });
    if (
      !attempt ||
      attempt.expiresAt <= new Date() ||
      !secureCompare(stateHash, attempt.stateHash)
    ) {
      if (attempt) {
        await transaction.googleOAuthAttempt.delete({
          where: { id: attempt.id },
        });
      }
      return null;
    }
    await transaction.googleOAuthAttempt.delete({ where: { id: attempt.id } });
    return attempt;
  });
}

export async function discardGoogleOAuthAttempt(state: string): Promise<void> {
  await consumeAttempt(state);
}

export async function completeGoogleOAuth(
  state: string,
  code: string,
): Promise<void> {
  const attempt = await consumeAttempt(state);
  if (!attempt || !code || code.length > 4096) {
    throw new AppError(
      "INVALID_OAUTH_CALLBACK",
      "The Google authorization attempt is invalid or expired.",
      400,
    );
  }
  const context = (field: string) =>
    `${attempt.realtorId}:oauthAttempt:${attempt.id}:${field}`;
  const clientId = decryptCredential(
    attempt.encryptedClientId,
    context("clientId"),
  );
  const clientSecret = decryptCredential(
    attempt.encryptedClientSecret,
    context("clientSecret"),
  );
  const calendarId = decryptCredential(
    attempt.encryptedCalendarId,
    context("calendarId"),
  );
  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    attempt.redirectUri,
  );
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) {
    throw new AppError(
      "GOOGLE_REFRESH_TOKEN_MISSING",
      "Google did not return offline access. Start the connection again and grant consent.",
      400,
    );
  }

  auth.setCredentials(tokens);
  await google.calendar({ version: "v3", auth }).events.list({
    calendarId,
    maxResults: 1,
    singleEvents: true,
    fields: "items(id)",
  });

  await setCalendarConnection(attempt.realtorId, {
    provider: "GOOGLE",
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token,
    calendarId,
  });
}
