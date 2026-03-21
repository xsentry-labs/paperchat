/**
 * Encryption at rest - AES-256-GCM
 *
 * Strategy:
 *   - Master secret lives in ENCRYPTION_SECRET env var
 *   - Per-user key is derived deterministically: SHA-256(userId + masterSecret)
 *   - Encrypted format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *   - Backward compatible: if a string doesn't match the format, return as-is
 *     (handles unencrypted chunks created before this feature was added)
 *
 * What is encrypted: chunk content (text stored in DB)
 * What is NOT encrypted: embeddings (vectors), metadata, filenames
 *   - embeddings reveal little about content and are needed raw for pgvector
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // bytes
const TAG_LENGTH = 16; // bytes (GCM auth tag)

/**
 * Derive a stable 32-byte encryption key for a given user.
 * Uses SHA-256(userId + masterSecret) - no key storage needed.
 */
export function deriveUserKey(userId: string): Buffer {
  const master =
    process.env.ENCRYPTION_SECRET ?? "dev-secret-change-in-production";
  return createHash("sha256")
    .update(userId + ":" + master)
    .digest();
}

/**
 * Encrypt plaintext with the given key.
 * Returns a colon-separated hex string: "iv:authTag:ciphertext"
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt an encrypted string.
 * Returns plaintext, or the original string if it was never encrypted.
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  if (!isEncrypted(ciphertext)) return ciphertext; // backward compat

  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * Check if a string looks like our encrypted format.
 * Format: <32-char hex>:<32-char hex>:<hex>
 */
export function isEncrypted(text: string): boolean {
  const parts = text.split(":");
  if (parts.length !== 3) return false;
  return (
    /^[0-9a-f]{32}$/.test(parts[0]) && // IV: 16 bytes = 32 hex chars
    /^[0-9a-f]{32}$/.test(parts[1]) && // Tag: 16 bytes = 32 hex chars
    /^[0-9a-f]*$/.test(parts[2]) // Ciphertext: hex (empty string encrypts to empty)
  );
}
