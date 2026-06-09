import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildAdminApiSettingsResponse,
  isLocalAdminRequest,
  isLocalAdminHost,
  normalizeAdminApiSettingsInput,
  saveAdminApiSettings,
  updateEnvContent
} from "../server/services/adminSettings";

describe("admin API settings", () => {
  it("reports API settings status without exposing secret values", () => {
    const response = buildAdminApiSettingsResponse({
      OPENAI_API_KEY: "sk-test-openai-secret",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      OPENAI_ANALYSIS_MODEL: "gpt-5-mini",
      SOLAPI_API_KEY: "solapi-api-key",
      SOLAPI_API_SECRET: "solapi-api-secret",
      SOLAPI_SENDER_NUMBER: "01079397089",
      CALLBRIDGE_API_KEY: "callbridge-api-key",
      CALLBRIDGE_AGENT_API_KEY: "callbridge-agent-key",
      CALLBRIDGE_BASE_URL: "https://bnd.happytalk.io/api/openapi",
      CALLBRIDGE_DISPLAY_NUMBER: "07012345678",
      PUBLIC_BASE_URL: "https://crm.example.com",
      PUBLIC_WS_BASE_URL: "wss://crm.example.com",
      OPENAI_REALTIME_TRANSCRIPTION_MODEL: "gpt-realtime-whisper"
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("sk-test-openai-secret");
    expect(serialized).not.toContain("solapi-api-secret");
    expect(serialized).not.toContain("callbridge-agent-key");

    const openAiKey = response.sections
      .find((section) => section.id === "openai")
      ?.fields.find((field) => field.name === "OPENAI_API_KEY");
    const solapiSender = response.sections
      .find((section) => section.id === "solapi")
      ?.fields.find((field) => field.name === "SOLAPI_SENDER_NUMBER");

    expect(openAiKey).toMatchObject({
      configured: true,
      secret: true,
      maskedValue: "configured"
    });
    expect(openAiKey).not.toHaveProperty("value");
    expect(solapiSender?.value).toBe("01079397089");
  });

  it("normalizes admin updates and preserves existing secrets when secret inputs are blank", () => {
    const updates = normalizeAdminApiSettingsInput({
      settings: {
        OPENAI_API_KEY: "",
        OPENAI_ANALYSIS_MODEL: " gpt-5-mini ",
        SOLAPI_SENDER_NUMBER: "010-7939-7089",
        CALLBRIDGE_API_KEY: " callbridge-key ",
        UNKNOWN_KEY: "ignored"
      }
    });

    expect(updates).toEqual({
      OPENAI_ANALYSIS_MODEL: "gpt-5-mini",
      SOLAPI_SENDER_NUMBER: "010-7939-7089",
      CALLBRIDGE_API_KEY: "callbridge-key"
    });
  });

  it("updates env content by upserting allowed API setting keys only", () => {
    const content = [
      "OPENAI_API_KEY=old-openai-key",
      "SOLAPI_SENDER_NUMBER=01000000000",
      "UNRELATED=value"
    ].join("\n");

    const next = updateEnvContent(content, {
      OPENAI_API_KEY: "new-openai-key",
      SOLAPI_API_SECRET: "new-solapi-secret",
      CALLBRIDGE_BASE_URL: "https://bnd.happytalk.io/api/openapi"
    });

    expect(next).toContain("OPENAI_API_KEY=new-openai-key");
    expect(next).toContain("SOLAPI_API_SECRET=new-solapi-secret");
    expect(next).toContain("CALLBRIDGE_BASE_URL=https://bnd.happytalk.io/api/openapi");
    expect(next).toContain("UNRELATED=value");
    expect(next.match(/^OPENAI_API_KEY=/gm)).toHaveLength(1);
  });

  it("allows admin settings writes only from local browser hosts", () => {
    expect(isLocalAdminHost("127.0.0.1:8787")).toBe(true);
    expect(isLocalAdminHost("localhost:8787")).toBe(true);
    expect(isLocalAdminHost("[::1]:8787")).toBe(true);
    expect(isLocalAdminHost("crm-public.ngrok-free.app")).toBe(false);
  });

  it("blocks admin settings through public tunnel headers", () => {
    expect(
      isLocalAdminRequest({
        host: "127.0.0.1:8787",
        forwardedHost: "crm-public.ngrok-free.app",
        origin: "http://127.0.0.1:8787"
      })
    ).toBe(false);
    expect(
      isLocalAdminRequest({
        host: "127.0.0.1:8787",
        origin: "https://crm-public.ngrok-free.app"
      })
    ).toBe(false);
    expect(
      isLocalAdminRequest({
        host: "127.0.0.1:8787",
        referer: "https://crm-public.ngrok-free.app/"
      })
    ).toBe(false);
    expect(
      isLocalAdminRequest({
        host: "127.0.0.1:8787",
        origin: "http://127.0.0.1:8787"
      })
    ).toBe(true);
  });

  it("saves API keys from the admin page into env local and applies them immediately", () => {
    const dir = join(tmpdir(), `crm-admin-settings-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const envFilePath = join(dir, ".env.local");
    const env: Record<string, string | undefined> = {};

    try {
      const response = saveAdminApiSettings(
        {
          settings: {
            OPENAI_API_KEY: "sk-test-admin-page-key",
            SOLAPI_API_KEY: "solapi-page-key",
            SOLAPI_API_SECRET: "solapi-page-secret",
            SOLAPI_SENDER_NUMBER: "01079397089",
            CALLBRIDGE_API_KEY: "callbridge-page-key",
            CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
          }
        },
        {
          envFilePath,
          env
        }
      );

      expect(env.OPENAI_API_KEY).toBe("sk-test-admin-page-key");
      expect(env.SOLAPI_API_SECRET).toBe("solapi-page-secret");
      expect(env.CALLBRIDGE_DISPLAY_NUMBER).toBe("07012345678");
      expect(readFileSync(envFilePath, "utf8")).toContain("CALLBRIDGE_API_KEY=callbridge-page-key");
      expect(JSON.stringify(response)).not.toContain("sk-test-admin-page-key");
      expect(response.sections.every((section) => section.configured)).toBe(true);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("auto-fills Callbridge advanced settings when API key and number are submitted", () => {
    const dir = join(tmpdir(), `crm-callbridge-simple-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const envFilePath = join(dir, ".env.local");
    const env: Record<string, string | undefined> = {};

    try {
      const response = saveAdminApiSettings(
        {
          settings: {
            CALLBRIDGE_API_KEY: "callbridge-simple-key",
            CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
          }
        },
        {
          envFilePath,
          env
        }
      );
      const content = readFileSync(envFilePath, "utf8");
      const callbridge = response.sections.find((section) => section.id === "callbridge");

      expect(env.CALLBRIDGE_AGENT_API_KEY).toBe("callbridge-simple-key");
      expect(env.CALLBRIDGE_BASE_URL).toBe("https://bnd.happytalk.io/api/openapi");
      expect(env.CALLBRIDGE_DISPLAY_NUMBER).toBe("07012345678");
      expect(env.OPENAI_REALTIME_TRANSCRIPTION_MODEL).toBe("gpt-realtime-whisper");
      expect(content).toContain("CALLBRIDGE_AGENT_API_KEY=callbridge-simple-key");
      expect(content).toContain("CALLBRIDGE_BASE_URL=https://bnd.happytalk.io/api/openapi");
      expect(content).toContain("OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-realtime-whisper");
      expect(callbridge?.configured).toBe(true);
      expect(callbridge?.fields.filter((field) => !field.hidden).map((field) => field.name)).toEqual([
        "CALLBRIDGE_API_KEY",
        "CALLBRIDGE_DISPLAY_NUMBER"
      ]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
