import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createConfig } from "../src/config.mjs";

test("createConfig reads defaults without exposing secrets", () => {
  const rootDir = path.resolve("..", "..");
  const config = createConfig({
    rootDir,
    env: {
      ANTHROPIC_API_KEY: "anthropic-test",
      XAI_API_KEY: "xai-test",
      AI_RADIO_PORT: "4999"
    }
  });

  assert.equal(config.port, 4999);
  assert.equal(config.anthropicApiKey, "anthropic-test");
  assert.equal(config.xaiApiKey, "xai-test");
  assert.equal(config.anthropicModel, "claude-sonnet-4-6");
  assert.equal(config.publicDir.endsWith(path.join("projects", "ai-radio", "public")), true);
});

test("createConfig throws when required API keys are missing", () => {
  assert.throws(
    () => createConfig({ rootDir: path.resolve("..", ".."), env: {} }),
    /ANTHROPIC_API_KEY/
  );
});
