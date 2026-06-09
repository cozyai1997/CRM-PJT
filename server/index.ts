import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildAdminApiSettingsResponse,
  isLocalAdminRequest,
  saveAdminApiSettings
} from "./services/adminSettings";
import {
  analyzeTranscript,
  assertOpenAiApiKey,
  createOpenAiClient,
  MissingOpenAiApiKeyError,
  openAiModelsFromEnv,
  refineMessageDraft,
  transcribeRecording
} from "./services/openaiWorkflow";
import { createFileCrmStore } from "./services/crmStore";
import { getSolapiConfig, isSolapiConfigured, sendSolapiMessage } from "./services/solapiWorkflow";
import {
  createCallbridgeSessionStartedMessage,
  getCallbridgeConfig,
  getCallbridgeConfigStatus,
  isAuthorizedCallbridgeAgentRequest,
  isCallbridgeSessionStartMessage,
  MissingCallbridgeConfigError,
  terminateCallbridgeAgentCall,
  type CallbridgeSessionStartMessage
} from "./services/callbridge";
import { createOpenAiRealtimeTranscriber, type RealtimeTranscriber } from "./services/realtimeTranscription";
import { getServerBindHost, getServerListenUrl } from "./services/runtimeConfig";
import { VoiceEventBus } from "./services/voiceEventBus";
import type { CallSession } from "./types";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT ?? 8787);
const host = getServerBindHost(process.env);
const uploadDir = join(process.cwd(), "uploads");
const dataPath = join(process.cwd(), "data", "crm-state.json");
const envLocalPath = join(process.cwd(), ".env.local");
const envExamplePath = join(process.cwd(), ".env.example");
const distDir = join(process.cwd(), "dist");
const distIndexPath = join(distDir, "index.html");
const store = createFileCrmStore(dataPath);
const upload = multer({ dest: uploadDir });
const callEvents = new VoiceEventBus();
const callbridgeAgentWss = new WebSocketServer({ noServer: true });
const browserAudioWss = new WebSocketServer({ noServer: true });
const agentSockets = new Map<string, WebSocket>();
const browserSockets = new Map<string, Set<WebSocket>>();
const transcribers = new Map<string, RealtimeTranscriber>();

mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

const safeError = (error: unknown) => {
  if (error instanceof MissingOpenAiApiKeyError) {
    return {
      status: 503,
      body: {
        error: "OpenAI API key is not configured.",
        detail: "Set OPENAI_API_KEY in the local environment before using transcription or AI analysis."
      }
    };
  }

  return {
    status: 500,
    body: {
      error: "Request failed.",
      detail: error instanceof Error ? error.message : "Unknown error"
    }
  };
};

const safeCallbridgeError = (error: unknown) => {
  if (error instanceof MissingCallbridgeConfigError) {
    return {
      status: 503,
      body: {
        error: "Callbridge is not configured.",
        detail: `Missing: ${error.missing.join(", ")}`
      }
    };
  }

  return {
    status: 500,
    body: {
      error: "Callbridge request failed.",
      detail: error instanceof Error ? error.message : "Unknown error"
    }
  };
};

const sendJson = (socket: WebSocket | undefined, payload: unknown) => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const publishCall = (type: string, callSession: CallSession) => {
  callEvents.publish(type, callSession);
};

const browserSet = (callSessionId: string) => {
  const existing = browserSockets.get(callSessionId);
  if (existing) return existing;

  const next = new Set<WebSocket>();
  browserSockets.set(callSessionId, next);
  return next;
};

const broadcastToBrowsers = (callSessionId: string, payload: unknown) => {
  const sockets = browserSockets.get(callSessionId);
  if (!sockets) return;

  for (const socket of sockets) {
    sendJson(socket, payload);
  }
};

const appendTranscriptDelta = async (callSessionId: string, delta: string) => {
  if (!delta.trim()) return;

  const updated = await store.appendCallTranscript(callSessionId, delta);
  callEvents.publish("transcript.delta", {
    callSession: updated,
    delta,
    final: false
  });
};

