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
  const episodes = [];
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
    },
    onEpisodeCompleted: async (episode) => {
      episodes.push(episode.id);
      return { recordingUrl: "/recordings/episode.mp3" };
    },
    initialSettings: { theme: "沖縄の日常とAI実験", targetMinutes: 3 }
  });

  await manager.ensureQueue();
  await manager.completeBlock("block-1", { playedSeconds: 200 });

  assert.deepEqual(completed, ["block-1"]);
  assert.deepEqual(episodes, ["episode-1"]);
  assert.equal(manager.getState().queue.length, 0);
  assert.equal(manager.getState().status, "complete");
  assert.equal(manager.getState().episode.recordingUrl, "/recordings/episode.mp3");
  assert.equal(manager.getState().completed[0].recordingUrl, "/recordings/block-1.mp3");
});

test("updateSettings resets episode and uses new theme and target minutes", async () => {
  const manager = createQueueManager({
    generateReadyBlock: async (settings) => ({
      id: "block-1",
      title: settings.theme,
      corner: "今日のAI実験報告",
      summary: "summary",
      topics: [settings.theme],
      lines: []
    }),
    onBlockCompleted: async () => null,
    onEpisodeCompleted: async () => null
  });

  manager.updateSettings({ theme: "Codex反省会", targetMinutes: 15 });
  await manager.ensureQueue();

  const state = manager.getState();
  assert.equal(state.settings.theme, "Codex反省会");
  assert.equal(state.settings.targetMinutes, 15);
  assert.equal(state.episode.targetSeconds, 900);
  assert.equal(state.queue[0].title, "Codex反省会");
});
