import { describe, expect, it } from "vitest";
import {
  clearRemoteApiSettingsCache,
  getEffectiveRuntimeEnv,
  replaceRemoteApiSettingsCache
} from "../server/services/runtimeApiSettings";

describe("runtime API settings", () => {
  it("uses remote DB settings before process environment values", () => {
    clearRemoteApiSettingsCache();
    replaceRemoteApiSettingsCache({
      OPENAI_API_KEY: "remote-openai-key",
      CALLBRIDGE_API_KEY: "remote-callbridge-key"
    });

    const env = getEffectiveRuntimeEnv({
      OPENAI_API_KEY: "local-openai-key",
      SOLAPI_API_KEY: "local-solapi-key"
    });

    expect(env.OPENAI_API_KEY).toBe("remote-openai-key");
    expect(env.CALLBRIDGE_API_KEY).toBe("remote-callbridge-key");
    expect(env.SOLAPI_API_KEY).toBe("local-solapi-key");
  });
});
