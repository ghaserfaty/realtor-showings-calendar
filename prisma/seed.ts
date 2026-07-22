import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

function token(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main() {
  const realtor = await prisma.realtor.upsert({
    where: { email: "realtor@example.test" },
    update: {},
    create: {
      email: "realtor@example.test",
      displayName: "Alex Morgan",
      calendarOwnerReference: process.env.GOOGLE_CALENDAR_ID ?? "primary",
    },
  });

  await prisma.registration.deleteMany({
    where: { invitation: { invitedEmail: { endsWith: "@example.test" } } },
  });
  await prisma.invitation.deleteMany({
    where: { invitedEmail: { endsWith: "@example.test" } },
  });

  const validToken = token();
  const expiredToken = token();

  const valid = await prisma.invitation.create({
    data: {
      tokenHash: hash(validToken),
      invitedEmail: "jane.buyer@example.test",
      invitedName: "Jane Buyer",
      invitedPhone: "+1 555 123 4567",
      realtorId: realtor.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      verificationRequired: false,
    },
  });

  await prisma.invitation.create({
    data: {
      tokenHash: hash(expiredToken),
      invitedEmail: "expired@example.test",
      invitedName: "Expired Guest",
      realtorId: realtor.id,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  await prisma.registration.create({
    data: {
      invitationId: valid.id,
      calendarEventId: "mock-showing-selected",
      fullName: "Jane Buyer",
      email: "jane.buyer@example.test",
      phone: "+1 555 123 4567",
      notes: "Interested in a sunny two-bedroom.",
      calendarSyncStatus: "SYNCED",
    },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  console.info(
    "Local seed complete. Plain tokens are printed only by this development seed.",
  );
  console.info(`Valid invitation: ${appUrl}/invite/${validToken}`);
  console.info(`Expired invitation: ${appUrl}/invite/${expiredToken}`);
  console.info(
    "Mock showing IDs: mock-showing-selected, mock-showing-riverside, mock-showing-garden",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
