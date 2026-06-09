import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AdLead,
  CallSession,
  CallbackTask,
  ConversionEvent,
  CreateCallSessionInput,
  CreateConsultationInput,
  CreateConsultationResult,
  Customer,
  CrmState,
  DashboardMetrics,
  MessageLog,
  Reservation,
  Site,
  UpdateCallSessionInput
} from "../types";

const emptyState = (): CrmState => ({
  customers: [],
  sites: [],
  consultations: [],
  callSessions: [],
  messages: [],
  reservations: [],
  callbacks: [],
  adLeads: [],
  conversionEvents: []
});

const nowIso = () => new Date().toISOString();

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

const nextId = (prefix: string, count: number) => `${prefix}-${count + 1}`;

const hydrateCallSession = (input: Partial<CallSession> & Record<string, unknown>): CallSession => ({
  id: String(input.id ?? nextId("call", 0)),
  provider: "callbridge",
  direction: input.direction ?? "inbound",
  status: input.status ?? "completed",
  callerNumber: String(input.callerNumber ?? ""),
  calledNumber: String(input.calledNumber ?? ""),
  normalizedCallerNumber: String(input.normalizedCallerNumber ?? normalizePhone(String(input.callerNumber ?? ""))),
  customerId: String(input.customerId ?? ""),
  siteId: String(input.siteId ?? ""),
  consultantId: input.consultantId ?? null,
  siteExternalId: input.siteExternalId ?? null,
  cdrId: String(input.cdrId ?? input.id ?? ""),
  callActionId: String(input.callActionId ?? input.conferenceName ?? input.id ?? ""),
  ivrIp: String(input.ivrIp ?? ""),
  agentId: String(input.agentId ?? ""),
  agentType: String(input.agentType ?? "voice"),
  liveTranscript: String(input.liveTranscript ?? ""),
  finalTranscript: input.finalTranscript ?? null,
  aiAnalysisStatus: input.aiAnalysisStatus ?? "not_started",
  processedEventKeys: input.processedEventKeys ?? [],
  startedAt: String(input.startedAt ?? input.updatedAt ?? nowIso()),
  answeredAt: input.answeredAt ?? null,
  endedAt: input.endedAt ?? null,
  updatedAt: String(input.updatedAt ?? nowIso())
});

const hydrateState = (state: Partial<CrmState>): CrmState => ({
  ...emptyState(),
  ...state,
  customers: state.customers ?? [],
  sites: state.sites ?? [],
  consultations: state.consultations ?? [],
  callSessions: (state.callSessions ?? []).map((item) => hydrateCallSession(item as Partial<CallSession> & Record<string, unknown>)),
  messages: state.messages ?? [],
  reservations: state.reservations ?? [],
  callbacks: state.callbacks ?? [],
  adLeads: state.adLeads ?? [],
  conversionEvents: state.conversionEvents ?? []
});

export interface CrmStore {
  createConsultation(input: CreateConsultationInput): Promise<CreateConsultationResult>;
  createCallSession(input: CreateCallSessionInput): Promise<CallSession>;
  updateCallSession(id: string, input: UpdateCallSessionInput): Promise<CallSession>;
  appendCallTranscript(id: string, delta: string, options?: { final?: boolean }): Promise<CallSession>;
  recordCallEvent(id: string, eventKey: string): Promise<boolean>;
  findCallSessionById(id: string): Promise<CallSession | null>;
  findCallSessionByCdrId(cdrId: string): Promise<CallSession | null>;
  findCallSessionByCallActionId(callActionId: string): Promise<CallSession | null>;
  createReservation(input: Omit<Reservation, "id" | "status" | "createdAt"> & Partial<Pick<Reservation, "status">>): Promise<Reservation>;
  createMessageLog(input: Omit<MessageLog, "id" | "solapiMessageId" | "messageChannel" | "sendStatus" | "sentAt"> & Partial<Pick<MessageLog, "solapiMessageId" | "messageChannel" | "sendStatus">>): Promise<MessageLog>;
  createCallback(input: Omit<CallbackTask, "id" | "status" | "createdAt"> & Partial<Pick<CallbackTask, "status">>): Promise<CallbackTask>;
  createConversionEvent(input: Omit<ConversionEvent, "id" | "eventAt"> & Partial<Pick<ConversionEvent, "eventAt">>): Promise<ConversionEvent>;
  getDashboard(): Promise<DashboardMetrics>;
  listState(): Promise<CrmState>;
}

