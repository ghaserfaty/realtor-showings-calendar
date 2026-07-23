import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { invitationService } from "@/services/invitation.service";
import { getShowingService } from "@/services/showing.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    const showingService = await getShowingService(invitation.realtorId);
    const showings = await showingService.listForInvitation(invitation.id);
    return NextResponse.json({ showings });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
