import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { authenticateAdmin } from "@/lib/security/admin";
import { getInvitationForAdmin } from "@/services/admin-invitation.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    authenticateAdmin(request);
    const { id } = await context.params;
    return NextResponse.json(await getInvitationForAdmin(id));
  } catch (error: unknown) {
    return jsonError(error);
  }
}
