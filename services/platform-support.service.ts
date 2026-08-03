import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getCalendarSyncService } from "@/services/calendar-sync.service";
import { listInvitationsForAdmin } from "@/services/admin-invitation.service";

export async function listSupportRealtors() {
  const realtors = await prisma.realtor.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      email: true,
      displayName: true,
      calendarProvider: true,
      createdAt: true,
      googleCalendarConnection: { select: { updatedAt: true } },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true },
      },
      invitations: { select: { _count: { select: { registrations: true } } } },
    },
  });
  return realtors.map((realtor) => ({
    id: realtor.id,
    email: realtor.email,
    displayName: realtor.displayName,
    calendarProvider: realtor.calendarProvider,
    createdAt: realtor.createdAt.toISOString(),
    calendarConnected:
      realtor.calendarProvider === "MOCK" ||
      Boolean(realtor.googleCalendarConnection),
    connectionUpdatedAt:
      realtor.googleCalendarConnection?.updatedAt.toISOString(),
    activeSessionCount: realtor.sessions.length,
    invitationCount: realtor.invitations.length,
    registrationCount: realtor.invitations.reduce(
      (total, invitation) => total + invitation._count.registrations,
      0,
    ),
  }));
}

export async function listSupportInvitations(realtorId: string) {
  const realtor = await prisma.realtor.findUnique({
    where: { id: realtorId },
    select: { id: true, email: true, displayName: true },
  });
  if (!realtor) throw new AppError("NOT_FOUND", "Tenant was not found.", 404);
  return {
    realtor,
    invitations: await listInvitationsForAdmin(realtorId),
  };
}

export async function deleteInvitationForSupport(
  realtorId: string,
  invitationId: string,
) {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, realtorId },
    select: {
      id: true,
      registrations: { select: { calendarEventId: true } },
    },
  });
  if (!invitation) {
    throw new AppError("NOT_FOUND", "Invitation was not found.", 404);
  }
  const eventIds = [
    ...new Set(invitation.registrations.map((item) => item.calendarEventId)),
  ];
  await prisma.$transaction(async (transaction) => {
    const deletedRegistrations = await transaction.registration.deleteMany({
      where: { invitationId },
    });
    await transaction.invitation.delete({ where: { id: invitationId } });
    await transaction.auditLog.create({
      data: {
        action: "INVITATION_DELETED",
        invitationId,
        actorType: "SYSTEM",
        actorId: "platform-support",
        metadata: {
          realtorId,
          deletedRegistrations: deletedRegistrations.count,
        },
      },
    });
  });

  if (eventIds.length > 0) {
    try {
      const sync = await getCalendarSyncService(realtorId);
      await Promise.all(eventIds.map((eventId) => sync.syncEvent(eventId)));
    } catch (error: unknown) {
      logger.warn("Calendar cleanup after invitation deletion failed", {
        realtorId,
        invitationId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return {
    deleted: true,
    deletedRegistrationCount: invitation.registrations.length,
  };
}
