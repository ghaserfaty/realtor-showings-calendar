import type { Metadata } from "next";
import { InviteExperience } from "@/components/invite/InviteExperience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose your showings",
  description: "Review and select private group property showing times.",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteExperience token={token} />;
}
