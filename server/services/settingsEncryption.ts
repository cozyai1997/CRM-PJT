import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSettingValue {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export const parseApiSettingsEncryptionKey = (env: { API_SETTINGS_ENCRYPTION_KEY?: string }) => {
  const raw = env.API_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("API_SETTINGS_ENCRYPTION_KEY is not configured.");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("API_SETTINGS_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  return key;
};

export const encryptSettingValue = (value: string, keyBase64: string): EncryptedSettingValue => {
  const key = parseApiSettingsEncryptionKey({ API_SETTINGS_ENCRYPTION_KEY: keyBase64 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
};

export const decryptSettingValue = (encrypted: EncryptedSettingValue, keyBase64: string) => {
  const key = parseApiSettingsEncryptionKey({ API_SETTINGS_ENCRYPTION_KEY: keyBase64 });
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedValue, "base64")),
    decipher.final()
  ]).toString("utf8");
};
