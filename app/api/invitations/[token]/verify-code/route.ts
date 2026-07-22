import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, clientIp, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { verificationCodeSchema } from "@/lib/validation/invitation";
import { audit } from "@/services/audit.service";
import { invitationService } from "@/services/invitation.service";
import {
  attachSessionCookie,
  createInvitationSession,
} from "@/services/session.service";
import { verifyCode } from "@/services/verification.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ip = clientIp(request);
  let invitationId: string | undefined;
  try {
    assertSameOrigin(request);
    enforceRateLimit(`otp-verify:${ip}`, {
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    invitationId = invitation.id;
    const input = verificationCodeSchema.parse(await request.json());
    await verifyCode(invitation.id, input.code);
    const sessionToken = await createInvitationSession(invitation.id, true);
    const response = NextResponse.json({ verified: true });
    attachSessionCookie(response, sessionToken);
    await audit({
      action: "VERIFICATION_SUCCEEDED",
      invitationId: invitation.id,
      actorType: "INVITEE",
      actorId: invitation.id,
      ip,
    });
    return response;
  } catch (error: unknown) {
    if (invitationId) {
      await audit({
        action: "VERIFICATION_FAILED",
        invitationId,
        actorType: "INVITEE",
        actorId: invitationId,
        ip,
      }).catch(() => undefined);
    }
    return jsonError(error);
  }
}
