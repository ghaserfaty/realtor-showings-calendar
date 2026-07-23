import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { resendInvitation } from "@/services/admin-invitation.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    const { id } = await context.params;
    return NextResponse.json(await resendInvitation(realtor.id, id));
  } catch (error: unknown) {
    return jsonError(error);
  }
}
