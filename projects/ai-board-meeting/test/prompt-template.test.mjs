import test from "node:test";
import assert from "node:assert/strict";
import { buildMeetingPrompt, REQUIRED_SECTIONS } from "../src/prompt-template.mjs";

test("buildMeetingPrompt embeds Saeki Ryo brand rules and user theme", () => {
  const prompt = buildMeetingPrompt({
    theme: "AIラジオを副業や発信につなげたい",
    purpose: "佐伯亮ブランドの次の実験を決める",
    constraints: "今日2時間だけ使える",
    channels: "X、note、AIラジオ",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.match(prompt, /AIラジオを副業や発信につなげたい/);
  assert.match(prompt, /佐伯亮/);
  assert.match(prompt, /やってみたらこうだった/);
  assert.match(prompt, /煽り/);
  assert.match(prompt, /他者批判/);
  assert.match(prompt, /フォロワー自慢/);
});

test("buildMeetingPrompt requires every meeting section", () => {
  const prompt = buildMeetingPrompt({
    theme: "雑な企画の種",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  for (const section of REQUIRED_SECTIONS) {
    assert.match(prompt, new RegExp(section));
  }
});

test("buildMeetingPrompt asks for the exact publishing outputs", () => {
  const prompt = buildMeetingPrompt({
    theme: "AI会議を作りたい",
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.match(prompt, /X投稿案 3本/);
  assert.match(prompt, /スレッズ投稿案 1本/);
  assert.match(prompt, /note記事タイトル案 3本/);
  assert.match(prompt, /AIラジオ台本の種 1本/);
});
