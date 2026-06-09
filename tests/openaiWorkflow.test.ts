import { describe, expect, it, vi } from "vitest";
import {
  analyzeTranscript,
  assertOpenAiApiKey,
  parseConsultationAnalysis,
  refineMessageDraft,
  transcribeRecording
} from "../server/services/openaiWorkflow";

describe("OpenAI CRM workflow", () => {
  it("fails with a safe error when OPENAI_API_KEY is missing", () => {
    expect(() => assertOpenAiApiKey({})).toThrow("OPENAI_API_KEY is not configured");
    expect(() => assertOpenAiApiKey({ OPENAI_API_KEY: "" })).toThrow("OPENAI_API_KEY is not configured");
  });

  it("parses AI analysis JSON into the CRM analysis contract", () => {
    const analysis = parseConsultationAnalysis(`{
      "customer_intent": "방문예약 문의",
      "interest_level": "높음",
      "main_concerns": ["초기 자금", "교통"],
      "recommended_script_type": "방문예약 확정 유도",
      "recommended_script": "이번 주말 방문 가능 시간을 확인해 주세요.",
      "next_action": "방문예약 생성 및 위치 문자 발송",
      "risk_alert": "분양가와 혜택 조건을 단정적으로 안내하지 말 것",
      "manager_summary": "고객은 주말 방문 의사가 있으며 초기 자금과 교통편을 우려함.",
      "sentiment": "긍정",
      "lead_quality": "qualified"
    }`);

    expect(analysis.customerIntent).toBe("방문예약 문의");
    expect(analysis.interestLevel).toBe("높음");
    expect(analysis.mainConcerns).toEqual(["초기 자금", "교통"]);
    expect(analysis.nextAction).toBe("방문예약 생성 및 위치 문자 발송");
    expect(analysis.leadQuality).toBe("qualified");
  });

  it("uses the configured transcription model for recording uploads", async () => {
    const create = vi.fn().mockResolvedValue({ text: "고객이 위치와 방문예약을 문의했습니다." });
    const result = await transcribeRecording(
      {
        filePath: "C:/tmp/call.wav",
        originalName: "call.wav"
      },
      {
        model: "gpt-4o-mini-transcribe",
        openai: {
          audio: {
            transcriptions: { create }
          }
        }
      }
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-transcribe"
      })
    );
    expect(result).toBe("고객이 위치와 방문예약을 문의했습니다.");
  });

  it("requests structured consultation analysis from the configured model", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        customer_intent: "위치 문의",
        interest_level: "중간",
        main_concerns: ["주차"],
        recommended_script_type: "위치 안내",
        recommended_script: "네이버지도 링크를 문자로 안내드리겠습니다.",
        next_action: "지도 링크 문자 발송",
        risk_alert: "현장 정보와 모델하우스 위치를 혼동하지 말 것",
        manager_summary: "고객은 주차 가능 여부를 확인함.",
        sentiment: "중립",
        lead_quality: "new"
      }
    });

    const analysis = await analyzeTranscript(
      {
        transcript: "모델하우스 위치와 주차장이 어디인가요?",
        siteName: "속초 중앙하이츠 THE 228"
      },
      {
        model: "gpt-5-mini",
        openai: {
          responses: { parse }
        }
      }
    );

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini"
      })
    );
    expect(analysis.nextAction).toBe("지도 링크 문자 발송");
  });

  it("refines a user-written follow-up message with CRM context", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        refined_text: "김고객님, 오늘 상담 감사드립니다. 모델하우스 위치와 주차 안내를 문자로 보내드립니다."
      }
    });

    const refined = await refineMessageDraft(
      {
        draft: "오늘 통화 감사. 위치랑 주차 보내드림",
        customerName: "김고객",
        siteName: "속초 중앙하이츠 THE 228",
        customerIntent: "위치 문의",
        interestLevel: "중간",
        mainConcerns: ["주차"],
        nextAction: "지도 링크 문자 발송"
      },
      {
        model: "gpt-5-mini",
        openai: {
          responses: { parse }
        }
      }
    );

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini"
      })
    );
    expect(refined).toBe("김고객님, 오늘 상담 감사드립니다. 모델하우스 위치와 주차 안내를 문자로 보내드립니다.");
  });
});
