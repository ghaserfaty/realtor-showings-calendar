import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { hmacSha256 } from "@/lib/security/crypto";

export type AuditAction =
  | "REALTOR_CREATED"
  | "REALTOR_LOGIN"
  | "REALTOR_LOGOUT"
  | "CALENDAR_CONNECTION_UPDATED"
  | "INVITATION_CREATED"
  | "INVITATION_ACCESSED"
  | "INVITATION_REVOKED"
  | "INVITATION_RESENT"
  | "REGISTRATION_CREATED"
  | "REGISTRATION_REUSED"
  | "REGISTRATION_CANCELLED";

export async function audit(input: {
  action: AuditAction;
  invitationId?: string;
  actorType: "ADMIN" | "INVITEE" | "SYSTEM";
  actorId?: string;
  ip?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      invitationId: input.invitationId,
      actorType: input.actorType,
      actorId: input.actorId,
      ipHash: input.ip
        ? hmacSha256(input.ip, getConfig().SESSION_SECRET)
        : undefined,
      metadata: input.metadata,
    },
  });
}