const completeTranscript = async (callSessionId: string, transcript: string, agentSocket?: WebSocket) => {
  const current = await store.findCallSessionById(callSessionId);
  const finalTranscript = (current?.liveTranscript.trim() || transcript.trim()).trim();
  if (!finalTranscript) return;

  const updated = await store.updateCallSession(callSessionId, { finalTranscript });
  callEvents.publish("transcript.completed", {
    callSession: updated,
    delta: transcript,
    final: true
  });
  sendJson(agentSocket ?? agentSockets.get(callSessionId), {
    type: "stt_result",
    stt_result: {
      role: "user",
      text: transcript
    }
  });
};

const processCallAnalysis = async (callSessionId: string) => {
  try {
    assertOpenAiApiKey(process.env);
    const state = await store.listState();
    const callSession = state.callSessions.find((item) => item.id === callSessionId);
    if (!callSession?.finalTranscript?.trim()) return;
    if (callSession.aiAnalysisStatus === "completed" || callSession.aiAnalysisStatus === "queued") return;

    const customer = state.customers.find((item) => item.id === callSession.customerId);
    const site = state.sites.find((item) => item.id === callSession.siteId);
    if (!customer || !site) return;

    await store.updateCallSession(callSessionId, { aiAnalysisStatus: "queued" });
    const openai = createOpenAiClient(process.env);
    const { analysisModel } = openAiModelsFromEnv(process.env);
    const analysis = await analyzeTranscript(
      {
        transcript: callSession.finalTranscript,
        siteName: site.siteName,
        customerName: customer.name,
        sourceChannel: "callbridge"
      },
      { model: analysisModel, openai }
    );

    await store.createConsultation({
      customerName: customer.name,
      phone: customer.phone,
      siteName: site.siteName,
      sourceChannel: "callbridge",
      transcript: callSession.finalTranscript,
      analysis,
      callSessionId
    });
    const updated = await store.updateCallSession(callSessionId, { aiAnalysisStatus: "completed" });
    publishCall("call.analysis.completed", updated);
  } catch {
    const updated = await store.updateCallSession(callSessionId, { aiAnalysisStatus: "failed" });
    publishCall("call.analysis.failed", updated);
  }
};

const completeCallSession = async (callSessionId: string) => {
  const existing = await store.findCallSessionById(callSessionId);
  if (!existing || existing.status === "completed") return existing;

  transcribers.get(callSessionId)?.close();
  transcribers.delete(callSessionId);
  agentSockets.delete(callSessionId);
  const updated = await store.updateCallSession(callSessionId, {
    status: "completed",
    endedAt: existing.endedAt ?? new Date().toISOString()
  });
  publishCall("call.completed", updated);
  void processCallAnalysis(callSessionId);
  return updated;
};

const attachRealtimeTranscriber = (callSessionId: string, agentSocket: WebSocket) => {
  if (!process.env.OPENAI_API_KEY) {
    callEvents.publish("transcript.status", {
      callSessionId,
      status: "disabled",
      reason: "OPENAI_API_KEY is not configured."
    });
    return null;
  }

  const transcriber = createOpenAiRealtimeTranscriber({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? "gpt-realtime-whisper",
    onDelta: (delta) => {
      void appendTranscriptDelta(callSessionId, delta);
    },
    onCompleted: (transcript) => {
      void completeTranscript(callSessionId, transcript, agentSocket);
    },
    onError: (message) => {
      callEvents.publish("transcript.error", {
        callSessionId,
        error: message
      });
    }
  });

  transcribers.set(callSessionId, transcriber);
  return transcriber;
};

const createCallSessionFromStartMessage = async (message: CallbridgeSessionStartMessage) =>
  store.createCallSession({
    provider: "callbridge",
    direction: "inbound",
    callerNumber: message.call_config.caller,
    calledNumber: message.call_config.callee,
    siteExternalId: message.call_config.siteId,
    cdrId: message.call_config.cdrId,
    callActionId: message.call_config.callActionId,
    ivrIp: message.call_config.ivrIp,
    agentId: message.call_config.agentId,
    agentType: message.call_config.agentType
  });

