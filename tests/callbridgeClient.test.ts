import { describe, expect, it } from "vitest";
import { downsampleFloat32ToPcm16Base64, pcm16Base64ToFloat32 } from "../src/callbridgeClient";

describe("Callbridge browser audio helpers", () => {
  it("downsamples float audio to PCM16 base64 and decodes PCM16 base64", () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25, -0.25, 0]);
    const payload = downsampleFloat32ToPcm16Base64(input, 16000, 8000);
    const decoded = pcm16Base64ToFloat32(payload);

    expect(decoded).toHaveLength(4);
    expect(decoded[0]).toBeCloseTo(0, 2);
    expect(decoded[1]).toBeCloseTo(-0.5, 2);
  });
});
