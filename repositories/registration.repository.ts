import {
  CalendarSyncStatus,
  RegistrationStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const registrationSelect = {
  id: true,
  invitationId: true,
  calendarEventId: true,
  fullName: true,
  email: true,
  phone: true,
  notes: true,
  status: true,
  registeredAt: true,
  cancelledAt: true,
  calendarSyncStatus: true,
  calendarSyncError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RegistrationSelect;

export type RegistrationRecord = Prisma.RegistrationGetPayload<{
  select: typeof registrationSelect;
}>;

export const registrationRepository = {
  listForInvitation(invitationId: string) {
    return prisma.registration.findMany({
      where: { invitationId },
      select: registrationSelect,
    });
  },
  listActiveForEvent(calendarEventId: string) {
    return prisma.registration.findMany({
      where: { calendarEventId, status: RegistrationStatus.CONFIRMED },
      orderBy: [{ registeredAt: "asc" }, { id: "asc" }],
      select: registrationSelect,
    });
  },
  countActiveForEvent(calendarEventId: string) {
    return prisma.registration.count({
      where: { calendarEventId, status: RegistrationStatus.CONFIRMED },
    });
  },
  find(invitationId: string, calendarEventId: string) {
    return prisma.registration.findUnique({
      where: {
        invitationId_calendarEventId: { invitationId, calendarEventId },
      },
      select: registrationSelect,
    });
  },
  markSync(
    calendarEventId: string,
    status: CalendarSyncStatus,
    calendarSyncError: string | null = null,
  ) {
    return prisma.registration.updateMany({
      where: { calendarEventId, status: RegistrationStatus.CONFIRMED },
      data: { calendarSyncStatus: status, calendarSyncError },
    });
  },
};
