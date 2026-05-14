import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildVideoExportArgs, outputVideoName } from "../src/video-exporter.mjs";

test("outputVideoName converts an mp3 recording name to mp4", () => {
  assert.equal(outputVideoName("episode-1.mp3"), "episode-1.mp4");
  assert.equal(outputVideoName("bad name!.mp3"), "bad-name.mp4");
});

test("buildVideoExportArgs creates a vertical waveform video command", () => {
  const inputPath = path.resolve("data/recordings/episode-1.mp3");
  const outputPath = path.resolve("data/videos/episode-1.mp4");
  const args = buildVideoExportArgs({
    inputPath,
    outputPath,
    title: "佐伯亮のAIゆんたくラジオ"
  });

  assert.deepEqual(args.slice(0, 5), ["-y", "-i", inputPath, "-f", "lavfi"]);
  assert.ok(args.includes("color=c=#141414:s=1080x1920:r=30"));
  assert.ok(args.includes("-filter_complex"));
  assert.match(args[args.indexOf("-filter_complex") + 1], /showwaves=s=900x360/);
  assert.match(args[args.indexOf("-filter_complex") + 1], /drawtext=/);
  assert.ok(args.includes("-shortest"));
  assert.equal(args.at(-1), outputPath);
});
