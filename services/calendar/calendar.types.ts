export type CalendarEvent = {
  id: string;
  status?: string | null;
  summary?: string | null;
  location?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; timeZone?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
  etag?: string | null;
};

export interface CalendarProvider {
  listUpcomingEvents(
    timeMin: Date,
    options?: { includeClosed?: boolean },
  ): Promise<CalendarEvent[]>;
  getEvent(eventId: string): Promise<CalendarEvent | null>;
  updateManagedFields(
    eventId: string,
    input: {
      description: string;
      privateExtendedProperties: Record<string, string>;
      expectedEtag?: string;
    },
  ): Promise<void>;
  updateShowingAvailability(
    eventId: string,
    input: {
      summary: string;
      privateExtendedProperties: Record<string, string>;
      expectedEtag?: string;
    },
  ): Promise<void>;
}
