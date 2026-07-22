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

export async function createInvitation(input: CreateInvitationInput) {
  let realtor = input.realtorId
    ? await prisma.realtor.findUnique({ where: { id: input.realtorId } })
    : await prisma.realtor.findFirst({ orderBy: { createdAt: "asc" } });
  if (!realtor && !input.realtorId) {
    const config = getConfig();
    realtor = await prisma.realtor.create({
      data: {
        email: config.REALTOR_EMAIL,
        displayName: config.REALTOR_DISPLAY_NAME,
        calendarOwnerReference: config.GOOGLE_CALENDAR_ID,
      },
    });
  }
  if (!realtor) {
    throw new AppError(
      "REALTOR_REQUIRED",
      "Create a realtor record before issuing invitations.",
      409,
    );
  }

  const plainToken = randomOpaqueToken();
  const invitation = await prisma.invitation.create({
    data: {
      tokenHash: sha256(plainToken),
      invitedEmail: input.invitedEmail,
      invitedName: input.invitedName,
      invitedPhone: input.invitedPhone,
      realtorId: realtor.id,
      expiresAt: input.expiresAt,
      maxSubmissions: input.maxSubmissions,
      verificationRequired:
        input.verificationRequired ??
        getConfig().REQUIRE_INVITATION_EMAIL_VERIFICATION,
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
      verificationRequired: invitation.verificationRequired,
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

export async function getInvitationForAdmin(id: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id },
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

export async function revokeInvitation(id: string): Promise<void> {
  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation)
    throw new AppError("NOT_FOUND", "Invitation was not found.", 404);
  await prisma.$transaction([
    prisma.invitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    }),
    prisma.invitationSession.deleteMany({ where: { invitationId: id } }),
  ]);
  await audit({
    action: "INVITATION_REVOKED",
    invitationId: id,
    actorType: "ADMIN",
  });
}

export async function resendInvitation(id: string) {
  const invitation = await prisma.invitation.findUnique({ where: { id } });
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
  await prisma.$transaction([
    prisma.invitation.update({
      where: { id },
      data: { tokenHash: sha256(plainToken) },
    }),
    prisma.invitationSession.deleteMany({ where: { invitationId: id } }),
  ]);
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
