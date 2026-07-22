import type { Invitation } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface InvitationLookupRepository {
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  countConfirmedRegistrations(invitationId: string): Promise<number>;
  touch(invitationId: string, at: Date): Promise<void>;
}

export const prismaInvitationRepository: InvitationLookupRepository = {
  findByTokenHash(tokenHash) {
    return prisma.invitation.findUnique({ where: { tokenHash } });
  },
  countConfirmedRegistrations(invitationId) {
    return prisma.registration.count({
      where: { invitationId, status: "CONFIRMED" },
    });
  },
  async touch(invitationId, at) {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { lastAccessedAt: at },
    });
  },
};
