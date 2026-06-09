import type { Response } from "express";

export interface VoiceEvent<T = unknown> {
  type: string;
  payload: T;
  createdAt: string;
}

export const createVoiceEvent = <T>(type: string, payload: T): VoiceEvent<T> => ({
  type,
  payload,
  createdAt: new Date().toISOString()
});

export class VoiceEventBus {
  private readonly clients = new Set<Response>();

  subscribe(response: Response) {
    this.clients.add(response);
    response.write(`event: ready\ndata: ${JSON.stringify(createVoiceEvent("ready", { ok: true }))}\n\n`);

    response.on("close", () => {
      this.clients.delete(response);
    });
  }

  publish<T>(type: string, payload: T) {
    const event = createVoiceEvent(type, payload);
    const data = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;

    for (const client of this.clients) {
      client.write(data);
    }

    return event;
  }
}
