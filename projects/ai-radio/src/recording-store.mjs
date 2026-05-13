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

  return {
    recordingPath,
    recordingUrl: `/recordings/${path.basename(recordingPath)}`
  };
}
