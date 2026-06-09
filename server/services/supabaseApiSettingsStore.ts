import type { PostgrestError } from "@supabase/supabase-js";
import {
  allowedAdminApiSettingNames,
  normalizeAndAutoFillAdminApiSettings,
  type AdminApiSettingName,
  type AdminApiSettingsUpdate
} from "./adminSettings";
import { decryptSettingValue, encryptSettingValue } from "./settingsEncryption";

export interface CrmApiSettingsRow {
  key: AdminApiSettingName;
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  updated_by: string | null;
  updated_at?: string;
}

export interface SupabaseApiSettingsTableLike {
  select: (columns: string) => PromiseLike<{ data: CrmApiSettingsRow[] | null; error: PostgrestError | null }>;
  upsert: (
    rows: CrmApiSettingsRow[],
    options: { onConflict: string }
  ) => {
    select: (columns: string) => PromiseLike<{ data: CrmApiSettingsRow[] | null; error: PostgrestError | null }>;
  };
}

export interface SupabaseApiSettingsClientLike {
  from: (table: "crm_api_settings") => SupabaseApiSettingsTableLike;
}

export const buildRowsForApiSettings = (
  settings: AdminApiSettingsUpdate,
  options: {
    encryptionKey: string;
    updatedBy: string | null;
  }
): CrmApiSettingsRow[] =>
  Object.entries(settings)
    .filter(([key]) => allowedAdminApiSettingNames.has(key as AdminApiSettingName))
    .map(([key, value]) => {
      const encrypted = encryptSettingValue(value ?? "", options.encryptionKey);

      return {
        key: key as AdminApiSettingName,
        encrypted_value: encrypted.encryptedValue,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        updated_by: options.updatedBy
      };
    });

export const decryptApiSettingsRows = (rows: CrmApiSettingsRow[], encryptionKey: string): AdminApiSettingsUpdate =>
  Object.fromEntries(
    rows
      .filter((row) => allowedAdminApiSettingNames.has(row.key))
      .map((row) => [
        row.key,
        decryptSettingValue(
          {
            encryptedValue: row.encrypted_value,
            iv: row.iv,
            authTag: row.auth_tag
          },
          encryptionKey
        )
      ])
  );

const throwIfSupabaseError = (error: PostgrestError | null) => {
  if (error) {
    throw new Error(error.message);
  }
};

export const loadRemoteApiSettings = async (
  client: SupabaseApiSettingsClientLike,
  encryptionKey: string
): Promise<AdminApiSettingsUpdate> => {
  const result = await client.from("crm_api_settings").select("key,encrypted_value,iv,auth_tag,updated_by,updated_at");
  throwIfSupabaseError(result.error);

  return decryptApiSettingsRows(result.data ?? [], encryptionKey);
};

export const saveRemoteApiSettings = async (
  payload: unknown,
  options: {
    client: SupabaseApiSettingsClientLike;
    env: Record<string, string | undefined>;
    encryptionKey: string;
    updatedBy: string;
  }
): Promise<AdminApiSettingsUpdate> => {
  const updates = normalizeAndAutoFillAdminApiSettings(payload, options.env);
  const rows = buildRowsForApiSettings(updates, {
    encryptionKey: options.encryptionKey,
    updatedBy: options.updatedBy
  });

  if (rows.length === 0) {
    return loadRemoteApiSettings(options.client, options.encryptionKey);
  }

  const result = await options.client
    .from("crm_api_settings")
    .upsert(rows, { onConflict: "key" })
    .select("key,encrypted_value,iv,auth_tag,updated_by,updated_at");
  throwIfSupabaseError(result.error);

  return {
    ...(await loadRemoteApiSettings(options.client, options.encryptionKey)),
    ...decryptApiSettingsRows(result.data ?? [], options.encryptionKey)
  };
};
