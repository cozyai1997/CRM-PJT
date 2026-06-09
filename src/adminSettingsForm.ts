import type { AdminApiSettingSection, AdminApiSettingsResponse, HealthResponse } from "./types";

export const createAdminForm = (settings: AdminApiSettingsResponse) =>
  Object.fromEntries(
    settings.sections.flatMap((section) =>
      section.fields.map((field) => [field.name, field.secret ? "" : field.value ?? field.defaultValue ?? ""])
    )
  );

export const shouldAutoOpenAdminSettings = (health: HealthResponse | null, search: string) => {
  const params = new URLSearchParams(search);
  if (params.get("settings") === "api" || params.get("api-settings") === "1") {
    return true;
  }

  if (!health) return false;

  return !health.openAiConfigured || !health.solapiConfigured || !health.callbridgeConfigured;
};

export const visibleAdminFields = (section: AdminApiSettingSection) =>
  section.fields.filter((field) => !field.hidden);

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export const canRegisterCallbridgeWebSocket = (location: Pick<Location | URL, "protocol" | "hostname">) =>
  location.protocol === "https:" && !localHosts.has(location.hostname);

export const buildCallbridgeAgentWebSocketUrl = (location: Pick<Location | URL, "protocol" | "host" | "hostname">) => {
  if (!canRegisterCallbridgeWebSocket(location)) {
    return "";
  }

  return `wss://${location.host}/api/callbridge/agent`;
};
