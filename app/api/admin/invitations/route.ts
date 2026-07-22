import { NextRequest, NextResponse } from "next/server";
import { jsonError, assertSameOrigin } from "@/lib/http";
import { authenticateAdmin } from "@/lib/security/admin";
import { createInvitationSchema } from "@/lib/validation/invitation";
import { createInvitation } from "@/services/admin-invitation.service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    authenticateAdmin(request);
    const input = createInvitationSchema.parse(await request.json());
    return NextResponse.json(await createInvitation(input), { status: 201 });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
