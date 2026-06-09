import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FileAudio,
  Headphones,
  MapPinned,
  MessageSquare,
  Mic2,
  MicOff,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createCallback,
  createConsultation,
  createMessage,
  createReservation,
  ApiError,
  getAdminApiSettings,
  getAdminAuthConfig,
  getCallbridgeConfig,
  getCrmState,
  getDashboard,
  getHealth,
  hangupCallbridgeCall,
  refineMessageDraft,
  saveAdminApiSettings
} from "./api";
import { createAdminAuthClient, getAdminSession, signInAdmin, signOutAdmin } from "./adminAuth";
import {
  buildCallbridgeAgentWebSocketUrl,
  canRegisterCallbridgeWebSocket,
  createAdminForm,
  shouldAutoOpenAdminSettings,
  visibleAdminFields
} from "./adminSettingsForm";
import { createCallbridgeBrowserClient, type CallbridgeBrowserClient } from "./callbridgeClient";
import type {
  CallSession,
  AdminApiSettingsResponse,
  AdminAuthConfigResponse,
  CallbridgeConfigResponse,
  CallbridgeEvent,
  ConsultationLog,
  ConsultationResponse,
  CrmState,
  Customer,
  DashboardMetrics,
  HealthResponse,
  Site
} from "./types";

const emptyState: CrmState = {
  customers: [],
  sites: [],
  consultations: [],
  messages: [],
  reservations: [],
  adLeads: [],
  callSessions: []
};

const emptyDashboard: DashboardMetrics = {
  totalConsultations: 0,
  connectedCalls: 0,
  missedCalls: 0,
  newCustomers: 0,
  duplicateLeads: 0,
  spamLeads: 0,
  interestedCustomers: 0,
  visitReservations: 0,
  sentMessages: 0,
  siteConversionRates: []
};

const managers = [
  { name: "현장 팀장", specialty: "계약 조건", status: "대기" },
  { name: "분양 상담원", specialty: "방문 예약", status: "통화 가능" },
  { name: "모델하우스 안내", specialty: "위치/주차", status: "대기" }
];

const liveCallStatuses = new Set(["incoming", "queued", "ringing", "in-progress"]);

const isLiveCall = (callSession: CallSession) => liveCallStatuses.has(callSession.status);

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const callStatusLabel = (status: CallSession["status"]) => {
  const labels: Record<CallSession["status"], string> = {
    incoming: "수신 중",
    queued: "대기열",
    ringing: "대기 중",
    "in-progress": "통화 중",
    completed: "종료",
    missed: "부재",
    failed: "실패",
    canceled: "취소"
  };

  return labels[status] ?? status;
};

