/**
 * token-crypto.ts
 *
 * Optional symmetric encryption for OAuth refresh tokens stored in the DB.
 * When TOKEN_ENCRYPTION_KEY is set (32-byte hex), tokens are encrypted with
 * AES-256-GCM before being written and decrypted on read.
 *
 * Graceful degradation:
 *   - No key set → encryptToken() returns plaintext, decryptToken() returns input unchanged.
 *   - Already-stored plaintext tokens continue to work because decryptToken() detects
 *     the "iv:authTag:ciphertext" format — anything without that separator is returned as-is.
 *
 * Format: "<iv-hex>:<authTag-hex>:<ciphertext-hex>"
 * Algorithm: AES-256-GCM (authenticated encryption — detects tampering)
 *
 * Usage:
 *   import { encryptToken, decryptToken } from "./token-crypto";
 *   const stored = encryptToken(rawRefreshToken);   // before writing to DB
 *   const raw    = decryptToken(storedValue);        // before using
 *
 * IMPORTANT: Never log the return value of either function.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createLogger } from "./logger";

const logger = createLogger("token-crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;   // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;  // 128-bit auth tag
const SEPARATOR = ":"; // separator between iv, authTag, ciphertext in stored string
const ENCRYPTED_PARTS = 3;

function getKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) return null;

  if (hex.length !== 64) {
    logger.warn("[TokenCrypto] TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars) — encryption disabled");
    return null;
  }

  try {
    return Buffer.from(hex, "hex");
  } catch {
    logger.warn("[TokenCrypto] TOKEN_ENCRYPTION_KEY is not valid hex — encryption disabled");
    return null;
  }
}

/**
 * Checks whether a stored value looks like it was encrypted by encryptToken().
 * Used by decryptToken to decide whether to decrypt or pass through.
 */
function isEncryptedFormat(value: string): boolean {
  const parts = value.split(SEPARATOR);
  return parts.length === ENCRYPTED_PARTS && parts.every(p => /^[0-9a-f]+$/i.test(p));
}

/**
 * Encrypt a plaintext token for storage.
 * Returns "iv:authTag:ciphertext" hex string.
 * If TOKEN_ENCRYPTION_KEY is not set or invalid, returns the plaintext unchanged.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getKey();
  if (!key) return plaintext;

  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted.toString("hex"),
    ].join(SEPARATOR);
  } catch (err) {
    // Encryption failure is not recoverable — log and return plaintext so we don't silently
    // store corrupt data.  The warn message does NOT include the token value.
    logger.warn("[TokenCrypto] encryptToken failed — storing plaintext (check TOKEN_ENCRYPTION_KEY):", err);
    return plaintext;
  }
}

/**
 * Decrypt a stored token value.
 * Detects "iv:authTag:ciphertext" format — if input doesn't match, returns as-is
 * (transparent migration from unencrypted storage).
 * If TOKEN_ENCRYPTION_KEY is not set, returns the input unchanged.
 */
export function decryptToken(stored: string): string {
  if (!stored) return stored;

  // If it doesn't look encrypted, return as-is (handles unencrypted legacy tokens)
  if (!isEncryptedFormat(stored)) return stored;

  const key = getKey();
  if (!key) {
    // Key not configured — can't decrypt.  Log a warning once so operators know
    // they need to set TOKEN_ENCRYPTION_KEY if tokens were stored encrypted.
    logger.warn("[TokenCrypto] Encrypted token found but TOKEN_ENCRYPTION_KEY is not set — cannot decrypt");
    return stored;
  }

  try {
    const parts = stored.split(SEPARATOR);
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const ciphertext = Buffer.from(parts[2], "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    // Auth tag mismatch = tampered data.  Log without token value.
    logger.error("[TokenCrypto] decryptToken failed — possible key mismatch or data corruption:", err);
    // Return the stored value unchanged so the caller can fail gracefully (Google will
    // return invalid_grant, triggering normal failure handling)
    return stored;
  }
}
