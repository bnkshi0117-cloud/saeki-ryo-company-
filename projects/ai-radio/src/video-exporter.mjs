import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export function outputVideoName(recordingName) {
  const base = path.basename(recordingName, path.extname(recordingName));
  const safeBase = base
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || `radio-${Date.now()}`;
  return `${safeBase}.mp4`;
}

export function buildVideoExportArgs({ inputPath, outputPath, bgmPath, subtitlePath, title = "佐伯亮のAIゆんたくラジオ", skipText = false }) {
  const useText = !skipText && canUseDrawtext();

  if (bgmPath) {
    // BGMあり: [0:a]をasplitで分岐（波形表示用とBGM混合用）
    const waveOverlay = useText
      ? `[1:v][w]overlay=x=90:y=1060,${titleFilters(title)}[v]`
      : "[1:v][w]overlay=x=90:y=1060[v]";

    const filter = [
      "[0:a]asplit=2[a_wave][a_mix]",
      "[a_wave]showwaves=s=600x240:mode=line:colors=5cc8a7,format=rgba[w]",
      waveOverlay,
      "[a_mix]volume=1.0[speech]",
      "[2:a]volume=0.15[bgm]",
      "[speech][bgm]amix=inputs=2:duration=first[a]"
    ].join(";");

    return [
      "-y",
      "-i", inputPath,
      "-f", "lavfi", "-i", "color=c=#141414:s=720x1280:r=24",
      "-stream_loop", "-1", "-i", bgmPath,
      "-filter_complex", filter,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      outputPath
    ];
  }

  // BGMなし（字幕対応）
  const subtitleFilter = subtitlePath
    ? `ass=${subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}`
    : null;

  const bgApply = subtitleFilter
    ? `[1:v]${subtitleFilter}[bg_sub]`
    : null;

  const waveSource = bgApply ? "[bg_sub]" : "[1:v]";

  const filterParts = [];
  if (bgApply) filterParts.push(bgApply);
  filterParts.push(`[0:a]showwaves=s=600x240:mode=line:colors=5cc8a7,format=rgba[w]`);
  filterParts.push(`${waveSource}[w]overlay=x=60:y=960[v]`);

  const filter = filterParts.join(";");

  return [
    "-y",
    "-i", inputPath,
    "-f", "lavfi", "-i", "color=c=#141414:s=720x1280:r=24",
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "0:a",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outputPath
  ];
}

function canUseDrawtext() {
  return process.platform === "win32";
}

export async function exportRecordingVideo({ ffmpegPath, inputPath, outputPath, bgmPath, subtitlePath, title, skipText = false }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const args = buildVideoExportArgs({ inputPath, outputPath, bgmPath, subtitlePath, title, skipText });
  await runFfmpeg(ffmpegPath, args);
  return { outputPath };
}

function getFontFile() {
  if (process.platform === "win32") {
    return "C\\:/Windows/Fonts/meiryo.ttc";
  }
  // Linux (GitHub Actions): Noto Sans CJK
  return "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
}

function titleFilters(title) {
  const fontFile = getFontFile();
  const escapedTitle = escapeDrawText(title);
  return [
    `drawtext=fontfile='${fontFile}':text='${escapedTitle}':fontcolor=f6f2e8:fontsize=58:x=80:y=220`,
    `drawtext=fontfile='${fontFile}':text='AI Yuntaku Radio Clip':fontcolor=5cc8a7:fontsize=34:x=80:y=305`,
    `drawtext=fontfile='${fontFile}':text='Generated from saved MP3':fontcolor=b9b2a5:fontsize=30:x=80:y=1540`
  ].join(",");
}

function escapeDrawText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
    });
  });
}
