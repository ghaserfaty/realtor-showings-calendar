import "server-only";
import { google } from "googleapis";
import type { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { randomOpaqueToken, sha256 } from "@/lib/security/crypto";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/security/encryption";
import type { createRealtorSchema } from "@/lib/validation/realtor";
import { audit } from "@/services/audit.service";

type CreateRealtorInput = z.infer<typeof createRealtorSchema>;

export async function createRealtor(input: CreateRealtorInput) {
  const apiKey = `rlt_${randomOpaqueToken()}`;
  const realtor = await prisma.realtor.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      calendarProvider: input.calendarProvider,
      adminApiKeyHash: sha256(apiKey),
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      calendarProvider: true,
      createdAt: true,
    },
  });
  await audit({
    action: "REALTOR_CREATED",
    actorType: "SYSTEM",
    actorId: realtor.id,
    metadata: { calendarProvider: realtor.calendarProvider },
  });
  return { realtor, apiKey };
}

async function googleAuthForRealtor(realtorId: string) {
  const config = getConfig();
  if (!config.GOOGLE_OAUTH_CLIENT_ID || !config.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new AppError(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google Calendar is not configured.",
      503,
    );
  }
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { realtorId },
  });
  if (!connection) {
    throw new AppError(
      "GOOGLE_CALENDAR_NOT_CONFIGURED",
      "Google Calendar is not connected.",
      409,
    );
  }
  const auth = new google.auth.OAuth2(
    config.GOOGLE_OAUTH_CLIENT_ID,
    config.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({
    refresh_token: decryptCredential(
      connection.encryptedRefreshToken,
      `${realtorId}:refreshToken`,
    ),
  });
  return { auth, connection };
}

export async function getCalendarConnectionStatus(realtorId: string) {
  const realtor = await prisma.realtor.findUniqueOrThrow({
    where: { id: realtorId },
    select: {
      calendarProvider: true,
      googleCalendarConnection: {
        select: { updatedAt: true, encryptedCalendarId: true },
      },
    },
  });
  return {
    provider: realtor.calendarProvider,
    configured:
      realtor.calendarProvider === "MOCK" ||
      Boolean(realtor.googleCalendarConnection),
    updatedAt: realtor.googleCalendarConnection?.updatedAt.toISOString(),
    calendarId: realtor.googleCalendarConnection
      ? decryptCredential(
          realtor.googleCalendarConnection.encryptedCalendarId,
          `${realtorId}:calendarId`,
        )
      : undefined,
  };
}

export async function listWritableCalendars(realtorId: string) {
  const { auth } = await googleAuthForRealtor(realtorId);
  const response = await google
    .calendar({ version: "v3", auth })
    .calendarList.list({
      minAccessRole: "writer",
      maxResults: 250,
      fields:
        "items(id,summary,summaryOverride,primary,accessRole,backgroundColor)",
    });
  return (response.data.items ?? []).flatMap((calendar) =>
    calendar.id
      ? [
          {
            id: calendar.id,
            name:
              calendar.summaryOverride ??
              calendar.summary ??
              (calendar.primary ? "Primary calendar" : calendar.id),
            primary: Boolean(calendar.primary),
            accessRole: calendar.accessRole ?? "writer",
            color: calendar.backgroundColor ?? undefined,
          },
        ]
      : [],
  );
}

export async function selectCalendar(realtorId: string, calendarId: string) {
  const { auth } = await googleAuthForRealtor(realtorId);
  await google.calendar({ version: "v3", auth }).events.list({
    calendarId,
    maxResults: 1,
    singleEvents: true,
    fields: "items(id)",
  });
  await prisma.googleCalendarConnection.update({
    where: { realtorId },
    data: {
      encryptedCalendarId: encryptCredential(
        calendarId,
        `${realtorId}:calendarId`,
      ),
    },
  });
  await audit({
    action: "CALENDAR_CONNECTION_UPDATED",
    actorType: "ADMIN",
    actorId: realtorId,
    metadata: { provider: "GOOGLE" },
  });
  return { configured: true, provider: "GOOGLE" as const, calendarId };
}
