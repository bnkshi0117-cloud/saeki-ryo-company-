import test from "node:test";
import assert from "node:assert/strict";
import { buildScriptPrompt, parseScriptResponse, validateRadioBlock } from "../src/script-generator.mjs";

const showConfig = {
  programTitle: "佐伯亮のAIゆんたくラジオ",
  hosts: [
    { id: "saeki", name: "佐伯亮", role: "パーソナリティ" },
    { id: "higa", name: "比嘉", role: "相方" }
  ],
  corners: ["今日のAI実験報告"]
};

test("buildScriptPrompt includes Okinawa, AI, comedy radio, and recent topics", () => {
  const prompt = buildScriptPrompt({
    showConfig,
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

test("first block requires fixed opening self introductions", () => {
  const prompt = buildScriptPrompt({ showConfig, memory: { blocks: [] }, isFirstBlock: true });

  assert.match(prompt, /どうも、佐伯亮のAIゆんたくラジオです。/);
  assert.match(prompt, /パーソナリティの佐伯亮です。/);
  assert.match(prompt, /相方の比嘉です。/);
  assert.match(prompt, /冒頭3行は必ずこの順番/);
});

test("middle block does not repeat opening or episode closing", () => {
  const prompt = buildScriptPrompt({ showConfig, memory: { blocks: [] }, isFirstBlock: false, isFinalBlock: false });

  assert.match(prompt, /番組の冒頭挨拶/);
  assert.match(prompt, /番組終了の挨拶は入れない/);
});

test("final block requires fixed closing line", () => {
  const prompt = buildScriptPrompt({ showConfig, memory: { blocks: [] }, isFirstBlock: false, isFinalBlock: true });

  assert.match(prompt, /最後の1行は必ず/);
  assert.match(prompt, /それではお時間になりましたので、また次回お会いしましょう。/);
});

test("final block is short enough to close smoothly", () => {
  const prompt = buildScriptPrompt({ showConfig, memory: { blocks: [] }, isFirstBlock: false, isFinalBlock: true });

  assert.match(prompt, /締めブロック/);
  assert.match(prompt, /linesは3から6個/);
});

test("buildScriptPrompt asks for radio-sized blocks instead of short snippets", () => {
  const prompt = buildScriptPrompt({ showConfig, memory: { blocks: [] }, isFinalBlock: false });

  assert.match(prompt, /2.*3.*分/);
  assert.match(prompt, /18.*26/);
  assert.match(prompt, /120/);
});

test("buildScriptPrompt includes fetched news context", () => {
  const prompt = buildScriptPrompt({
    showConfig,
    memory: { blocks: [] },
    newsContext: {
      enabled: true,
      promptText: "- [market] 日経平均が反発 (Example) https://example.com"
    }
  });

  assert.match(prompt, /今回参照できるニュース素材/);
  assert.match(prompt, /日経平均が反発/);
  assert.match(prompt, /投資助言ではなく/);
});

test("parseScriptResponse extracts valid JSON from text", () => {
  const response = `以下です。

{
  "title": "湿気とCodex",
  "corner": "今日のAI実験報告",
  "summary": "湿気のある夜にCodexを試した話",
  "topics": ["沖縄の湿気", "Codex"],
  "lines": [
    {"speakerId": "saeki", "speakerName": "佐伯亮", "text": "湿気がすごい夜です。", "segment": "opening"},
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
