import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMeetingFilename, saveMeetingLog } from "../src/file-store.mjs";

test("createMeetingFilename keeps Japanese topic text and strips unsafe characters", () => {
  const filename = createMeetingFilename({
    title: "AI役員会: AIラジオ / 次の可能性?",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(filename, "2026-05-15-AIラジオ-次の可能性.md");
});

test("createMeetingFilename falls back when title has no usable text", () => {
  const filename = createMeetingFilename({
    title: "///???",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(filename, "2026-05-15-ai-board-meeting.md");
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
