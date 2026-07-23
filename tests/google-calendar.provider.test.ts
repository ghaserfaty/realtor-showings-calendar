import { describe, expect, it } from "vitest";
import { missingGoogleCredentialFields } from "@/services/calendar/google-calendar.provider";

describe("Google Calendar provider configuration", () => {
  it("reports the exact missing OAuth variables", () => {
    expect(
      missingGoogleCredentialFields({
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "",
        calendarId: "calendar-id",
      }),
    ).toEqual(["refreshToken"]);
  });

  it("accepts a complete OAuth configuration", () => {
    expect(
      missingGoogleCredentialFields({
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        calendarId: "calendar-id",
      }),
    ).toEqual([]);
  });
});
