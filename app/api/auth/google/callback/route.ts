import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  REALTOR_SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/security/realtor-session";
import {
  completeGoogleOAuth,
  discardGoogleOAuthAttempt,
} from "@/services/google-oauth.service";

function resultRedirect(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, getConfig().APP_URL));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (request.nextUrl.searchParams.has("error")) {
    await discardGoogleOAuthAttempt(state).catch(() => undefined);
    return resultRedirect("/?auth=denied");
  }
  try {
    const session = await completeGoogleOAuth(
      state,
      request.nextUrl.searchParams.get("code") ?? "",
    );
    const response = resultRedirect("/realtor/dashboard");
    response.cookies.set(
      REALTOR_SESSION_COOKIE,
      session.sessionToken,
      sessionCookieOptions(session.sessionExpiresAt),
    );
    return response;
  } catch (error: unknown) {
    logger.warn("Google OAuth callback failed", {
      errorCode: isAppError(error)
        ? error.code
        : "GOOGLE_OAUTH_CALLBACK_FAILED",
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return resultRedirect("/?auth=error");
  }
}
