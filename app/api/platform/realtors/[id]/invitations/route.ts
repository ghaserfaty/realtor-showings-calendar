import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { authenticatePlatformAdmin } from "@/lib/security/admin";
import { listSupportInvitations } from "@/services/platform-support.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    authenticatePlatformAdmin(request);
    const { id } = await context.params;
    return NextResponse.json(await listSupportInvitations(id));
  } catch (error: unknown) {
    return jsonError(error);
  }
}
