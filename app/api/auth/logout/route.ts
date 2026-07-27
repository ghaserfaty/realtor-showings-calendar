import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { assertSameOrigin } from "@/lib/http";
import {
  destroyRealtorSession,
  findRealtorBySessionToken,
  REALTOR_SESSION_COOKIE,
} from "@/lib/security/realtor-session";
import { audit } from "@/services/audit.service";

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    new URL("/", getConfig().APP_URL),
    303,
  );
  response.cookies.set(REALTOR_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
