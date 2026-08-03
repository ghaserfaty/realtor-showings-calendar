import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticatePlatformAdmin } from "@/lib/security/admin";
import { deleteInvitationForSupport } from "@/services/platform-support.service";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; invitationId: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    authenticatePlatformAdmin(request);
    const { id, invitationId } = await context.params;
    return NextResponse.json(
      await deleteInvitationForSupport(id, invitationId),
    );
  } catch (error: unknown) {
    return jsonError(error);
  }
}
