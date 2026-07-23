import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const VERSION = "v1";

function encryptionKey(
  encoded = getConfig().CREDENTIAL_ENCRYPTION_KEY,
): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.every((byte) => byte === 0)) {
    throw new AppError(
      "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED",
      "Credential encryption is not configured.",
      503,
      false,
    );
  }
  return key;
}

export function encryptCredential(
  plaintext: string,
  context: string,
  encodedKey?: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function decryptCredential(
  encrypted: string,
  context: string,
  encodedKey?: string,
): string {
  const [version, iv, ciphertext, tag] = encrypted.split(".");
  if (version !== VERSION || !iv || !ciphertext || !tag) {
    throw new AppError(
      "INVALID_ENCRYPTED_CREDENTIAL",
      "Stored calendar credentials are invalid.",
      503,
      false,
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(encodedKey),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      "INVALID_ENCRYPTED_CREDENTIAL",
      "Stored calendar credentials could not be decrypted.",
      503,
      false,
    );
  }
}
