import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, deleteMany } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ SESSION_SECRET: "s".repeat(32) }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
    rateLimitBucket: { deleteMany },
  },
}));

import {
  enforceRateLimit,
  resetRateLimitsForTests,
} from "@/lib/security/rate-limit";

describe("distributed rate limiter", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    deleteMany.mockReset();
  });

  it("allows requests up to the count returned atomically by PostgreSQL", async () => {
    queryRaw.mockResolvedValue([
      { count: 2, resetsAt: new Date("2026-08-03T12:15:00.000Z") },
    ]);

    await expect(
      enforceRateLimit(
        "showings-read-ip:203.0.113.10",
        { limit: 2, windowMs: 60_000 },
        Date.parse("2026-08-03T12:00:00.000Z"),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects the first request over the shared database limit", async () => {
    queryRaw.mockResolvedValue([
      { count: 3, resetsAt: new Date("2026-08-03T12:15:00.000Z") },
    ]);

    await expect(
      enforceRateLimit("registration-ip:203.0.113.10", {
        limit: 2,
        windowMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("hashes identifiers before sending the bucket key to PostgreSQL", async () => {
    queryRaw.mockResolvedValue([
      { count: 1, resetsAt: new Date("2026-08-03T12:15:00.000Z") },
    ]);
    const rawKey = "showings-read-ip:203.0.113.10";

    await enforceRateLimit(rawKey, { limit: 2, windowMs: 60_000 });

    const values = queryRaw.mock.calls[0]?.slice(1) ?? [];
    expect(values).not.toContain(rawKey);
    expect(values).toContainEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it("can clear persisted buckets in test environments", async () => {
    deleteMany.mockResolvedValue({ count: 2 });
    await resetRateLimitsForTests();
    expect(deleteMany).toHaveBeenCalledOnce();
  });
});
