import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, clientIp, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { registrationSchema } from "@/lib/validation/invitation";
import { invitationService } from "@/services/invitation.service";
import { registerForShowings } from "@/services/registration.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    await enforceRateLimit(`registration-ip:${ip}`, {
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    await enforceRateLimit(`registration:${invitation.id}`, {
      limit: 60,
      windowMs: 15 * 60 * 1000,
    });
    const input = registrationSchema.parse(await request.json());
    const registrations = await registerForShowings(invitation, input, ip);
    return NextResponse.json({ registrations });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
