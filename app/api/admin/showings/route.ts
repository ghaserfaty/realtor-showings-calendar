import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { getShowingService } from "@/services/showing.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const realtor = await authenticateRealtor(request);
    const service = await getShowingService(realtor.id);
    return NextResponse.json({
      showings: await service.listManageableForRealtor(),
    });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
