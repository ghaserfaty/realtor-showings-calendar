import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { googleOAuthStartSchema } from "@/lib/validation/realtor";
import { startGoogleOAuth } from "@/services/google-oauth.service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    enforceRateLimit(`google-oauth:${realtor.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const input = googleOAuthStartSchema.parse(await request.json());
    return NextResponse.json(await startGoogleOAuth(realtor.id, input));
  } catch (error: unknown) {
    return jsonError(error);
  }
}
