import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveUserKey,
  encrypt,
  decrypt,
  isEncrypted,
} from "@/lib/encryption";

// Use a fixed test secret so key derivation is deterministic
beforeEach(() => {
  process.env.ENCRYPTION_SECRET = "test-secret-for-unit-tests";
});

describe("deriveUserKey", () => {
  it("returns a 32-byte Buffer", () => {
    const key = deriveUserKey("user-abc");
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("is deterministic — same userId returns same key", () => {
    const k1 = deriveUserKey("user-abc");
    const k2 = deriveUserKey("user-abc");
    expect(k1.toString("hex")).toBe(k2.toString("hex"));
  });

  it("different userIds produce different keys", () => {
    const k1 = deriveUserKey("user-abc");
    const k2 = deriveUserKey("user-xyz");
    expect(k1.toString("hex")).not.toBe(k2.toString("hex"));
  });
});

describe("encrypt / decrypt roundtrip", () => {
  it("decrypts to original plaintext", () => {
    const key = deriveUserKey("user-test");
    const original = "Hello, world! This is a test chunk.";
    const ciphertext = encrypt(original, key);
    expect(decrypt(ciphertext, key)).toBe(original);
  });

  it("handles empty string", () => {
    const key = deriveUserKey("user-test");
    const ciphertext = encrypt("", key);
    expect(decrypt(ciphertext, key)).toBe("");
  });

  it("handles unicode / long text", () => {
    const key = deriveUserKey("user-test");
    const long = "こんにちは 🌍 ".repeat(200);
    expect(decrypt(encrypt(long, key), key)).toBe(long);
  });

  it("each encrypt call produces a different ciphertext (random IV)", () => {
    const key = deriveUserKey("user-test");
    const text = "same plaintext";
    const c1 = encrypt(text, key);
    const c2 = encrypt(text, key);
    expect(c1).not.toBe(c2); // different IVs
    // but both decrypt correctly
    expect(decrypt(c1, key)).toBe(text);
    expect(decrypt(c2, key)).toBe(text);
  });

  it("wrong key fails to decrypt (throws)", () => {
    const k1 = deriveUserKey("user-a");
    const k2 = deriveUserKey("user-b");
    const ciphertext = encrypt("secret data", k1);
    expect(() => decrypt(ciphertext, k2)).toThrow();
  });
});

describe("isEncrypted", () => {
  it("returns true for encrypted strings", () => {
    const key = deriveUserKey("user-test");
    const ct = encrypt("some text", key);
    expect(isEncrypted(ct)).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isEncrypted("just plain text")).toBe(false);
    expect(isEncrypted("hello world")).toBe(false);
  });

  it("returns false for strings that look similar but aren't", () => {
    expect(isEncrypted("a:b:c")).toBe(false);        // too short
    expect(isEncrypted("aa:bb:cc:dd")).toBe(false);   // 4 parts
    expect(isEncrypted("zzzz:zzzz:zzzz")).toBe(false); // non-hex
  });
});

describe("backward compat — decrypt returns plaintext unchanged", () => {
  it("passes through non-encrypted content", () => {
    const key = deriveUserKey("user-test");
    const plain = "This chunk was stored before encryption was added.";
    expect(decrypt(plain, key)).toBe(plain);
  });
});
