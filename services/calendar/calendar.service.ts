import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { decryptCredential } from "@/lib/security/encryption";
import { GoogleCalendarProvider } from "@/services/calendar/google-calendar.provider";
import { MockCalendarProvider } from "@/services/calendar/mock-calendar.provider";
import type { CalendarProvider } from "@/services/calendar/calendar.types";

let providerForTests: CalendarProvider | undefined;

export async function getCalendarProvider(
  realtorId: string,
): Promise<CalendarProvider> {
  if (providerForTests) return providerForTests;
  const realtor = await prisma.realtor.findUnique({
    where: { id: realtorId },
    select: {
      calendarProvider: true,
      googleCalendarConnection: true,
    },
  });
  if (!realtor) {
    throw new AppError("REALTOR_NOT_FOUND", "Realtor was not found.", 404);
  }
  if (realtor.calendarProvider === "MOCK") return new MockCalendarProvider();

  const connection = realtor.googleCalendarConnection;
  if (!connection) {
    throw new AppError(
      "GOOGLE_CALENDAR_NOT_CONFIGURED",
      "This realtor has not connected Google Calendar.",
      503,
    );
  }
  const decrypt = (field: string, value: string) =>
    decryptCredential(value, `${realtorId}:${field}`);
  return new GoogleCalendarProvider({
    clientId: decrypt("clientId", connection.encryptedClientId),
    clientSecret: decrypt("clientSecret", connection.encryptedClientSecret),
    refreshToken: decrypt("refreshToken", connection.encryptedRefreshToken),
    calendarId: decrypt("calendarId", connection.encryptedCalendarId),
  });
}

export function setCalendarProviderForTests(value?: CalendarProvider): void {
  providerForTests = value;
}
