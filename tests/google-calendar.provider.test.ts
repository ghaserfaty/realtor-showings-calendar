import { describe, expect, it } from "vitest";
import { missingGoogleOAuthVariables } from "@/services/calendar/google-calendar.provider";

describe("Google Calendar provider configuration", () => {
  it("reports the exact missing OAuth variables", () => {
    expect(
      missingGoogleOAuthVariables({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "",
      }),
    ).toEqual(["GOOGLE_REFRESH_TOKEN"]);
  });

  it("accepts a complete OAuth configuration", () => {
    expect(
      missingGoogleOAuthVariables({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      }),
    ).toEqual([]);
  });
});
