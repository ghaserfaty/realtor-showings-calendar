import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, clientIp, jsonError } from "@/lib/http";
import { invitationService } from "@/services/invitation.service";
import { cancelRegistration } from "@/services/registration.service";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ token: string; eventId: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    if (!getConfig().ALLOW_REGISTRATION_CANCELLATION) {
      throw new AppError(
        "CANCELLATION_DISABLED",
        "Online cancellation is not available.",
        403,
      );
    }
    const { token, eventId } = await context.params;
    const invitation = await invitationService.validateToken(token, false);
    const registration = await cancelRegistration(
      invitation,
      eventId,
      clientIp(request),
    );
    return NextResponse.json({ registration });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
