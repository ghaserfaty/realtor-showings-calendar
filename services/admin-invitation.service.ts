import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { randomOpaqueToken, sha256 } from "@/lib/security/crypto";
import type { createInvitationSchema } from "@/lib/validation/invitation";
import { audit } from "@/services/audit.service";
import { sendInvitationEmail } from "@/services/email.service";
import type { z } from "zod";

type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export async function createInvitation(
  realtorId: string,
  input: CreateInvitationInput,
) {
  const plainToken = randomOpaqueToken();
  const invitation = await prisma.invitation.create({
    data: {
      tokenHash: sha256(plainToken),
      invitedEmail: input.invitedEmail,
      invitedName: input.invitedName,
      invitedPhone: input.invitedPhone,
      realtorId,
      expiresAt: input.expiresAt,
      maxSubmissions: input.maxSubmissions,
    },
  });
  const invitationUrl = `${getConfig().APP_URL}/invite/${plainToken}`;
  let emailSent = false;
  if (input.sendEmail) {
    try {
      await sendInvitationEmail(invitation.invitedEmail, invitationUrl);
      emailSent = true;
    } catch {
      logger.warn("Invitation was created but email delivery failed", {
        invitationId: invitation.id,
      });
    }
  }
  await audit({
    action: "INVITATION_CREATED",
    invitationId: invitation.id,
    actorType: "ADMIN",
    metadata: {
      emailSent,
    },
  });
  return {
    id: invitation.id,
    token: plainToken,
    invitationUrl,
    expiresAt: invitation.expiresAt.toISOString(),
    emailSent,
  };
}

export async function getInvitationForAdmin(realtorId: string, id: string) {
  const invitation = await prisma.invitation.findFirst({
    where: { id, realtorId },
    include: {
      registrations: { orderBy: { registeredAt: "desc" } },
      realtor: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (!invitation)
    throw new AppError("NOT_FOUND", "Invitation was not found.", 404);
  return Object.fromEntries(
    Object.entries(invitation).filter(([key]) => key !== "tokenHash"),
  );
}

export async function revokeInvitation(
  realtorId: string,
  id: string,
): Promise<void> {
  const invitation = await prisma.invitation.findFirst({
    where: { id, realtorId },
  });
  if (!invitation)
    throw new AppError("NOT_FOUND", "Invitation was not found.", 404);
  await prisma.invitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  await audit({
    action: "INVITATION_REVOKED",
    invitationId: id,
    actorType: "ADMIN",
  });
}

export async function resendInvitation(realtorId: string, id: string) {
  const invitation = await prisma.invitation.findFirst({
    where: { id, realtorId },
  });
  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date()
  ) {
    throw new AppError(
      "NOT_FOUND",
      "Invitation is not available for resend.",
      404,
    );
  }
  const oldHash = invitation.tokenHash;
  const plainToken = randomOpaqueToken();
  const invitationUrl = `${getConfig().APP_URL}/invite/${plainToken}`;
  await prisma.invitation.update({
    where: { id },
    data: { tokenHash: sha256(plainToken) },
  });
  try {
    await sendInvitationEmail(invitation.invitedEmail, invitationUrl);
  } catch (error: unknown) {
    await prisma.invitation.update({
      where: { id },
      data: { tokenHash: oldHash },
    });
    throw error;
  }
  await audit({
    action: "INVITATION_RESENT",
    invitationId: id,
    actorType: "ADMIN",
  });
  return { invitationUrl, token: plainToken, emailSent: true };
}
