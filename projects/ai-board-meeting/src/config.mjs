import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");
const defaultRootDir = path.resolve(projectDir, "..", "..");

export function loadRootEnv(rootDir = defaultRootDir) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}

export function createConfig({ rootDir = defaultRootDir, env = process.env } = {}) {
  const anthropicApiKey = env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required in the root .env file.");
  }

  return {
    rootDir,
    projectDir: path.join(rootDir, "projects", "ai-board-meeting"),
    meetingLogDir: path.join(rootDir, "logs", "meeting"),
    anthropicApiKey,
    anthropicModel: env.AI_BOARD_MEETING_MODEL || env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    anthropicEndpoint: env.ANTHROPIC_ENDPOINT || "https://api.anthropic.com/v1/messages"
  };
}

export function getConfig() {
  loadRootEnv();
  return createConfig();
}
