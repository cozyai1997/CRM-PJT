import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Render deploy config", () => {
  it("installs dev dependencies during Render builds", () => {
    const renderYaml = readFileSync(join(root, "render.yaml"), "utf8");

    expect(renderYaml).toContain("buildCommand: npm ci --include=dev && npm run build");
  });

  it("documents the same Render build command users should enter manually", () => {
    const guide = readFileSync(join(root, "docs", "render-deploy-guide.md"), "utf8");

    expect(guide).toContain("npm ci --include=dev && npm run build");
  });
});
