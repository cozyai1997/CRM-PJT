import { describe, expect, it } from "vitest";
import {
  decryptSettingValue,
  encryptSettingValue,
  parseApiSettingsEncryptionKey
} from "../server/services/settingsEncryption";

const key = Buffer.alloc(32, 7).toString("base64");

describe("API settings encryption", () => {
  it("requires a 32 byte base64 encryption key", () => {
    expect(parseApiSettingsEncryptionKey({ API_SETTINGS_ENCRYPTION_KEY: key })).toHaveLength(32);
    expect(() => parseApiSettingsEncryptionKey({ API_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      "API_SETTINGS_ENCRYPTION_KEY must decode to 32 bytes."
    );
  });

  it("encrypts API setting values without storing plaintext", () => {
    const encrypted = encryptSettingValue("sk-test-secret", key);

    expect(encrypted.encryptedValue).not.toContain("sk-test-secret");
    expect(encrypted.iv).not.toContain("sk-test-secret");
    expect(encrypted.authTag).not.toContain("sk-test-secret");
    expect(decryptSettingValue(encrypted, key)).toBe("sk-test-secret");
  });
});
