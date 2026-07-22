import { NextRequest, NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security/headers";

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  for (const [key, configuredValue] of Object.entries(securityHeaders)) {
    const value =
      key === "Content-Security-Policy" &&
      process.env.NODE_ENV === "development"
        ? configuredValue.replace(
            "script-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          )
        : configuredValue;
    response.headers.set(key, value);
  }
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (request.nextUrl.pathname.startsWith("/invite/")) {
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
