import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { randomOpaqueToken, sha256 } from "@/lib/security/crypto";
import { encryptCredential } from "@/lib/security/encryption";
import type {
  calendarConnectionSchema,
  createRealtorSchema,
} from "@/lib/validation/realtor";
import { audit } from "@/services/audit.service";

type CreateRealtorInput = z.infer<typeof createRealtorSchema>;
type CalendarConnectionInput = z.infer<typeof calendarConnectionSchema>;

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

export async function setCalendarConnection(
  realtorId: string,
  input: CalendarConnectionInput,
) {
  if (input.provider === "MOCK") {
    await prisma.$transaction([
      prisma.realtor.update({
        where: { id: realtorId },
        data: { calendarProvider: "MOCK" },
      }),
      prisma.googleCalendarConnection.deleteMany({ where: { realtorId } }),
    ]);
    await audit({
      action: "CALENDAR_CONNECTION_UPDATED",
      actorType: "ADMIN",
      actorId: realtorId,
      metadata: { provider: "MOCK" },
    });
    return { provider: "MOCK" as const, configured: true };
  }

  const encrypt = (field: string, value: string) =>
    encryptCredential(value, `${realtorId}:${field}`);
  await prisma.$transaction([
    prisma.googleCalendarConnection.upsert({
      where: { realtorId },
      update: {
        encryptedClientId: encrypt("clientId", input.clientId),
        encryptedClientSecret: encrypt("clientSecret", input.clientSecret),
        encryptedRefreshToken: encrypt("refreshToken", input.refreshToken),
        encryptedCalendarId: encrypt("calendarId", input.calendarId),
      },
      create: {
        realtorId,
        encryptedClientId: encrypt("clientId", input.clientId),
        encryptedClientSecret: encrypt("clientSecret", input.clientSecret),
        encryptedRefreshToken: encrypt("refreshToken", input.refreshToken),
        encryptedCalendarId: encrypt("calendarId", input.calendarId),
      },
    }),
    prisma.realtor.update({
      where: { id: realtorId },
      data: { calendarProvider: "GOOGLE" },
    }),
  ]);
  await audit({
    action: "CALENDAR_CONNECTION_UPDATED",
    actorType: "ADMIN",
    actorId: realtorId,
    metadata: { provider: "GOOGLE" },
  });
  return { provider: "GOOGLE" as const, configured: true };
}

export async function getCalendarConnectionStatus(realtorId: string) {
  const realtor = await prisma.realtor.findUniqueOrThrow({
    where: { id: realtorId },
    select: {
      calendarProvider: true,
      googleCalendarConnection: { select: { updatedAt: true } },
    },
  });
  return {
    provider: realtor.calendarProvider,
    configured:
      realtor.calendarProvider === "MOCK" ||
      Boolean(realtor.googleCalendarConnection),
    updatedAt: realtor.googleCalendarConnection?.updatedAt.toISOString(),
  };
}
