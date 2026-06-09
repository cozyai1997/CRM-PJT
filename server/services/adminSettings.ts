import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const adminApiSettingSections = [
  {
    id: "openai",
    title: "OpenAI",
    requiredKeys: ["OPENAI_API_KEY"],
    fields: [
      {
        name: "OPENAI_API_KEY",
        label: "OpenAI API Key",
        secret: true,
        required: true,
        placeholder: "sk-..."
      },
      {
        name: "OPENAI_TRANSCRIPTION_MODEL",
        label: "Audio transcription model",
        secret: false,
        required: false,
        defaultValue: "gpt-4o-mini-transcribe",
        placeholder: "gpt-4o-mini-transcribe"
      },
      {
        name: "OPENAI_ANALYSIS_MODEL",
        label: "CRM analysis model",
        secret: false,
        required: false,
        defaultValue: "gpt-5-mini",
        placeholder: "gpt-5-mini"
      },
      {
        name: "OPENAI_REALTIME_TRANSCRIPTION_MODEL",
        label: "Realtime transcription model",
        secret: false,
        required: false,
        defaultValue: "gpt-realtime-whisper",
        placeholder: "gpt-realtime-whisper"
      }
    ]
  },
  {
    id: "solapi",
    title: "Solapi",
    requiredKeys: ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER_NUMBER"],
    fields: [
      {
        name: "SOLAPI_API_KEY",
        label: "Solapi API Key",
        secret: true,
        required: true,
        placeholder: "Solapi API Key"
      },
      {
        name: "SOLAPI_API_SECRET",
        label: "Solapi API Secret",
        secret: true,
        required: true,
        placeholder: "Solapi API Secret"
      },
      {
        name: "SOLAPI_SENDER_NUMBER",
        label: "Sender number",
        secret: false,
        required: true,
        placeholder: "01000000000"
      }
    ]
  },
  {
    id: "callbridge",
    title: "Callbridge 간편 연결",
    requiredKeys: ["CALLBRIDGE_API_KEY", "CALLBRIDGE_DISPLAY_NUMBER"],
    fields: [
      {
        name: "CALLBRIDGE_API_KEY",
        label: "Callbridge API Key",
        secret: true,
        required: true,
        placeholder: "Callbridge API Key"
      },
      {
        name: "CALLBRIDGE_AGENT_API_KEY",
        label: "Agent WebSocket API Key",
        secret: true,
        required: false,
        hidden: true,
        placeholder: "Automatically uses Callbridge API Key"
      },
      {
        name: "CALLBRIDGE_BASE_URL",
        label: "Callbridge base URL",
        secret: false,
        required: false,
        hidden: true,
        defaultValue: "https://bnd.happytalk.io/api/openapi",
        placeholder: "https://bnd.happytalk.io/api/openapi"
      },
      {
        name: "CALLBRIDGE_DISPLAY_NUMBER",
        label: "Callbridge 수신번호",
        secret: false,
        required: true,
        placeholder: "07000000000"
      },
      {
        name: "PUBLIC_BASE_URL",
        label: "Public HTTPS base URL",
        secret: false,
        required: false,
        hidden: true,
        placeholder: "https://your-tunnel.example"
      },
      {
        name: "PUBLIC_WS_BASE_URL",
        label: "Public WSS base URL",
        secret: false,
        required: false,
        hidden: true,
        placeholder: "wss://your-tunnel.example"
      }
    ]
  }
] as const;

export type AdminApiSettingSectionId = (typeof adminApiSettingSections)[number]["id"];
export type AdminApiSettingName = (typeof adminApiSettingSections)[number]["fields"][number]["name"];
export type AdminApiSettingsUpdate = Partial<Record<AdminApiSettingName, string>>;

export interface AdminApiSettingFieldResponse {
  name: AdminApiSettingName;
  label: string;
  secret: boolean;
  required: boolean;
  configured: boolean;
  hidden?: boolean;
  placeholder: string;
  defaultValue?: string;
  value?: string;
  maskedValue?: "configured";
}

export interface AdminApiSettingSectionResponse {
  id: AdminApiSettingSectionId;
  title: string;
  configured: boolean;
  missing: AdminApiSettingName[];
  fields: AdminApiSettingFieldResponse[];
}

export interface AdminApiSettingsResponse {
  ok: true;
  sections: AdminApiSettingSectionResponse[];
  envFile: ".env.local";
  saveMode: "blank-secret-keeps-existing-value";
}

export const allowedAdminApiSettingNames = new Set<AdminApiSettingName>(
  adminApiSettingSections.flatMap((section) => section.fields.map((field) => field.name))
);
const secretNames = new Set<AdminApiSettingName>(
  adminApiSettingSections.flatMap((section) => section.fields.filter((field) => field.secret).map((field) => field.name))
);

const trim = (value: string | undefined) => value?.trim() ?? "";

const configured = (env: Record<string, string | undefined>, name: AdminApiSettingName, defaultValue?: string) =>
  Boolean(trim(env[name]) || defaultValue);

export const buildAdminApiSettingsResponse = (
  env: Record<string, string | undefined> = process.env
): AdminApiSettingsResponse => ({
  ok: true,
  envFile: ".env.local",
  saveMode: "blank-secret-keeps-existing-value",
  sections: adminApiSettingSections.map((section) => {
    const missing = section.requiredKeys.filter((name) => !trim(env[name]));

    return {
      id: section.id,
      title: section.title,
      configured: missing.length === 0,
      missing,
      fields: section.fields.map((field) => {
        const defaultValue = "defaultValue" in field ? field.defaultValue : undefined;
        const value = trim(env[field.name]) || defaultValue || "";
        const isConfigured = configured(env, field.name, defaultValue);

        return {
          name: field.name,
          label: field.label,
          secret: field.secret,
          required: field.required,
          configured: isConfigured,
          hidden: "hidden" in field ? field.hidden : undefined,
          placeholder: field.placeholder,
          defaultValue,
          ...(field.secret
            ? { maskedValue: isConfigured ? ("configured" as const) : undefined }
            : { value })
        };
      })
    };
  })
});

