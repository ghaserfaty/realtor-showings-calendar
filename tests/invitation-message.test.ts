import { describe, expect, it } from "vitest";
import { buildInvitationMessage } from "@/lib/invitation-message";

describe("invitation message", () => {
  it("places the private invitation link in the ready-to-send copy", () => {
    expect(buildInvitationMessage("https://example.com/invite/secret")).toBe(
      "Hi there! You can check the available showings times for the week on the following link: https://example.com/invite/secret",
    );
  });
});
