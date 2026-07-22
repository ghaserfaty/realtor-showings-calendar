CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'ERROR');

CREATE TABLE "Realtor" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "calendarOwnerReference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Realtor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "invitedName" TEXT,
  "invitedPhone" TEXT,
  "realtorId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "maxSubmissions" INTEGER,
  "verificationRequired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAccessedAt" TIMESTAMP(3),
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvitationSession" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "verifiedEmailAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvitationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationCode" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "requestedIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Registration" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "calendarEventId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "notes" TEXT,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "calendarSyncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
  "calendarSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "invitationId" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "metadata" JSONB,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Realtor_email_key" ON "Realtor"("email");
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");
CREATE INDEX "Invitation_realtorId_idx" ON "Invitation"("realtorId");
CREATE UNIQUE INDEX "InvitationSession_tokenHash_key" ON "InvitationSession"("tokenHash");
CREATE INDEX "InvitationSession_invitationId_expiresAt_idx" ON "InvitationSession"("invitationId", "expiresAt");
CREATE INDEX "VerificationCode_invitationId_createdAt_idx" ON "VerificationCode"("invitationId", "createdAt");
CREATE UNIQUE INDEX "Registration_invitationId_calendarEventId_key" ON "Registration"("invitationId", "calendarEventId");
CREATE INDEX "Registration_calendarEventId_status_idx" ON "Registration"("calendarEventId", "status");
CREATE INDEX "AuditLog_invitationId_createdAt_idx" ON "AuditLog"("invitationId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_realtorId_fkey" FOREIGN KEY ("realtorId") REFERENCES "Realtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvitationSession" ADD CONSTRAINT "InvitationSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
