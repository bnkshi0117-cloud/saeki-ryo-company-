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
      lines: [{ speakerId: "saeki", speakerName: "佐伯亮", text: "湿気がすごいですね。", audioUrl: "/audio/a.mp3" }]
    }),
    onBlockCompleted: async () => {}
  });

  await manager.ensureQueue();
  const state = manager.getState();

  assert.equal(state.queue.length, 1);
  assert.equal(state.status, "ready");
  assert.equal(state.queue[0].title, "湿気とAI");
});

test("queue manager rejects ready blocks without playable audio lines", async () => {
  const manager = createQueueManager({
    generateReadyBlock: async () => ({
      id: "empty-block",
      title: "音声なし",
      corner: "確認",
      summary: "音声がないブロック",
      topics: ["確認"],
      lines: []
    }),
    onBlockCompleted: async () => null
  });

  await assert.rejects(() => manager.ensureQueue(), /playable audio lines/);

  const state = manager.getState();
  assert.equal(state.status, "error");
  assert.equal(state.queue.length, 0);
});

test("reaching target duration queues a final closing block before completing episode", async () => {
  const contexts = [];
  const episodes = [];
  const manager = createQueueManager({
    generateReadyBlock: async (_settings, context) => {
      contexts.push(context);
      return {
        id: context.isFinalBlock ? "final-block" : "normal-block",
        title: context.isFinalBlock ? "締め" : "本編",
        corner: "今日のAI実験報告",
        summary: "summary",
        topics: ["AI"],
        isFinalBlock: context.isFinalBlock,
        lines: [{ speakerId: "saeki", speakerName: "佐伯亮", text: "音声あり", audioUrl: `/audio/${context.isFinalBlock ? "final" : "normal"}.mp3` }]
      };
    },
    onBlockCompleted: async (block) => ({ recordingUrl: `/recordings/${block.id}.mp3` }),
    onEpisodeCompleted: async (episode) => {
      episodes.push(episode.id);
      return { recordingUrl: "/recordings/episode.mp3" };
    },
    initialSettings: { theme: "沖縄の日常とAI実験", targetMinutes: 3 }
  });

  await manager.ensureQueue();
  await manager.completeBlock("normal-block", { playedSeconds: 200 });

  let state = manager.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.episode.complete, false);
  assert.equal(state.queue[0].id, "final-block");
  assert.equal(contexts.at(-1).isFinalBlock, true);
  assert.deepEqual(episodes, []);

  await manager.completeBlock("final-block", { playedSeconds: 20 });

  state = manager.getState();
  assert.equal(state.status, "complete");
  assert.equal(state.episode.complete, true);
  assert.equal(state.episode.recordingUrl, "/recordings/episode.mp3");
  assert.deepEqual(episodes, ["episode-1"]);
});

test("reaching target duration replaces prefetched normal blocks with the final block", async () => {
  const manager = createQueueManager({
    generateReadyBlock: async (_settings, context) => ({
      id: context.isFinalBlock ? "final-block" : `normal-${Date.now()}-${Math.random()}`,
      title: context.isFinalBlock ? "締め" : "本編",
      corner: "今日のAI実験報告",
      summary: "summary",
      topics: ["AI"],
      isFinalBlock: context.isFinalBlock,
      lines: [{ speakerId: "saeki", speakerName: "佐伯亮", text: "音声あり", audioUrl: "/audio/a.mp3" }]
    }),
    onBlockCompleted: async (block) => ({ recordingUrl: `/recordings/${block.id}.mp3` }),
    onEpisodeCompleted: async () => ({ recordingUrl: "/recordings/episode.mp3" }),
    initialSettings: { theme: "沖縄の日常とAI実験", targetMinutes: 3 }
  });

  await manager.ensureQueue();
  const firstBlockId = manager.getState().queue[0].id;
  await manager.ensureQueue();
  assert.equal(manager.getState().queue.length, 2);

  await manager.completeBlock(firstBlockId, { playedSeconds: 200 });

  const state = manager.getState();
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0].id, "final-block");
});

test("queue manager primes a short final block in the background", async () => {
  const contexts = [];
  const manager = createQueueManager({
    generateReadyBlock: async (_settings, context) => {
      contexts.push(context);
      return {
        id: context.isFinalBlock ? "final-block" : "normal-block",
        title: context.isFinalBlock ? "締め" : "本編",
        corner: "今日のAI実験報告",
        summary: "summary",
        topics: ["AI"],
        isFinalBlock: context.isFinalBlock,
        lines: [{ speakerId: "saeki", speakerName: "佐伯亮", text: "音声あり", audioUrl: "/audio/a.mp3" }]
      };
    },
    onBlockCompleted: async (block) => ({ recordingUrl: `/recordings/${block.id}.mp3` }),
    onEpisodeCompleted: async () => ({ recordingUrl: "/recordings/episode.mp3" }),
    initialSettings: { theme: "沖縄の日常とAI実験", targetMinutes: 3 }
  });

  await manager.ensureQueue();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(contexts.some((context) => context.isFinalBlock), true);
});

test("updateSettings resets episode and uses new theme and target minutes", async () => {
  const manager = createQueueManager({
    generateReadyBlock: async (settings) => ({
      id: "block-1",
      title: settings.theme,
      corner: "今日のAI実験報告",
      summary: "summary",
      topics: [settings.theme],
      lines: [{ speakerId: "saeki", speakerName: "佐伯亮", text: "音声あり", audioUrl: "/audio/a.mp3" }]
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
