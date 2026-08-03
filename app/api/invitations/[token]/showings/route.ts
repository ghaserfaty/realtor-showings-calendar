import { NextRequest, NextResponse } from "next/server";
import { clientIp, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { invitationService } from "@/services/invitation.service";
import { getShowingService } from "@/services/showing.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const ip = clientIp(request);
    await enforceRateLimit(`showings-read-ip:${ip}`, {
      limit: 60,
      windowMs: 5 * 60 * 1000,
    });
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    await enforceRateLimit(`showings-read:${invitation.id}`, {
      limit: 120,
      windowMs: 5 * 60 * 1000,
    });
    const showingService = await getShowingService(invitation.realtorId);
    const showings = await showingService.listForInvitation(invitation.id);
    return NextResponse.json({ showings });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
