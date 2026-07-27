import type { Invitation } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRegistration = {
  id: string;
  invitationId: string;
  calendarEventId: string;
  fullName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  status: "CONFIRMED" | "CANCELLED";
  registeredAt: Date;
  cancelledAt: Date | null;
  calendarSyncStatus: "PENDING" | "SYNCED" | "ERROR";
  calendarSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const { state, key, fakeRegistrationApi } = vi.hoisted(() => {
  const localState = {
    records: new Map<string, FakeRegistration>(),
    sequence: 0,
    syncShouldFail: false,
  };
  const localKey = (invitationId: string, eventId: string) =>
    `${invitationId}:${eventId}`;
  const api = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      let values = [...localState.records.values()];
      if (typeof where.invitationId === "string") {
        values = values.filter(
          (value) => value.invitationId === where.invitationId,
        );
      }
      const eventCondition = where.calendarEventId as
        | { in?: string[] }
        | string
        | undefined;
      if (typeof eventCondition === "string") {
        values = values.filter(
          (value) => value.calendarEventId === eventCondition,
        );
      } else if (eventCondition?.in) {
        values = values.filter((value) =>
          eventCondition.in?.includes(value.calendarEventId),
        );
      }
      return values;
    },
    count: async ({ where }: { where: Record<string, unknown> }) =>
      [...localState.records.values()].filter(
        (value) =>
          (!where.invitationId || value.invitationId === where.invitationId) &&
          (!where.status || value.status === where.status),
      ).length,
    findUnique: async ({
      where,
    }: {
      where: {
        id?: string;
        invitationId_calendarEventId?: {
          invitationId: string;
          calendarEventId: string;
        };
      };
    }) => {
      if (where.id) {
        return (
          [...localState.records.values()].find(
            (value) => value.id === where.id,
          ) ?? null
        );
      }
      const composite = where.invitationId_calendarEventId;
      return composite
        ? (localState.records.get(
            localKey(composite.invitationId, composite.calendarEventId),
          ) ?? null)
        : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date("2026-07-20T18:32:11.000Z");
      localState.sequence += 1;
      const value: FakeRegistration = {
        id: `reg-${localState.sequence}`,
        invitationId: String(data.invitationId),
        calendarEventId: String(data.calendarEventId),
        fullName: String(data.fullName),
        email: data.email ? String(data.email) : null,
        phone: String(data.phone),
        notes: data.notes ? String(data.notes) : null,
        status: "CONFIRMED",
        registeredAt: now,
        cancelledAt: null,
        calendarSyncStatus: "PENDING",
        calendarSyncError: null,
        createdAt: now,
        updatedAt: now,
      };
      localState.records.set(
        localKey(value.invitationId, value.calendarEventId),
        value,
      );
      return value;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const current = [...localState.records.values()].find(
        (value) => value.id === where.id,
      );
      if (!current) throw new Error("missing fake registration");
      const next = { ...current } as FakeRegistration;
      for (const [field, value] of Object.entries(data)) {
        if (field in next) Object.assign(next, { [field]: value });
      }
      next.updatedAt = new Date();
      localState.records.set(
        localKey(next.invitationId, next.calendarEventId),
        next,
      );
      return next;
    },
  };
  return { state: localState, key: localKey, fakeRegistrationApi: api };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: fakeRegistrationApi,
    $transaction: async (input: unknown) => {
      if (typeof input === "function") {
        return (
          input as (transaction: {
            registration: typeof fakeRegistrationApi;
          }) => unknown
        )({
          registration: fakeRegistrationApi,
        });
      }
      return Promise.all(input as Promise<unknown>[]);
    },
  },
}));

vi.mock("@/services/showing.service", () => ({
  getShowingService: () => ({ assertSelectable: async () => ({}) }),
}));

vi.mock("@/services/audit.service", () => ({ audit: async () => undefined }));

vi.mock("@/services/calendar-sync.service", () => ({
  getCalendarSyncService: () => ({
    syncEvent: async (eventId: string) => {
      const affected = [...state.records.values()].filter(
        (record) =>
          record.calendarEventId === eventId && record.status === "CONFIRMED",
      );
      for (const record of affected) {
        record.calendarSyncStatus = state.syncShouldFail ? "ERROR" : "SYNCED";
        record.calendarSyncError = state.syncShouldFail
          ? "Temporary Google API failure"
          : null;
      }
      if (state.syncShouldFail) throw new Error("Temporary Google API failure");
    },
  }),
}));

import {
  cancelRegistration,
  registerForShowings,
} from "@/services/registration.service";

const now = new Date("2026-07-20T12:00:00.000Z");
function invitation(id: string): Invitation {
  return {
    id,
    tokenHash: `hash-${id}`,
    invitedEmail: `${id}@example.test`,
    invitedName: "Test Buyer",
    invitedPhone: null,
    realtorId: "realtor-1",
    expiresAt: new Date("2026-08-20T12:00:00.000Z"),
    revokedAt: null,
    maxSubmissions: null,
    createdAt: now,
    lastAccessedAt: null,
  };
}

const input = {
  eventIds: ["group-showing-1"],
  eventVersions: { "group-showing-1": "a".repeat(64) },
  fullName: "Test Buyer",
  email: "buyer@example.test",
  phone: "+1 555 555 5555",
  notes: "Test note",
};

describe("registration service", () => {
  beforeEach(() => {
    state.records.clear();
    state.sequence = 0;
    state.syncShouldFail = false;
  });

  it("allows multiple invitations to register for the same group showing", async () => {
    await registerForShowings(invitation("inv-1"), input);
    await registerForShowings(invitation("inv-2"), input);
    expect(state.records.size).toBe(2);
  });

  it("returns the existing registration when the same invitation retries", async () => {
    const first = await registerForShowings(invitation("inv-1"), input);
    const second = await registerForShowings(invitation("inv-1"), input);
    expect(state.records.size).toBe(1);
    expect(second[0]?.id).toBe(first[0]?.id);
  });

  it("keeps the database registration when Calendar synchronization fails", async () => {
    state.syncShouldFail = true;
    const registrations = await registerForShowings(invitation("inv-1"), input);
    expect(state.records.size).toBe(1);
    expect(registrations[0]?.calendarSyncStatus).toBe("ERROR");
  });

  it("cancels only the requesting invitation's registration", async () => {
    await registerForShowings(invitation("inv-1"), input);
    await registerForShowings(invitation("inv-2"), input);
    const cancelled = await cancelRegistration(
      invitation("inv-1"),
      "group-showing-1",
    );
    expect(cancelled.status).toBe("CANCELLED");
    expect(state.records.get(key("inv-2", "group-showing-1"))?.status).toBe(
      "CONFIRMED",
    );
  });
});