export const normalizeAdminApiSettingsInput = (payload: unknown): AdminApiSettingsUpdate => {
  const source =
    payload && typeof payload === "object" && "settings" in payload
      ? (payload as { settings?: unknown }).settings
      : payload;

  if (!source || typeof source !== "object") {
    return {};
  }

  const updates: AdminApiSettingsUpdate = {};

  for (const [name, value] of Object.entries(source)) {
    if (!allowedAdminApiSettingNames.has(name as AdminApiSettingName) || typeof value !== "string") {
      continue;
    }

    if (/[\r\n]/.test(value)) {
      throw new Error(`${name} cannot contain line breaks.`);
    }

    const settingName = name as AdminApiSettingName;
    const normalized = value.trim();

    if (secretNames.has(settingName) && !normalized) {
      continue;
    }

    updates[settingName] = normalized;
  }

  return updates;
};

const formatEnvValue = (value: string) => {
  if (!value) return "";
  if (/^[A-Za-z0-9_./:@?&=+-]+$/.test(value)) return value;
  return JSON.stringify(value);
};

const formatEnvLine = (name: AdminApiSettingName, value: string) => `${name}=${formatEnvValue(value)}`;

const defaultCallbridgeBaseUrl = "https://bnd.happytalk.io/api/openapi";

export const autoFillAdminApiSettings = (
  updates: AdminApiSettingsUpdate,
  env: Record<string, string | undefined>
): AdminApiSettingsUpdate => {
  const next: AdminApiSettingsUpdate = { ...updates };
  const callbridgeApiKey = next.CALLBRIDGE_API_KEY || trim(env.CALLBRIDGE_API_KEY);

  if (callbridgeApiKey) {
    next.CALLBRIDGE_AGENT_API_KEY = next.CALLBRIDGE_AGENT_API_KEY || callbridgeApiKey;
    next.CALLBRIDGE_BASE_URL = next.CALLBRIDGE_BASE_URL || trim(env.CALLBRIDGE_BASE_URL) || defaultCallbridgeBaseUrl;
    next.OPENAI_REALTIME_TRANSCRIPTION_MODEL =
      next.OPENAI_REALTIME_TRANSCRIPTION_MODEL || trim(env.OPENAI_REALTIME_TRANSCRIPTION_MODEL) || "gpt-realtime-whisper";
  }

  return next;
};

export const normalizeAndAutoFillAdminApiSettings = (
  payload: unknown,
  env: Record<string, string | undefined>
) => autoFillAdminApiSettings(normalizeAdminApiSettingsInput(payload), env);

export const updateEnvContent = (content: string, updates: AdminApiSettingsUpdate) => {
  const updateEntries = Object.entries(updates).filter(([name]) =>
    allowedAdminApiSettingNames.has(name as AdminApiSettingName)
  );

  if (updateEntries.length === 0) {
    return content;
  }

  const updateMap = new Map(updateEntries as Array<[AdminApiSettingName, string]>);
  const seen = new Set<AdminApiSettingName>();
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/);
    const name = match?.[1] as AdminApiSettingName | undefined;

    if (name && updateMap.has(name)) {
      if (!seen.has(name)) {
        nextLines.push(formatEnvLine(name, updateMap.get(name)!));
        seen.add(name);
      }
      continue;
    }

    nextLines.push(line);
  }

  for (const [name, value] of updateMap) {
    if (!seen.has(name)) {
      nextLines.push(formatEnvLine(name, value));
    }
  }

  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
    nextLines.pop();
  }

  return `${nextLines.join("\n")}\n`;
};

export const saveAdminApiSettings = (
  payload: unknown,
  options: {
    envFilePath: string;
    exampleFilePath?: string;
    env?: Record<string, string | undefined>;
  }
) => {
  const env = options.env ?? process.env;
  const updates = normalizeAndAutoFillAdminApiSettings(payload, env);
  const existingContent = existsSync(options.envFilePath)
    ? readFileSync(options.envFilePath, "utf8")
    : options.exampleFilePath && existsSync(options.exampleFilePath)
      ? readFileSync(options.exampleFilePath, "utf8")
      : "";
  const nextContent = updateEnvContent(existingContent, updates);

  writeFileSync(options.envFilePath, nextContent, "utf8");

  for (const [name, value] of Object.entries(updates)) {
    env[name] = value;
  }

  return buildAdminApiSettingsResponse(env);
};

export const isLocalAdminHost = (hostHeader: string | undefined) => {
  const host = hostHeader?.trim().toLowerCase();
  if (!host) return false;
  if (host === "::1" || host.startsWith("[::1]")) return true;

  const hostname = host.split(":")[0];
  return hostname === "127.0.0.1" || hostname === "localhost";
};

const hostFromUrl = (value: string | undefined) => {
  if (!value?.trim()) return undefined;

  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
};

export const isLocalAdminRequest = (headers: {
  host?: string;
  forwardedHost?: string;
  origin?: string;
  referer?: string;
}) => {
  if (!isLocalAdminHost(headers.host)) {
    return false;
  }

  if (headers.forwardedHost && !isLocalAdminHost(headers.forwardedHost)) {
    return false;
  }

  const originHost = hostFromUrl(headers.origin);
  if (originHost && !isLocalAdminHost(originHost)) {
    return false;
  }

  const refererHost = hostFromUrl(headers.referer);
  if (refererHost && !isLocalAdminHost(refererHost)) {
    return false;
  }

  return true;
};
