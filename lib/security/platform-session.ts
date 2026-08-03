import "server-only";
import { getConfig } from "@/lib/config";
import { hmacSha256, secureCompare } from "@/lib/security/crypto";

export const PLATFORM_SESSION_COOKIE = "platform_admin_session";
const PLATFORM_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function createPlatformSession(now = new Date()): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date(now.getTime() + PLATFORM_SESSION_TTL_MS);
  const payload = expiresAt.getTime().toString(36);
  const signature = hmacSha256(payload, getConfig().PLATFORM_ADMIN_API_KEY);
  return { token: `${payload}.${signature}`, expiresAt };
}

export function isValidPlatformSession(
  token: string,
  now = new Date(),
): boolean {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const expiresAt = Number.parseInt(payload, 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now.getTime()) {
    return false;
  }
  return secureCompare(
    suppliedSignature,
    hmacSha256(payload, getConfig().PLATFORM_ADMIN_API_KEY),
  );
}

export function platformSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: getConfig().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function expiredPlatformSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: getConfig().NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };
}
