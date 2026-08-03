import { NextRequest, NextResponse } from "next/server";
import type { PublicInvitationDto } from "@/lib/dto";
import { clientIp, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/services/audit.service";
import { invitationService } from "@/services/invitation.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const ip = clientIp(request);
    await enforceRateLimit(`invitation-read-ip:${ip}`, {
      limit: 120,
      windowMs: 15 * 60 * 1000,
    });
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token);
    await enforceRateLimit(`invitation-read:${invitation.id}`, {
      limit: 300,
      windowMs: 15 * 60 * 1000,
    });
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
      ip,
    });
    return NextResponse.json(dto);
  } catch (error: unknown) {
    return jsonError(error);
  }
}
