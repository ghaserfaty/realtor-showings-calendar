import { NextRequest, NextResponse } from "next/server";
import type { PublicInvitationDto } from "@/lib/dto";
import { clientIp, jsonError } from "@/lib/http";
import { maskEmail } from "@/lib/security/crypto";
import { audit } from "@/services/audit.service";
import { invitationService } from "@/services/invitation.service";
import {
  attachSessionCookie,
  createInvitationSession,
  getInvitationSession,
} from "@/services/session.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token);
    let session = await getInvitationSession(request, invitation.id);
    let plainSessionToken: string | undefined;
    if (!session) {
      plainSessionToken = await createInvitationSession(
        invitation.id,
        !invitation.verificationRequired,
      );
      session = null;
    }
    const verified =
      !invitation.verificationRequired || Boolean(session?.verifiedEmailAt);
    const dto: PublicInvitationDto = {
      invitedName: invitation.invitedName ?? undefined,
      invitedEmail: verified ? invitation.invitedEmail : undefined,
      invitedPhone: verified
        ? (invitation.invitedPhone ?? undefined)
        : undefined,
      maskedEmail: maskEmail(invitation.invitedEmail),
      expiresAt: invitation.expiresAt.toISOString(),
      verificationRequired: invitation.verificationRequired,
      verified,
    };
    const response = NextResponse.json(dto);
    if (plainSessionToken) attachSessionCookie(response, plainSessionToken);
    await audit({
      action: "INVITATION_ACCESSED",
      invitationId: invitation.id,
      actorType: "INVITEE",
      actorId: invitation.id,
      ip: clientIp(request),
    });
    return response;
  } catch (error: unknown) {
    return jsonError(error);
  }
}
