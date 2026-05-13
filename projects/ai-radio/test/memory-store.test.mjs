import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadMemory, appendMemory } from "../src/memory-store.mjs";

test("loadMemory creates a clean memory file when missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-radio-memory-"));
  const memoryPath = path.join(dir, "memory.json");

  const memory = await loadMemory(memoryPath);

  assert.deepEqual(memory.blocks, []);
  const saved = JSON.parse(await fs.readFile(memoryPath, "utf8"));
  assert.deepEqual(saved.blocks, []);
});

test("appendMemory keeps the latest 30 blocks", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-radio-memory-"));
  const memoryPath = path.join(dir, "memory.json");

  for (let i = 0; i < 35; i += 1) {
    await appendMemory(memoryPath, {
      id: `block-${i}`,
      summary: `summary ${i}`,
      topics: [`topic-${i}`],
      corner: "今日のAI実験報告"
    });
  }

  const memory = await loadMemory(memoryPath);
  assert.equal(memory.blocks.length, 30);
  assert.equal(memory.blocks[0].id, "block-5");
  assert.equal(memory.blocks[29].id, "block-34");
});
