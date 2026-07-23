import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  GOOGLE_CALENDAR_SCOPE,
} from "@/services/google-oauth.service";

describe("Google OAuth authorization URL", () => {
  it("requests offline Calendar access with tenant state", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: "client.apps.googleusercontent.com",
        clientSecret: "client-secret",
        redirectUri: "https://app.example.com/api/admin/google-oauth/callback",
        state: "opaque-state",
      }),
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toContain("consent");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(url.searchParams.get("state")).toBe("opaque-state");
  });
});
