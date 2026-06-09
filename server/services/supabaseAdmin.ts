import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseAdminEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface AdminAuthConfigResponse {
  ok: true;
  configured: boolean;
  supabaseUrl: string;
  publishableKey: string;
}

export interface SupabaseUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseAuthClientLike {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: SupabaseUser | null };
      error: unknown;
    }>;
  };
}

export type AdminTokenVerification =
  | {
      ok: true;
      userId: string;
      email: string | null;
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error: string;
      detail: string;
    };

const trim = (value: string | undefined) => value?.trim() ?? "";

export const buildAdminAuthConfigResponse = (env: SupabaseAdminEnv): AdminAuthConfigResponse => ({
  ok: true,
  configured: Boolean(trim(env.SUPABASE_URL) && trim(env.SUPABASE_PUBLISHABLE_KEY)),
  supabaseUrl: trim(env.SUPABASE_URL),
  publishableKey: trim(env.SUPABASE_PUBLISHABLE_KEY)
});

export const isSupabaseAdminConfigured = (env: SupabaseAdminEnv) =>
  Boolean(trim(env.SUPABASE_URL) && trim(env.SUPABASE_SERVICE_ROLE_KEY));

export const createSupabaseServiceClient = (env: SupabaseAdminEnv): SupabaseClient => {
  if (!trim(env.SUPABASE_URL) || !trim(env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("Supabase service role configuration is incomplete.");
  }

  return createClient(trim(env.SUPABASE_URL), trim(env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
};

export const getBearerToken = (authorization: string | string[] | undefined) => {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value?.startsWith("Bearer ")) return null;

  const token = value.slice("Bearer ".length).trim();
  return token || null;
};

export const verifySupabaseAdminToken = async (
  token: string | null,
  client: SupabaseAuthClientLike
): Promise<AdminTokenVerification> => {
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Admin authentication is required.",
      detail: "Sign in with a Supabase administrator account before changing API settings."
    };
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      status: 401,
      error: "Admin authentication failed.",
      detail: "The Supabase session is invalid or expired."
    };
  }

  if (data.user.app_metadata?.crm_role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Admin permission is required.",
      detail: "The signed-in Supabase user does not have crm_role=admin in app metadata."
    };
  }

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email ?? null
  };
};
