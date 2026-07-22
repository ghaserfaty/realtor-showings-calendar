import type { Invitation } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { secureCompare, sha256 } from "@/lib/security/crypto";
import {
  prismaInvitationRepository,
  type InvitationLookupRepository,
} from "@/repositories/invitation.repository";

const unavailable = () =>
  new AppError(
    "INVITATION_UNAVAILABLE",
    "This invitation is invalid or no longer available.",
    404,
  );

export class InvitationService {
  constructor(
    private readonly repository: InvitationLookupRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async validateToken(token: string, touch = true): Promise<Invitation> {
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) throw unavailable();
    const candidateHash = sha256(token);
    const invitation = await this.repository.findByTokenHash(candidateHash);
    if (!invitation || !secureCompare(candidateHash, invitation.tokenHash))
      throw unavailable();

    const now = this.now();
    if (invitation.expiresAt <= now || invitation.revokedAt)
      throw unavailable();
    if (invitation.maxSubmissions !== null) {
      const used = await this.repository.countConfirmedRegistrations(
        invitation.id,
      );
      if (used >= invitation.maxSubmissions) throw unavailable();
    }
    if (touch) await this.repository.touch(invitation.id, now);
    return invitation;
  }
}

export const invitationService = new InvitationService(
  prismaInvitationRepository,
);
