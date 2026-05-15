import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, createInputFromArgs, isCliEntrypoint } from "../src/cli.mjs";

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
