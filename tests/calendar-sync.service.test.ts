import type { RegistrationRecord } from "@/repositories/registration.repository";
import { describe, expect, it } from "vitest";
import {
  rebuildManagedDescription,
  REGISTRATION_END,
  REGISTRATION_START,
} from "@/services/calendar-sync.service";

function registration(
  overrides: Partial<RegistrationRecord> = {},
): RegistrationRecord {
  const time = new Date("2026-07-20T18:32:11.000Z");
  return {
    id: "reg_123",
    invitationId: "inv_123",
    calendarEventId: "event_123",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+1 555 123 4567",
    notes: "Interested in a two-bedroom unit",
    status: "CONFIRMED",
    registeredAt: time,
    cancelledAt: null,
    calendarSyncStatus: "PENDING",
    calendarSyncError: null,
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}

describe("managed Calendar description block", () => {
  it("preserves all realtor-authored text", () => {
    const result = rebuildManagedDescription(
      "Seller asks visitors to remove shoes.",
      [registration()],
    );
    expect(result).toContain("Seller asks visitors to remove shoes.");
    expect(result).toContain("Registration ID: reg_123");
  });

  it("rebuilds deterministically instead of appending duplicate entries", () => {
    const first = rebuildManagedDescription("Original", [registration()]);
    const second = rebuildManagedDescription(first, [registration()]);
    expect(second).toBe(first);
    expect(second.split("Registration ID: reg_123")).toHaveLength(2);
    expect(second.split(REGISTRATION_START)).toHaveLength(2);
    expect(second.split(REGISTRATION_END)).toHaveLength(2);
  });

  it("removes the managed block when no active registrations remain", () => {
    const current = rebuildManagedDescription("Original", [registration()]);
    expect(rebuildManagedDescription(current, [])).toBe("Original");
  });
});