const defaultSite = (siteName: string, count: number): Site => {
  const timestamp = nowIso();

  return {
    id: nextId("site", count),
    siteName,
    siteType: "분양 현장",
    address: "",
    naverMapUrl: "",
    modelhouseAddress: "",
    parkingInfo: "",
    inboundNumber: "",
    salesStatus: "상담중",
    projectSummary: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createMemoryCrmStore = (initialState: Partial<CrmState> = emptyState(), onChange?: (state: CrmState) => void): CrmStore => {
  const state = hydrateState(initialState);

  const persist = () => onChange?.(state);

  return {
    async createConsultation(input) {
      const timestamp = nowIso();
      const normalizedPhone = normalizePhone(input.phone);
      let site = state.sites.find((item) => item.siteName === input.siteName);

      if (!site) {
        site = defaultSite(input.siteName, state.sites.length);
        state.sites.push(site);
      }

      let customer = state.customers.find((item) => item.normalizedPhone === normalizedPhone);
      const isDuplicate = Boolean(customer);

      if (!customer) {
        customer = {
          id: nextId("customer", state.customers.length),
          name: input.customerName,
          phone: input.phone,
          normalizedPhone,
          sourceChannel: input.sourceChannel,
          firstInflowAt: timestamp,
          lastContactAt: timestamp,
          customerStatus: "신규",
          interestLevel: input.analysis.interestLevel,
          spamScore: input.analysis.leadQuality === "spam" ? 100 : 0,
          duplicateGroupId: null,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        state.customers.push(customer);
      } else {
        customer.lastContactAt = timestamp;
        customer.updatedAt = timestamp;
        customer.interestLevel = input.analysis.interestLevel;
        customer.customerStatus = isDuplicate ? "재문의" : customer.customerStatus;
        customer.duplicateGroupId = isDuplicate ? customer.id : customer.duplicateGroupId;
      }

      const consultation = {
        id: nextId("consultation", state.consultations.length),
        customerId: customer.id,
        siteId: site.id,
        consultantId: null,
        callSessionId: input.callSessionId ?? null,
        rawTranscript: input.transcript,
        aiSummary: input.analysis.managerSummary,
        customerIntent: input.analysis.customerIntent,
        interestLevel: input.analysis.interestLevel,
        concerns: input.analysis.mainConcerns,
        recommendedScript: input.analysis.recommendedScript,
        forbiddenExpressionAlert: input.analysis.riskAlert,
        nextAction: input.analysis.nextAction,
        consultantCorrection: null,
        resultStatus: "분석완료",
        createdAt: timestamp
      };
      state.consultations.push(consultation);

      const adLead: AdLead = {
        id: nextId("ad-lead", state.adLeads.length),
        customerId: customer.id,
        siteId: site.id,
        campaignId: input.campaignId ?? "",
        keyword: input.keyword ?? "",
        landingPageUrl: input.landingPageUrl ?? "",
        utmSource: input.utmSource ?? input.sourceChannel,
        utmMedium: input.utmMedium ?? "",
        utmCampaign: input.utmCampaign ?? "",
        leadQuality: isDuplicate ? "duplicate" : input.analysis.leadQuality,
        isDuplicate,
        isSpam: input.analysis.leadQuality === "spam",
        costAttributed: 0,
        createdAt: timestamp
      };
      state.adLeads.push(adLead);
      persist();

      return { customer, site, consultation, adLead };
    },

    async createCallSession(input) {
      const existing = state.callSessions.find((item) => item.cdrId === input.cdrId || item.callActionId === input.callActionId);

      if (existing) {
        return existing;
      }

      const timestamp = nowIso();
      const normalizedCallerNumber = normalizePhone(input.callerNumber);
      const normalizedCalledNumber = normalizePhone(input.calledNumber);
      let site = state.sites.find((item) => normalizePhone(item.inboundNumber) === normalizedCalledNumber);

      if (!site) {
        site = defaultSite(input.siteName ?? "Callbridge", state.sites.length);
        site.inboundNumber = input.calledNumber;
        state.sites.push(site);
      }

      let customer = state.customers.find((item) => item.normalizedPhone === normalizedCallerNumber);

      if (!customer) {
        customer = {
          id: nextId("customer", state.customers.length),
          name: input.callerName?.trim() || "전화 고객",
          phone: input.callerNumber,
          normalizedPhone: normalizedCallerNumber,
          sourceChannel: "callbridge",
          firstInflowAt: timestamp,
          lastContactAt: timestamp,
          customerStatus: "new",
          interestLevel: "unknown",
          spamScore: 0,
          duplicateGroupId: null,
          createdAt: timestamp,
          updatedAt: timestamp
        } satisfies Customer;
        state.customers.push(customer);
      } else {
        customer.lastContactAt = timestamp;
        customer.updatedAt = timestamp;
      }

      const callSession: CallSession = {
        id: nextId("call", state.callSessions.length),
        provider: input.provider,
        direction: input.direction,
        status: "incoming",
        callerNumber: input.callerNumber,
        calledNumber: input.calledNumber,
        normalizedCallerNumber,
        customerId: customer.id,
        siteId: site.id,
        consultantId: null,
        siteExternalId: input.siteExternalId ?? null,
        cdrId: input.cdrId,
        callActionId: input.callActionId,
        ivrIp: input.ivrIp,
        agentId: input.agentId,
        agentType: input.agentType,
        liveTranscript: "",
        finalTranscript: null,
        aiAnalysisStatus: "not_started",
        processedEventKeys: [],
        startedAt: timestamp,
        answeredAt: null,
        endedAt: null,
        updatedAt: timestamp
      };

      state.callSessions.unshift(callSession);
      persist();
      return callSession;
    },

    async updateCallSession(id, input) {
      const callSession = state.callSessions.find((item) => item.id === id);

      if (!callSession) {
        throw new Error("Call session was not found.");
      }

      Object.assign(callSession, input, { updatedAt: nowIso() });
      persist();
      return callSession;
    },

    async appendCallTranscript(id, delta, options) {
      const callSession = state.callSessions.find((item) => item.id === id);

      if (!callSession) {
        throw new Error("Call session was not found.");
      }

      callSession.liveTranscript += delta;

      if (options?.final) {
        callSession.finalTranscript = callSession.liveTranscript.trim();
      }

      callSession.updatedAt = nowIso();
      persist();
      return callSession;
    },

    async recordCallEvent(id, eventKey) {
      const callSession = state.callSessions.find((item) => item.id === id);

      if (!callSession) {
        throw new Error("Call session was not found.");
      }

      if (callSession.processedEventKeys.includes(eventKey)) {
        return false;
      }

      callSession.processedEventKeys.push(eventKey);
      callSession.updatedAt = nowIso();
      persist();
      return true;
    },

    async findCallSessionById(id) {
      return state.callSessions.find((item) => item.id === id) ?? null;
    },

    async findCallSessionByCdrId(cdrId) {
      return state.callSessions.find((item) => item.cdrId === cdrId) ?? null;
    },

    async findCallSessionByCallActionId(callActionId) {
      return state.callSessions.find((item) => item.callActionId === callActionId) ?? null;
    },

    async createReservation(input) {
      const reservation: Reservation = {
        id: nextId("reservation", state.reservations.length),
        customerId: input.customerId,
        siteId: input.siteId,
        scheduledAt: input.scheduledAt,
        status: input.status ?? "예약확정",
        memo: input.memo,
        createdAt: nowIso()
      };
      state.reservations.push(reservation);
      persist();
      return reservation;
    },

    async createMessageLog(input) {
      const message: MessageLog = {
        id: nextId("message", state.messages.length),
        customerId: input.customerId,
        siteId: input.siteId,
        solapiMessageId: input.solapiMessageId ?? null,
        messageChannel: input.messageChannel ?? "SMS",
        messageTemplateType: input.messageTemplateType,
        messageBody: input.messageBody,
        sendStatus: input.sendStatus ?? "queued",
        triggerEvent: input.triggerEvent,
        sentAt: nowIso()
      };
      state.messages.push(message);
      persist();
      return message;
    },

    async createCallback(input) {
      const callback: CallbackTask = {
        id: nextId("callback", state.callbacks.length),
        customerId: input.customerId,
        siteId: input.siteId,
        reason: input.reason,
        status: input.status ?? "open",
        dueAt: input.dueAt,
        createdAt: nowIso()
      };
      state.callbacks.push(callback);
      persist();
      return callback;
    },

    async createConversionEvent(input) {
      const event: ConversionEvent = {
        id: nextId("conversion", state.conversionEvents.length),
        customerId: input.customerId,
        siteId: input.siteId,
        eventType: input.eventType,
        eventValue: input.eventValue,
        eventAt: input.eventAt ?? nowIso(),
        memo: input.memo
      };
      state.conversionEvents.push(event);
      persist();
      return event;
    },

    async getDashboard() {
      const interestedCustomerIds = new Set(
        state.consultations
          .filter((item) => item.interestLevel === "높음")
          .map((item) => item.customerId)
      );

      const siteConversionRates = state.sites.map((site) => {
        const consultations = state.consultations.filter((item) => item.siteId === site.id).length;
        const reservations = state.reservations.filter((item) => item.siteId === site.id).length;

        return {
          siteId: site.id,
          siteName: site.siteName,
          consultations,
          reservations,
          conversionRate: consultations === 0 ? 0 : Number((reservations / consultations).toFixed(2))
        };
      });

      return {
        totalConsultations: state.consultations.length,
        connectedCalls: state.consultations.length,
        missedCalls: state.callbacks.length,
        newCustomers: state.customers.length,
        duplicateLeads: state.adLeads.filter((item) => item.isDuplicate).length,
        spamLeads: state.adLeads.filter((item) => item.isSpam).length,
        interestedCustomers: interestedCustomerIds.size,
        visitReservations: state.reservations.length,
        sentMessages: state.messages.length,
        siteConversionRates
      };
    },

    async listState() {
      return state;
    }
  };
};

export const createFileCrmStore = (filePath: string): CrmStore => {
  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(emptyState(), null, 2), "utf-8");
  }

  const state = JSON.parse(readFileSync(filePath, "utf-8")) as CrmState;

  return createMemoryCrmStore(state, (nextState) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(nextState, null, 2), "utf-8");
  });
};
