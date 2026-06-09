export interface ConsultationAnalysis {
  customerIntent: string;
  interestLevel: string;
  mainConcerns: string[];
  recommendedScriptType: string;
  recommendedScript: string;
  nextAction: string;
  riskAlert: string;
  managerSummary: string;
  sentiment: string;
  leadQuality: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  sourceChannel: string;
  customerStatus: string;
  interestLevel: string;
  duplicateGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  siteName: string;
  address: string;
  naverMapUrl: string;
  modelhouseAddress: string;
  parkingInfo: string;
  salesStatus: string;
}

export interface ConsultationLog {
  id: string;
  customerId: string;
  siteId: string;
  callSessionId?: string | null;
  rawTranscript: string;
  aiSummary: string;
  customerIntent: string;
  interestLevel: string;
  concerns: string[];
  recommendedScript: string;
  forbiddenExpressionAlert: string;
  nextAction: string;
  resultStatus: string;
  createdAt: string;
}

export interface MessageLog {
  id: string;
  customerId: string;
  siteId: string;
  messageTemplateType: string;
  messageBody: string;
  sendStatus: string;
  triggerEvent: string;
  sentAt: string;
}

export interface Reservation {
  id: string;
  customerId: string;
  siteId: string;
  scheduledAt: string;
  status: string;
  memo: string;
  createdAt: string;
}

export interface AdLead {
  id: string;
  customerId: string;
  siteId: string;
  leadQuality: string;
  isDuplicate: boolean;
  isSpam: boolean;
  createdAt: string;
}

export type CallSessionStatus =
  | "incoming"
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "missed"
  | "failed"
  | "canceled";

export interface CallSession {
  id: string;
  provider: "callbridge";
  direction: "inbound" | "outbound";
  status: CallSessionStatus;
  customerId: string;
  siteId: string;
  callerNumber: string;
  calledNumber: string;
  normalizedCallerNumber: string;
  siteExternalId: string | null;
  cdrId: string;
  callActionId: string;
  ivrIp: string;
  agentId: string;
  agentType: string;
  liveTranscript: string;
  finalTranscript: string | null;
  aiAnalysisStatus: "not_started" | "queued" | "completed" | "failed";
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface DashboardMetrics {
  totalConsultations: number;
  connectedCalls: number;
  missedCalls: number;
  newCustomers: number;
  duplicateLeads: number;
  spamLeads: number;
  interestedCustomers: number;
  visitReservations: number;
  sentMessages: number;
  siteConversionRates: Array<{
    siteId: string;
    siteName: string;
    consultations: number;
    reservations: number;
    conversionRate: number;
  }>;
}

export interface CrmState {
  customers: Customer[];
  sites: Site[];
  consultations: ConsultationLog[];
  messages: MessageLog[];
  reservations: Reservation[];
  adLeads: AdLead[];
  callSessions: CallSession[];
}

export interface ConsultationResponse {
  transcript: string;
  analysis: ConsultationAnalysis;
  customer: Customer;
  site: Site;
  consultation: ConsultationLog;
  adLead: AdLead;
}

export interface HealthResponse {
  ok: boolean;
  openAiConfigured: boolean;
  solapiConfigured: boolean;
  solapiSenderNumberConfigured: boolean;
  callbridgeConfigured: boolean;
  realtimeTranscriptionPhase: string;
  docs: Record<string, string>;
}

export interface CallbridgeConfigResponse {
  ok: boolean;
  configured: boolean;
  missing: string[];
  displayNumberMasked: string | null;
  publicBaseUrlConfigured: boolean;
  publicWsBaseUrlConfigured: boolean;
  realtimeTranscriptionModel: string;
  agentWebSocketPath: string;
  docs: Record<string, string>;
}

export interface AdminApiSettingField {
  name: string;
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

export interface AdminApiSettingSection {
  id: string;
  title: string;
  configured: boolean;
  missing: string[];
  fields: AdminApiSettingField[];
}

export interface AdminApiSettingsResponse {
  ok: boolean;
  sections: AdminApiSettingSection[];
  envFile: string;
  saveMode: "blank-secret-keeps-existing-value";
}

export interface CallbridgeEvent {
  type: string;
  payload: CallSession | { callSession?: CallSession; delta?: string; final?: boolean; [key: string]: unknown };
  timestamp: string;
}
