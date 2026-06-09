import { describe, expect, it, vi } from "vitest";
import {
  buildRowsForApiSettings,
  decryptApiSettingsRows,
  saveRemoteApiSettings
} from "../server/services/supabaseApiSettingsStore";

const encryptionKey = Buffer.alloc(32, 11).toString("base64");

describe("Supabase API settings store", () => {
  it("encrypts settings rows and decrypts them back into API settings", () => {
    const rows = buildRowsForApiSettings(
      {
        OPENAI_API_KEY: "sk-test-secret",
        CALLBRIDGE_API_KEY: "callbridge-secret",
        CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
      },
      {
        encryptionKey,
        updatedBy: "user-1"
      }
    );

    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain("sk-test-secret");
    expect(JSON.stringify(rows)).not.toContain("callbridge-secret");
    expect(decryptApiSettingsRows(rows, encryptionKey)).toMatchObject({
      OPENAI_API_KEY: "sk-test-secret",
      CALLBRIDGE_API_KEY: "callbridge-secret",
      CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
    });
  });

  it("normalizes, autofills, and upserts remote API settings", async () => {
    const storedRows = [
      ...buildRowsForApiSettings(
        {
          CALLBRIDGE_API_KEY: "callbridge-page-key",
          CALLBRIDGE_DISPLAY_NUMBER: "07012345678",
          CALLBRIDGE_AGENT_API_KEY: "callbridge-page-key",
          CALLBRIDGE_BASE_URL: "https://bnd.happytalk.io/api/openapi",
          OPENAI_REALTIME_TRANSCRIPTION_MODEL: "gpt-realtime-whisper"
        },
        { encryptionKey, updatedBy: "user-1" }
      )
    ];
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: storedRows,
        error: null
      })
    });
    const select = vi.fn().mockResolvedValue({
      data: storedRows,
      error: null
    });
    const client = {
      from: vi.fn().mockReturnValue({ select, upsert })
    };

    const saved = await saveRemoteApiSettings(
      {
        settings: {
          CALLBRIDGE_API_KEY: " callbridge-page-key ",
          CALLBRIDGE_DISPLAY_NUMBER: "07012345678"
        }
      },
      {
        client,
        env: {},
        encryptionKey,
        updatedBy: "user-1"
      }
    );

    expect(client.from).toHaveBeenCalledWith("crm_api_settings");
    expect(upsert).toHaveBeenCalledOnce();
    expect(JSON.stringify(upsert.mock.calls[0][0])).not.toContain("callbridge-page-key");
    expect(saved.CALLBRIDGE_AGENT_API_KEY).toBe("callbridge-page-key");
    expect(saved.CALLBRIDGE_BASE_URL).toBe("https://bnd.happytalk.io/api/openapi");
    expect(saved.OPENAI_REALTIME_TRANSCRIPTION_MODEL).toBe("gpt-realtime-whisper");
  });
});
