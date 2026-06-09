interface SolapiEnv {
  SOLAPI_API_KEY?: string;
  SOLAPI_API_SECRET?: string;
  SOLAPI_SENDER_NUMBER?: string;
}

export interface SolapiConfig {
  apiKey: string;
  apiSecret: string;
  senderNumber: string;
}

interface SolapiClient {
  send: (input: {
    to: string;
    from: string;
    text: string;
    type: "SMS" | "LMS";
  }) => Promise<Record<string, unknown>>;
}

export interface SendSolapiMessageInput {
  to: string;
  text: string;
  templateType: string;
}

export interface SendSolapiMessageResult {
  providerMessageId: string | null;
  providerGroupId: string | null;
  status: "sent" | "failed";
  raw: Record<string, unknown>;
}

interface SendSolapiDeps {
  config: SolapiConfig;
  clientFactory?: (config: SolapiConfig) => SolapiClient;
}

export class MissingSolapiConfigError extends Error {
  constructor() {
    super("Solapi configuration is not complete");
    this.name = "MissingSolapiConfigError";
  }
}

export const normalizeKoreanPhone = (phone: string) => phone.replace(/\D/g, "");

export const isSolapiConfigured = (env: SolapiEnv = process.env) =>
  Boolean(env.SOLAPI_API_KEY?.trim() && env.SOLAPI_API_SECRET?.trim() && env.SOLAPI_SENDER_NUMBER?.trim());

export const getSolapiConfig = (env: SolapiEnv = process.env): SolapiConfig => {
  const apiKey = env.SOLAPI_API_KEY?.trim();
  const apiSecret = env.SOLAPI_API_SECRET?.trim();
  const senderNumber = env.SOLAPI_SENDER_NUMBER?.trim();

  if (!apiKey || !apiSecret || !senderNumber) {
    throw new MissingSolapiConfigError();
  }

  return {
    apiKey,
    apiSecret,
    senderNumber: normalizeKoreanPhone(senderNumber)
  };
};

const defaultClientFactory = async (config: SolapiConfig): Promise<SolapiClient> => {
  const solapi = await import("solapi");
  return new solapi.SolapiMessageService(config.apiKey, config.apiSecret) as SolapiClient;
};

const pickString = (value: unknown) => (typeof value === "string" ? value : null);

const pickMessageId = (response: Record<string, unknown>) => {
  const nested = response.message;

  if (nested && typeof nested === "object" && "messageId" in nested) {
    return pickString((nested as { messageId?: unknown }).messageId);
  }

  return pickString(response.messageId) ?? pickString(response.message_id);
};

export const sendSolapiMessage = async (
  input: SendSolapiMessageInput,
  deps: SendSolapiDeps
): Promise<SendSolapiMessageResult> => {
  const client = deps.clientFactory ? deps.clientFactory(deps.config) : await defaultClientFactory(deps.config);
  const text = input.text.trim();

  if (!text) {
    throw new Error("Message body cannot be empty");
  }

  const response = await client.send({
    to: normalizeKoreanPhone(input.to),
    from: normalizeKoreanPhone(deps.config.senderNumber),
    text,
    type: text.length > 45 ? "LMS" : "SMS"
  });

  return {
    providerMessageId: pickMessageId(response),
    providerGroupId: pickString(response.groupId) ?? pickString(response.group_id),
    status: "sent",
    raw: response
  };
};
