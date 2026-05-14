import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLatestRecording, resolveExportVideoOptions } from "../scripts/export-video.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("findLatestRecording returns the newest mp3 file", async () => {
  const tmpDir = path.join(projectDir, "data", ".test-recordings");
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });
  const oldFile = path.join(tmpDir, "old.mp3");
  const newFile = path.join(tmpDir, "new.mp3");
  await fs.writeFile(oldFile, "old");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await fs.writeFile(newFile, "new");

  assert.equal(await findLatestRecording(tmpDir), newFile);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("resolveExportVideoOptions targets data/videos by default", () => {
  const inputPath = path.join(projectDir, "data", "recordings", "episode-1.mp3");
  const options = resolveExportVideoOptions({
    projectDir,
    inputPath,
    title: "テストタイトル"
  });

  assert.equal(options.inputPath, inputPath);
  assert.equal(options.title, "テストタイトル");
  assert.equal(options.outputPath, path.join(projectDir, "data", "videos", "episode-1.mp4"));
});
