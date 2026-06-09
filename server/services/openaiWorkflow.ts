import { createReadStream, existsSync } from "node:fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ConsultationAnalysis, LeadQuality } from "../types";

const leadQualities = ["new", "qualified", "duplicate", "spam", "contracted", "low"] as const;

const snakeAnalysisSchema = z.object({
  customer_intent: z.string().min(1),
  interest_level: z.string().min(1),
  main_concerns: z.array(z.string()).default([]),
  recommended_script_type: z.string().min(1),
  recommended_script: z.string().min(1),
  next_action: z.string().min(1),
  risk_alert: z.string().default(""),
  manager_summary: z.string().min(1),
  sentiment: z.string().default("중립"),
  lead_quality: z.enum(leadQualities).default("new")
});

const messageRefinementSchema = z.object({
  refined_text: z.string().min(1)
});

type SnakeAnalysis = z.infer<typeof snakeAnalysisSchema>;
type MessageRefinement = z.infer<typeof messageRefinementSchema>;

interface RecordingInput {
  filePath: string;
  originalName: string;
}

interface TranscriptionDeps {
  model: string;
  openai: {
    audio: {
      transcriptions: {
        create: (input: any) => Promise<{ text?: string } | string>;
      };
    };
  };
}

interface AnalysisInput {
  transcript: string;
  siteName: string;
  customerName?: string;
  sourceChannel?: string;
}

interface AnalysisDeps {
  model: string;
  openai: {
    responses: {
      parse: (input: any) => Promise<{ output_parsed?: SnakeAnalysis | null }>;
    };
  };
}

interface MessageRefinementInput {
  draft: string;
  customerName?: string;
  siteName?: string;
  customerIntent?: string;
  interestLevel?: string;
  mainConcerns?: string[];
  nextAction?: string;
}

interface MessageRefinementDeps {
  model: string;
  openai: {
    responses: {
      parse: (input: any) => Promise<{ output_parsed?: MessageRefinement | null }>;
    };
  };
}

export class MissingOpenAiApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "MissingOpenAiApiKeyError";
  }
}

export const assertOpenAiApiKey = (env: Record<string, string | undefined>): string => {
  const key = env.OPENAI_API_KEY?.trim();

  if (!key) {
    throw new MissingOpenAiApiKeyError();
  }

  return key;
};

const extractJson = (value: string) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
};

const toCamelAnalysis = (analysis: SnakeAnalysis): ConsultationAnalysis => ({
  customerIntent: analysis.customer_intent,
  interestLevel: analysis.interest_level,
  mainConcerns: analysis.main_concerns,
  recommendedScriptType: analysis.recommended_script_type,
  recommendedScript: analysis.recommended_script,
  nextAction: analysis.next_action,
  riskAlert: analysis.risk_alert,
  managerSummary: analysis.manager_summary,
  sentiment: analysis.sentiment,
  leadQuality: analysis.lead_quality as LeadQuality
});

export const parseConsultationAnalysis = (value: string | SnakeAnalysis): ConsultationAnalysis => {
  const parsed = typeof value === "string" ? JSON.parse(extractJson(value)) : value;
  return toCamelAnalysis(snakeAnalysisSchema.parse(parsed));
};

export const createOpenAiClient = (env: NodeJS.ProcessEnv = process.env) =>
  new OpenAI({
    apiKey: assertOpenAiApiKey(env)
  });

export const transcribeRecording = async (recording: RecordingInput, deps: TranscriptionDeps): Promise<string> => {
  const file = existsSync(recording.filePath)
    ? createReadStream(recording.filePath)
    : ({ path: recording.filePath, name: recording.originalName } as unknown);

  const result = await deps.openai.audio.transcriptions.create({
    file,
    model: deps.model
  });

  if (typeof result === "string") {
    return result;
  }

  return result.text ?? "";
};

export const analyzeTranscript = async (input: AnalysisInput, deps: AnalysisDeps): Promise<ConsultationAnalysis> => {
  const result = await deps.openai.responses.parse({
    model: deps.model,
    input: [
      {
        role: "system",
        content:
          "당신은 분양 상담 CRM 분석 도우미입니다. 상담 내용을 기반으로 상담원이 즉시 사용할 수 있는 구조화된 결과만 반환합니다. 가격, 혜택, 계약 조건은 단정하지 않도록 위험 알림을 포함합니다."
      },
      {
        role: "user",
        content: [
          `현장명: ${input.siteName}`,
          input.customerName ? `고객명: ${input.customerName}` : "",
          input.sourceChannel ? `유입경로: ${input.sourceChannel}` : "",
          "상담 전사:",
          input.transcript
        ]
          .filter(Boolean)
          .join("\n")
      }
    ],
    text: {
      format: zodTextFormat(snakeAnalysisSchema, "consultation_analysis")
    }
  });

  if (!result.output_parsed) {
    throw new Error("OpenAI analysis response did not include parsed output");
  }

  return parseConsultationAnalysis(result.output_parsed);
};

export const refineMessageDraft = async (
  input: MessageRefinementInput,
  deps: MessageRefinementDeps
): Promise<string> => {
  const draft = input.draft.trim();

  if (!draft) {
    throw new Error("Message draft cannot be empty");
  }

  const result = await deps.openai.responses.parse({
    model: deps.model,
    input: [
      {
        role: "system",
        content:
          "당신은 분양 상담 CRM의 문자 문구 편집자입니다. 사용자가 쓴 문자 초안을 정중하고 자연스럽고 짧게 다듬습니다. 고객에게 없는 혜택, 가격, 계약 조건, 확정되지 않은 정보를 새로 만들지 않습니다. 광고성 과장 표현과 단정적인 분양 조건 안내를 피합니다."
      },
      {
        role: "user",
        content: [
          `초안: ${draft}`,
          input.customerName ? `고객명: ${input.customerName}` : "",
          input.siteName ? `현장명: ${input.siteName}` : "",
          input.customerIntent ? `고객 의도: ${input.customerIntent}` : "",
          input.interestLevel ? `관심도: ${input.interestLevel}` : "",
          input.mainConcerns?.length ? `주요 우려: ${input.mainConcerns.join(", ")}` : "",
          input.nextAction ? `다음 액션: ${input.nextAction}` : "",
          "문자는 한국어로 작성하고, SMS/LMS 발송에 적합하게 불필요한 설명 없이 최종 발송 문구만 refined_text에 넣습니다."
        ]
          .filter(Boolean)
          .join("\n")
      }
    ],
    text: {
      format: zodTextFormat(messageRefinementSchema, "message_refinement")
    }
  });

  if (!result.output_parsed) {
    throw new Error("OpenAI message refinement response did not include parsed output");
  }

  return result.output_parsed.refined_text;
};

export const openAiModelsFromEnv = (env: NodeJS.ProcessEnv = process.env) => ({
  transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
  analysisModel: env.OPENAI_ANALYSIS_MODEL ?? "gpt-5-mini"
});
