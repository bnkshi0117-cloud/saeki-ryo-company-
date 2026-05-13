import test from "node:test";
import assert from "node:assert/strict";
import { buildScriptPrompt, parseScriptResponse, validateRadioBlock } from "../src/script-generator.mjs";

test("buildScriptPrompt includes Okinawa, AI, comedy radio, and recent topics", () => {
  const prompt = buildScriptPrompt({
    showConfig: {
      programTitle: "佐伯亮のAIゆんたくラジオ",
      hosts: [
        { name: "佐伯", role: "沖縄在住の会社員" },
        { name: "相方", role: "ツッコミ役" }
      ],
      corners: ["今日のAI実験報告"]
    },
    memory: {
      blocks: [{ topics: ["台風の日のCodex修正"] }]
    },
    settings: {
      theme: "台風の日のAI自動化",
      targetMinutes: 10
    },
    now: new Date("2026-05-13T21:00:00+09:00")
  });

  assert.match(prompt, /沖縄の日常/);
  assert.match(prompt, /AI関連/);
  assert.match(prompt, /お笑い芸人の深夜ラジオ/);
  assert.match(prompt, /台風の日のCodex修正/);
  assert.match(prompt, /今回の指定テーマ: 台風の日のAI自動化/);
  assert.match(prompt, /番組全体の目標時間: 約10分/);
});

test("buildScriptPrompt requires fixed opening self introductions", () => {
  const prompt = buildScriptPrompt({
    showConfig: {
      programTitle: "佐伯亮のAIゆんたくラジオ",
      hosts: [
        { id: "saeki", name: "佐伯亮", role: "パーソナリティ" },
        { id: "higa", name: "比嘉", role: "相方" }
      ],
      corners: ["今日のAI実験報告"]
    },
    memory: { blocks: [] }
  });

  assert.match(prompt, /どうも、佐伯亮のAIゆんたくラジオです。/);
  assert.match(prompt, /パーソナリティの佐伯亮です。/);
  assert.match(prompt, /相方の比嘉です。/);
  assert.match(prompt, /冒頭3行は必ずこの順番/);
});

test("parseScriptResponse extracts valid JSON from text", () => {
  const response = `以下です。

{
  "title": "湿気とCodex",
  "corner": "今日のAI実験報告",
  "summary": "湿気のある夜にCodexを試した話",
  "topics": ["沖縄の湿気", "Codex"],
  "lines": [
    {"speakerId": "saeki", "speakerName": "佐伯", "text": "湿気がすごい夜です。", "segment": "opening"},
    {"speakerId": "higa", "speakerName": "比嘉", "text": "パソコンより先に人間が熱暴走してる。", "segment": "opening"}
  ]
}

以上です。`;

  const block = parseScriptResponse(response);

  assert.equal(block.title, "湿気とCodex");
  assert.equal(block.lines.length, 2);
});

test("validateRadioBlock rejects missing lines", () => {
  assert.throws(
    () => validateRadioBlock({ title: "bad", corner: "x", summary: "x", topics: [] }),
    /lines/
  );
});
