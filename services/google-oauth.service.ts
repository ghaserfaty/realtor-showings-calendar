import "server-only";
import type { CodeChallengeMethod } from "google-auth-library";
import { google } from "googleapis";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  randomOpaqueToken,
  secureCompare,
  sha256,
  sha256Base64Url,
} from "@/lib/security/crypto";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/security/encryption";
import { createRealtorSession } from "@/lib/security/realtor-session";
import { audit } from "@/services/audit.service";

export const GOOGLE_OPENID_SCOPES = ["openid", "email", "profile"] as const;
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function oauthConfiguration(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const config = getConfig();
  if (!config.GOOGLE_OAUTH_CLIENT_ID || !config.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new AppError(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google sign-in is not configured.",
      503,
    );
  }
  return {
    clientId: config.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: new URL(
      "/api/auth/google/callback",
      config.APP_URL,
    ).toString(),
  };
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const auth = new google.auth.OAuth2(
    input.clientId,
    undefined,
    input.redirectUri,
  );
  return auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: [...GOOGLE_OPENID_SCOPES, ...GOOGLE_CALENDAR_SCOPES],
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256" as CodeChallengeMethod,
  });
}

export async function startGoogleOAuth(): Promise<string> {
  const { clientId, redirectUri } = oauthConfiguration();
  const id = randomOpaqueToken(18);
  const state = randomOpaqueToken();
  const nonce = randomOpaqueToken();
  const codeVerifier = randomOpaqueToken(48);

  await prisma.$transaction([
    prisma.googleOAuthAttempt.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    }),
    prisma.googleOAuthAttempt.create({
      data: {
        id,
        stateHash: sha256(state),
        nonceHash: sha256(nonce),
        encryptedCodeVerifier: encryptCredential(
          codeVerifier,
          `oauthAttempt:${id}:codeVerifier`,
        ),
        expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
      },
    }),
  ]);

  return buildGoogleAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    nonce,
    codeChallenge: sha256Base64Url(codeVerifier),
  });
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

function safeAvatarUrl(value?: string | null): string | undefined {
  if (!value || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function resolveRealtor(input: {
  googleSubject: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}) {
  const [bySubject, byEmail] = await Promise.all([
    prisma.realtor.findUnique({
      where: { googleSubject: input.googleSubject },
    }),
    prisma.realtor.findUnique({ where: { email: input.email } }),
  ]);
  if (bySubject && byEmail && bySubject.id !== byEmail.id) {
    throw new AppError(
      "GOOGLE_ACCOUNT_CONFLICT",
      "This Google account cannot be linked to the existing realtor.",
      409,
    );
  }
  if (byEmail?.googleSubject && byEmail.googleSubject !== input.googleSubject) {
    throw new AppError(
      "GOOGLE_ACCOUNT_CONFLICT",
      "This email is already linked to another Google account.",
      409,
    );
  }

  const existing = bySubject ?? byEmail;
  if (existing) {
    return prisma.realtor.update({
      where: { id: existing.id },
      data: {
        googleSubject: input.googleSubject,
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
    });
  }
  const realtor = await prisma.realtor.create({
    data: {
      googleSubject: input.googleSubject,
      email: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      calendarProvider: "GOOGLE",
    },
  });
  await audit({
    action: "REALTOR_CREATED",
    actorType: "SYSTEM",
    actorId: realtor.id,
    metadata: { calendarProvider: "GOOGLE" },
  });
  return realtor;
}

export async function completeGoogleOAuth(
  state: string,
  code: string,
): Promise<{ sessionToken: string; sessionExpiresAt: Date }> {
  const attempt = await consumeAttempt(state);
  if (!attempt || !code || code.length > 4096) {
    throw new AppError(
      "INVALID_OAUTH_CALLBACK",
      "The Google authorization attempt is invalid or expired.",
      400,
    );
  }

  const { clientId, clientSecret, redirectUri } = oauthConfiguration();
  const codeVerifier = decryptCredential(
    attempt.encryptedCodeVerifier,
    `oauthAttempt:${attempt.id}:codeVerifier`,
  );
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await auth.getToken({ code, codeVerifier });
  if (!tokens.id_token) {
    throw new AppError(
      "GOOGLE_IDENTITY_MISSING",
      "Google did not return a verifiable identity.",
      400,
    );
  }
  const ticket = await auth.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });
  const identity = ticket.getPayload();
  const returnedNonceHash = sha256(identity?.nonce ?? "");
  if (
    !identity?.sub ||
    !identity.email ||
    identity.email_verified !== true ||
    !secureCompare(returnedNonceHash, attempt.nonceHash)
  ) {
    throw new AppError(
      "GOOGLE_IDENTITY_INVALID",
      "Google identity verification failed.",
      400,
    );
  }

  const realtor = await resolveRealtor({
    googleSubject: identity.sub,
    email: identity.email.toLowerCase(),
    displayName: identity.name || undefined,
    avatarUrl: safeAvatarUrl(identity.picture),
  });
  const existingConnection = await prisma.googleCalendarConnection.findUnique({
    where: { realtorId: realtor.id },
  });
  const refreshToken =
    tokens.refresh_token ??
    (existingConnection
      ? decryptCredential(
          existingConnection.encryptedRefreshToken,
          `${realtor.id}:refreshToken`,
        )
      : undefined);
  if (!refreshToken) {
    throw new AppError(
      "GOOGLE_REFRESH_TOKEN_MISSING",
      "Google did not grant offline Calendar access. Please try again.",
      400,
    );
  }
  const calendarId = existingConnection
    ? decryptCredential(
        existingConnection.encryptedCalendarId,
        `${realtor.id}:calendarId`,
      )
    : "primary";

  auth.setCredentials({ ...tokens, refresh_token: refreshToken });
  await google.calendar({ version: "v3", auth }).events.list({
    calendarId,
    maxResults: 1,
    singleEvents: true,
    fields: "items(id)",
  });

  const encrypt = (field: string, value: string) =>
    encryptCredential(value, `${realtor.id}:${field}`);
  await prisma.$transaction([
    prisma.googleCalendarConnection.upsert({
      where: { realtorId: realtor.id },
      update: {
        encryptedRefreshToken: encrypt("refreshToken", refreshToken),
        encryptedCalendarId: encrypt("calendarId", calendarId),
      },
      create: {
        realtorId: realtor.id,
        encryptedRefreshToken: encrypt("refreshToken", refreshToken),
        encryptedCalendarId: encrypt("calendarId", calendarId),
      },
    }),
    prisma.realtor.update({
      where: { id: realtor.id },
      data: { calendarProvider: "GOOGLE" },
    }),
  ]);
  await audit({
    action: "REALTOR_LOGIN",
    actorType: "ADMIN",
    actorId: realtor.id,
    metadata: { provider: "GOOGLE" },
  });
  const session = await createRealtorSession(realtor.id);
  return {
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}