const eventCallSession = (event: CallbridgeEvent): CallSession | null => {
  const payload = event.payload;

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  if ("id" in payload && "cdrId" in payload) {
    return payload as CallSession;
  }

  if ("callSession" in payload && payload.callSession) {
    return payload.callSession;
  }

  return null;
};

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [callbridgeConfig, setCallbridgeConfig] = useState<CallbridgeConfigResponse | null>(null);
  const [adminAuthConfig, setAdminAuthConfig] = useState<AdminAuthConfigResponse | null>(null);
  const [adminSettings, setAdminSettings] = useState<AdminApiSettingsResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetrics>(emptyDashboard);
  const [crmState, setCrmState] = useState<CrmState>(emptyState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [lastResult, setLastResult] = useState<ConsultationResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefiningMessage, setIsRefiningMessage] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isAdminSigningIn, setIsAdminSigningIn] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [adminForm, setAdminForm] = useState<Record<string, string>>({});
  const [adminLoginForm, setAdminLoginForm] = useState({ email: "", password: "" });
  const [adminAccessToken, setAdminAccessToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isAdminAuthRequired, setIsAdminAuthRequired] = useState(false);
  const [visibleSecretFields, setVisibleSecretFields] = useState<Record<string, boolean>>({});
  const [webSocketCopyStatus, setWebSocketCopyStatus] = useState("");
  const [callStatus, setCallStatus] = useState("상담석 대기");
  const [actionStatus, setActionStatus] = useState("");
  const [error, setError] = useState("");
  const callbridgeClientRef = useRef<CallbridgeBrowserClient | null>(null);
  const adminAutoOpenedRef = useRef(false);

  const selectedConsultation = useMemo(() => {
    if (selectedId) {
      return crmState.consultations.find((item) => item.id === selectedId) ?? null;
    }

    return crmState.consultations[0] ?? null;
  }, [crmState.consultations, selectedId]);

  const selectedCustomer = selectedConsultation
    ? crmState.customers.find((item) => item.id === selectedConsultation.customerId) ?? null
    : null;
  const selectedSite = selectedConsultation
    ? crmState.sites.find((item) => item.id === selectedConsultation.siteId) ?? null
    : null;
  const selectedLead = selectedConsultation
    ? crmState.adLeads.find((item) => item.customerId === selectedConsultation.customerId) ?? null
    : null;

  const activeCall = useMemo(() => {
    const callSessions = crmState.callSessions ?? [];

    if (activeCallId) {
      const selected = callSessions.find((item) => item.id === activeCallId);
      if (selected) return selected;
    }

    return callSessions.find(isLiveCall) ?? callSessions[0] ?? null;
  }, [activeCallId, crmState.callSessions]);

  const activeCallCustomer = activeCall ? crmState.customers.find((item) => item.id === activeCall.customerId) ?? null : null;
  const activeCallSite = activeCall ? crmState.sites.find((item) => item.id === activeCall.siteId) ?? null : null;
  const callbridgeAgentWebSocketUrl = useMemo(() => buildCallbridgeAgentWebSocketUrl(window.location), []);
  const canUseCallbridgeAgentUrl = useMemo(() => canRegisterCallbridgeWebSocket(window.location), []);

  const refresh = async () => {
    const [healthResult, dashboardResult, stateResult, callbridgeConfigResult] = await Promise.all([
      getHealth(),
      getDashboard(),
      getCrmState(),
      getCallbridgeConfig()
    ]);

    setHealth(healthResult);
    setDashboard(dashboardResult);
    setCrmState(stateResult);
    setCallbridgeConfig(callbridgeConfigResult);
    setSelectedId((current) => {
      if (current && stateResult.consultations.some((item) => item.id === current)) return current;
      return stateResult.consultations[0]?.id ?? null;
    });
    setActiveCallId((current) => {
      const callSessions = stateResult.callSessions ?? [];
      if (current && callSessions.some((item) => item.id === current)) return current;
      return callSessions.find(isLiveCall)?.id ?? callSessions[0]?.id ?? null;
    });
  };

  const loadAdminAuthConfig = async () => {
    const config = await getAdminAuthConfig();
    setAdminAuthConfig(config);

    const client = createAdminAuthClient(config);
    const session = await getAdminSession(client);
    if (session?.access_token) {
      setAdminAccessToken(session.access_token);
      setAdminEmail(session.user.email ?? null);
      return session.access_token;
    }

    return null;
  };

  const loadAdminSettings = async (accessToken = adminAccessToken) => {
    const settings = await getAdminApiSettings(accessToken);
    setAdminSettings(settings);
    setAdminForm(createAdminForm(settings));
    setIsAdminAuthRequired(false);
  };

  const handleOpenAdminSettings = async () => {
    setError("");
    setActionStatus("");
    setIsAdminOpen(true);

    try {
      const token = await loadAdminAuthConfig();
      await loadAdminSettings(token);
    } catch (settingsError) {
      if (settingsError instanceof ApiError && [401, 403].includes(settingsError.status)) {
        setIsAdminAuthRequired(true);
        setAdminSettings(null);
        setError("");
        return;
      }

      setError(settingsError instanceof Error ? settingsError.message : "관리자 API 설정을 불러오지 못했습니다.");
    }
  };

  const handleAdminLoginFieldChange = (name: "email" | "password", value: string) => {
    setAdminLoginForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleAdminSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setActionStatus("");
    setIsAdminSigningIn(true);

    try {
      const config = adminAuthConfig ?? (await getAdminAuthConfig());
      setAdminAuthConfig(config);
      const client = createAdminAuthClient(config);
      if (!client) {
        throw new Error("Supabase 관리자 로그인이 설정되지 않았습니다.");
      }

      const session = await signInAdmin(client, adminLoginForm.email.trim(), adminLoginForm.password);
      if (!session?.access_token) {
        throw new Error("Supabase 세션을 만들지 못했습니다.");
      }

      setAdminAccessToken(session.access_token);
      setAdminEmail(session.user.email ?? adminLoginForm.email.trim());
      setAdminLoginForm({ email: "", password: "" });
      await loadAdminSettings(session.access_token);
      setActionStatus("관리자 로그인이 완료되었습니다.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "관리자 로그인에 실패했습니다.");
    } finally {
      setIsAdminSigningIn(false);
    }
  };

  const handleAdminSignOut = async () => {
    await signOutAdmin(createAdminAuthClient(adminAuthConfig ?? { ok: true, configured: false, supabaseUrl: "", publishableKey: "" }));
    setAdminAccessToken(null);
    setAdminEmail(null);
    setAdminSettings(null);
    setAdminForm({});
    setIsAdminAuthRequired(true);
  };

  const handleAdminFieldChange = (name: string, value: string) => {
    setAdminForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleToggleSecretField = (name: string) => {
    setVisibleSecretFields((current) => ({
      ...current,
      [name]: !current[name]
    }));
  };

  const handleSaveAdminSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setActionStatus("");
    setIsSavingSettings(true);

    try {
      const settings = await saveAdminApiSettings(adminForm, adminAccessToken);
      setAdminSettings(settings);
      setAdminForm(createAdminForm(settings));
      await refresh();
      setActionStatus("관리자 API 설정이 저장되었습니다.");
    } catch (settingsError) {
      if (settingsError instanceof ApiError && [401, 403].includes(settingsError.status)) {
        setIsAdminAuthRequired(true);
      }
      setError(settingsError instanceof Error ? settingsError.message : "관리자 API 설정 저장에 실패했습니다.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCopyCallbridgeWebSocket = async () => {
    if (!callbridgeAgentWebSocketUrl) {
      setWebSocketCopyStatus("외부 HTTPS 주소로 접속하면 자동 생성됩니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(callbridgeAgentWebSocketUrl);
      setWebSocketCopyStatus("WebSocket 주소를 복사했습니다.");
    } catch {
      setWebSocketCopyStatus("복사에 실패했습니다. 주소를 직접 선택해 복사하세요.");
    }
  };

  useEffect(() => {
    refresh().catch((refreshError: Error) => setError(refreshError.message));
  }, []);

  useEffect(() => {
    if (adminAutoOpenedRef.current || !shouldAutoOpenAdminSettings(health, window.location.search)) {
      return;
    }

    adminAutoOpenedRef.current = true;
    void handleOpenAdminSettings();
  }, [health]);

  useEffect(() => {
    const source = new EventSource("/api/callbridge/events");

    source.onmessage = (event) => {
      try {
        const callbridgeEvent = JSON.parse(event.data) as CallbridgeEvent;
        const callSession = eventCallSession(callbridgeEvent);

        if (callSession) {
          setActiveCallId(callSession.id);
          setCallStatus(`${callStatusLabel(callSession.status)}: ${callSession.callerNumber || "전화번호 미확인"}`);
        }

        if (
          callbridgeEvent.type.startsWith("call.") ||
          callbridgeEvent.type.startsWith("transcript.") ||
          callbridgeEvent.type.startsWith("media.")
        ) {
          void refresh();
        }
      } catch {
        setCallStatus("상담석 이벤트를 해석하지 못했습니다.");
      }
    };

    source.onerror = () => {
      setCallStatus("상담석 이벤트 연결 재시도 중");
    };

    return () => {
      source.close();
      callbridgeClientRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    setMessageDraft(selectedConsultation?.recommendedScript ?? "");
  }, [selectedConsultation?.id, selectedConsultation?.recommendedScript]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setActionStatus("");
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const result = await createConsultation(formData);
      setLastResult(result);
      await refresh();
      setSelectedId(result.consultation.id);
      form.reset();
      setActionStatus("상담 분석이 저장되었습니다.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "상담 분석 요청에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const runAction = async (type: "reservation" | "message" | "callback") => {
    if (!selectedConsultation) return;

    setError("");
    setActionStatus("");

    try {
      if (type === "reservation") {
        await createReservation({
          customerId: selectedConsultation.customerId,
          siteId: selectedConsultation.siteId,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          memo: selectedConsultation.nextAction
        });
        setActionStatus("방문 예약이 생성되었습니다.");
      }

      if (type === "message") {
        const messageBody = messageDraft.trim();

        if (!messageBody) {
          setError("발송할 문자 내용을 입력해 주세요.");
          return;
        }

        await createMessage({
          customerId: selectedConsultation.customerId,
          siteId: selectedConsultation.siteId,
          messageTemplateType: "ai_followup",
          messageBody,
          triggerEvent: "consultation_followup"
        });
        setActionStatus(health?.solapiConfigured ? "후속 문자가 발송되었습니다." : "후속 문자가 대기열에 등록되었습니다.");
      }

      if (type === "callback") {
        await createCallback({
          customerId: selectedConsultation.customerId,
          siteId: selectedConsultation.siteId,
          reason: selectedConsultation.nextAction,
          dueAt: null
        });
        setActionStatus("콜백 요청이 생성되었습니다.");
      }

      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "액션 처리에 실패했습니다.");
    }
  };

  const handleRefineMessage = async () => {
    if (!selectedConsultation) return;

    const draft = messageDraft.trim();

    if (!draft) {
      setError("AI로 다듬을 문자 내용을 먼저 입력해 주세요.");
      return;
    }

    setError("");
    setActionStatus("");
    setIsRefiningMessage(true);

    try {
      const result = await refineMessageDraft({
        draft,
        customerName: selectedCustomer?.name,
        siteName: selectedSite?.siteName,
        customerIntent: selectedConsultation.customerIntent,
        interestLevel: selectedConsultation.interestLevel,
        mainConcerns: selectedConsultation.concerns,
        nextAction: selectedConsultation.nextAction
      });
      setMessageDraft(result.refinedText);
      setActionStatus("AI가 문자 내용을 다듬었습니다.");
    } catch (refineError) {
      setError(refineError instanceof Error ? refineError.message : "문자 내용 다듬기에 실패했습니다.");
    } finally {
      setIsRefiningMessage(false);
    }
  };

  const handlePrepareCallbridge = async () => {
    setError("");
    setActionStatus("");

    if (!callbridgeConfig?.configured) {
      setError("Callbridge 환경변수를 먼저 설정해야 상담석을 사용할 수 있습니다.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("현재 브라우저에서 마이크 입력을 사용할 수 없습니다.");
      return;
    }

    setCallStatus("상담석 준비 완료");
  };

  const handleAnswerCall = async () => {
    if (!activeCall) return;

    if (!callbridgeConfig?.configured) {
      setError("Callbridge 환경변수를 먼저 설정해야 통화를 받을 수 있습니다.");
      return;
    }

    setError("");
    setActionStatus("");
    setIsCallConnecting(true);

    try {
      callbridgeClientRef.current?.disconnect();
      const client = createCallbridgeBrowserClient({
        callSessionId: activeCall.id,
        onStatus: setCallStatus,
        onError: (callError) => setError(callError.message)
      });
      callbridgeClientRef.current = client;
      await client.connect();
      await refresh();
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "통화 받기에 실패했습니다.");
    } finally {
      setIsCallConnecting(false);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isCallMuted;
    callbridgeClientRef.current?.setMuted(nextMuted);
    setIsCallMuted(nextMuted);
  };

  const handleHangup = async () => {
    if (!activeCall) return;

    setError("");
    setActionStatus("");

    try {
      callbridgeClientRef.current?.disconnect();
      callbridgeClientRef.current = null;
      const result = await hangupCallbridgeCall(activeCall.id);
      setActiveCallId(result.callSession.id);
      await refresh();
      setActionStatus("통화를 종료했습니다.");
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "통화 종료에 실패했습니다.");
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI 상담 관리</p>
          <h1>분양 상담 CRM</h1>
        </div>
        <div className="topbar-actions">
          <span className={health?.openAiConfigured ? "status-pill ok" : "status-pill warn"}>
            {health?.openAiConfigured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            OpenAI {health?.openAiConfigured ? "연결됨" : "설정 필요"}
          </span>
          <span className={health?.solapiConfigured ? "status-pill ok" : "status-pill warn"}>
            {health?.solapiConfigured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            Solapi {health?.solapiConfigured ? "발송 가능" : "설정 필요"}
          </span>
          <span className={health?.callbridgeConfigured ? "status-pill ok" : "status-pill warn"}>
            {health?.callbridgeConfigured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            Callbridge {health?.callbridgeConfigured ? "상담석 준비" : "설정 필요"}
          </span>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => {
              if (isAdminOpen) {
                setIsAdminOpen(false);
                return;
              }
              void handleOpenAdminSettings();
            }}
          >
            {isAdminOpen ? <X size={16} /> : <Settings size={16} />}
            API 설정
          </button>
          <button className="icon-button" type="button" onClick={() => refresh()} aria-label="새로고침">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="metrics-strip">
        <Metric icon={<Mic2 />} label="총 상담" value={dashboard.totalConsultations} />
        <Metric icon={<CheckCircle2 />} label="관심 고객" value={dashboard.interestedCustomers} tone="green" />
        <Metric icon={<CalendarCheck />} label="방문 예약" value={dashboard.visitReservations} tone="blue" />
        <Metric icon={<MessageSquare />} label="문자" value={dashboard.sentMessages} tone="amber" />
        <Metric icon={<AlertTriangle />} label="중복" value={dashboard.duplicateLeads} tone="red" />
      </section>

      {(error || actionStatus) && (
        <div className={error ? "notice error" : "notice success"}>
          {error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{error || actionStatus}</span>
        </div>
      )}

      {isAdminOpen && (
        <AdminSettingsPanel
          settings={adminSettings}
          formValues={adminForm}
          authRequired={isAdminAuthRequired}
          adminEmail={adminEmail}
          loginValues={adminLoginForm}
          isSaving={isSavingSettings}
          isSigningIn={isAdminSigningIn}
          visibleSecrets={visibleSecretFields}
          onLoginChange={handleAdminLoginFieldChange}
          onSignIn={handleAdminSignIn}
          onSignOut={handleAdminSignOut}
          onChange={handleAdminFieldChange}
          onReload={loadAdminSettings}
          onSubmit={handleSaveAdminSettings}
          onToggleSecret={handleToggleSecretField}
          callbridgeAgentWebSocketUrl={callbridgeAgentWebSocketUrl}
          canUseCallbridgeAgentUrl={canUseCallbridgeAgentUrl}
          webSocketCopyStatus={webSocketCopyStatus}
          onCopyCallbridgeWebSocket={handleCopyCallbridgeWebSocket}
        />
      )}

      <section className="workspace-grid">
        <aside className="panel left-panel">
          <div className="panel-heading">
            <h2>상담 접수</h2>
            <FileAudio size={18} />
          </div>
          <form className="crm-form" onSubmit={handleSubmit}>
            <label>
              고객명
              <input name="customerName" placeholder="김고객" />
            </label>
            <label>
              전화번호
              <input name="phone" placeholder="010-0000-0000" required />
            </label>
            <label>
              현장명
              <input name="siteName" defaultValue="속초 중앙하이츠 THE 228" />
            </label>
            <label>
              유입 경로
              <select name="sourceChannel" defaultValue="naver">
                <option value="naver">네이버</option>
                <option value="google">구글</option>
                <option value="homepage">홈페이지</option>
                <option value="phone">전화</option>
                <option value="callbridge">Callbridge 전화</option>
              </select>
            </label>
            <label>
              녹취 파일
              <input name="recording" type="file" accept="audio/*,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm" />
            </label>
            <label>
              수동 전사 텍스트
              <textarea name="transcript" rows={7} placeholder="녹취 파일이 없을 때 상담 내용을 입력합니다." />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Clock3 size={18} /> : <UploadCloud size={18} />}
              {isSubmitting ? "분석 중" : "분석 저장"}
            </button>
          </form>

          <div className="mini-section">
            <h3>고객 상태</h3>
            <KeyValue label="이름" value={selectedCustomer?.name ?? "-"} />
            <KeyValue label="전화" value={selectedCustomer?.phone ?? "-"} />
            <KeyValue label="상태" value={selectedCustomer?.customerStatus ?? "-"} />
            <KeyValue label="중복" value={selectedLead?.isDuplicate ? "중복 리드" : "정상"} />
          </div>
        </aside>

        <section className="panel center-panel">
          <div className="panel-heading">
            <h2>AI 상담 분석</h2>
            <BarChart3 size={18} />
          </div>
          {selectedConsultation ? (
            <AnalysisView consultation={selectedConsultation} />
          ) : (
            <div className="empty-state">
              <Mic2 size={34} />
              <span>저장된 상담 없음</span>
            </div>
          )}
        </section>

        <aside className="panel right-panel">
          <div className="panel-heading">
            <h2>상담원 연결</h2>
            <PhoneForwarded size={18} />
          </div>

          <CallCenterPanel
            activeCall={activeCall}
            activeCustomer={activeCallCustomer}
            activeSite={activeCallSite}
            callStatus={callStatus}
            callbridgeConfig={callbridgeConfig}
            isCallMuted={isCallMuted}
            isConnecting={isCallConnecting}
            onAnswer={handleAnswerCall}
            onHangup={handleHangup}
            onMuteToggle={handleToggleMute}
            onPrepare={handlePrepareCallbridge}
          />

          <div className="manager-list">
            {managers.map((manager) => (
              <div className="manager-row" key={manager.name}>
                <div>
                  <strong>{manager.name}</strong>
                  <span>{manager.specialty}</span>
                </div>
                <em>{manager.status}</em>
              </div>
            ))}
          </div>

          <div className="message-composer">
            <label htmlFor="messageDraft">문자 내용</label>
            <textarea
              id="messageDraft"
              value={messageDraft}
              rows={6}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder="발송할 문자 내용을 직접 입력하세요."
              disabled={!selectedConsultation}
            />
            <div className="composer-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={handleRefineMessage}
                disabled={!selectedConsultation || isRefiningMessage}
              >
                {isRefiningMessage ? <Clock3 size={16} /> : <Sparkles size={16} />}
                {isRefiningMessage ? "AI 다듬는 중" : "AI 다듬기"}
              </button>
            </div>
          </div>

          <div className="action-stack">
            <button type="button" onClick={() => runAction("reservation")} disabled={!selectedConsultation}>
              <CalendarCheck size={17} />
              방문 예약
            </button>
            <button type="button" onClick={() => runAction("message")} disabled={!selectedConsultation}>
              <Send size={17} />
              {health?.solapiConfigured ? "문자 발송" : "문자 대기열"}
            </button>
            <button type="button" onClick={() => runAction("callback")} disabled={!selectedConsultation}>
              <PhoneForwarded size={17} />
              콜백 요청
            </button>
          </div>

          <div className="mini-section">
            <h3>현장 정보</h3>
            <KeyValue label="현장" value={selectedSite?.siteName ?? "-"} />
            <KeyValue label="분양" value={selectedSite?.salesStatus ?? "-"} />
            <KeyValue label="주차" value={selectedSite?.parkingInfo || "-"} />
            <button className="secondary-button" type="button" disabled={!selectedSite?.naverMapUrl}>
              <MapPinned size={16} />
              지도 링크
            </button>
          </div>
        </aside>
      </section>

      <section className="bottom-grid">
        <div className="panel history-panel">
          <div className="panel-heading">
            <h2>상담 히스토리</h2>
            <Clock3 size={18} />
          </div>
          <div className="history-list">
            {crmState.consultations.map((item) => {
              const customer = crmState.customers.find((entry) => entry.id === item.customerId);
              const site = crmState.sites.find((entry) => entry.id === item.siteId);
              return (
                <button
                  className={item.id === selectedConsultation?.id ? "history-item selected" : "history-item"}
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>{customer?.name ?? "이름 미상"}</span>
                  <strong>{item.customerIntent}</strong>
                  <em>{site?.siteName ?? "미지정 현장"}</em>
                  <small>{formatDate(item.createdAt)}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel conversion-panel">
          <div className="panel-heading">
            <h2>현장 반응률</h2>
            <BarChart3 size={18} />
          </div>
          <div className="conversion-list">
            {dashboard.siteConversionRates.map((site) => (
              <div className="conversion-row" key={site.siteId}>
                <span>{site.siteName}</span>
                <div className="conversion-track">
                  <i style={{ width: `${Math.min(site.conversionRate * 100, 100)}%` }} />
                </div>
                <strong>{Math.round(site.conversionRate * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {lastResult && (
        <div className="sr-status" role="status">
          {lastResult.customer.name} 상담 저장 완료
        </div>
      )}
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "default"
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "default" | "green" | "blue" | "amber" | "red";
}) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value.toLocaleString("ko-KR")}</strong>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdminSettingsPanel({
  settings,
  formValues,
  authRequired,
  adminEmail,
  loginValues,
  isSaving,
  isSigningIn,
  visibleSecrets,
  callbridgeAgentWebSocketUrl,
  canUseCallbridgeAgentUrl,
  webSocketCopyStatus,
  onLoginChange,
  onSignIn,
  onSignOut,
  onChange,
  onCopyCallbridgeWebSocket,
  onReload,
  onSubmit,
  onToggleSecret
}: {
  settings: AdminApiSettingsResponse | null;
  formValues: Record<string, string>;
  authRequired: boolean;
  adminEmail: string | null;
  loginValues: { email: string; password: string };
  isSaving: boolean;
  isSigningIn: boolean;
  visibleSecrets: Record<string, boolean>;
  callbridgeAgentWebSocketUrl: string;
  canUseCallbridgeAgentUrl: boolean;
  webSocketCopyStatus: string;
  onLoginChange(name: "email" | "password", value: string): void;
  onSignIn(event: FormEvent<HTMLFormElement>): void;
  onSignOut(): Promise<void>;
  onChange(name: string, value: string): void;
  onCopyCallbridgeWebSocket(): void;
  onReload(): Promise<void>;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onToggleSecret(name: string): void;
}) {
  return (
    <section className="panel admin-panel" aria-label="관리자 API 설정">
      <div className="panel-heading">
        <div>
          <h2>관리자 API 설정</h2>
          <span className="admin-subtitle">{settings?.envFile ?? ".env.local"}</span>
        </div>
        <ShieldCheck size={18} />
      </div>

      {authRequired ? (
        <form className="admin-login-form" onSubmit={onSignIn}>
          <div>
            <strong>관리자 로그인</strong>
            <span>Supabase 관리자 계정으로 로그인해야 API 키를 수정할 수 있습니다.</span>
          </div>
          <label>
            이메일
            <input
              autoComplete="username"
              type="email"
              value={loginValues.email}
              onChange={(event) => onLoginChange("email", event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              type="password"
              value={loginValues.password}
              onChange={(event) => onLoginChange("password", event.target.value)}
              placeholder="Supabase password"
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={isSigningIn}>
            {isSigningIn ? <Clock3 size={16} /> : <ShieldCheck size={16} />}
            {isSigningIn ? "로그인 중" : "관리자 로그인"}
          </button>
        </form>
      ) : !settings ? (
        <div className="admin-loading">설정 정보를 불러오는 중입니다.</div>
      ) : (
        <form className="admin-settings-form" onSubmit={onSubmit}>
          {adminEmail && (
            <div className="admin-session-row">
              <span>{adminEmail}</span>
              <button className="secondary-button" type="button" onClick={() => void onSignOut()} disabled={isSaving}>
                로그아웃
              </button>
            </div>
          )}
          {settings.sections.map((section) => (
            <fieldset className="admin-settings-section" key={section.id}>
              <legend>
                <span>{section.title}</span>
                <em className={section.configured ? "admin-state ok" : "admin-state warn"}>
                  {section.configured ? "설정 완료" : "설정 필요"}
                </em>
              </legend>

              {section.missing.length > 0 && <p className="admin-missing">누락: {section.missing.join(", ")}</p>}

              <div className="admin-fields-grid">
                {visibleAdminFields(section).map((field) => {
                  const isSecretVisible = Boolean(visibleSecrets[field.name]);

                  return (
                    <label key={field.name}>
                      <span>
                        {field.label}
                        {field.required && <em>필수</em>}
                      </span>
                      <div className={field.secret ? "secret-input-row" : "plain-input-row"}>
                        <input
                          autoComplete="off"
                          name={field.name}
                          onChange={(event) => onChange(field.name, event.target.value)}
                          placeholder={field.secret && field.configured ? "저장됨 - 변경 시에만 입력" : field.placeholder}
                          spellCheck={false}
                          type={field.secret && !isSecretVisible ? "password" : "text"}
                          value={formValues[field.name] ?? ""}
                        />
                        {field.secret && (
                          <button
                            aria-label={`${field.label} 입력값 ${isSecretVisible ? "숨기기" : "보기"}`}
                            className="secret-toggle-button"
                            type="button"
                            onClick={() => onToggleSecret(field.name)}
                            disabled={isSaving}
                          >
                            {isSecretVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        )}
                      </div>
                      {field.secret && field.configured && <small>기존 값 유지</small>}
                    </label>
                  );
                })}
              </div>

              {section.id === "callbridge" && (
                <div className={canUseCallbridgeAgentUrl ? "websocket-helper ready" : "websocket-helper blocked"}>
                  <strong>Agent WebSocket 등록 주소</strong>
                  {canUseCallbridgeAgentUrl ? (
                    <>
                      <div className="websocket-copy-row">
                        <input readOnly value={callbridgeAgentWebSocketUrl} aria-label="Callbridge Agent WebSocket 주소" />
                        <button type="button" className="secondary-button" onClick={onCopyCallbridgeWebSocket}>
                          복사
                        </button>
                      </div>
                      <span>Callbridge 관리자 페이지의 Agent WebSocket 주소 입력란에 붙여넣으세요.</span>
                    </>
                  ) : (
                    <>
                      <p>현재 로컬 주소는 Callbridge에 등록할 수 없습니다.</p>
                      <span>ngrok 또는 Cloudflare Tunnel의 HTTPS 주소로 접속하면 이 주소가 자동 생성됩니다.</span>
                    </>
                  )}
                  {webSocketCopyStatus && <em>{webSocketCopyStatus}</em>}
                </div>
              )}
            </fieldset>
          ))}

          <div className="admin-actions">
            <button className="secondary-button" type="button" onClick={() => void onReload()} disabled={isSaving}>
              <RefreshCw size={16} />
              다시 불러오기
            </button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? <Clock3 size={16} /> : <Save size={16} />}
              {isSaving ? "저장 중" : "API 설정 저장"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function CallCenterPanel({
  activeCall,
  activeCustomer,
  activeSite,
  callStatus,
  callbridgeConfig,
  isCallMuted,
  isConnecting,
  onAnswer,
  onHangup,
  onMuteToggle,
  onPrepare
}: {
  activeCall: CallSession | null;
  activeCustomer: Customer | null;
  activeSite: Site | null;
  callStatus: string;
  callbridgeConfig: CallbridgeConfigResponse | null;
  isCallMuted: boolean;
  isConnecting: boolean;
  onAnswer(): void;
  onHangup(): void;
  onMuteToggle(): void;
  onPrepare(): void;
}) {
  const configured = Boolean(callbridgeConfig?.configured);
  const callIsLive = Boolean(activeCall && isLiveCall(activeCall));
  const controlDisabled = !configured || !activeCall || activeCall.status === "completed" || activeCall.status === "failed";
  const missingConfig = callbridgeConfig?.missing.length ? callbridgeConfig.missing.join(", ") : "";

  return (
    <div className="call-center-panel">
      <div className="call-status-row">
        <div>
          <span>Callbridge 상담석</span>
          <strong>{configured ? callbridgeConfig?.displayNumberMasked ?? "번호 설정됨" : "Callbridge 설정 필요"}</strong>
        </div>
        <em className={configured ? "call-state ready" : "call-state blocked"}>{configured ? "준비 가능" : "비활성"}</em>
      </div>

      {!configured && (
        <div className="call-config-warning">
          <AlertTriangle size={16} />
          <span>{missingConfig || "Callbridge 환경변수가 필요합니다."}</span>
        </div>
      )}

      <div className="active-call-box">
        <div className="active-call-heading">
          <PhoneIncoming size={18} />
          <div>
            <span>{activeCall ? callStatusLabel(activeCall.status) : "수신 대기"}</span>
            <strong>{activeCustomer?.name ?? activeCall?.callerNumber ?? "대기 중"}</strong>
          </div>
        </div>
        <KeyValue label="발신" value={activeCall?.callerNumber ?? "-"} />
        <KeyValue label="수신" value={activeCall?.calledNumber ?? "-"} />
        <KeyValue label="현장" value={activeSite?.siteName ?? "-"} />
        <KeyValue label="생성" value={formatDate(activeCall?.startedAt)} />
      </div>

      <div className="voice-actions-grid">
        <button type="button" onClick={onPrepare} disabled={!configured || isConnecting}>
          <Headphones size={16} />
          상담석 준비
        </button>
        <button type="button" onClick={onAnswer} disabled={!configured || !activeCall || isConnecting || !callIsLive}>
          <PhoneCall size={16} />
          받기
        </button>
        <button type="button" onClick={onMuteToggle} disabled={controlDisabled}>
          <MicOff size={16} />
          {isCallMuted ? "음소거 해제" : "음소거"}
        </button>
        <button className="danger" type="button" onClick={onHangup} disabled={controlDisabled}>
          <PhoneOff size={16} />
          끊기
        </button>
      </div>

      <div className="voice-status-line">{callStatus}</div>

      {activeCall?.liveTranscript && (
        <div className="live-transcript">
          <span>실시간 전사</span>
          <p>{activeCall.liveTranscript}</p>
        </div>
      )}
    </div>
  );
}

function AnalysisView({ consultation }: { consultation: ConsultationLog }) {
  return (
    <div className="analysis-layout">
      <div className="summary-band">
        <div>
          <span>의도</span>
          <strong>{consultation.customerIntent}</strong>
        </div>
        <div>
          <span>관심도</span>
          <strong>{consultation.interestLevel}</strong>
        </div>
        <div>
          <span>다음 액션</span>
          <strong>{consultation.nextAction}</strong>
        </div>
      </div>

      <div className="script-box">
        <h3>추천 스크립트</h3>
        <p>{consultation.recommendedScript}</p>
      </div>

      <div className="transcript-box">
        <h3>STT 전사</h3>
        <p>{consultation.rawTranscript}</p>
      </div>

      <div className="risk-box">
        <AlertTriangle size={18} />
        <span>{consultation.forbiddenExpressionAlert || "위험 알림 없음"}</span>
      </div>

      <div className="concerns">
        {consultation.concerns.map((concern) => (
          <span key={concern}>{concern}</span>
        ))}
      </div>
    </div>
  );
}