callbridgeAgentWss.on("connection", (socket) => {
  let callSessionId: string | null = null;
  let transcriber: RealtimeTranscriber | null = null;

  socket.on("message", (rawMessage) => {
    void (async () => {
      let message: unknown;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        return;
      }

      if (isCallbridgeSessionStartMessage(message)) {
        const callSession = await createCallSessionFromStartMessage(message);
        callSessionId = callSession.id;
        agentSockets.set(callSession.id, socket);
        transcriber = attachRealtimeTranscriber(callSession.id, socket);
        publishCall("call.incoming", callSession);
        sendJson(socket, createCallbridgeSessionStartedMessage(message));
        return;
      }

      if (!callSessionId || !message || typeof message !== "object") return;

      if ("user_audio_chunk" in message && typeof message.user_audio_chunk === "string") {
        broadcastToBrowsers(callSessionId, {
          type: "audio",
          audioBase64: message.user_audio_chunk
        });
        transcriber?.pushPcm8kPayload(message.user_audio_chunk);
        return;
      }

      if ("type" in message && message.type === "stt_result" && "stt_result" in message) {
        const sttResult = message.stt_result as { text?: unknown };
        if (typeof sttResult.text === "string") {
          await appendTranscriptDelta(callSessionId, sttResult.text);
          await completeTranscript(callSessionId, sttResult.text, socket);
        }
      }
    })();
  });

  socket.on("close", () => {
    if (callSessionId) {
      void completeCallSession(callSessionId);
    }
  });

  socket.on("error", () => {
    if (callSessionId) {
      void completeCallSession(callSessionId);
    }
  });
});

browserAudioWss.on("connection", (socket, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const callSessionId = decodeURIComponent(url.pathname.replace(/^\/api\/callbridge\/browser\//, ""));
  const sockets = browserSet(callSessionId);
  sockets.add(socket);

  socket.on("message", (rawMessage) => {
    void (async () => {
      let message: { type?: string; audioBase64?: string };
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        return;
      }

      const current = await store.findCallSessionById(callSessionId);
      if (!current) return;

      if (message.type === "answer") {
        const updated = await store.updateCallSession(callSessionId, {
          status: "in-progress",
          answeredAt: current.answeredAt ?? new Date().toISOString()
        });
        publishCall("call.answered", updated);
        return;
      }

      if (message.type === "audio" && message.audioBase64) {
        const agentSocket = agentSockets.get(callSessionId);
        sendJson(agentSocket!, {
          type: "audio",
          audio_event: {
            audio_base_64: message.audioBase64
          }
        });
        return;
      }

      if (message.type === "hangup") {
        await completeCallSession(callSessionId);
      }
    })();
  });

  socket.on("close", () => {
    sockets.delete(socket);
  });
});

app.get("/api/health", (_req, res) => {
  let openAiConfigured = false;
  try {
    assertOpenAiApiKey(process.env);
    openAiConfigured = true;
  } catch {
    openAiConfigured = false;
  }

  res.json({
    ok: true,
    openAiConfigured,
    solapiConfigured: isSolapiConfigured(process.env),
    solapiSenderNumberConfigured: Boolean(process.env.SOLAPI_SENDER_NUMBER?.trim()),
    callbridgeConfigured: getCallbridgeConfigStatus(process.env).configured,
    realtimeTranscriptionPhase: "callbridge",
    docs: {
      audio: "https://developers.openai.com/api/docs/guides/audio",
      speechToText: "https://developers.openai.com/api/docs/guides/speech-to-text",
      realtimeTranscription: "https://developers.openai.com/api/docs/guides/realtime-transcription",
      callbridge: "https://blumnai.oopy.io/callbridge/developers"
    }
  });
});

app.get("/api/callbridge/config", (_req, res) => {
  res.json({
    ok: true,
    ...getCallbridgeConfigStatus(process.env),
    docs: {
      developers: "https://blumnai.oopy.io/callbridge/developers",
      websocket: "https://blumnai.oopy.io/325c0b11-04dd-801f-bad8-c196227ffe18",
      audio: "https://blumnai.oopy.io/325c0b11-04dd-800a-91de-f5a8e4bdb169",
      stt: "https://blumnai.oopy.io/325c0b11-04dd-8061-b60f-c85faf0bbe73"
    }
  });
});

app.get("/api/callbridge/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  callEvents.subscribe(res);

  req.on("close", () => {
    res.end();
  });
});

