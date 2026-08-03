import "server-only";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hmacSha256 } from "@/lib/security/crypto";

type RateLimitResult = { count: number; resetsAt: Date };

export async function enforceRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
): Promise<void> {
  if (options.limit < 1 || options.windowMs < 1) {
    throw new Error("Rate limit options must be positive integers.");
  }

  // HMAC prevents raw IP addresses and invitation tokens from being stored.
  const keyHash = hmacSha256(key, getConfig().SESSION_SECRET);
  const checkedAt = new Date(now);
  const nextReset = new Date(now + options.windowMs);
  const retentionCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const [bucket] = await prisma.$queryRaw<RateLimitResult[]>`
    WITH cleanup AS (
      DELETE FROM "RateLimitBucket"
      WHERE "resetsAt" < ${retentionCutoff}
    )
    INSERT INTO "RateLimitBucket" ("keyHash", "count", "resetsAt", "updatedAt")
    VALUES (${keyHash}, 1, ${nextReset}, ${checkedAt})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetsAt" <= ${checkedAt} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetsAt" = CASE
        WHEN "RateLimitBucket"."resetsAt" <= ${checkedAt} THEN ${nextReset}
        ELSE "RateLimitBucket"."resetsAt"
      END,
      "updatedAt" = ${checkedAt}
    RETURNING "count", "resetsAt"
  `;

  if (!bucket) throw new Error("Rate limit bucket could not be updated.");
  if (bucket.count > options.limit) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please try again later.",
      429,
    );
  }
}

export async function resetRateLimitsForTests(): Promise<void> {
  await prisma.rateLimitBucket.deleteMany();
}
