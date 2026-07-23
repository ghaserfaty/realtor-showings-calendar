import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  completeGoogleOAuth,
  discardGoogleOAuthAttempt,
} from "@/services/google-oauth.service";

function resultRedirect(status: "success" | "error"): NextResponse {
  const target = new URL("/admin/connect-calendar", getConfig().APP_URL);
  target.searchParams.set("status", status);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (request.nextUrl.searchParams.has("error")) {
    await discardGoogleOAuthAttempt(state).catch(() => undefined);
    return resultRedirect("error");
  }
  try {
    await completeGoogleOAuth(
      state,
      request.nextUrl.searchParams.get("code") ?? "",
    );
    return resultRedirect("success");
  } catch (error: unknown) {
    logger.warn("Google OAuth callback failed", {
      errorCode: isAppError(error)
        ? error.code
        : "GOOGLE_OAUTH_CALLBACK_FAILED",
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return resultRedirect("error");
  }
}
