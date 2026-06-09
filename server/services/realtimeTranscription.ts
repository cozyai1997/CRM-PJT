import WebSocket from "ws";

export interface RealtimeTranscriber {
  pushPcm8kPayload(payload: string): void;
  commit(): void;
  close(): void;
}

export interface RealtimeTranscriberOptions {
  apiKey: string;
  model: string;
  language?: string;
  onDelta: (delta: string) => void;
  onCompleted: (transcript: string) => void;
  onError: (message: string) => void;
}

export const decodePcm16Payload = (payload: string) => {
  const input = Buffer.from(payload, "base64");
  const output = new Int16Array(Math.floor(input.length / 2));

  for (let index = 0; index < output.length; index += 1) {
    output[index] = input.readInt16LE(index * 2);
  }

  return output;
};

export const upsample8kTo24k = (samples: Int16Array) => {
  const output = new Int16Array(samples.length * 3);

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const next = samples[index + 1] ?? current;
    const targetIndex = index * 3;
    output[targetIndex] = current;
    output[targetIndex + 1] = Math.round(current + (next - current) / 3);
    output[targetIndex + 2] = Math.round(current + ((next - current) * 2) / 3);
  }

  return output;
};

export const pcm16ToBase64 = (samples: Int16Array) =>
  Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).toString("base64");

export const pcm8kPayloadToOpenAiPcmBase64 = (payload: string) => pcm16ToBase64(upsample8kTo24k(decodePcm16Payload(payload)));

export const createOpenAiRealtimeTranscriber = (options: RealtimeTranscriberOptions): RealtimeTranscriber => {
  const ws = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription", {
    headers: {
      Authorization: `Bearer ${options.apiKey}`
    }
  });
  let pendingChunks = 0;
  let opened = false;
  const pendingAudio: string[] = [];

  const send = (payload: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  ws.on("open", () => {
    opened = true;
    send({
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000
            },
            transcription: {
              model: options.model,
              language: options.language ?? "ko",
              delay: "low"
            },
            turn_detection: null
          }
        }
      }
    });
    pendingAudio.splice(0).forEach((audio) => {
      send({ type: "input_audio_buffer.append", audio });
    });
  });

  ws.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());

      if (event.type === "conversation.item.input_audio_transcription.delta" && typeof event.delta === "string") {
        options.onDelta(event.delta);
      }

      if (event.type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string") {
        options.onCompleted(event.transcript);
      }

      if (event.type === "error") {
        options.onError(event.error?.message ?? "OpenAI realtime transcription failed.");
      }
    } catch (error) {
      options.onError(error instanceof Error ? error.message : "OpenAI realtime event parse failed.");
    }
  });

  ws.on("error", (error) => {
    options.onError(error.message);
  });

  return {
    pushPcm8kPayload(payload) {
      const audio = pcm8kPayloadToOpenAiPcmBase64(payload);

      if (opened) {
        send({ type: "input_audio_buffer.append", audio });
      } else {
        pendingAudio.push(audio);
      }

      pendingChunks += 1;

      if (pendingChunks >= 50) {
        pendingChunks = 0;
        this.commit();
      }
    },

    commit() {
      send({ type: "input_audio_buffer.commit" });
    },

    close() {
      if (ws.readyState === WebSocket.OPEN) {
        send({ type: "input_audio_buffer.commit" });
        ws.close();
      }
    }
  };
};
