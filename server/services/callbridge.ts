export interface CallbridgeEnv {
  CALLBRIDGE_API_KEY?: string;
  CALLBRIDGE_AGENT_API_KEY?: string;
  CALLBRIDGE_BASE_URL?: string;
  CALLBRIDGE_DISPLAY_NUMBER?: string;
  PUBLIC_BASE_URL?: string;
  PUBLIC_WS_BASE_URL?: string;
  OPENAI_REALTIME_TRANSCRIPTION_MODEL?: string;
}

export interface CallbridgeConfig {
  apiKey: string;
  agentApiKey: string;
  baseUrl: string;
  displayNumber: string | null;
  publicBaseUrl: string;
  publicWsBaseUrl: string;
  realtimeTranscriptionModel: string;
}

export interface CallbridgeConfigStatus {
  configured: boolean;
  missing: string[];
  displayNumberMasked: string | null;
  publicBaseUrlConfigured: boolean;
  publicWsBaseUrlConfigured: boolean;
  realtimeTranscriptionModel: string;
  agentWebSocketPath: string;
}

export interface CallbridgeCallConfig {
  siteId: string;
  caller: string;
  callee: string;
  cdrId: string;
  callActionId: string;
  ivrIp: string;
  agentId: string;
  agentType: string;
}

export interface CallbridgeAudioFormat {
  phone_output_audio_format: string;
  phone_input_audio_format: string;
}

export interface CallbridgeSessionStartMessage {
  call_config: CallbridgeCallConfig;
  audio_format: CallbridgeAudioFormat;
}

export interface CallbridgeSessionStartedMessage extends CallbridgeSessionStartMessage {
  type: "started";
}

export interface CallbridgeAgentTerminatePayload {
  ivrIp: string;
  id: string;
  cdrId: string;
  callerNo: string;
  calleeNo: string;
  actionId: string;
  ment: string;
}

export class MissingCallbridgeConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Callbridge configuration is incomplete: ${missing.join(", ")}`);
    this.name = "MissingCallbridgeConfigError";
  }
}

const trim = (value: string | undefined) => value?.trim() ?? "";

const maskPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return value;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

const defaultBaseUrl = "https://bnd.happytalk.io/api/openapi";
const defaultRealtimeModel = "gpt-realtime-whisper";
const defaultPublicBaseUrl = "http://127.0.0.1:8787";
const defaultPublicWsBaseUrl = "ws://127.0.0.1:8787";

export const getCallbridgeConfigStatus = (env: CallbridgeEnv): CallbridgeConfigStatus => {
  const missing = [
    ["CALLBRIDGE_API_KEY", trim(env.CALLBRIDGE_API_KEY)],
    ["CALLBRIDGE_DISPLAY_NUMBER", trim(env.CALLBRIDGE_DISPLAY_NUMBER)]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    configured: missing.length === 0,
    missing,
    displayNumberMasked: trim(env.CALLBRIDGE_DISPLAY_NUMBER) ? maskPhoneNumber(trim(env.CALLBRIDGE_DISPLAY_NUMBER)) : null,
    publicBaseUrlConfigured: Boolean(trim(env.PUBLIC_BASE_URL)),
    publicWsBaseUrlConfigured: Boolean(trim(env.PUBLIC_WS_BASE_URL)),
    realtimeTranscriptionModel: trim(env.OPENAI_REALTIME_TRANSCRIPTION_MODEL) || defaultRealtimeModel,
    agentWebSocketPath: "/api/callbridge/agent"
  };
};

export const getCallbridgeConfig = (env: CallbridgeEnv): CallbridgeConfig => {
  const status = getCallbridgeConfigStatus(env);

  if (!status.configured) {
    throw new MissingCallbridgeConfigError(status.missing);
  }

  const apiKey = trim(env.CALLBRIDGE_API_KEY);

  return {
    apiKey,
    agentApiKey: trim(env.CALLBRIDGE_AGENT_API_KEY) || apiKey,
    baseUrl: (trim(env.CALLBRIDGE_BASE_URL) || defaultBaseUrl).replace(/\/$/, ""),
    displayNumber: trim(env.CALLBRIDGE_DISPLAY_NUMBER) || null,
    publicBaseUrl: (trim(env.PUBLIC_BASE_URL) || defaultPublicBaseUrl).replace(/\/$/, ""),
    publicWsBaseUrl: (trim(env.PUBLIC_WS_BASE_URL) || defaultPublicWsBaseUrl).replace(/\/$/, ""),
    realtimeTranscriptionModel: trim(env.OPENAI_REALTIME_TRANSCRIPTION_MODEL) || defaultRealtimeModel
  };
};

export const isCallbridgeSessionStartMessage = (message: unknown): message is CallbridgeSessionStartMessage => {
  if (!message || typeof message !== "object") return false;

  const candidate = message as Partial<CallbridgeSessionStartMessage>;
  const callConfig = candidate.call_config;
  const audioFormat = candidate.audio_format;

  return Boolean(
    callConfig &&
      audioFormat &&
      typeof callConfig.siteId === "string" &&
      typeof callConfig.caller === "string" &&
      typeof callConfig.callee === "string" &&
      typeof callConfig.cdrId === "string" &&
      typeof callConfig.callActionId === "string" &&
      typeof callConfig.ivrIp === "string" &&
      typeof callConfig.agentId === "string" &&
      typeof callConfig.agentType === "string" &&
      typeof audioFormat.phone_output_audio_format === "string" &&
      typeof audioFormat.phone_input_audio_format === "string"
  );
};

export const createCallbridgeSessionStartedMessage = (
  message: CallbridgeSessionStartMessage
): CallbridgeSessionStartedMessage => ({
  type: "started",
  call_config: message.call_config,
  audio_format: message.audio_format
});

export const isAuthorizedCallbridgeAgentRequest = (
  config: CallbridgeConfig,
  request: {
    headers: Record<string, string | string[] | undefined>;
    url?: string;
  }
) => {
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const xApiKeyValue = request.headers["x-api-key"];
  const xApiKey = Array.isArray(xApiKeyValue) ? xApiKeyValue[0] : xApiKeyValue;
  const url = new URL(request.url ?? "/", "http://localhost");
  const queryApiKey = url.searchParams.get("apiKey") ?? "";

  return [bearer, xApiKey, queryApiKey].some((candidate) => candidate === config.agentApiKey);
};

export const buildAgentTerminateRequest = (config: CallbridgeConfig, payload: CallbridgeAgentTerminatePayload) => ({
  url: `${config.baseUrl}/calls/agent-terminate`,
  init: {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }
});

export const terminateCallbridgeAgentCall = async (
  config: CallbridgeConfig,
  payload: CallbridgeAgentTerminatePayload,
  fetcher: typeof fetch = fetch
) => {
  const request = buildAgentTerminateRequest(config, payload);
  const response = await fetcher(request.url, request.init);
  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: unknown; data?: unknown };

  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : `Callbridge terminate failed with status ${response.status}.`);
  }

  return body;
};
