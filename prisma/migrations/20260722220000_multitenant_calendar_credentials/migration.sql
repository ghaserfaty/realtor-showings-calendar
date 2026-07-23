CREATE TYPE "CalendarProviderType" AS ENUM ('MOCK', 'GOOGLE');

ALTER TABLE "Realtor"
ADD COLUMN "adminApiKeyHash" TEXT,
ADD COLUMN "calendarProvider" "CalendarProviderType" NOT NULL DEFAULT 'MOCK';

CREATE UNIQUE INDEX "Realtor_adminApiKeyHash_key" ON "Realtor"("adminApiKeyHash");

CREATE TABLE "GoogleCalendarConnection" (
  "realtorId" TEXT NOT NULL,
  "encryptedClientId" TEXT NOT NULL,
  "encryptedClientSecret" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "encryptedCalendarId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("realtorId")
);

ALTER TABLE "GoogleCalendarConnection"
ADD CONSTRAINT "GoogleCalendarConnection_realtorId_fkey"
FOREIGN KEY ("realtorId") REFERENCES "Realtor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "InvitationSession";
DROP TABLE "VerificationCode";

ALTER TABLE "Invitation" DROP COLUMN "verificationRequired";
ALTER TABLE "Realtor" DROP COLUMN "calendarOwnerReference";
