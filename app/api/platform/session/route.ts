import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { assertSameOrigin, clientIp, jsonError } from "@/lib/http";
import { secureCompare } from "@/lib/security/crypto";
import {
  createPlatformSession,
  expiredPlatformSessionCookieOptions,
  PLATFORM_SESSION_COOKIE,
  platformSessionCookieOptions,
} from "@/lib/security/platform-session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const loginSchema = z.object({ apiKey: z.string().min(1).max(500) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`platform-login:${clientIp(request)}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const { apiKey } = loginSchema.parse(await request.json());
    if (!secureCompare(apiKey, getConfig().PLATFORM_ADMIN_API_KEY)) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid platform key." } },
        { status: 401 },
      );
    }
    const session = createPlatformSession();
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(
      PLATFORM_SESSION_COOKIE,
      session.token,
      platformSessionCookieOptions(session.expiresAt),
    );
    return response;
  } catch (error: unknown) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ authenticated: false });
    response.cookies.set(
      PLATFORM_SESSION_COOKIE,
      "",
      expiredPlatformSessionCookieOptions(),
    );
    return response;
  } catch (error: unknown) {
    return jsonError(error);
  }
}
