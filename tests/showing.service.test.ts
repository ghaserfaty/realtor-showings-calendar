import type {
  CalendarEvent,
  CalendarProvider,
} from "@/services/calendar/calendar.types";
import { describe, expect, it } from "vitest";
import {
  sanitizeShowing,
  showingSelectionVersion,
  ShowingService,
} from "@/services/showing.service";

const now = new Date("2026-07-20T12:00:00.000Z");
const config = {
  SHOWING_FILTER_MODE: "extended_property" as const,
  SHOWING_EVENT_TYPE: "property_showing",
  SHOWING_TITLE_PREFIX: "[SHOWING]",
  SHOWING_OPEN_TITLE_PREFIX: "[ABIERTA]",
  SHOWING_PUBLIC_BLOCK_START: "PUBLIC_SHOWING",
  SHOWING_PUBLIC_BLOCK_END: "END_PUBLIC_SHOWING",
};

const dedicatedConfig = {
  ...config,
  SHOWING_FILTER_MODE: "dedicated_calendar" as const,
};

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    status: "confirmed",
    summary: "Sunny two-bedroom",
    description: "Internal realtor text",
    start: { dateTime: "2026-07-21T12:00:00.000Z", timeZone: "UTC" },
    end: { dateTime: "2026-07-21T13:00:00.000Z", timeZone: "UTC" },
    extendedProperties: {
      private: {
        eventType: "property_showing",
        registrationEnabled: "true",
        propertyAddress: "123 Main St",
      },
    },
    ...overrides,
  };
}

describe("showing sanitization", () => {
  it("returns only the public DTO source fields for a valid showing", () => {
    const result = sanitizeShowing(event(), config, now);
    expect(result).toMatchObject({
      propertyTitle: "Sunny two-bedroom",
      propertyAddress: "123 Main St",
    });
    expect(result).not.toHaveProperty("description");
  });

  it("excludes unrelated calendar events", () => {
    expect(
      sanitizeShowing(
        event({
          extendedProperties: { private: { registrationEnabled: "true" } },
        }),
        config,
        now,
      ),
    ).toBeNull();
  });

  it("excludes past events", () => {
    expect(
      sanitizeShowing(
        event({
          start: { dateTime: "2026-07-19T12:00:00.000Z", timeZone: "UTC" },
        }),
        config,
        now,
      ),
    ).toBeNull();
  });

  it("excludes cancelled events", () => {
    expect(
      sanitizeShowing(event({ status: "cancelled" }), config, now),
    ).toBeNull();
  });

  it("excludes showings with registration disabled", () => {
    expect(
      sanitizeShowing(
        event({
          extendedProperties: {
            private: {
              eventType: "property_showing",
              registrationEnabled: "false",
            },
          },
        }),
        config,
        now,
      ),
    ).toBeNull();
  });

  it("uses only normal Google Calendar fields in dedicated-calendar mode", () => {
    const result = sanitizeShowing(
      event({
        summary: "[ABIERTA] Palermo two-bedroom",
        location: "Güemes 4120, Palermo",
        description: `PUBLIC_SHOWING
Listing: https://example.com/palermo
Notes: Meet in the lobby.
Capacity: 12
END_PUBLIC_SHOWING

Seller phone: this internal text must stay private.`,
        extendedProperties: undefined,
      }),
      dedicatedConfig,
      now,
    );
    expect(result).toMatchObject({
      propertyTitle: "Palermo two-bedroom",
      propertyAddress: "Güemes 4120, Palermo",
      listingUrl: "https://example.com/palermo",
      publicShowingNotes: "Meet in the lobby.",
      capacity: 12,
    });
    expect(result).not.toHaveProperty("description");
    expect(result?.publicShowingNotes).not.toContain("Seller phone");
  });

  it("parses a public block from a rich-text Google Calendar description", () => {
    const result = sanitizeShowing(
      event({
        summary: "[ABIERTA] Recoleta studio",
        location: "Arenales 1800, Recoleta",
        description:
          '<div><b>PUBLIC_SHOWING</b></div><div>Listing: <a href="https://example.com/recoleta">https://example.com/recoleta</a></div><div>Notes: Meet &amp; greet.</div><div>Capacity:&nbsp;8</div><div>END_PUBLIC_SHOWING</div><div>Private seller note.</div>',
        extendedProperties: undefined,
      }),
      dedicatedConfig,
      now,
    );

    expect(result).toMatchObject({
      listingUrl: "https://example.com/recoleta",
      publicShowingNotes: "Meet & greet.",
      capacity: 8,
    });
    expect(result?.publicShowingNotes).not.toContain("Private seller note");
  });

  it("excludes closed and unprefixed events from a dedicated calendar", () => {
    expect(
      sanitizeShowing(
        event({ summary: "[CERRADA] Palermo two-bedroom" }),
        dedicatedConfig,
        now,
      ),
    ).toBeNull();
    expect(
      sanitizeShowing(event({ summary: "Team meeting" }), dedicatedConfig, now),
    ).toBeNull();
  });

  it("rejects a stale selection when Calendar details changed", async () => {
    const original = sanitizeShowing(
      event({
        summary: "[ABIERTA] Palermo two-bedroom",
        location: "Güemes 4120, Palermo",
        extendedProperties: undefined,
      }),
      dedicatedConfig,
      now,
    );
    if (!original) throw new Error("expected a valid test showing");

    const changedEvent = event({
      summary: "[ABIERTA] Palermo two-bedroom",
      location: "Güemes 4120, Palermo",
      start: { dateTime: "2026-07-21T14:00:00.000Z", timeZone: "UTC" },
      end: { dateTime: "2026-07-21T15:00:00.000Z", timeZone: "UTC" },
      extendedProperties: undefined,
    });
    const calendar: CalendarProvider = {
      listUpcomingEvents: async () => [changedEvent],
      getEvent: async () => changedEvent,
      updateManagedFields: async () => undefined,
    };
    const counts = {
      countActiveForEvent: async () => 0,
      listForInvitation: async () => [],
    };
    const service = new ShowingService(
      "realtor-1",
      calendar,
      counts,
      () => now,
      dedicatedConfig,
    );

    await expect(
      service.assertSelectable("event-1", showingSelectionVersion(original)),
    ).rejects.toMatchObject({ code: "SHOWING_CHANGED", status: 409 });
  });
});
