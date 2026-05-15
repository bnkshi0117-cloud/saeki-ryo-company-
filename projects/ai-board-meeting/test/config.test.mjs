import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConfig, getConfig } from "../src/config.mjs";

test("createConfig resolves root, project, and meeting log paths", () => {
  const rootDir = path.resolve("C:/tmp/saeki-ryo-company");
  const config = createConfig({
    rootDir,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      AI_BOARD_MEETING_MODEL: "claude-test"
    }
  });

  assert.equal(config.rootDir, rootDir);
  assert.equal(config.projectDir, path.join(rootDir, "projects", "ai-board-meeting"));
  assert.equal(config.meetingLogDir, path.join(rootDir, "logs", "meeting"));
  assert.equal(config.anthropicModel, "claude-test");
  assert.equal(config.anthropicApiKey, "test-key");
});

test("createConfig uses a default Anthropic model", () => {
  const config = createConfig({
    rootDir: "C:/repo",
    env: {
      ANTHROPIC_API_KEY: "test-key"
    }
  });

  assert.equal(config.anthropicModel, "claude-sonnet-4-6");
});

test("createConfig requires ANTHROPIC_API_KEY", () => {
  assert.throws(
    () => createConfig({ rootDir: "C:/repo", env: {} }),
    /ANTHROPIC_API_KEY is required/
  );
});

test("getConfig resolves root from module location instead of cwd", () => {
  const originalCwd = process.cwd();
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.AI_BOARD_MEETING_MODEL;
  const testFile = fileURLToPath(import.meta.url);
  const projectDir = path.resolve(path.dirname(testFile), "..");
  const expectedRootDir = path.resolve(projectDir, "..", "..");

  process.chdir(os.tmpdir());
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.AI_BOARD_MEETING_MODEL;

  try {
    const config = getConfig();

    assert.equal(config.rootDir, expectedRootDir);
    assert.equal(config.projectDir, projectDir);
  } finally {
    process.chdir(originalCwd);

    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.AI_BOARD_MEETING_MODEL;
    } else {
      process.env.AI_BOARD_MEETING_MODEL = originalModel;
    }
  }
});
