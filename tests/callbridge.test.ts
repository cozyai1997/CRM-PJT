import { describe, expect, it, vi } from "vitest";
import {
  buildAgentTerminateRequest,
  createCallbridgeSessionStartedMessage,
  getCallbridgeConfig,
  getCallbridgeConfigStatus,
  isAuthorizedCallbridgeAgentRequest,
  isCallbridgeSessionStartMessage
} from "../server/services/callbridge";
import { createMemoryCrmStore } from "../server/services/crmStore";

const env = {
  CALLBRIDGE_API_KEY: "test-callbridge-key",
  CALLBRIDGE_BASE_URL: "https://bnd.happytalk.io/api/openapi",
  CALLBRIDGE_DISPLAY_NUMBER: "07012345678",
  PUBLIC_BASE_URL: "https://crm.example.com",
  PUBLIC_WS_BASE_URL: "wss://crm.example.com",
  OPENAI_REALTIME_TRANSCRIPTION_MODEL: "gpt-realtime-whisper"
};

const startMessage = {
  call_config: {
    siteId: "921004322052",
    caller: "01012341234",
    callee: "07012345678",
    cdrId: "10014473",
    callActionId: "1.758187055878E9",
    ivrIp: "192.168.150.103:29034",
    agentId: "agent-main",
    agentType: "voice"
  },
  audio_format: {
    phone_output_audio_format: "PCM_8000",
    phone_input_audio_format: "PCM_8000"
  }
};

describe("Callbridge integration", () => {
  it("reports missing config without exposing API keys", () => {
    const status = getCallbridgeConfigStatus({});

    expect(status.configured).toBe(false);
    expect(status.missing).toContain("CALLBRIDGE_API_KEY");
    expect(JSON.stringify(status)).not.toContain("sk_live");
  });

  it("requires the API key and display number for simple Callbridge setup", () => {
    const status = getCallbridgeConfigStatus({
      CALLBRIDGE_API_KEY: "test-callbridge-key"
    });
    const configuredStatus = getCallbridgeConfigStatus({
      CALLBRIDGE_API_KEY: "test-callbridge-key",
      CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
    });
    const config = getCallbridgeConfig({
      CALLBRIDGE_API_KEY: "test-callbridge-key",
      CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
    });

    expect(status.configured).toBe(false);
    expect(status.missing).toContain("CALLBRIDGE_DISPLAY_NUMBER");
    expect(configuredStatus.configured).toBe(true);
    expect(configuredStatus.missing).toEqual([]);
    expect(configuredStatus.displayNumberMasked).toBe("070****5678");
    expect(config.displayNumber).toBe("07012345678");
    expect(config.agentApiKey).toBe("test-callbridge-key");
    expect(config.baseUrl).toBe("https://bnd.happytalk.io/api/openapi");
  });

  it("does not expose the display number when reporting missing API key", () => {
    const status = getCallbridgeConfigStatus({
      CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
    });

    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(["CALLBRIDGE_API_KEY"]);
    expect(status.displayNumberMasked).toBe("070****5678");
    expect(JSON.stringify(status)).not.toContain("07012345678");
  });

  it("accepts agent websocket auth from bearer, x-api-key, or apiKey query", () => {
    const config = getCallbridgeConfig(env);

    expect(
      isAuthorizedCallbridgeAgentRequest(config, {
        headers: { authorization: "Bearer test-callbridge-key" },
        url: "/api/callbridge/agent"
      })
    ).toBe(true);
    expect(
      isAuthorizedCallbridgeAgentRequest(config, {
        headers: { "x-api-key": "test-callbridge-key" },
        url: "/api/callbridge/agent"
      })
    ).toBe(true);
    expect(
      isAuthorizedCallbridgeAgentRequest(config, {
        headers: {},
        url: "/api/callbridge/agent?apiKey=test-callbridge-key"
      })
    ).toBe(true);
    expect(
      isAuthorizedCallbridgeAgentRequest(config, {
        headers: { authorization: "Bearer wrong" },
        url: "/api/callbridge/agent"
      })
    ).toBe(false);
  });

  it("recognizes a Callbridge session start message and creates the started response", () => {
    expect(isCallbridgeSessionStartMessage(startMessage)).toBe(true);

    const response = createCallbridgeSessionStartedMessage(startMessage);

    expect(response).toEqual({
      type: "started",
      call_config: startMessage.call_config,
      audio_format: startMessage.audio_format
    });
  });

  it("creates an idempotent Callbridge call session from call_config", async () => {
    const store = createMemoryCrmStore();

    const first = await store.createCallSession({
      provider: "callbridge",
      direction: "inbound",
      callerNumber: startMessage.call_config.caller,
      calledNumber: startMessage.call_config.callee,
      siteExternalId: startMessage.call_config.siteId,
      cdrId: startMessage.call_config.cdrId,
      callActionId: startMessage.call_config.callActionId,
      ivrIp: startMessage.call_config.ivrIp,
      agentId: startMessage.call_config.agentId,
      agentType: startMessage.call_config.agentType
    });
    const second = await store.createCallSession({
      provider: "callbridge",
      direction: "inbound",
      callerNumber: startMessage.call_config.caller,
      calledNumber: startMessage.call_config.callee,
      siteExternalId: startMessage.call_config.siteId,
      cdrId: startMessage.call_config.cdrId,
      callActionId: startMessage.call_config.callActionId,
      ivrIp: startMessage.call_config.ivrIp,
      agentId: startMessage.call_config.agentId,
      agentType: startMessage.call_config.agentType
    });

    expect(second.id).toBe(first.id);
    expect(first.provider).toBe("callbridge");
    expect(first.cdrId).toBe(startMessage.call_config.cdrId);
    expect(first.callActionId).toBe(startMessage.call_config.callActionId);
  });

  it("builds an agent terminate request with bearer auth and no leaked key in body", () => {
    const config = getCallbridgeConfig(env);
    const request = buildAgentTerminateRequest(config, {
      ivrIp: startMessage.call_config.ivrIp,
      id: "call-1",
      cdrId: startMessage.call_config.cdrId,
      callerNo: startMessage.call_config.caller,
      calleeNo: startMessage.call_config.callee,
      actionId: startMessage.call_config.callActionId,
      ment: "상담을 종료합니다."
    });

    expect(request.url).toBe("https://bnd.happytalk.io/api/openapi/calls/agent-terminate");
    expect(request.init.headers).toEqual({
      Authorization: "Bearer test-callbridge-key",
      "Content-Type": "application/json"
    });
    expect(request.init.body).not.toContain("test-callbridge-key");
  });

  it("posts agent terminate requests through fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "OK", data: { id: "call-1" } })
    });
    const config = getCallbridgeConfig(env);
    const { terminateCallbridgeAgentCall } = await import("../server/services/callbridge");

    const result = await terminateCallbridgeAgentCall(
      config,
      {
        ivrIp: startMessage.call_config.ivrIp,
        id: "call-1",
        cdrId: startMessage.call_config.cdrId,
        callerNo: startMessage.call_config.caller,
        calleeNo: startMessage.call_config.callee,
        actionId: startMessage.call_config.callActionId,
        ment: "상담을 종료합니다."
      },
      fetchMock
    );

    expect(result.code).toBe("OK");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
