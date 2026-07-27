import { NextRequest, NextResponse } from "next/server";
import { jsonError, assertSameOrigin } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { createInvitationSchema } from "@/lib/validation/invitation";
import {
  createInvitation,
  listInvitationsForAdmin,
} from "@/services/admin-invitation.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const realtor = await authenticateRealtor(request);
    return NextResponse.json({
      invitations: await listInvitationsForAdmin(realtor.id),
    });
  } catch (error: unknown) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    const input = createInvitationSchema.parse(await request.json());
    return NextResponse.json(await createInvitation(realtor.id, input), {
      status: 201,
    });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
