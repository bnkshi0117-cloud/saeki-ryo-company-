/**
 * ヘッドレスラジオ生成スクリプト
 * Usage: node scripts/generate-headless.mjs --show morning|afternoon|night
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import { getConfig } from "../src/config.mjs";
import { loadMemory, appendMemory } from "../src/memory-store.mjs";
import { generateScriptBlock } from "../src/script-generator.mjs";
import { synthesizeBlock } from "../src/tts-xai.mjs";
import { createQueueManager } from "../src/queue-manager.mjs";
import { saveBlockRecording, saveEpisodeRecording } from "../src/recording-store.mjs";
import { buildNewsContext } from "../src/news-fetcher.mjs";
import { exportRecordingVideo } from "../src/video-exporter.mjs";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");

const SHOW_PRESETS = {
  morning: {
    theme: "最新ニュースと今日の沖縄の天気・AIニュース",
    targetMinutes: 10,
    label: "朝のラジオ",
    caption: [
      "おはようございます！今朝のAIゆんたくラジオです☀️",
      "",
      "Claude × xAI TTSで自動生成した朝のラジオ。",
      "",
      "とーーーーーーってもお暇なときにでも聞いてみてくださいｗ",
      "",
      "#AI #沖縄 #朝ラジオ"
    ].join("\n")
  },
  afternoon: {
    theme: "沖縄の日常とAI実験",
    targetMinutes: 25,
    label: "昼のラジオ",
    caption: [
      "こんにちは！昼のAIゆんたくラジオです🌺",
      "",
      "とーーーーーーってもお暇なときにでも聞いてみてくださいｗ",
      "",
      "#AI #沖縄 #AIラジオ"
    ].join("\n")
  },
  night: {
    theme: "沖縄の日常とAI実験、ちょっとおふざけ深夜ラジオ",
    targetMinutes: 25,
    label: "夜のラジオ",
    caption: [
      "今夜もAIゆんたくラジオです🌙",
      "",
      "とーーーーーーってもお暇なときにでも聞いてみてくださいｗ",
      "",
      "#AI #沖縄 #深夜ラジオ"
    ].join("\n")
  }
};

/** 日本語音声の長さをテキスト文字数から推定（約5.5文字/秒） */
function estimateBlockDuration(block) {
  return block.lines.reduce((total, line) => {
    return total + Math.max(2, line.text.length / 5.5);
  }, 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const showName = args.show || "morning";
  const preset = SHOW_PRESETS[showName];
  if (!preset) {
    throw new Error(`Unknown show: "${showName}". Use morning, afternoon, or night.`);
  }

  console.log(`🎙️  [${preset.label}] 生成開始 (目標: ${preset.targetMinutes}分)`);

  const config = getConfig();
  const showConfig = JSON.parse(await fs.readFile(config.showConfigPath, "utf8"));
  const settings = { theme: preset.theme, targetMinutes: preset.targetMinutes };

  const manager = createQueueManager({
    generateReadyBlock: async (_settings, context = {}) => {
      const memory = await loadMemory(config.memoryPath);
      const newsContext = await buildNewsContext({ settings });
      const isFirstBlock = context.isFirstBlock === true;
      const isFinalBlock = context.isFinalBlock === true;
      const scriptBlock = await generateScriptBlock({
        config, showConfig, memory, settings, newsContext,
        isFirstBlock, isFinalBlock
      });
      scriptBlock.newsItems = newsContext.items;
      scriptBlock.isFinalBlock = isFinalBlock;
      return synthesizeBlock({ config, showConfig, block: scriptBlock });
    },
    onBlockCompleted: async (block) => {
      const recording = await saveBlockRecording({ config, block });
      await appendMemory(config.memoryPath, {
        id: block.id,
        summary: block.summary,
        topics: block.topics,
        corner: block.corner,
        recordingUrl: recording?.recordingUrl || null
      });
      return recording;
    },
    onEpisodeCompleted: async (episode) => saveEpisodeRecording({ config, episode }),
    initialSettings: settings
  });

  // 生成開始
  manager.ensureQueue().catch(() => {});

  let blockCount = 0;
  const MAX_WAIT_MS = 20 * 60 * 1000; // 20分タイムアウト
  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error("タイムアウト: 生成に20分以上かかっています");
    }

    const state = manager.getState();

    if (state.episode.complete) {
      console.log(`\n✅ エピソード完了 (合計 ${Math.round(state.episode.playedSeconds / 60 * 10) / 10}分)`);

      const episodeUrl = state.episode.recordingUrl;
      if (!episodeUrl) throw new Error("録音URLが取得できませんでした");
      const episodePath = path.join(config.recordingsDir, path.basename(episodeUrl));

      // MP4書き出し
      console.log(`🎬 動画書き出し中...`);
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(now).replace(/\//g, "-");

      const videoDir = path.join(projectDir, "data", "videos");
      await fs.mkdir(videoDir, { recursive: true });
      const videoPath = path.join(videoDir, `${showName}-${dateStr}.mp4`);

      const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic;
      const skipText = process.platform !== "win32"; // CI(Linux)ではdrawtext不使用
      await exportRecordingVideo({
        ffmpegPath,
        inputPath: episodePath,
        outputPath: videoPath,
        title: `佐伯亮のAIゆんたくラジオ ${preset.label}`,
        skipText
      });

      console.log(`✅ 動画完了: ${videoPath}`);

      // 次ステップへの引き渡し用ファイル
      const runOutput = {
        videoPath,
        episodePath,
        show: showName,
        label: preset.label,
        caption: preset.caption,
        dateStr
      };
      const outputFilePath = path.join(projectDir, "data", "run-output.json");
      await fs.writeFile(outputFilePath, JSON.stringify(runOutput, null, 2), "utf8");
      console.log(`📋 出力: ${outputFilePath}`);
      break;
    }

    if (state.status === "error") {
      throw new Error(`生成エラー: ${state.lastError}`);
    }

    if (state.queue.length === 0) {
      process.stdout.write(".");
      await sleep(3000);
      manager.ensureQueue().catch(() => {});
      continue;
    }

    // ブロックを完了扱いにして次へ進める
    const block = state.queue[0];
    const playedSeconds = estimateBlockDuration(block);
    blockCount++;
    console.log(`\n  📻 ブロック${blockCount}: "${block.title}" (~${Math.round(playedSeconds)}秒)`);
    await manager.completeBlock(block.id, { playedSeconds });
  }
}

main().catch((error) => {
  console.error(`\n❌ 失敗: ${error.message}`);
  process.exitCode = 1;
});
