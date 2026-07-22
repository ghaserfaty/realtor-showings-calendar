import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticateAdmin } from "@/lib/security/admin";
import { resendInvitation } from "@/services/admin-invitation.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    authenticateAdmin(request);
    const { id } = await context.params;
    return NextResponse.json(await resendInvitation(id));
  } catch (error: unknown) {
    return jsonError(error);
  }
}
