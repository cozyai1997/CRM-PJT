export type LeadQuality = "new" | "qualified" | "duplicate" | "spam" | "contracted" | "low";

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
  leadQuality: LeadQuality;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  sourceChannel: string;
  firstInflowAt: string;
  lastContactAt: string;
  customerStatus: string;
  interestLevel: string;
  spamScore: number;
  duplicateGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  siteName: string;
  siteType: string;
  address: string;
  naverMapUrl: string;
  modelhouseAddress: string;
  parkingInfo: string;
  inboundNumber: string;
  salesStatus: string;
  projectSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationLog {
  id: string;
  customerId: string;
  siteId: string;
  consultantId: string | null;
  callSessionId: string | null;
  rawTranscript: string;
  aiSummary: string;
  customerIntent: string;
  interestLevel: string;
  concerns: string[];
  recommendedScript: string;
  forbiddenExpressionAlert: string;
  nextAction: string;
  consultantCorrection: string | null;
  resultStatus: string;
  createdAt: string;
}

export type CallSessionStatus =
  | "incoming"
  | "queued"
  | "ringing"
  | "in-progress"
  | "held"
  | "completed"
  | "missed"
  | "failed"
  | "canceled";

export interface CallSession {
  id: string;
  provider: "callbridge";
  direction: "inbound" | "outbound";
  status: CallSessionStatus;
  callerNumber: string;
  calledNumber: string;
  normalizedCallerNumber: string;
  customerId: string;
  siteId: string;
  consultantId: string | null;
  siteExternalId: string | null;
  cdrId: string;
  callActionId: string;
  ivrIp: string;
  agentId: string;
  agentType: string;
  liveTranscript: string;
  finalTranscript: string | null;
  aiAnalysisStatus: "not_started" | "queued" | "completed" | "failed";
  processedEventKeys: string[];
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface MessageLog {
  id: string;
  customerId: string;
  siteId: string;
  solapiMessageId: string | null;
  messageChannel: string;
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

export interface CallbackTask {
  id: string;
  customerId: string;
  siteId: string;
  reason: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
}

export interface AdLead {
  id: string;
  customerId: string;
  siteId: string;
  campaignId: string;
  keyword: string;
  landingPageUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  leadQuality: LeadQuality;
  isDuplicate: boolean;
  isSpam: boolean;
  costAttributed: number;
  createdAt: string;
}

export interface ConversionEvent {
  id: string;
  customerId: string;
  siteId: string;
  eventType: string;
  eventValue: string;
  eventAt: string;
  memo: string;
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

export interface CreateConsultationInput {
  customerName: string;
  phone: string;
  siteName: string;
  sourceChannel: string;
  transcript: string;
  analysis: ConsultationAnalysis;
  campaignId?: string;
  keyword?: string;
  landingPageUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  callSessionId?: string | null;
}

export interface CreateConsultationResult {
  customer: Customer;
  site: Site;
  consultation: ConsultationLog;
  adLead: AdLead;
}

export interface CreateCallSessionInput {
  provider: "callbridge";
  direction: "inbound" | "outbound";
  callerNumber: string;
  calledNumber: string;
  siteExternalId?: string | null;
  cdrId: string;
  callActionId: string;
  ivrIp: string;
  agentId: string;
  agentType: string;
  callerName?: string | null;
  siteName?: string | null;
}

export interface UpdateCallSessionInput {
  status?: CallSessionStatus;
  siteExternalId?: string | null;
  cdrId?: string;
  callActionId?: string;
  ivrIp?: string;
  agentId?: string;
  agentType?: string;
  liveTranscript?: string;
  finalTranscript?: string | null;
  aiAnalysisStatus?: CallSession["aiAnalysisStatus"];
  answeredAt?: string | null;
  endedAt?: string | null;
}

export interface CrmState {
  customers: Customer[];
  sites: Site[];
  consultations: ConsultationLog[];
  callSessions: CallSession[];
  messages: MessageLog[];
  reservations: Reservation[];
  callbacks: CallbackTask[];
  adLeads: AdLead[];
  conversionEvents: ConversionEvent[];
}
