import { NextRequest } from "next/server";
import type { Realtor } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { secureCompare, sha256 } from "@/lib/security/crypto";

export function authenticatePlatformAdmin(request: NextRequest): void {
  const supplied = request.headers.get("x-platform-admin-api-key") ?? "";
  if (!secureCompare(supplied, getConfig().PLATFORM_ADMIN_API_KEY)) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
}

export async function authenticateRealtor(
  request: NextRequest,
): Promise<Realtor> {
  const supplied = request.headers.get("x-realtor-api-key") ?? "";
  if (!/^rlt_[A-Za-z0-9_-]{32,200}$/.test(supplied)) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  const candidateHash = sha256(supplied);
  const realtor = await prisma.realtor.findUnique({
    where: { adminApiKeyHash: candidateHash },
  });
  if (
    !realtor?.adminApiKeyHash ||
    !secureCompare(candidateHash, realtor.adminApiKeyHash)
  ) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  return realtor;
}
