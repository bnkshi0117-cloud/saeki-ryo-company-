import test from "node:test";
import assert from "node:assert/strict";
import { createQueueManager } from "../src/queue-manager.mjs";

test("queue manager generates one block and exposes public state", async () => {
  const manager = createQueueManager({
    generateReadyBlock: async () => ({
      id: "block-1",
      title: "湿気とAI",
      corner: "今日のAI実験報告",
      summary: "沖縄の湿気とAI作業の話",
      topics: ["湿気", "AI"],
      lines: [{ speakerName: "佐伯", text: "湿気がすごいですね。", audioUrl: "/audio/a.mp3" }]
    }),
    onBlockCompleted: async () => {}
  });

  await manager.ensureQueue();
  const state = manager.getState();

  assert.equal(state.queue.length, 1);
  assert.equal(state.status, "ready");
  assert.equal(state.queue[0].title, "湿気とAI");
});

test("completeBlock removes the block and calls completion hook", async () => {
  const completed = [];
  const manager = createQueueManager({
    generateReadyBlock: async () => ({
      id: "block-1",
      title: "湿気とAI",
      corner: "今日のAI実験報告",
      summary: "沖縄の湿気とAI作業の話",
      topics: ["湿気", "AI"],
      lines: []
    }),
    onBlockCompleted: async (block) => {
      completed.push(block.id);
      return { recordingUrl: "/recordings/block-1.mp3" };
    }
  });

  await manager.ensureQueue();
  await manager.completeBlock("block-1");

  assert.deepEqual(completed, ["block-1"]);
  assert.equal(manager.getState().queue.length, 0);
  assert.equal(manager.getState().completed[0].recordingUrl, "/recordings/block-1.mp3");
});
