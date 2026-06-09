export interface CallbridgeBrowserClient {
  connect(): Promise<void>;
  setMuted(muted: boolean): void;
  disconnect(): void;
}

export interface CallbridgeBrowserClientOptions {
  callSessionId: string;
  onStatus(status: string): void;
  onError(error: Error): void;
}

const targetSampleRate = 8000;

const clampSample = (sample: number) => Math.max(-1, Math.min(1, sample));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const downsampleFloat32ToPcm16Base64 = (input: Float32Array, sourceSampleRate: number, outputSampleRate = targetSampleRate) => {
  const ratio = sourceSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = Math.min(input.length - 1, Math.floor(index * ratio));
    const sample = clampSample(input[sourceIndex]);
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return bytesToBase64(bytes);
};

export const pcm16Base64ToFloat32 = (payload: string) => {
  const bytes = base64ToBytes(payload);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = new Float32Array(Math.floor(bytes.byteLength / 2));

  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getInt16(index * 2, true) / 0x8000;
  }

  return output;
};

const websocketUrl = (callSessionId: string) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/callbridge/browser/${encodeURIComponent(callSessionId)}`;
};

const waitForOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Callbridge browser WebSocket connection failed.")), { once: true });
  });

const playPcm16Base64 = (audioContext: AudioContext, payload: string) => {
  const samples = pcm16Base64ToFloat32(payload);
  const buffer = audioContext.createBuffer(1, samples.length, targetSampleRate);
  buffer.copyToChannel(samples, 0);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
};

export const createCallbridgeBrowserClient = ({
  callSessionId,
  onStatus,
  onError
}: CallbridgeBrowserClientOptions): CallbridgeBrowserClient => {
  let socket: WebSocket | null = null;
  let audioContext: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let mediaStream: MediaStream | null = null;
  let muted = false;

  const disconnect = () => {
    socket?.send(JSON.stringify({ type: "hangup" }));
    socket?.close();
    socket = null;
    processor?.disconnect();
    processor = null;
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    void audioContext?.close();
    audioContext = null;
    onStatus("상담석 연결 종료");
  };

  return {
    async connect() {
      if (socket?.readyState === WebSocket.OPEN) return;

      audioContext = new AudioContext();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      socket = new WebSocket(websocketUrl(callSessionId));
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "audio" && typeof message.audioBase64 === "string" && audioContext) {
            playPcm16Base64(audioContext, message.audioBase64);
          }
        } catch (error) {
          onError(error instanceof Error ? error : new Error("Callbridge audio message parse failed."));
        }
      });
      socket.addEventListener("close", () => onStatus("상담석 WebSocket 연결 종료"));
      socket.addEventListener("error", () => onError(new Error("Callbridge browser WebSocket error.")));

      await waitForOpen(socket);
      socket.send(JSON.stringify({ type: "answer" }));

      const source = audioContext.createMediaStreamSource(mediaStream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        event.outputBuffer.getChannelData(0).fill(0);
        if (muted || socket?.readyState !== WebSocket.OPEN || !audioContext) return;

        const payload = downsampleFloat32ToPcm16Base64(
          event.inputBuffer.getChannelData(0),
          audioContext.sampleRate,
          targetSampleRate
        );
        socket.send(
          JSON.stringify({
            type: "audio",
            audioBase64: payload
          })
        );
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      onStatus("Callbridge 상담석 연결 완료");
    },
    setMuted(nextMuted) {
      muted = nextMuted;
      onStatus(nextMuted ? "마이크 음소거" : "마이크 음소거 해제");
    },
    disconnect
  };
};
