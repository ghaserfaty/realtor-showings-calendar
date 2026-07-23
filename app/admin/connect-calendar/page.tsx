import type { Metadata } from "next";
import { GoogleCalendarConnect } from "@/components/admin/GoogleCalendarConnect";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect Google Calendar",
  description: "Authorize a realtor's Google Calendar connection.",
};

export default async function ConnectCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const callbackUrl = new URL(
    "/api/admin/google-oauth/callback",
    getConfig().APP_URL,
  ).toString();
  return (
    <GoogleCalendarConnect
      callbackUrl={callbackUrl}
      initialStatus={
        status === "success" || status === "error" ? status : undefined
      }
    />
  );
}
