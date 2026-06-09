import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminApiSettingsUpdate } from "./adminSettings";
import { parseApiSettingsEncryptionKey } from "./settingsEncryption";
import { loadRemoteApiSettings } from "./supabaseApiSettingsStore";
import { createSupabaseServiceClient, isSupabaseAdminConfigured } from "./supabaseAdmin";

let remoteApiSettingsCache: AdminApiSettingsUpdate = {};
let remoteSettingsLoaded = false;
let remoteSettingsLoadPromise: Promise<AdminApiSettingsUpdate> | null = null;

export const replaceRemoteApiSettingsCache = (settings: AdminApiSettingsUpdate) => {
  remoteApiSettingsCache = { ...settings };
  remoteSettingsLoaded = true;
};

export const clearRemoteApiSettingsCache = () => {
  remoteApiSettingsCache = {};
  remoteSettingsLoaded = false;
  remoteSettingsLoadPromise = null;
};

export const getEffectiveRuntimeEnv = (env: Record<string, string | undefined> = process.env) => ({
  ...env,
  ...remoteApiSettingsCache
});

export const hydrateRemoteApiSettingsCache = async (
  env: Record<string, string | undefined> = process.env,
  client?: SupabaseClient
) => {
  if (!isSupabaseAdminConfigured(env) || !env.API_SETTINGS_ENCRYPTION_KEY?.trim()) {
    return remoteApiSettingsCache;
  }

  if (remoteSettingsLoaded) {
    return remoteApiSettingsCache;
  }

  if (!remoteSettingsLoadPromise) {
    remoteSettingsLoadPromise = (async () => {
      const encryptionKey = env.API_SETTINGS_ENCRYPTION_KEY!.trim();
      parseApiSettingsEncryptionKey({ API_SETTINGS_ENCRYPTION_KEY: encryptionKey });
      const settings = await loadRemoteApiSettings(client ?? createSupabaseServiceClient(env), encryptionKey);
      replaceRemoteApiSettingsCache(settings);
      return settings;
    })().finally(() => {
      remoteSettingsLoadPromise = null;
    });
  }

  return remoteSettingsLoadPromise;
};
