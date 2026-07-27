import { describe, expect, it } from "vitest";
import {
  createInvitationSchema,
  registrationSchema,
} from "@/lib/validation/invitation";

describe("lead email validation", () => {
  it("allows an invitation without an email address", () => {
    const result = createInvitationSchema.parse({
      invitedName: "Jane Buyer",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(result.invitedEmail).toBeUndefined();
  });

  it("allows a registration without an email address", () => {
    const result = registrationSchema.parse({
      eventIds: ["showing-1"],
      eventVersions: { "showing-1": "a".repeat(64) },
      fullName: "Jane Buyer",
      phone: "+54 11 5555 5555",
    });

    expect(result.email).toBeUndefined();
  });

  it("normalizes a supplied lead email address", () => {
    const result = createInvitationSchema.parse({
      invitedEmail: "BUYER@EXAMPLE.COM",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(result.invitedEmail).toBe("buyer@example.com");
  });
});
