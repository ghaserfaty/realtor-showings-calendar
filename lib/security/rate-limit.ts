import { AppError } from "@/lib/errors";

type Bucket = { count: number; resetsAt: number };
const buckets = new Map<string, Bucket>();

export function enforceRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
): void {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + options.windowMs });
    return;
  }
  if (bucket.count >= options.limit) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please try again later.",
      429,
    );
  }
  bucket.count += 1;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
