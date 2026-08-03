import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SupportDashboard } from "@/components/support/SupportDashboard";
import { SupportLogin } from "@/components/support/SupportLogin";
import {
  isValidPlatformSession,
  PLATFORM_SESSION_COOKIE,
} from "@/lib/security/platform-session";
import { listSupportRealtors } from "@/services/platform-support.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform admin",
  description: "Private multi-tenant administration operations.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PlatformAdminPage() {
  const cookieStore = await cookies();
  const authenticated = isValidPlatformSession(
    cookieStore.get(PLATFORM_SESSION_COOKIE)?.value ?? "",
  );
  if (!authenticated) return <SupportLogin />;
  return <SupportDashboard initialRealtors={await listSupportRealtors()} />;
}
