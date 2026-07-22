import type { VerificationCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  evaluateOtp,
  hashVerificationCode,
} from "@/services/verification.service";

const now = new Date("2026-07-20T12:00:00.000Z");
const correctHash = hashVerificationCode(
  "inv-1",
  "123456",
  "a-test-pepper-at-least-thirty-two-characters",
);

function record(overrides: Partial<VerificationCode> = {}): VerificationCode {
  return {
    id: "otp-1",
    invitationId: "inv-1",
    codeHash: correctHash,
    expiresAt: new Date("2026-07-20T12:10:00.000Z"),
    usedAt: null,
    attempts: 0,
    maxAttempts: 5,
    requestedIp: null,
    createdAt: now,
    ...overrides,
  };
}

describe("OTP evaluation", () => {
  it("accepts the matching hashed code", () => {
    expect(evaluateOtp(record(), correctHash, now)).toBe("VALID");
  });

  it("rejects an expired code", () => {
    expect(
      evaluateOtp(
        record({ expiresAt: new Date("2026-07-20T11:59:59.000Z") }),
        correctHash,
        now,
      ),
    ).toBe("EXPIRED");
  });

  it("rejects a code after its attempt limit", () => {
    expect(evaluateOtp(record({ attempts: 5 }), correctHash, now)).toBe(
      "ATTEMPTS_EXCEEDED",
    );
  });

  it("rejects reuse after the code is consumed", () => {
    expect(
      evaluateOtp(
        record({ usedAt: new Date("2026-07-20T12:01:00.000Z") }),
        correctHash,
        now,
      ),
    ).toBe("USED");
  });

  it("rejects a non-matching candidate hash", () => {
    const wrongHash = hashVerificationCode(
      "inv-1",
      "654321",
      "a-test-pepper-at-least-thirty-two-characters",
    );
    expect(evaluateOtp(record(), wrongHash, now)).toBe("INVALID");
  });
});
