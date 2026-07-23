import { describe, expect, it } from "vitest";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/security/encryption";

const key = Buffer.alloc(32, 7).toString("base64");

describe("tenant credential encryption", () => {
  it("round-trips a credential only with the same tenant context", () => {
    const encrypted = encryptCredential(
      "refresh-token",
      "realtor-1:refreshToken",
      key,
    );
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptCredential(encrypted, "realtor-1:refreshToken", key)).toBe(
      "refresh-token",
    );
  });

  it("rejects ciphertext copied to another realtor", () => {
    const encrypted = encryptCredential(
      "refresh-token",
      "realtor-1:refreshToken",
      key,
    );
    expect(() =>
      decryptCredential(encrypted, "realtor-2:refreshToken", key),
    ).toThrow("could not be decrypted");
  });

  it("rejects the development placeholder encryption key", () => {
    expect(() =>
      encryptCredential(
        "refresh-token",
        "realtor-1:refreshToken",
        Buffer.alloc(32).toString("base64"),
      ),
    ).toThrow("Credential encryption is not configured");
  });
});
