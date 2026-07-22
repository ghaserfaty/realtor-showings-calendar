import type { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import {
  randomOpaqueToken,
  secureCompare,
  sha256,
} from "@/lib/security/crypto";

export const SESSION_COOKIE = "showing_invitation_session";
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

export async function createInvitationSession(
  invitationId: string,
  verified: boolean,
): Promise<string> {
  const plainToken = randomOpaqueToken();
  await prisma.invitationSession.create({
    data: {
      invitationId,
      tokenHash: sha256(plainToken),
      verifiedEmailAt: verified ? new Date() : null,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });
  return plainToken;
}

export function attachSessionCookie(
  response: NextResponse,
  plainToken: string,
): void {
  const config = getConfig();
  response.cookies.set(SESSION_COOKIE, plainToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production" || config.SESSION_COOKIE_SECURE,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_LIFETIME_MS / 1000,
  });
}

export async function getInvitationSession(
  request: NextRequest,
  invitationId: string,
) {
  const plain = request.cookies.get(SESSION_COOKIE)?.value;
  if (!plain) return null;
  const candidateHash = sha256(plain);
  const session = await prisma.invitationSession.findUnique({
    where: { tokenHash: candidateHash },
  });
  if (
    !session ||
    !secureCompare(candidateHash, session.tokenHash) ||
    session.invitationId !== invitationId ||
    session.expiresAt <= new Date()
  ) {
    return null;
  }
  await prisma.invitationSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return session;
}

export async function requireInvitationAccess(
  request: NextRequest,
  invitationId: string,
  verificationRequired: boolean,
): Promise<void> {
  if (!verificationRequired) return;
  const session = await getInvitationSession(request, invitationId);
  if (!session?.verifiedEmailAt) {
    throw new AppError(
      "VERIFICATION_REQUIRED",
      "Verify the invited email to continue.",
      403,
    );
  }
}
