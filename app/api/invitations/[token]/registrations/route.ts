import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, clientIp, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { registrationSchema } from "@/lib/validation/invitation";
import { invitationService } from "@/services/invitation.service";
import { registerForShowings } from "@/services/registration.service";
import { requireInvitationAccess } from "@/services/session.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    enforceRateLimit(`registration:${ip}`, {
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    await requireInvitationAccess(
      request,
      invitation.id,
      invitation.verificationRequired,
    );
    const input = registrationSchema.parse(await request.json());
    const registrations = await registerForShowings(invitation, input, ip);
    return NextResponse.json({ registrations });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
