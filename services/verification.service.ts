import { randomInt } from "node:crypto";
import type { VerificationCode } from "@prisma/client";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hmacSha256, secureCompare } from "@/lib/security/crypto";
import { sendVerificationEmail } from "@/services/email.service";

const CODE_TTL_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_ATTEMPTS = 5;

export type OtpEvaluation =
  | "VALID"
  | "EXPIRED"
  | "USED"
  | "ATTEMPTS_EXCEEDED"
  | "INVALID";

export function hashVerificationCode(
  invitationId: string,
  code: string,
  pepper: string,
): string {
  return hmacSha256(`${invitationId}:${code}`, pepper);
}

export function evaluateOtp(
  record: Pick<
    VerificationCode,
    "codeHash" | "expiresAt" | "usedAt" | "attempts" | "maxAttempts"
  >,
  candidateHash: string,
  now: Date,
): OtpEvaluation {
  if (record.usedAt) return "USED";
  if (record.expiresAt <= now) return "EXPIRED";
  if (record.attempts >= record.maxAttempts) return "ATTEMPTS_EXCEEDED";
  return secureCompare(record.codeHash, candidateHash) ? "VALID" : "INVALID";
}

export async function requestVerificationCode(
  invitationId: string,
  invitedEmail: string,
  requestedIp: string,
): Promise<void> {
  const now = new Date();
  const recentCount = await prisma.verificationCode.count({
    where: {
      invitationId,
      createdAt: { gte: new Date(now.getTime() - REQUEST_WINDOW_MS) },
    },
  });
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many codes requested. Please try again later.",
      429,
    );
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = hashVerificationCode(
    invitationId,
    code,
    getConfig().OTP_PEPPER,
  );
  await prisma.$transaction([
    prisma.verificationCode.updateMany({
      where: { invitationId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.verificationCode.create({
      data: {
        invitationId,
        codeHash,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        maxAttempts: MAX_ATTEMPTS,
        requestedIp,
      },
    }),
  ]);
  await sendVerificationEmail(invitedEmail, code);
}

export async function verifyCode(
  invitationId: string,
  code: string,
): Promise<void> {
  const record = await prisma.verificationCode.findFirst({
    where: { invitationId },
    orderBy: { createdAt: "desc" },
  });
  if (!record)
    throw new AppError(
      "INVALID_CODE",
      "The verification code is invalid.",
      400,
    );

  const candidateHash = hashVerificationCode(
    invitationId,
    code,
    getConfig().OTP_PEPPER,
  );
  const evaluation = evaluateOtp(record, candidateHash, new Date());
  if (evaluation === "VALID") {
    const result = await prisma.verificationCode.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        attempts: { lt: record.maxAttempts },
      },
      data: { usedAt: new Date() },
    });
    if (result.count !== 1)
      throw new AppError("INVALID_CODE", "The code was already used.", 400);
    return;
  }
  if (evaluation === "INVALID") {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
  }
  const messages: Record<Exclude<OtpEvaluation, "VALID">, string> = {
    INVALID: "The verification code is invalid.",
    EXPIRED: "The verification code has expired. Request a new code.",
    USED: "The verification code was already used.",
    ATTEMPTS_EXCEEDED: "Too many attempts. Request a new code.",
  };
  throw new AppError("INVALID_CODE", messages[evaluation], 400);
}
