import { NextRequest, NextResponse } from "next/server";
import type { PublicInvitationDto } from "@/lib/dto";
import { clientIp, jsonError } from "@/lib/http";
import { audit } from "@/services/audit.service";
import { invitationService } from "@/services/invitation.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token);
    const dto: PublicInvitationDto = {
      invitedName: invitation.invitedName ?? undefined,
      invitedEmail: invitation.invitedEmail ?? undefined,
      invitedPhone: invitation.invitedPhone ?? undefined,
      expiresAt: invitation.expiresAt.toISOString(),
    };
    await audit({
      action: "INVITATION_ACCESSED",
      invitationId: invitation.id,
      actorType: "INVITEE",
      actorId: invitation.id,
      ip: clientIp(request),
    });
    return NextResponse.json(dto);
  } catch (error: unknown) {
    return jsonError(error);
  }
}
