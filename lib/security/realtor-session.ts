import "server-only";
import type { Realtor } from "@prisma/client";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import {
  randomOpaqueToken,
  secureCompare,
  sha256,
} from "@/lib/security/crypto";

export const REALTOR_SESSION_COOKIE = "realtor_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getConfig().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function createRealtorSession(realtorId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.$transaction([
    prisma.realtorSession.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    }),
    prisma.realtorSession.create({
      data: {
        realtorId,
        tokenHash: sha256(token),
        expiresAt,
      },
    }),
  ]);
  return { token, expiresAt };
}

export async function findRealtorBySessionToken(
  token: string,
): Promise<Realtor | null> {
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) return null;
  const tokenHash = sha256(token);
  const session = await prisma.realtorSession.findUnique({
    where: { tokenHash },
    include: { realtor: true },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    !secureCompare(tokenHash, session.tokenHash)
  ) {
    if (session) {
      await prisma.realtorSession.delete({ where: { id: session.id } });
    }
    return null;
  }
  if (session.lastSeenAt.getTime() < Date.now() - TOUCH_INTERVAL_MS) {
    await prisma.realtorSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return session.realtor;
}

export async function destroyRealtorSession(token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) return;
  await prisma.realtorSession.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}
