import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { listWritableCalendars } from "@/services/realtor.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const realtor = await authenticateRealtor(request);
    return NextResponse.json({
      calendars: await listWritableCalendars(realtor.id),
    });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
