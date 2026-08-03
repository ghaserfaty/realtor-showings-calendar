import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { authenticateRealtor } from "@/lib/security/admin";
import { getShowingService } from "@/services/showing.service";

const availabilitySchema = z.object({ open: z.boolean() });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    const { eventId } = await context.params;
    const { open } = availabilitySchema.parse(await request.json());
    const service = await getShowingService(realtor.id);
    await service.setAvailability(eventId, open);
    return NextResponse.json({
      updated: true,
      availability: open ? "open" : "closed",
    });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
