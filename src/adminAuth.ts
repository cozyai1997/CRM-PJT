import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminAuthConfigResponse } from "./types";

let adminClient: SupabaseClient | null = null;

export const createAdminAuthClient = (config: AdminAuthConfigResponse) => {
  if (!config.configured || !config.supabaseUrl || !config.publishableKey) {
    return null;
  }

  adminClient =
    adminClient ??
    createClient(config.supabaseUrl, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

  return adminClient;
};

export const getAdminSession = async (client: SupabaseClient | null): Promise<Session | null> => {
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return data.session ?? null;
};

export const signInAdmin = async (client: SupabaseClient, email: string, password: string) => {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }

  return data.session;
};

export const signOutAdmin = async (client: SupabaseClient | null) => {
  if (!client) return;
  await client.auth.signOut();
};
