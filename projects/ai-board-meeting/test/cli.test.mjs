import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, createInputFromArgs, runCli, isCliEntrypoint } from "../src/cli.mjs";

test("parseArgs reads theme and optional fields", () => {
  const args = parseArgs([
    "--theme", "AIラジオの次の可能性",
    "--purpose", "佐伯亮ブランドの次の実験を決める",
    "--constraints", "2時間",
    "--channels", "X,note,AIラジオ"
  ]);

  assert.deepEqual(args, {
    theme: "AIラジオの次の可能性",
    purpose: "佐伯亮ブランドの次の実験を決める",
    constraints: "2時間",
    channels: "X,note,AIラジオ"
  });
});

test("parseArgs supports positional theme", () => {
  const args = parseArgs(["AIラジオを副業や発信につなげたい"]);

  assert.deepEqual(args, {
    theme: "AIラジオを副業や発信につなげたい"
  });
});

test("createInputFromArgs rejects missing theme", () => {
  assert.throws(
    () => createInputFromArgs({}),
    /テーマを指定してください/
  );
});

test("createInputFromArgs trims theme", () => {
  const input = createInputFromArgs({
    theme: "  AIラジオを副業や発信につなげたい  "
  });

  assert.deepEqual(input, {
    theme: "AIラジオを副業や発信につなげたい"
  });
});

test("isCliEntrypoint supports Windows argv paths", () => {
  assert.equal(
    isCliEntrypoint(
      "file:///C:/Users/BENOKI/Desktop/saeki-ryo-company/.worktrees/ai-board-meeting/projects/ai-board-meeting/src/cli.mjs",
      "C:\\Users\\BENOKI\\Desktop\\saeki-ryo-company\\.worktrees\\ai-board-meeting\\projects\\ai-board-meeting\\src\\cli.mjs"
    ),
    true
  );
});

test("runCli reports missing theme through injected exit code handler", async () => {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  let stderrText = "";
  let exitCode;

  try {
    const result = await runCli({
      argv: [],
      stdout: { write() {} },
      stderr: { write(text) { stderrText += text; } },
      setExitCode(code) { exitCode = code; }
    });

    assert.equal(result, null);
    assert.match(stderrText, /テーマを指定してください/);
    assert.equal(exitCode, 1);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = originalExitCode;
  }
});

test("runCli saves generated meeting log for valid theme", async () => {
  let stdoutText = "";
  const config = {
    meetingLogDir: "logs/meeting",
    anthropicApiKey: "test-key",
    anthropicModel: "test-model",
    anthropicEndpoint: "https://example.test/messages"
  };
  const saved = {
    filePath: "C:\\logs\\meeting\\2026-05-15-AIラジオ.md",
    filename: "2026-05-15-AIラジオ.md"
  };
  const calls = [];

  const result = await runCli({
    argv: ["AIラジオの次の可能性"],
    stdout: { write(text) { stdoutText += text; } },
    stderr: { write() {} },
    getConfigImpl() {
      calls.push(["getConfig"]);
      return config;
    },
    async generateMeetingLogImpl(args) {
      calls.push(["generateMeetingLog", args]);
      return "# AI役員会: AIラジオ";
    },
    async saveMeetingLogImpl(args) {
      calls.push(["saveMeetingLog", args]);
      return saved;
    },
    setExitCode(code) {
      calls.push(["setExitCode", code]);
    }
  });

  assert.equal(result, saved);
  assert.equal(stdoutText, `AI役員会ログを保存しました: ${saved.filePath}\n`);
  assert.deepEqual(calls, [
    ["getConfig"],
    ["generateMeetingLog", {
      config,
      input: { theme: "AIラジオの次の可能性" }
    }],
    ["saveMeetingLog", {
      meetingLogDir: config.meetingLogDir,
      markdown: "# AI役員会: AIラジオ"
    }]
  ]);
});
