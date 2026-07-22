import { getConfig } from "@/lib/config";
import { GoogleCalendarProvider } from "@/services/calendar/google-calendar.provider";
import { MockCalendarProvider } from "@/services/calendar/mock-calendar.provider";
import type { CalendarProvider } from "@/services/calendar/calendar.types";

let provider: CalendarProvider | undefined;

export function getCalendarProvider(): CalendarProvider {
  provider ??=
    getConfig().CALENDAR_PROVIDER === "google"
      ? new GoogleCalendarProvider()
      : new MockCalendarProvider();
  return provider;
}

export function setCalendarProviderForTests(value?: CalendarProvider): void {
  provider = value;
}
