import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { authenticateRealtor } from "@/lib/security/admin";
import { getCalendarSyncService } from "@/services/calendar-sync.service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const realtor = await authenticateRealtor(request);
    const failed = await prisma.registration.findMany({
      where: {
        calendarSyncStatus: "ERROR",
        invitation: { realtorId: realtor.id },
      },
      distinct: ["calendarEventId"],
      select: { calendarEventId: true },
      take: 100,
    });
    const syncService = await getCalendarSyncService(realtor.id);
    const results = await Promise.allSettled(
      failed.map(({ calendarEventId }) =>
        syncService.syncEvent(calendarEventId),
      ),
    );
    return NextResponse.json({
      attempted: results.length,
      succeeded: results.filter((result) => result.status === "fulfilled")
        .length,
      failed: results.filter((result) => result.status === "rejected").length,
    });
  } catch (error: unknown) {
    return jsonError(error);
  }
}
