ALTER TABLE "Realtor"
ADD COLUMN "googleSubject" TEXT,
ADD COLUMN "avatarUrl" TEXT;

CREATE UNIQUE INDEX "Realtor_googleSubject_key"
ON "Realtor"("googleSubject");

DROP TABLE "GoogleOAuthAttempt";

CREATE TABLE "GoogleOAuthAttempt" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "encryptedCodeVerifier" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleOAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleOAuthAttempt_stateHash_key"
ON "GoogleOAuthAttempt"("stateHash");

CREATE INDEX "GoogleOAuthAttempt_expiresAt_idx"
ON "GoogleOAuthAttempt"("expiresAt");

CREATE TABLE "RealtorSession" (
  "id" TEXT NOT NULL,
  "realtorId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RealtorSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RealtorSession_tokenHash_key"
ON "RealtorSession"("tokenHash");

CREATE INDEX "RealtorSession_realtorId_expiresAt_idx"
ON "RealtorSession"("realtorId", "expiresAt");

ALTER TABLE "RealtorSession"
ADD CONSTRAINT "RealtorSession_realtorId_fkey"
FOREIGN KEY ("realtorId") REFERENCES "Realtor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleCalendarConnection"
DROP COLUMN "encryptedClientId",
DROP COLUMN "encryptedClientSecret";
