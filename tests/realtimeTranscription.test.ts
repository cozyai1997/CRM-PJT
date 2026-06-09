import { describe, expect, it } from "vitest";
import {
  decodePcm16Payload,
  pcm8kPayloadToOpenAiPcmBase64,
  upsample8kTo24k
} from "../server/services/realtimeTranscription";

describe("Realtime transcription audio conversion", () => {
  it("converts Callbridge PCM 8 kHz audio into 24 kHz PCM16 base64", () => {
    const pcm8kPayload = Buffer.from(new Int16Array([0, 1200, -1200, 2400]).buffer).toString("base64");
    const decoded = decodePcm16Payload(pcm8kPayload);
    const upsampled = upsample8kTo24k(decoded);
    const openAiPayload = pcm8kPayloadToOpenAiPcmBase64(pcm8kPayload);

    expect(decoded).toHaveLength(4);
    expect(upsampled).toHaveLength(12);
    expect(Buffer.from(openAiPayload, "base64")).toHaveLength(24);
  });
});
