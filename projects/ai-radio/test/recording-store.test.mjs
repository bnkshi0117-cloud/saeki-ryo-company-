import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { recordingFileName, saveBlockRecording } from "../src/recording-store.mjs";

test("recordingFileName uses block id and mp3 extension", () => {
  assert.equal(recordingFileName({ id: "block-123", title: "沖縄とAI" }), "block-123.mp3");
});

test("saveBlockRecording concatenates line audio in order", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-radio-recording-"));
  const audioDir = path.join(dir, "audio");
  const recordingsDir = path.join(dir, "recordings");
  await fs.mkdir(audioDir, { recursive: true });

  const first = path.join(audioDir, "first.mp3");
  const second = path.join(audioDir, "second.mp3");
  await fs.writeFile(first, Buffer.from([1, 2, 3]));
  await fs.writeFile(second, Buffer.from([4, 5]));

  const result = await saveBlockRecording({
    config: { recordingsDir },
    block: {
      id: "block-abc",
      title: "test",
      lines: [
        { audioPath: first },
        { audioPath: second }
      ]
    }
  });

  assert.equal(result.recordingUrl, "/recordings/block-abc.mp3");
  assert.deepEqual([...await fs.readFile(result.recordingPath)], [1, 2, 3, 4, 5]);
});
