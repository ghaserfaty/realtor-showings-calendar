CREATE TABLE "GoogleOAuthAttempt" (
  "id" TEXT NOT NULL,
  "realtorId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "encryptedClientId" TEXT NOT NULL,
  "encryptedClientSecret" TEXT NOT NULL,
  "encryptedCalendarId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleOAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleOAuthAttempt_stateHash_key"
ON "GoogleOAuthAttempt"("stateHash");

CREATE INDEX "GoogleOAuthAttempt_realtorId_expiresAt_idx"
ON "GoogleOAuthAttempt"("realtorId", "expiresAt");

ALTER TABLE "GoogleOAuthAttempt"
ADD CONSTRAINT "GoogleOAuthAttempt_realtorId_fkey"
FOREIGN KEY ("realtorId") REFERENCES "Realtor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
