import fs from "node:fs/promises";
import path from "node:path";

export function recordingFileName(block) {
  const safeId = String(block.id).replace(/[^a-z0-9_-]/gi, "");
  return `${safeId || Date.now()}.mp3`;
}

export async function saveBlockRecording({ config, block }) {
  const inputPaths = block.lines.map((line) => line.audioPath).filter(Boolean);
  if (inputPaths.length === 0) {
    return null;
  }

  await fs.mkdir(config.recordingsDir, { recursive: true });
  const recordingPath = path.join(config.recordingsDir, recordingFileName(block));
  const chunks = [];

  for (const inputPath of inputPaths) {
    chunks.push(await fs.readFile(inputPath));
  }

  await fs.writeFile(recordingPath, Buffer.concat(chunks));

  // 字幕・アバター用マニフェスト保存
  const manifestPath = recordingPath.replace(/\.mp3$/, ".json");
  const manifest = {
    type: "block",
    id: block.id,
    title: block.title || "",
    lines: block.lines.filter((l) => l.audioPath).map((l) => ({
      speakerId: l.speakerId,
      speakerName: l.speakerName,
      text: l.text
    }))
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return {
    recordingPath,
    recordingUrl: `/recordings/${path.basename(recordingPath)}`
  };
}

export async function saveEpisodeRecording({ config, episode }) {
  const inputPaths = episode.recordings.map((recording) => recording.recordingPath).filter(Boolean);
  if (inputPaths.length === 0) {
    return null;
  }

  await fs.mkdir(config.recordingsDir, { recursive: true });
  const recordingPath = path.join(config.recordingsDir, `${episode.id}.mp3`);
  const chunks = [];

  for (const inputPath of inputPaths) {
    chunks.push(await fs.readFile(inputPath));
  }

  await fs.writeFile(recordingPath, Buffer.concat(chunks));

  // 全ブロックのラインを集約してエピソードマニフェスト保存
  const allLines = [];
  for (const rec of episode.recordings) {
    if (!rec.recordingPath) continue;
    const blockManifestPath = rec.recordingPath.replace(/\.mp3$/, ".json");
    try {
      const data = JSON.parse(await fs.readFile(blockManifestPath, "utf8"));
      allLines.push(...(data.lines || []));
    } catch { /* マニフェストがなければスキップ */ }
  }

  if (allLines.length > 0) {
    const episodeManifestPath = recordingPath.replace(/\.mp3$/, ".json");
    await fs.writeFile(episodeManifestPath, JSON.stringify({
      type: "episode",
      id: episode.id,
      lines: allLines
    }, null, 2), "utf8");
  }

  return {
    recordingPath,
    recordingUrl: `/recordings/${path.basename(recordingPath)}`
  };
}
