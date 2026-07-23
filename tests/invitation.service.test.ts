import type { Invitation } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/security/crypto";
import { InvitationService } from "@/services/invitation.service";
import type { InvitationLookupRepository } from "@/repositories/invitation.repository";

const now = new Date("2026-07-20T12:00:00.000Z");
const plainToken = "abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890";

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invitation-1",
    tokenHash: sha256(plainToken),
    invitedEmail: "buyer@example.test",
    invitedName: "Buyer",
    invitedPhone: null,
    realtorId: "realtor-1",
    expiresAt: new Date("2026-07-21T12:00:00.000Z"),
    revokedAt: null,
    maxSubmissions: null,
    createdAt: now,
    lastAccessedAt: null,
    ...overrides,
  };
}

function repository(
  value: Invitation | null,
  used = 0,
): InvitationLookupRepository {
  return {
    findByTokenHash: async (hash) => (value?.tokenHash === hash ? value : null),
    countConfirmedRegistrations: async () => used,
    touch: async () => undefined,
  };
}

describe("InvitationService", () => {
  it("accepts a valid opaque token found by its SHA-256 hash", async () => {
    const service = new InvitationService(repository(invitation()), () => now);
    await expect(service.validateToken(plainToken)).resolves.toMatchObject({
      id: "invitation-1",
    });
  });

  it("rejects an invalid token with a generic response", async () => {
    const service = new InvitationService(repository(null), () => now);
    await expect(
      service.validateToken("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"),
    ).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
  });

  it("rejects an expired invitation", async () => {
    const service = new InvitationService(
      repository(
        invitation({ expiresAt: new Date("2026-07-19T12:00:00.000Z") }),
      ),
      () => now,
    );
    await expect(service.validateToken(plainToken)).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
  });

  it("rejects a revoked invitation", async () => {
    const service = new InvitationService(
      repository(invitation({ revokedAt: now })),
      () => now,
    );
    await expect(service.validateToken(plainToken)).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
  });

  it("rejects an invitation whose configured selection limit is exhausted", async () => {
    const service = new InvitationService(
      repository(invitation({ maxSubmissions: 1 }), 1),
      () => now,
    );
    await expect(service.validateToken(plainToken)).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
  });
});
