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

export function buildVideoExportArgs({ inputPath, outputPath, title = "佐伯亮のAIゆんたくラジオ", skipText = false }) {
  // CI環境（Linux）ではdrawtextフィルターをスキップしてフォント依存を回避
  const useText = !skipText && canUseDrawtext();

  const filter = useText
    ? ["[0:a]showwaves=s=900x360:mode=line:colors=5cc8a7,format=rgba[w]",
        `[1:v][w]overlay=x=90:y=1060,${titleFilters(title)}[v]`].join(";")
    : ["[0:a]showwaves=s=900x360:mode=line:colors=5cc8a7,format=rgba[w]",
        "[1:v][w]overlay=x=90:y=1060[v]"].join(";");

  return [
    "-y",
    "-i", inputPath,
    "-f", "lavfi",
    "-i", "color=c=#141414:s=1080x1920:r=30",
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "0:a",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outputPath
  ];
}

function canUseDrawtext() {
  // Windowsのみテキストオーバーレイを使用（フォントが確実に存在する）
  return process.platform === "win32";
}

export async function exportRecordingVideo({ ffmpegPath, inputPath, outputPath, title, skipText = false }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const args = buildVideoExportArgs({ inputPath, outputPath, title, skipText });
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
