import type {
  CalendarEvent,
  CalendarProvider,
} from "@/services/calendar/calendar.types";

const DAY = 24 * 60 * 60 * 1000;
const mockStore = new Map<string, CalendarEvent>();

function futureDate(days: number, hour: number): string {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function seedEvents(): CalendarEvent[] {
  const timezone = "America/Argentina/Buenos_Aires";
  const events: CalendarEvent[] = [
    {
      id: "mock-showing-selected",
      status: "confirmed",
      summary: "[ABIERTA] Palermo light-filled apartment",
      location: "Güemes 4120, Palermo",
      description: `PUBLIC_SHOWING
Listing: https://example.com/listings/palermo-101
Notes: Meet in the lobby five minutes before the tour.
END_PUBLIC_SHOWING

Realtor note: enter through the lobby on Güemes.`,
      start: { dateTime: futureDate(1, 18), timeZone: timezone },
      end: { dateTime: futureDate(1, 18 + 1), timeZone: timezone },
      extendedProperties: {
        private: {
          eventType: "property_showing",
          registrationEnabled: "true",
          propertyId: "palermo-101",
          propertyAddress: "Güemes 4120, Palermo",
          listingUrl: "https://example.com/listings/palermo-101",
          publicShowingNotes: "Meet in the lobby five minutes before the tour.",
        },
      },
      etag: "mock-1",
    },
    {
      id: "mock-showing-riverside",
      status: "confirmed",
      summary: "[ABIERTA] Riverside loft in Puerto Madero",
      location: "Juana Manso 620, Puerto Madero",
      description: `PUBLIC_SHOWING
Listing: https://example.com/listings/madero-220
Capacity: 12
END_PUBLIC_SHOWING

Internal seller instructions remain private.`,
      start: { dateTime: futureDate(3, 20), timeZone: timezone },
      end: { dateTime: futureDate(3, 21), timeZone: timezone },
      extendedProperties: {
        private: {
          eventType: "property_showing",
          registrationEnabled: "true",
          propertyId: "madero-220",
          propertyAddress: "Juana Manso 620, Puerto Madero",
          listingUrl: "https://example.com/listings/madero-220",
          capacity: "12",
        },
      },
      etag: "mock-2",
    },
    {
      id: "mock-showing-garden",
      status: "confirmed",
      summary: "[ABIERTA] Garden home in Belgrano R",
      location: "Melián 1844, Belgrano R",
      description: `PUBLIC_SHOWING
Notes: Outdoor areas are included in the tour.
END_PUBLIC_SHOWING`,
      start: { dateTime: futureDate(6, 15), timeZone: timezone },
      end: { dateTime: futureDate(6, 16), timeZone: timezone },
      extendedProperties: {
        private: {
          eventType: "property_showing",
          registrationEnabled: "true",
          propertyId: "belgrano-44",
          propertyAddress: "Melián 1844, Belgrano R",
          publicShowingNotes: "Outdoor areas are included in the tour.",
        },
      },
      etag: "mock-3",
    },
    {
      id: "mock-private-meeting",
      status: "confirmed",
      summary: "Private medical appointment",
      description: "Sensitive private information",
      start: { dateTime: futureDate(2, 12), timeZone: timezone },
      end: { dateTime: futureDate(2, 13), timeZone: timezone },
      extendedProperties: { private: {} },
    },
    {
      id: "mock-disabled-showing",
      status: "confirmed",
      summary: "[CERRADA] Disabled registration",
      start: { dateTime: futureDate(2, 17), timeZone: timezone },
      end: { dateTime: futureDate(2, 18), timeZone: timezone },
      extendedProperties: {
        private: {
          eventType: "property_showing",
          registrationEnabled: "false",
        },
      },
    },
    {
      id: "mock-cancelled-showing",
      status: "cancelled",
      summary: "[ABIERTA] Cancelled showing",
      start: { dateTime: futureDate(2, 19), timeZone: timezone },
      end: { dateTime: futureDate(2, 20), timeZone: timezone },
      extendedProperties: {
        private: { eventType: "property_showing", registrationEnabled: "true" },
      },
    },
    {
      id: "mock-past-showing",
      status: "confirmed",
      summary: "[ABIERTA] Past showing",
      start: {
        dateTime: new Date(Date.now() - DAY).toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: new Date(Date.now() - DAY + 60 * 60 * 1000).toISOString(),
        timeZone: timezone,
      },
      extendedProperties: {
        private: { eventType: "property_showing", registrationEnabled: "true" },
      },
    },
  ];
  return events;
}

function ensureSeeded(): void {
  if (mockStore.size) return;
  for (const event of seedEvents())
    mockStore.set(event.id, structuredClone(event));
}

export class MockCalendarProvider implements CalendarProvider {
  async listUpcomingEvents(): Promise<CalendarEvent[]> {
    ensureSeeded();
    return [...mockStore.values()].map((event) => structuredClone(event));
  }

  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    ensureSeeded();
    const event = mockStore.get(eventId);
    return event ? structuredClone(event) : null;
  }

  async updateManagedFields(
    eventId: string,
    input: {
      description: string;
      privateExtendedProperties: Record<string, string>;
    },
  ): Promise<void> {
    ensureSeeded();
    const event = mockStore.get(eventId);
    if (!event) throw new Error("Mock calendar event not found");
    event.description = input.description;
    event.extendedProperties = {
      private: {
        ...event.extendedProperties?.private,
        ...input.privateExtendedProperties,
      },
    };
    event.etag = `mock-${Date.now()}`;
  }

  async updateShowingAvailability(
    eventId: string,
    input: {
      summary: string;
      privateExtendedProperties: Record<string, string>;
    },
  ): Promise<void> {
    ensureSeeded();
    const event = mockStore.get(eventId);
    if (!event) throw new Error("Mock calendar event not found");
    event.summary = input.summary;
    event.extendedProperties = {
      private: { ...input.privateExtendedProperties },
    };
    event.etag = `mock-${Date.now()}`;
  }
}

export function resetMockCalendar(): void {
  mockStore.clear();
}
