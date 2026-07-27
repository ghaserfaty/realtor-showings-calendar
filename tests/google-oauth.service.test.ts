import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_OPENID_SCOPES,
} from "@/services/google-oauth.service";

describe("Google OAuth authorization URL", () => {
  it("requests identity, offline Calendar access, state, nonce and PKCE", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: "client.apps.googleusercontent.com",
        redirectUri: "https://app.example.com/api/auth/google/callback",
        state: "opaque-state",
        nonce: "opaque-nonce",
        codeChallenge: "pkce-challenge",
      }),
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toContain("consent");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      ...GOOGLE_OPENID_SCOPES,
      ...GOOGLE_CALENDAR_SCOPES,
    ]);
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.get("nonce")).toBe("opaque-nonce");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
