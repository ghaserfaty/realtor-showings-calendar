import { NextRequest } from "next/server";
import type { Realtor } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { secureCompare, sha256 } from "@/lib/security/crypto";
import {
  findRealtorBySessionToken,
  REALTOR_SESSION_COOKIE,
} from "@/lib/security/realtor-session";
import {
  isValidPlatformSession,
  PLATFORM_SESSION_COOKIE,
} from "@/lib/security/platform-session";

export function authenticatePlatformAdmin(request: NextRequest): void {
  const session = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value ?? "";
  if (isValidPlatformSession(session)) return;
  const supplied = request.headers.get("x-platform-admin-api-key") ?? "";
  if (!secureCompare(supplied, getConfig().PLATFORM_ADMIN_API_KEY)) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
}

export async function authenticateRealtor(
  request: NextRequest,
): Promise<Realtor> {
  const sessionToken = request.cookies.get(REALTOR_SESSION_COOKIE)?.value ?? "";
  const sessionRealtor = await findRealtorBySessionToken(sessionToken);
  if (sessionRealtor) {
    await assertRealtorCalendarConnected(sessionRealtor);
    return sessionRealtor;
  }

  const supplied = request.headers.get("x-realtor-api-key") ?? "";
  if (!/^rlt_[A-Za-z0-9_-]{32,200}$/.test(supplied)) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  const candidateHash = sha256(supplied);
  const realtor = await prisma.realtor.findUnique({
    where: { adminApiKeyHash: candidateHash },
  });
  if (
    !realtor?.adminApiKeyHash ||
    !secureCompare(candidateHash, realtor.adminApiKeyHash)
  ) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  await assertRealtorCalendarConnected(realtor);
  return realtor;
}

async function assertRealtorCalendarConnected(realtor: Realtor): Promise<void> {
  if (realtor.calendarProvider === "MOCK") return;
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { realtorId: realtor.id },
    select: { realtorId: true },
  });
  if (!connection) {
    throw new AppError(
      "CALENDAR_CONNECTION_REQUIRED",
      "Google Calendar must be connected before using the realtor workspace.",
      401,
    );
  }
}
