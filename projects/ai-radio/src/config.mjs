import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");

export function loadRootEnv(rootDir = path.resolve(projectDir, "..", "..")) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}

export function createConfig({ rootDir = path.resolve(projectDir, "..", ".."), env = process.env } = {}) {
  const anthropicApiKey = env.ANTHROPIC_API_KEY;
  const xaiApiKey = env.XAI_API_KEY;

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required in the root .env file.");
  }

  if (!xaiApiKey) {
    throw new Error("XAI_API_KEY is required in the root .env file.");
  }

  const port = Number.parseInt(env.AI_RADIO_PORT || "4173", 10);

  return {
    rootDir,
    projectDir,
    port,
    anthropicApiKey,
    xaiApiKey,
    anthropicModel: env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    xaiTtsEndpoint: env.XAI_TTS_ENDPOINT || "https://api.x.ai/v1/tts",
    publicDir: path.join(projectDir, "public"),
    dataDir: path.join(projectDir, "data"),
    audioDir: path.join(projectDir, "data", "audio"),
    bgmDir: path.join(projectDir, "data", "bgm"),
    recordingsDir: path.join(projectDir, "data", "recordings"),
    memoryPath: path.join(projectDir, "data", "memory.json"),
    showConfigPath: path.join(projectDir, "data", "show-config.json")
  };
}

export function getConfig() {
  loadRootEnv();
  return createConfig();
}
