import { describe, expect, it } from "vitest";
import { getServerBindHost, getServerListenUrl } from "../server/services/runtimeConfig";

describe("runtime config", () => {
  it("keeps local development bound to loopback by default", () => {
    expect(getServerBindHost({})).toBe("127.0.0.1");
    expect(getServerListenUrl("127.0.0.1", 8787)).toBe("http://127.0.0.1:8787");
  });

  it("binds to all interfaces on Render", () => {
    expect(getServerBindHost({ RENDER: "true" })).toBe("0.0.0.0");
    expect(getServerListenUrl("0.0.0.0", 10000)).toBe("http://0.0.0.0:10000");
  });

  it("allows an explicit HOST override", () => {
    expect(getServerBindHost({ HOST: "0.0.0.0" })).toBe("0.0.0.0");
  });
});
