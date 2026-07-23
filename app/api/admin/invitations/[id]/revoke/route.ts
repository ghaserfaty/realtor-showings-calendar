import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { revokeInvitation } from "@/services/admin-invitation.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    const { id } = await context.params;
    await revokeInvitation(realtor.id, id);
    return NextResponse.json({ revoked: true });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
