import type {
  AdminAuthConfigResponse,
  AdminApiSettingsResponse,
  CallSession,
  CallbridgeConfigResponse,
  ConsultationResponse,
  CrmState,
  DashboardMetrics,
  HealthResponse
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const readJson = async <T>(response: Response): Promise<T> => {
  const body = await response.json();

  if (!response.ok) {
    throw new ApiError(body.detail || body.error || "요청 처리에 실패했습니다.", response.status);
  }

  return body as T;
};

const authHeaders = (accessToken?: string | null): Record<string, string> =>
  accessToken
    ? {
        Authorization: `Bearer ${accessToken}`
      }
    : {};

export const getHealth = async () => readJson<HealthResponse>(await fetch("/api/health"));

export const getDashboard = async () => readJson<DashboardMetrics>(await fetch("/api/dashboard"));

export const getCrmState = async () => readJson<CrmState>(await fetch("/api/state"));

export const getCallbridgeConfig = async () => readJson<CallbridgeConfigResponse>(await fetch("/api/callbridge/config"));

export const getAdminAuthConfig = async () => readJson<AdminAuthConfigResponse>(await fetch("/api/admin/auth-config"));

export const getAdminApiSettings = async (accessToken?: string | null) =>
  readJson<AdminApiSettingsResponse>(
    await fetch("/api/admin/api-settings", {
      headers: authHeaders(accessToken)
    })
  );

export const saveAdminApiSettings = async (settings: Record<string, string>, accessToken?: string | null) =>
  readJson<AdminApiSettingsResponse>(
    await fetch("/api/admin/api-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify({ settings })
    })
  );

export const createConsultation = async (formData: FormData) =>
  readJson<ConsultationResponse>(
    await fetch("/api/consultations", {
      method: "POST",
      body: formData
    })
  );

export const createReservation = async (payload: {
  customerId: string;
  siteId: string;
  scheduledAt: string;
  memo: string;
}) =>
  readJson(
    await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );

export const createMessage = async (payload: {
  customerId: string;
  siteId: string;
  messageTemplateType: string;
  messageBody: string;
  triggerEvent: string;
}) =>
  readJson(
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );

export const refineMessageDraft = async (payload: {
  draft: string;
  customerName?: string;
  siteName?: string;
  customerIntent?: string;
  interestLevel?: string;
  mainConcerns?: string[];
  nextAction?: string;
}) =>
  readJson<{ refinedText: string }>(
    await fetch("/api/messages/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );

export const createCallback = async (payload: {
  customerId: string;
  siteId: string;
  reason: string;
  dueAt: string | null;
}) =>
  readJson(
    await fetch("/api/callbacks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );

export const hangupCallbridgeCall = async (callSessionId: string) =>
  readJson<{ callSession: CallSession; callbridge: unknown }>(
    await fetch(`/api/callbridge/calls/${encodeURIComponent(callSessionId)}/hangup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
  );
