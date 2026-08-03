import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RealtorDashboard } from "@/components/admin/RealtorDashboard";
import {
  findRealtorBySessionToken,
  REALTOR_SESSION_COOKIE,
} from "@/lib/security/realtor-session";
import { listInvitationsForAdmin } from "@/services/admin-invitation.service";
import { getCalendarConnectionStatus } from "@/services/realtor.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Realtor dashboard",
  description: "Create and manage private showing invitations.",
  robots: { index: false, follow: false, nocache: true },
};

function defaultExpiration(): string {
  const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default async function RealtorDashboardPage() {
  const cookieStore = await cookies();
  const realtor = await findRealtorBySessionToken(
    cookieStore.get(REALTOR_SESSION_COOKIE)?.value ?? "",
  );
  if (!realtor) redirect("/?auth=required");

  const calendarStatus = await getCalendarConnectionStatus(realtor.id);
  if (!calendarStatus.configured) redirect("/?auth=calendar_required");
  const invitations = await listInvitationsForAdmin(realtor.id);
  return (
    <RealtorDashboard
      realtor={{
        email: realtor.email,
        displayName: realtor.displayName,
      }}
      initialInvitations={invitations}
      initialCalendarStatus={calendarStatus}
      defaultExpiresAt={defaultExpiration()}
    />
  );
}
