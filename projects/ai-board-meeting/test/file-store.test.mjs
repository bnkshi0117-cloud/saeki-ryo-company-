import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMeetingFilename, extractTitle, saveMeetingLog } from "../src/file-store.mjs";

test("createMeetingFilename keeps Japanese topic text and strips Japanese prefix", () => {
  const filename = createMeetingFilename({
    title: "AI役員会: AIラジオ / 次の可能性?",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(filename, "2026-05-15-AIラジオ-次の可能性.md");
});

test("createMeetingFilename uses Asia/Tokyo date for filename", () => {
  const filename = createMeetingFilename({
    title: "AI役員会: AIラジオ",
    now: new Date("2026-05-14T15:30:00.000Z")
  });

  assert.equal(filename, "2026-05-15-AIラジオ.md");
});

test("createMeetingFilename falls back when title has no usable text", () => {
  const filename = createMeetingFilename({
    title: "///???",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(filename, "2026-05-15-ai-board-meeting.md");
});

test("createMeetingFilename strips Windows-invalid control characters", () => {
  const filename = createMeetingFilename({
    title: "AI役員会: AI\u0000ラジオ\u001f次の可能性",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(filename, "2026-05-15-AI-ラジオ-次の可能性.md");
});

test("extractTitle returns first level-one heading", () => {
  const markdown = "前置き\n# AI役員会: AIラジオ次の可能性\n\n## テーマの再定義\n本文";

  assert.equal(extractTitle(markdown), "AI役員会: AIラジオ次の可能性");
});

test("extractTitle falls back to exact Japanese board title", () => {
  const markdown = "## テーマの再定義\n本文";

  assert.equal(extractTitle(markdown), "AI役員会");
});

test("saveMeetingLog creates logs directory and writes Markdown", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-board-meeting-"));
  const meetingLogDir = path.join(tempDir, "logs", "meeting");
  const markdown = "# AI役員会: AIラジオ次の可能性\n\n## テーマの再定義\n本文";

  const result = await saveMeetingLog({
    meetingLogDir,
    markdown,
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(result.filename, "2026-05-15-AIラジオ次の可能性.md");
  assert.equal(await fs.readFile(result.filePath, "utf8"), markdown);
});

test("saveMeetingLog creates unique filenames instead of overwriting", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-board-meeting-"));
  const meetingLogDir = path.join(tempDir, "logs", "meeting");
  const markdown = "# AI役員会: AIラジオ次の可能性\n\n本文";

  const first = await saveMeetingLog({
    meetingLogDir,
    markdown,
    now: new Date("2026-05-15T01:00:00.000Z")
  });
  const second = await saveMeetingLog({
    meetingLogDir,
    markdown,
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(first.filename, "2026-05-15-AIラジオ次の可能性.md");
  assert.equal(second.filename, "2026-05-15-AIラジオ次の可能性-2.md");
  assert.notEqual(first.filePath, second.filePath);
  assert.equal(await fs.readFile(first.filePath, "utf8"), markdown);
  assert.equal(await fs.readFile(second.filePath, "utf8"), markdown);
});
