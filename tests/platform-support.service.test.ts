import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  deleteMany: vi.fn(),
  deleteInvitation: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
  syncEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invitation: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/services/calendar-sync.service", () => ({
  getCalendarSyncService: async () => ({ syncEvent: mocks.syncEvent }),
}));
vi.mock("@/services/admin-invitation.service", () => ({
  listInvitationsForAdmin: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { deleteInvitationForSupport } from "@/services/platform-support.service";

describe("platform support invitation deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: "invitation-1",
      registrations: [
        { calendarEventId: "event-1" },
        { calendarEventId: "event-1" },
        { calendarEventId: "event-2" },
      ],
    });
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    mocks.transaction.mockImplementation(
      async (operation: (transaction: unknown) => Promise<void>) =>
        operation({
          registration: { deleteMany: mocks.deleteMany },
          invitation: { delete: mocks.deleteInvitation },
          auditLog: { create: mocks.createAudit },
        }),
    );
  });

  it("scopes deletion to a tenant, deletes dependencies, audits, and resyncs unique events", async () => {
    const result = await deleteInvitationForSupport(
      "realtor-1",
      "invitation-1",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invitation-1", realtorId: "realtor-1" },
      }),
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { invitationId: "invitation-1" },
    });
    expect(mocks.deleteInvitation).toHaveBeenCalledWith({
      where: { id: "invitation-1" },
    });
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "INVITATION_DELETED" }),
      }),
    );
    expect(mocks.syncEvent).toHaveBeenCalledTimes(2);
    expect(mocks.syncEvent).toHaveBeenCalledWith("event-1");
    expect(mocks.syncEvent).toHaveBeenCalledWith("event-2");
    expect(result).toEqual({ deleted: true, deletedRegistrationCount: 3 });
  });
});
