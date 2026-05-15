import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { exportRecordingVideo, outputVideoName } from "../src/video-exporter.mjs";
import { buildAssSubtitles, estimateDuration } from "../src/subtitle-builder.mjs";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");

export async function findLatestRecording(recordingsDir) {
  const entries = await fs.readdir(recordingsDir, { withFileTypes: true });
  const mp3Files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".mp3")) {
      continue;
    }
    const filePath = path.join(recordingsDir, entry.name);
    const stat = await fs.stat(filePath);
    mp3Files.push({ filePath, mtimeMs: stat.mtimeMs });
  }

  if (mp3Files.length === 0) {
    throw new Error(`No mp3 recordings found in ${recordingsDir}`);
  }

  mp3Files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return mp3Files[0].filePath;
}

export function resolveExportVideoOptions({
  projectDir,
  inputPath,
  outputPath,
  title = "佐伯亮のAIゆんたくラジオ"
}) {
  return {
    inputPath,
    outputPath: outputPath || path.join(projectDir, "data", "videos", outputVideoName(path.basename(inputPath))),
    title
  };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    args.set(item.slice(2), argv[index + 1]);
    index += 1;
  }
  return args;
}

async function loadManifest(mp3Path) {
  const manifestPath = mp3Path.replace(/\.mp3$/i, ".json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

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

async function buildStaticAvatarConfig(projectDir) {
  const avatarDir = path.join(projectDir, "data", "avatars");
  const saekiPath = path.join(avatarDir, "saeki.png");
  const higaPath = path.join(avatarDir, "higa.png");

  const [saekiExists, higaExists] = await Promise.all([
    fs.access(saekiPath).then(() => true).catch(() => false),
    fs.access(higaPath).then(() => true).catch(() => false)
  ]);

  if (!saekiExists && !higaExists) return null;

  // 常時表示（タイミングなし）
  return {
    saekiPath: saekiExists ? saekiPath : null,
    higaPath: higaExists ? higaPath : null,
    saekiEnable: saekiExists ? "1" : null,
    higaEnable: higaExists ? "1" : null
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recordingsDir = path.join(projectDir, "data", "recordings");
  const inputPath = args.get("input")
    ? path.resolve(projectDir, args.get("input"))
    : await findLatestRecording(recordingsDir);
  const outputPath = args.get("output")
    ? path.resolve(projectDir, args.get("output"))
    : undefined;
  const title = args.get("title") || "佐伯亮のAIゆんたくラジオ";
  const options = resolveExportVideoOptions({ projectDir, inputPath, outputPath, title });

  // マニフェストが存在すれば字幕・アバタータイミングを生成
  const manifest = await loadManifest(options.inputPath);
  let subtitlePath = null;
  let avatarConfig = null;

  if (manifest?.lines?.length > 0) {
    console.log(`マニフェスト読み込み: ${manifest.lines.length}行`);

    // 字幕ファイル生成
    const assContent = buildAssSubtitles(manifest.lines, options.title);
    subtitlePath = options.outputPath.replace(/\.mp4$/, ".ass");
    await fs.writeFile(subtitlePath, assContent, "utf8");

    // アバタータイミング生成
    const avatarDir = path.join(projectDir, "data", "avatars");
    const saekiPath = path.join(avatarDir, "saeki.png");
    const higaPath = path.join(avatarDir, "higa.png");
    const [saekiExists, higaExists] = await Promise.all([
      fs.access(saekiPath).then(() => true).catch(() => false),
      fs.access(higaPath).then(() => true).catch(() => false)
    ]);
    avatarConfig = {
      saekiPath: saekiExists ? saekiPath : null,
      higaPath: higaExists ? higaPath : null,
      saekiEnable: buildEnableStr(manifest.lines, "saeki"),
      higaEnable: buildEnableStr(manifest.lines, "higa")
    };
    console.log("字幕・アバタータイミング付きで書き出します");
  } else {
    // マニフェストなし → アバター常時表示にフォールバック
    avatarConfig = await buildStaticAvatarConfig(projectDir);
    if (avatarConfig) console.log("アバター常時表示で書き出します");
  }

  await exportRecordingVideo({ ffmpegPath, subtitlePath, avatarConfig, ...options });
  console.log(`Video exported: ${options.outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
