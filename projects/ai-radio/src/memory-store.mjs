import fs from "node:fs/promises";
import path from "node:path";

export function createEmptyMemory() {
  return {
    version: 1,
    blocks: []
  };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function saveMemory(memoryPath, memory) {
  await ensureParentDir(memoryPath);
  await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), "utf8");
}

export async function loadMemory(memoryPath) {
  try {
    const raw = await fs.readFile(memoryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.blocks)) {
      throw new Error("Invalid memory format.");
    }
    return parsed;
  } catch {
    const memory = createEmptyMemory();
    await saveMemory(memoryPath, memory);
    return memory;
  }
}

export async function appendMemory(memoryPath, blockSummary) {
  const memory = await loadMemory(memoryPath);
  memory.blocks.push({
    ...blockSummary,
    savedAt: new Date().toISOString()
  });
  memory.blocks = memory.blocks.slice(-30);
  await saveMemory(memoryPath, memory);
  return memory;
}

export function recentTopics(memory) {
  return memory.blocks.flatMap((block) => block.topics || []).slice(-40);
}
