/**
 * ヘッドレスラジオ生成スクリプト（1本スクリプト方式）
 * Usage: node scripts/generate-headless.mjs --show morning|afternoon|night
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import { getConfig } from "../src/config.mjs";
import { loadMemory, appendMemory } from "../src/memory-store.mjs";
import { generateFullEpisodeScript } from "../src/script-generator.mjs";
import { synthesizeLine, safeAudioName, createBlockId } from "../src/tts-xai.mjs";
import { exportRecordingVideo } from "../src/video-exporter.mjs";
import { buildNewsContext } from "../src/news-fetcher.mjs";
import { buildAssSubtitles, estimateDuration } from "../src/subtitle-builder.mjs";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");

const SHOW_PRESETS = {
  morning: {
    theme: "沖縄の日常、今日の天気とニュース、AIの話、生活のこと、なんでも",
    targetMinutes: 3,
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
    theme: "沖縄の日常とAI実験、生活のあれこれ",
    targetMinutes: 3,
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
    targetMinutes: 3,
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

async function findBgmFile(bgmDir) {
  try {
    const files = await fs.readdir(bgmDir);
    const audio = files.filter((f) => /\.(mp3|wav|m4a)$/i.test(f)).sort();
    return audio.length > 0 ? path.join(bgmDir, audio[0]) : null;
  } catch {
    return null;
  }
}

/** TTS直列合成（1本ずつ、xAIのスロットリング対策） */
async function synthesizeAllLines({ config, showConfig, blockId, lines }) {
  const voiceBySpeaker = new Map(showConfig.hosts.map((h) => [h.id, h.voiceId]));
  const results = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const voiceId = voiceBySpeaker.get(line.speakerId) || showConfig.hosts[0].voiceId;
    const outputPath = path.join(config.audioDir, safeAudioName({ blockId, index, speakerId: line.speakerId }));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await synthesizeLine({ config, line, voiceId, outputPath, timeoutMs: 90000 });
    results.push(result);
    process.stdout.write(`  音声合成: ${index + 1}/${lines.length}\r`);
  }
  console.log();
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const showName = args.show || "morning";
  const preset = SHOW_PRESETS[showName];
  if (!preset) throw new Error(`Unknown show: "${showName}". Use morning, afternoon, or night.`);

  console.log(`🎙️  [${preset.label}] 生成開始 (目標: ${preset.targetMinutes}分)`);

  const config = getConfig();
  const showConfig = JSON.parse(await fs.readFile(config.showConfigPath, "utf8"));
  const settings = { theme: preset.theme, targetMinutes: preset.targetMinutes };
  const memory = await loadMemory(config.memoryPath);

  // ニュース取得（1回だけ）
  console.log(`📰 ニュース取得中...`);
  const newsContext = await buildNewsContext({ settings });
  if (newsContext.enabled) console.log(`  ${newsContext.items.length}件取得`);

  // 1本のスクリプトを生成（Claude 1回呼び出し）
  console.log(`✍️  台本生成中...`);
  const script = await generateFullEpisodeScript({ config, showConfig, memory, settings, newsContext });
  console.log(`  「${script.title}」(${script.lines.length}行)`);

  // 音声合成（並列バッチ処理）
  console.log(`🔊 音声合成中...`);
  const blockId = createBlockId();
  const synthesizedLines = await synthesizeAllLines({ config, showConfig, blockId, lines: script.lines });

  // MP3連結
  console.log(`🎵 MP3結合中...`);
  await fs.mkdir(config.recordingsDir, { recursive: true });
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now).replace(/\//g, "-");

  const episodePath = path.join(config.recordingsDir, `${showName}-${dateStr}.mp3`);
  const chunks = await Promise.all(synthesizedLines.map((l) => fs.readFile(l.audioPath)));
  await fs.writeFile(episodePath, Buffer.concat(chunks));
  console.log(`  ${episodePath}`);

  // メモリ更新
  await appendMemory(config.memoryPath, {
    id: blockId,
    summary: script.summary,
    topics: script.topics,
    corner: "フルエピソード",
    recordingUrl: `/recordings/${path.basename(episodePath)}`
  });

  // 字幕ファイル生成
  console.log(`📝 字幕生成中...`);
  const subtitlePath = path.join(projectDir, "data", `${showName}-${dateStr}.ass`);
  const assContent = buildAssSubtitles(script.lines, `佐伯亮のAIゆんたくラジオ ${preset.label}`);
  await fs.writeFile(subtitlePath, assContent, "utf8");

  // アバタータイミング計算
  const saekiAvatarPath = path.join(projectDir, "data", "avatars", "saeki.png");
  const higaAvatarPath = path.join(projectDir, "data", "avatars", "higa.png");

  function buildEnableStr(lines, speakerId) {
    let t = 0;
    const parts = [];
    for (const line of lines) {
      const d = estimateDuration(line.text);
      if (line.speakerId === speakerId) {
        parts.push(`between(t,${t.toFixed(2)},${(t + d).toFixed(2)})`);
      }
      t += d;
    }
    return parts.length > 0 ? parts.join("+") : "between(t,-1,-2)";
  }

  const avatarConfig = {
    saekiPath: saekiAvatarPath,
    higaPath: higaAvatarPath,
    saekiEnable: buildEnableStr(script.lines, "saeki"),
    higaEnable: buildEnableStr(script.lines, "higa")
  };

  // MP4書き出し
  console.log(`🎬 動画書き出し中...`);
  const videoDir = path.join(projectDir, "data", "videos");
  await fs.mkdir(videoDir, { recursive: true });
  const videoPath = path.join(videoDir, `${showName}-${dateStr}.mp4`);
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic;

  await exportRecordingVideo({
    ffmpegPath,
    inputPath: episodePath,
    outputPath: videoPath,
    bgmPath: null,
    subtitlePath,
    avatarConfig,
    title: `佐伯亮のAIゆんたくラジオ ${preset.label}`,
    skipText: true
  });
  console.log(`✅ 動画完了: ${videoPath}`);

  // 次ステップへの引き渡し
  const runOutput = { videoPath, episodePath, show: showName, label: preset.label, caption: preset.caption, dateStr };
  await fs.writeFile(path.join(projectDir, "data", "run-output.json"), JSON.stringify(runOutput, null, 2), "utf8");
}

main().catch((error) => {
  console.error(`\n❌ 失敗: ${error.message}`);
  process.exitCode = 1;
});
