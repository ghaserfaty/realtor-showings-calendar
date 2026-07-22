import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { getConfig } from "@/lib/config";
import { secureCompare } from "@/lib/security/crypto";

export function authenticateAdmin(request: NextRequest): void {
  const supplied = request.headers.get("x-admin-api-key") ?? "";
  if (!secureCompare(supplied, getConfig().ADMIN_API_KEY)) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
}
