import { describe, expect, it, vi } from "vitest";
import {
  buildAdminAuthConfigResponse,
  getBearerToken,
  verifySupabaseAdminToken
} from "../server/services/supabaseAdmin";

describe("Supabase admin auth", () => {
  it("returns only public auth config values", () => {
    const response = buildAdminAuthConfigResponse({
      SUPABASE_URL: "https://dmqguebuvssjbiahumhp.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret"
    });

    expect(response).toEqual({
      ok: true,
      configured: true,
      supabaseUrl: "https://dmqguebuvssjbiahumhp.supabase.co",
      publishableKey: "sb_publishable_test"
    });
    expect(JSON.stringify(response)).not.toContain("service-role-secret");
  });

  it("extracts bearer tokens from authorization headers", () => {
    expect(getBearerToken("Bearer access-token")).toBe("access-token");
    expect(getBearerToken("Basic wrong")).toBe(null);
    expect(getBearerToken(undefined)).toBe(null);
  });

  it("accepts only users with crm_role admin in app metadata", async () => {
    const adminClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "admin@example.com",
              app_metadata: { crm_role: "admin" },
              user_metadata: {}
            }
          },
          error: null
        })
      }
    };
    const userMetadataOnlyClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-2",
              email: "not-admin@example.com",
              app_metadata: {},
              user_metadata: { crm_role: "admin" }
            }
          },
          error: null
        })
      }
    };

    await expect(verifySupabaseAdminToken("admin-token", adminClient)).resolves.toMatchObject({
      ok: true,
      userId: "user-1",
      email: "admin@example.com"
    });
    await expect(verifySupabaseAdminToken("user-token", userMetadataOnlyClient)).resolves.toMatchObject({
      ok: false,
      status: 403
    });
  });
});
