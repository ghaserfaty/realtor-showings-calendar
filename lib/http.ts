import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getConfig } from "@/lib/config";
import { AppError, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please check the submitted fields.",
        },
      },
      { status: 400 },
    );
  }
  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.expose
            ? error.message
            : "The request could not be completed.",
        },
      },
      { status: error.status },
    );
  }
  logger.error("Unhandled request error", {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : "unknown",
  });
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    },
    { status: 500 },
  );
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(getConfig().APP_URL).origin;
  if (origin !== expected && origin !== request.nextUrl.origin) {
    throw new AppError("CSRF_REJECTED", "Cross-origin request rejected.", 403);
  }
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}
