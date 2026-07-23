import type { Invitation } from "@prisma/client";
import type { PublicRegistrationDto } from "@/lib/dto";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { RegistrationInput } from "@/lib/validation/invitation";
import { audit } from "@/services/audit.service";
import { getCalendarSyncService } from "@/services/calendar-sync.service";
import { getShowingService } from "@/services/showing.service";

function toDto(registration: {
  id: string;
  calendarEventId: string;
  status: "CONFIRMED" | "CANCELLED";
  calendarSyncStatus: "PENDING" | "SYNCED" | "ERROR";
  registeredAt: Date;
}): PublicRegistrationDto {
  return {
    id: registration.id,
    eventId: registration.calendarEventId,
    status: registration.status,
    calendarSyncStatus: registration.calendarSyncStatus,
    registeredAt: registration.registeredAt.toISOString(),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function registerForShowings(
  invitation: Invitation,
  input: RegistrationInput,
  ip?: string,
): Promise<PublicRegistrationDto[]> {
  const showingService = await getShowingService(invitation.realtorId);
  const existing = await prisma.registration.findMany({
    where: {
      invitationId: invitation.id,
      calendarEventId: { in: input.eventIds },
    },
  });
  const existingConfirmed = new Set(
    existing
      .filter((registration) => registration.status === "CONFIRMED")
      .map((item) => item.calendarEventId),
  );
  if (invitation.maxSubmissions !== null) {
    const activeCount = await prisma.registration.count({
      where: { invitationId: invitation.id, status: "CONFIRMED" },
    });
    const additions = input.eventIds.filter(
      (eventId) => !existingConfirmed.has(eventId),
    ).length;
    if (activeCount + additions > invitation.maxSubmissions) {
      throw new AppError(
        "SUBMISSION_LIMIT",
        "This invitation cannot select any more showings.",
        409,
      );
    }
  }

  // Calendar is authoritative for availability. Re-fetch every event as close as
  // possible to the database write and compare it with the version shown to the user.
  await Promise.all(
    input.eventIds.map((eventId) =>
      showingService.assertSelectable(eventId, input.eventVersions?.[eventId]),
    ),
  );

  await prisma.$transaction(async (transaction) => {
    const results = [];
    for (const eventId of input.eventIds) {
      const current = await transaction.registration.findUnique({
        where: {
          invitationId_calendarEventId: {
            invitationId: invitation.id,
            calendarEventId: eventId,
          },
        },
      });
      if (current?.status === "CONFIRMED") {
        results.push(current);
        continue;
      }
      if (current) {
        results.push(
          await transaction.registration.update({
            where: { id: current.id },
            data: {
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              notes: input.notes,
              status: "CONFIRMED",
              cancelledAt: null,
              registeredAt: new Date(),
              calendarSyncStatus: "PENDING",
              calendarSyncError: null,
            },
          }),
        );
        continue;
      }
      try {
        results.push(
          await transaction.registration.create({
            data: {
              invitationId: invitation.id,
              calendarEventId: eventId,
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              notes: input.notes,
            },
          }),
        );
      } catch (error: unknown) {
        if (!isUniqueConstraintError(error)) throw error;
        const raced = await transaction.registration.findUnique({
          where: {
            invitationId_calendarEventId: {
              invitationId: invitation.id,
              calendarEventId: eventId,
            },
          },
        });
        if (!raced) throw error;
        results.push(raced);
      }
    }
    return results;
  });

  const syncService = await getCalendarSyncService(invitation.realtorId);
  for (const eventId of input.eventIds) {
    const reused = existingConfirmed.has(eventId);
    await audit({
      action: reused ? "REGISTRATION_REUSED" : "REGISTRATION_CREATED",
      invitationId: invitation.id,
      actorType: "INVITEE",
      actorId: invitation.id,
      ip,
      metadata: { eventId },
    });
    try {
      await syncService.syncEvent(eventId);
    } catch (error: unknown) {
      logger.warn("Calendar synchronization deferred after registration", {
        invitationId: invitation.id,
        eventId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const refreshed = await prisma.registration.findMany({
    where: {
      invitationId: invitation.id,
      calendarEventId: { in: input.eventIds },
    },
  });
  return refreshed.map(toDto);
}

export async function cancelRegistration(
  invitation: Invitation,
  eventId: string,
  ip?: string,
): Promise<PublicRegistrationDto> {
  const showingService = await getShowingService(invitation.realtorId);
  await showingService.assertSelectable(eventId);
  const registration = await prisma.registration.findUnique({
    where: {
      invitationId_calendarEventId: {
        invitationId: invitation.id,
        calendarEventId: eventId,
      },
    },
  });
  if (!registration || registration.status === "CANCELLED") {
    throw new AppError(
      "REGISTRATION_NOT_FOUND",
      "Registration was not found.",
      404,
    );
  }
  await prisma.registration.update({
    where: { id: registration.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      calendarSyncStatus: "PENDING",
      calendarSyncError: null,
    },
  });
  await audit({
    action: "REGISTRATION_CANCELLED",
    invitationId: invitation.id,
    actorType: "INVITEE",
    actorId: invitation.id,
    ip,
    metadata: { eventId },
  });
  try {
    const syncService = await getCalendarSyncService(invitation.realtorId);
    await syncService.syncEvent(eventId);
    const synced = await prisma.registration.update({
      where: { id: registration.id },
      data: { calendarSyncStatus: "SYNCED" },
    });
    return toDto(synced);
  } catch (error: unknown) {
    logger.warn("Calendar synchronization deferred after cancellation", {
      invitationId: invitation.id,
      eventId,
    });
    const failed = await prisma.registration.update({
      where: { id: registration.id },
      data: {
        calendarSyncStatus: "ERROR",
        calendarSyncError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown error",
      },
    });
    return toDto(failed);
  }
}
