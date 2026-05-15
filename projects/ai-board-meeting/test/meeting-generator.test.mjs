import test from "node:test";
import assert from "node:assert/strict";
import {
  extractMarkdownFromAnthropicResponse,
  validateMeetingMarkdown,
  generateMeetingLog
} from "../src/meeting-generator.mjs";

const completeMarkdown = `# AI役員会: AIラジオ次の可能性

- 日付: 2026/05/15 10:00
- 入力テーマ: AIラジオ
- 会議ステータス: 実行推奨
- 推奨アクション: 小さな実験を1本作る

## テーマの再定義
本文

## ブランド接続
本文

## Codex視点
本文

## Claude Code視点
本文

## 相互反論
本文

## 100点化した統合案
本文

## 実行プラン
本文

## 発信ネタ
X投稿案 3本
スレッズ投稿案 1本
note記事タイトル案 3本
AIラジオ台本の種 1本

## 次回会議に残す問い
本文`;

test("extractMarkdownFromAnthropicResponse returns text content", () => {
  const markdown = extractMarkdownFromAnthropicResponse({
    content: [
      { type: "text", text: completeMarkdown }
    ]
  });

  assert.equal(markdown, completeMarkdown);
});

test("validateMeetingMarkdown rejects missing required sections", () => {
  assert.throws(
    () => validateMeetingMarkdown("# AI役員会: 不完全\n\n## テーマの再定義\n本文"),
    /Missing required meeting section/
  );
});

test("generateMeetingLog sends Anthropic request and returns validated Markdown", async () => {
  let capturedRequest;
  const fetchImpl = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      async json() {
        return {
          content: [
            { type: "text", text: completeMarkdown }
          ]
        };
      }
    };
  };

  const markdown = await generateMeetingLog({
    config: {
      anthropicEndpoint: "https://api.anthropic.com/v1/messages",
      anthropicApiKey: "secret-test-key",
      anthropicModel: "claude-test"
    },
    input: {
      theme: "AIラジオを副業や発信につなげたい"
    },
    fetchImpl,
    now: new Date("2026-05-15T01:00:00.000Z")
  });

  assert.equal(markdown, completeMarkdown);
  assert.equal(capturedRequest.url, "https://api.anthropic.com/v1/messages");
  assert.equal(capturedRequest.options.method, "POST");
  assert.equal(capturedRequest.options.headers["x-api-key"], "secret-test-key");

  const body = JSON.parse(capturedRequest.options.body);
  assert.equal(body.model, "claude-test");
  assert.equal(body.max_tokens, 5000);
  assert.match(body.messages[0].content, /AIラジオを副業や発信につなげたい/);
});

test("generateMeetingLog hides API key in thrown errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    async text() {
      return "secret-test-key unauthorized";
    }
  });

  await assert.rejects(
    () => generateMeetingLog({
      config: {
        anthropicEndpoint: "https://api.anthropic.com/v1/messages",
        anthropicApiKey: "secret-test-key",
        anthropicModel: "claude-test"
      },
      input: {
        theme: "AIラジオ"
      },
      fetchImpl
    }),
    (error) => {
      assert.match(error.message, /Anthropic request failed: 401/);
      assert.doesNotMatch(error.message, /secret-test-key/);
      return true;
    }
  );
});
