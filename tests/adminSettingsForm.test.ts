import { describe, expect, it } from "vitest";
import {
  buildCallbridgeAgentWebSocketUrl,
  canRegisterCallbridgeWebSocket,
  visibleAdminFields,
  shouldAutoOpenAdminSettings
} from "../src/adminSettingsForm";
import type { AdminApiSettingSection, HealthResponse } from "../src/types";

const health = (overrides: Partial<HealthResponse>): HealthResponse => ({
  ok: true,
  openAiConfigured: true,
  solapiConfigured: true,
  solapiSenderNumberConfigured: true,
  callbridgeConfigured: true,
  realtimeTranscriptionPhase: "callbridge",
  docs: {},
  ...overrides
});

describe("admin settings form helpers", () => {
  it("opens API settings automatically when any provider is not configured", () => {
    expect(shouldAutoOpenAdminSettings(health({ openAiConfigured: false }), "")).toBe(true);
    expect(shouldAutoOpenAdminSettings(health({ solapiConfigured: false }), "")).toBe(true);
    expect(shouldAutoOpenAdminSettings(health({ callbridgeConfigured: false }), "")).toBe(true);
  });

  it("opens API settings from the URL query even when providers are configured", () => {
    expect(shouldAutoOpenAdminSettings(health({}), "?settings=api")).toBe(true);
    expect(shouldAutoOpenAdminSettings(health({}), "?api-settings=1")).toBe(true);
  });

  it("does not open API settings when everything is configured and no query requests it", () => {
    expect(shouldAutoOpenAdminSettings(health({}), "")).toBe(false);
  });

  it("shows only the Callbridge API key in the simple settings form", () => {
    const section: AdminApiSettingSection = {
      id: "callbridge",
      title: "Callbridge",
      configured: false,
      missing: ["CALLBRIDGE_API_KEY"],
      fields: [
        {
          name: "CALLBRIDGE_API_KEY",
          label: "Callbridge API Key",
          secret: true,
          required: true,
          configured: false,
          placeholder: "Callbridge API Key"
        },
        {
          name: "CALLBRIDGE_DISPLAY_NUMBER",
          label: "Callbridge display number",
          secret: false,
          required: true,
          configured: false,
          placeholder: "07000000000"
        },
        {
          name: "PUBLIC_BASE_URL",
          label: "Public HTTPS base URL",
          secret: false,
          required: false,
          configured: false,
          hidden: true,
          placeholder: "Auto"
        }
      ]
    };

    expect(visibleAdminFields(section).map((field) => field.name)).toEqual([
      "CALLBRIDGE_API_KEY",
      "CALLBRIDGE_DISPLAY_NUMBER"
    ]);
  });

  it("builds a Callbridge Agent WebSocket URL from an external HTTPS location", () => {
    const location = new URL("https://example.ngrok-free.app/crm?settings=api");

    expect(canRegisterCallbridgeWebSocket(location)).toBe(true);
    expect(buildCallbridgeAgentWebSocketUrl(location)).toBe("wss://example.ngrok-free.app/api/callbridge/agent");
  });

  it("does not allow Callbridge Agent WebSocket registration from local HTTP", () => {
    const location = new URL("http://127.0.0.1:8787/?settings=api");

    expect(canRegisterCallbridgeWebSocket(location)).toBe(false);
    expect(buildCallbridgeAgentWebSocketUrl(location)).toBe("");
  });
});
