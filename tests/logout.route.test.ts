import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { destroySession, findSession } = vi.hoisted(() => ({
  destroySession: vi.fn(async () => undefined),
  findSession: vi.fn(async () => ({
    id: "realtor-1",
  })),
}));

vi.mock("@/lib/security/realtor-session", () => ({
  REALTOR_SESSION_COOKIE: "realtor_session",
  destroyRealtorSession: destroySession,
  findRealtorBySessionToken: findSession,
  expiredSessionCookieOptions: () => ({
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  }),
}));

vi.mock("@/services/audit.service", () => ({
  audit: async () => undefined,
}));

import { POST } from "@/app/api/auth/logout/route";

describe("realtor logout route", () => {
  it("destroys the session, expires the cookie, and redirects on the request origin", async () => {
    const token = "a".repeat(48);
    const response = await POST(
      new NextRequest("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `realtor_session=${token}`,
          origin: "http://localhost:3001",
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3001/");
    expect(response.headers.get("set-cookie")).toContain(
      "realtor_session=; Path=/",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(findSession).toHaveBeenCalledWith(token);
    expect(destroySession).toHaveBeenCalledWith(token);
  });
});