const requireLocalAdminHost: express.RequestHandler = (req, res, next) => {
  const forwardedHost = req.headers["x-forwarded-host"];

  if (
    !isLocalAdminRequest({
      host: req.headers.host,
      forwardedHost: Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost,
      origin: req.headers.origin,
      referer: req.headers.referer
    })
  ) {
    res.status(403).json({
      error: "Admin API settings are available only from the local CRM address.",
      detail: "Open the CRM through http://127.0.0.1 or http://localhost before changing API settings."
    });
    return;
  }

  next();
};

app.get("/api/admin/api-settings", requireLocalAdminHost, (_req, res) => {
  res.json(buildAdminApiSettingsResponse(process.env));
});

app.post("/api/admin/api-settings", requireLocalAdminHost, (req, res) => {
  try {
    const settings = saveAdminApiSettings(req.body, {
      envFilePath: envLocalPath,
      exampleFilePath: envExamplePath,
      env: process.env
    });
    res.json(settings);
  } catch (error) {
    res.status(400).json({
      error: "API settings could not be saved.",
      detail: error instanceof Error ? error.message : "Unknown settings error"
    });
  }
});

app.post("/api/callbridge/calls/:id/hangup", async (req, res) => {
  try {
    const config = getCallbridgeConfig(process.env);
    const callSession = await store.findCallSessionById(req.params.id);

    if (!callSession) {
      res.status(404).json({ error: "Call session was not found." });
      return;
    }

    const result = await terminateCallbridgeAgentCall(config, {
      ivrIp: callSession.ivrIp,
      id: callSession.id,
      cdrId: callSession.cdrId,
      callerNo: callSession.callerNumber,
      calleeNo: callSession.calledNumber,
      actionId: callSession.callActionId,
      ment: "상담을 종료합니다."
    });
    const updated = await completeCallSession(callSession.id);
    res.json({ callSession: updated, callbridge: result });
  } catch (error) {
    const response = safeCallbridgeError(error);
    res.status(response.status).json(response.body);
  }
});

app.get("/api/dashboard", async (_req, res) => {
  res.json(await store.getDashboard());
});

app.get("/api/state", async (_req, res) => {
  res.json(await store.listState());
});

app.post("/api/consultations", upload.single("recording"), async (req, res) => {
  try {
    const customerName = String(req.body.customerName ?? "").trim() || "이름 미상";
    const phone = String(req.body.phone ?? "").trim();
    const siteName = String(req.body.siteName ?? "").trim() || "미지정 현장";
    const sourceChannel = String(req.body.sourceChannel ?? "").trim() || "unknown";
    const manualTranscript = String(req.body.transcript ?? "").trim();

    if (!phone) {
      res.status(400).json({ error: "Customer phone is required." });
      return;
    }

    if (!req.file && !manualTranscript) {
      res.status(400).json({ error: "Recording file or transcript is required." });
      return;
    }

    const openai = createOpenAiClient(process.env);
    const { transcriptionModel, analysisModel } = openAiModelsFromEnv(process.env);
    const transcript = req.file
      ? await transcribeRecording(
          {
            filePath: req.file.path,
            originalName: req.file.originalname
          },
          { model: transcriptionModel, openai }
        )
      : manualTranscript;

    const analysis = await analyzeTranscript(
      {
        transcript,
        siteName,
        customerName,
        sourceChannel
      },
      { model: analysisModel, openai }
    );

    const record = await store.createConsultation({
      customerName,
      phone,
      siteName,
      sourceChannel,
      transcript,
      analysis,
      campaignId: req.body.campaignId,
      keyword: req.body.keyword,
      landingPageUrl: req.body.landingPageUrl,
      utmSource: req.body.utmSource,
      utmMedium: req.body.utmMedium,
      utmCampaign: req.body.utmCampaign
    });

    res.status(201).json({ transcript, analysis, ...record });
  } catch (error) {
    const response = safeError(error);
    res.status(response.status).json(response.body);
  }
});

app.post("/api/reservations", async (req, res) => {
  const reservation = await store.createReservation({
    customerId: String(req.body.customerId),
    siteId: String(req.body.siteId),
    scheduledAt: String(req.body.scheduledAt),
    memo: String(req.body.memo ?? ""),
    status: req.body.status
  });

  res.status(201).json(reservation);
});

