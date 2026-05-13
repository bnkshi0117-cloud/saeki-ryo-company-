import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export function safeAudioName({ blockId, index, speakerId }) {
  const cleanSpeaker = speakerId.replace(/[^a-z0-9_-]/gi, "");
  return `${blockId}-${String(index).padStart(2, "0")}-${cleanSpeaker}.mp3`;
}

export function createBlockId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export async function synthesizeLine({ config, line, voiceId, outputPath, fetchImpl = fetch }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const response = await fetchImpl(config.xaiTtsEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.xaiApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      text: line.text,
      voice_id: voiceId,
      language: "ja",
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    throw new Error(`xAI TTS failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  return {
    ...line,
    audioPath: outputPath,
    audioUrl: `/audio/${path.basename(outputPath)}`
  };
}

export async function synthesizeBlock({ config, showConfig, block, fetchImpl = fetch }) {
  const blockId = createBlockId();
  const voiceBySpeaker = new Map(showConfig.hosts.map((host) => [host.id, host.voiceId]));
  const lines = [];

  for (let index = 0; index < block.lines.length; index += 1) {
    const line = block.lines[index];
    const voiceId = voiceBySpeaker.get(line.speakerId) || showConfig.hosts[0].voiceId;
    const outputPath = path.join(config.audioDir, safeAudioName({ blockId, index, speakerId: line.speakerId }));
    const spokenLine = await synthesizeLine({ config, line, voiceId, outputPath, fetchImpl });
    lines.push(spokenLine);
  }

  return {
    ...block,
    id: blockId,
    lines
  };
}
