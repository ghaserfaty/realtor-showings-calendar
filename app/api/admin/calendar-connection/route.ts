import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { calendarConnectionSchema } from "@/lib/validation/realtor";
import {
  getCalendarConnectionStatus,
  setCalendarConnection,
} from "@/services/realtor.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const realtor = await authenticateRealtor(request);
    return NextResponse.json(await getCalendarConnectionStatus(realtor.id));
  } catch (error: unknown) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    const input = calendarConnectionSchema.parse(await request.json());
    return NextResponse.json(await setCalendarConnection(realtor.id, input));
  } catch (error: unknown) {
    return jsonError(error);
  }
}