app.post("/api/messages", async (req, res) => {
  const customerId = String(req.body.customerId);
  const siteId = String(req.body.siteId);
  const messageTemplateType = String(req.body.messageTemplateType ?? "manual_followup");
  const messageBody = String(req.body.messageBody ?? "");
  const triggerEvent = String(req.body.triggerEvent ?? "manual");
  let solapiMessageId: string | null = null;
  let sendStatus = "queued";

  if (isSolapiConfigured(process.env)) {
    const state = await store.listState();
    const customer = state.customers.find((item) => item.id === customerId);

    if (!customer) {
      res.status(404).json({ error: "Customer was not found for message delivery." });
      return;
    }

    try {
      const result = await sendSolapiMessage(
        {
          to: customer.phone,
          text: messageBody,
          templateType: messageTemplateType
        },
        {
          config: getSolapiConfig(process.env)
        }
      );
      solapiMessageId = result.providerMessageId;
      sendStatus = result.status;
    } catch (error) {
      const message = await store.createMessageLog({
        customerId,
        siteId,
        messageTemplateType,
        messageBody,
        triggerEvent,
        solapiMessageId,
        sendStatus: "failed"
      });
      res.status(502).json({
        ...message,
        error: error instanceof Error ? error.message : "Solapi delivery failed"
      });
      return;
    }
  }

  const message = await store.createMessageLog({
    customerId,
    siteId,
    messageTemplateType,
    messageBody,
    triggerEvent,
    solapiMessageId,
    sendStatus
  });

  res.status(201).json(message);
});

app.post("/api/messages/refine", async (req, res) => {
  try {
    const draft = String(req.body.draft ?? "").trim();

    if (!draft) {
      res.status(400).json({ error: "Message draft is required." });
      return;
    }

    const openai = createOpenAiClient(process.env);
    const { analysisModel } = openAiModelsFromEnv(process.env);
    const refinedText = await refineMessageDraft(
      {
        draft,
        customerName: req.body.customerName,
        siteName: req.body.siteName,
        customerIntent: req.body.customerIntent,
        interestLevel: req.body.interestLevel,
        mainConcerns: Array.isArray(req.body.mainConcerns) ? req.body.mainConcerns : [],
        nextAction: req.body.nextAction
      },
      {
        model: analysisModel,
        openai
      }
    );

    res.json({ refinedText });
  } catch (error) {
    const response = safeError(error);
    res.status(response.status).json(response.body);
  }
});

app.post("/api/callbacks", async (req, res) => {
  const callback = await store.createCallback({
    customerId: String(req.body.customerId),
    siteId: String(req.body.siteId),
    reason: String(req.body.reason ?? "상담 연결 필요"),
    dueAt: req.body.dueAt ? String(req.body.dueAt) : null
  });

  res.status(201).json(callback);
});

app.post("/api/conversions", async (req, res) => {
  const event = await store.createConversionEvent({
    customerId: String(req.body.customerId),
    siteId: String(req.body.siteId),
    eventType: String(req.body.eventType),
    eventValue: String(req.body.eventValue ?? ""),
    memo: String(req.body.memo ?? "")
  });

  res.status(201).json(event);
});

if (existsSync(distIndexPath)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(distIndexPath);
      return;
    }

    next();
  });
}

const rejectUpgrade = (socket: Duplex, status: number, message: string) => {
  socket.write(`HTTP/1.1 ${status} ${message}\r\n\r\n`);
  socket.destroy();
};

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

  if (url.pathname === "/api/callbridge/agent") {
    try {
      const config = getCallbridgeConfig(process.env);
      if (!isAuthorizedCallbridgeAgentRequest(config, { headers: req.headers, url: req.url })) {
        rejectUpgrade(socket, 401, "Unauthorized");
        return;
      }
      callbridgeAgentWss.handleUpgrade(req, socket, head, (ws) => {
        callbridgeAgentWss.emit("connection", ws, req);
      });
    } catch {
      rejectUpgrade(socket, 503, "Service Unavailable");
    }
    return;
  }

  if (url.pathname.startsWith("/api/callbridge/browser/")) {
    browserAudioWss.handleUpgrade(req, socket, head, (ws) => {
      browserAudioWss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

httpServer.listen(port, host, () => {
  console.log(`CRM API listening on ${getServerListenUrl(host, port)}`);
});
