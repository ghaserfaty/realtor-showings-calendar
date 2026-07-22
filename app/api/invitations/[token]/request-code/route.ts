import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, clientIp, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/services/audit.service";
import { invitationService } from "@/services/invitation.service";
import { requestVerificationCode } from "@/services/verification.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    enforceRateLimit(`otp-request:${ip}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    if (invitation.verificationRequired) {
      await requestVerificationCode(invitation.id, invitation.invitedEmail, ip);
      await audit({
        action: "VERIFICATION_REQUESTED",
        invitationId: invitation.id,
        actorType: "INVITEE",
        actorId: invitation.id,
        ip,
      });
    }
    return NextResponse.json({ sent: true });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
