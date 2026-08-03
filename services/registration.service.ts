import type { Invitation, Prisma } from "@prisma/client";
import type { PublicRegistrationDto } from "@/lib/dto";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { RegistrationInput } from "@/lib/validation/invitation";
import { audit } from "@/services/audit.service";
import { getCalendarSyncService } from "@/services/calendar-sync.service";
import {
  getShowingService,
  type EligibleShowing,
} from "@/services/showing.service";

const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;

function lockResources(invitation: Invitation, eventIds: string[]): string[] {
  return [
    `invitation:${invitation.id}`,
    ...eventIds.map((eventId) => `showing:${invitation.realtorId}:${eventId}`),
  ].sort();
}

async function acquireRegistrationLocks(
  transaction: Prisma.TransactionClient,
  invitation: Invitation,
  eventIds: string[],
): Promise<void> {
  // Transaction-scoped advisory locks serialize capacity checks without
  // persisting a local copy of Calendar slots. Sorting prevents deadlocks when
  // one request selects several events.
  for (const resource of lockResources(invitation, eventIds)) {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${resource}, 0))::text AS "lock"
    `;
  }
}

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

  // Calendar is authoritative for availability. Re-fetch every event as close as
  // possible to the database write and compare it with the version shown to the user.
  const showings = new Map<string, EligibleShowing>();
  const validatedShowings = await Promise.all(
    input.eventIds.map((eventId) =>
      showingService.assertSelectable(eventId, input.eventVersions?.[eventId]),
    ),
  );
  input.eventIds.forEach((eventId, index) => {
    const showing = validatedShowings[index];
    if (showing) showings.set(eventId, showing);
  });

  const reusedEventIds = new Set(
    await prisma.$transaction(async (transaction) => {
      await acquireRegistrationLocks(transaction, invitation, input.eventIds);

      const currentInvitation = await transaction.invitation.findUnique({
        where: { id: invitation.id },
      });
      const checkedAt = new Date();
      if (
        !currentInvitation ||
        currentInvitation.realtorId !== invitation.realtorId ||
        currentInvitation.revokedAt ||
        currentInvitation.expiresAt <= checkedAt
      ) {
        throw new AppError(
          "INVITATION_UNAVAILABLE",
          "This invitation is invalid or no longer available.",
          404,
        );
      }

      const existing = await transaction.registration.findMany({
        where: {
          invitationId: invitation.id,
          calendarEventId: { in: input.eventIds },
        },
      });
      const existingByEvent = new Map(
        existing.map((registration) => [
          registration.calendarEventId,
          registration,
        ]),
      );

      const reused = existing
        .filter((registration) => registration.status === "CONFIRMED")
        .map((registration) => registration.calendarEventId);
      if (currentInvitation.maxSubmissions !== null) {
        const activeCount = await transaction.registration.count({
          where: { invitationId: invitation.id, status: "CONFIRMED" },
        });
        const additions = input.eventIds.filter(
          (eventId) => existingByEvent.get(eventId)?.status !== "CONFIRMED",
        ).length;
        if (activeCount + additions > currentInvitation.maxSubmissions) {
          throw new AppError(
            "SUBMISSION_LIMIT",
            "This invitation cannot select any more showings.",
            409,
          );
        }
      }

      for (const eventId of input.eventIds) {
        const current = existingByEvent.get(eventId);
        if (current?.status === "CONFIRMED") continue;

        const showing = showings.get(eventId);
        if (!showing) {
          throw new AppError(
            "SHOWING_UNAVAILABLE",
            "One of the selected showings is no longer available.",
            409,
          );
        }
        if (showing.capacity) {
          const activeForEvent = await transaction.registration.count({
            where: {
              calendarEventId: eventId,
              status: "CONFIRMED",
              invitation: { realtorId: invitation.realtorId },
            },
          });
          if (activeForEvent >= showing.capacity) {
            throw new AppError(
              "SHOWING_FULL",
              "One of the selected showings has reached capacity.",
              409,
            );
          }
        }

        if (current) {
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
          });
          continue;
        }

        try {
          await transaction.registration.create({
            data: {
              invitationId: invitation.id,
              calendarEventId: eventId,
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              notes: input.notes,
            },
          });
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
        }
      }
      return reused;
    }, transactionOptions),
  );

  const syncService = await getCalendarSyncService(invitation.realtorId);
  for (const eventId of input.eventIds) {
    const reused = reusedEventIds.has(eventId);
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
  const registration = await prisma.$transaction(async (transaction) => {
    await acquireRegistrationLocks(transaction, invitation, [eventId]);
    const current = await transaction.registration.findUnique({
      where: {
        invitationId_calendarEventId: {
          invitationId: invitation.id,
          calendarEventId: eventId,
        },
      },
    });
    if (!current || current.status === "CANCELLED") {
      throw new AppError(
        "REGISTRATION_NOT_FOUND",
        "Registration was not found.",
        404,
      );
    }
    return transaction.registration.update({
      where: { id: current.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        calendarSyncStatus: "PENDING",
        calendarSyncError: null,
      },
    });
  }, transactionOptions);
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
