import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import {
  destroyRealtorSession,
  expiredSessionCookieOptions,
  findRealtorBySessionToken,
  REALTOR_SESSION_COOKIE,
} from "@/lib/security/realtor-session";
import { audit } from "@/services/audit.service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const token = request.cookies.get(REALTOR_SESSION_COOKIE)?.value ?? "";
    const realtor = await findRealtorBySessionToken(token);
    await destroyRealtorSession(token);
    await audit({
      action: "REALTOR_LOGOUT",
      actorType: "ADMIN",
      actorId: realtor?.id,
    }).catch(() => undefined);
    const response = NextResponse.redirect(
      new URL("/", request.nextUrl.origin),
      303,
    );
    response.cookies.set(
      REALTOR_SESSION_COOKIE,
      "",
      expiredSessionCookieOptions(),
    );
    return response;
  } catch (error: unknown) {
    return jsonError(error);
  }
}
