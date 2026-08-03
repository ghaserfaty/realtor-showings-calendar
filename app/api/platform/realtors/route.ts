import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticatePlatformAdmin } from "@/lib/security/admin";
import { createRealtorSchema } from "@/lib/validation/realtor";
import { createRealtor } from "@/services/realtor.service";
import { listSupportRealtors } from "@/services/platform-support.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    authenticatePlatformAdmin(request);
    return NextResponse.json({ realtors: await listSupportRealtors() });
  } catch (error: unknown) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    authenticatePlatformAdmin(request);
    const input = createRealtorSchema.parse(await request.json());
    return NextResponse.json(await createRealtor(input), { status: 201 });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
