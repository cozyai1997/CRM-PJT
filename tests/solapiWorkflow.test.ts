import { describe, expect, it, vi } from "vitest";
import {
  getSolapiConfig,
  isSolapiConfigured,
  MissingSolapiConfigError,
  normalizeKoreanPhone,
  sendSolapiMessage
} from "../server/services/solapiWorkflow";

describe("Solapi workflow", () => {
  it("detects missing Solapi configuration without exposing secret values", () => {
    expect(isSolapiConfigured({})).toBe(false);
    expect(() => getSolapiConfig({ SOLAPI_API_KEY: "key-only" })).toThrow(MissingSolapiConfigError);
  });

  it("normalizes Korean phone numbers into Solapi-compatible digits", () => {
    expect(normalizeKoreanPhone("010-7939-7089")).toBe("01079397089");
    expect(normalizeKoreanPhone("02)1234-5678")).toBe("0212345678");
  });

  it("sends an SMS through the injected Solapi client", async () => {
    const send = vi.fn().mockResolvedValue({
      groupId: "G01",
      messageId: "M01",
      statusCode: "2000"
    });

    const result = await sendSolapiMessage(
      {
        to: "010-1234-5678",
        text: "방문예약이 확정되었습니다.",
        templateType: "visit_confirmation"
      },
      {
        config: {
          apiKey: "api-key",
          apiSecret: "api-secret",
          senderNumber: "010-7939-7089"
        },
        clientFactory: () => ({ send })
      }
    );

    expect(send).toHaveBeenCalledWith({
      to: "01012345678",
      from: "01079397089",
      text: "방문예약이 확정되었습니다.",
      type: "SMS"
    });
    expect(result.providerMessageId).toBe("M01");
    expect(result.status).toBe("sent");
  });
});
