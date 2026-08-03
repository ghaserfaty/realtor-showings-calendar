import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";
import {
  createPlatformSession,
  isValidPlatformSession,
} from "@/lib/security/platform-session";

describe("platform support session", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "PLATFORM_ADMIN_API_KEY",
      "test-platform-key-that-is-long-enough",
    );
    resetConfigForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigForTests();
  });

  it("accepts a signed session before expiration", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const session = createPlatformSession(now);
    expect(
      isValidPlatformSession(
        session.token,
        new Date("2026-08-03T19:59:59.000Z"),
      ),
    ).toBe(true);
  });

  it("rejects expired and tampered sessions", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const session = createPlatformSession(now);
    expect(isValidPlatformSession(session.token, session.expiresAt)).toBe(
      false,
    );
    expect(isValidPlatformSession(`${session.token}x`, now)).toBe(false);
  });
});
