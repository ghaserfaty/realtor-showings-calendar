import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { clientIp } from "@/lib/http";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { startGoogleOAuth } from "@/services/google-oauth.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await enforceRateLimit(`google-login:${clientIp(request)}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    return NextResponse.redirect(await startGoogleOAuth());
  } catch (error: unknown) {
    logger.warn("Google sign-in could not be started", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const target = new URL("/", getConfig().APP_URL);
    target.searchParams.set("auth", "unavailable");
    return NextResponse.redirect(target);
  }
}
