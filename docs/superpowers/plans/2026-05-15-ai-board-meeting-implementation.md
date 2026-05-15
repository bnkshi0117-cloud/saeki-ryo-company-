# AI Board Meeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI that turns Saeki-san's rough idea seed into a saved AI board meeting Markdown log for the Saeki Ryo brand.

**Architecture:** Create a small standalone project under `projects/ai-board-meeting/`. Keep prompt construction, AI generation, file saving, and CLI handling in separate modules so the MVP can later grow into a browser UI or AI Radio integration.

**Tech Stack:** Node.js ESM, `node --test`, `dotenv`, Anthropic Messages API via `fetch`, Markdown files saved under root `logs/meeting/`.

---

## File Structure

- Create `projects/ai-board-meeting/package.json`
  - Defines ESM project, `start`, and `test` scripts.
- Create `projects/ai-board-meeting/README.md`
  - Documents setup, usage, environment variables, and verification.
- Create `projects/ai-board-meeting/src/config.mjs`
  - Loads root `.env`, validates `ANTHROPIC_API_KEY`, and resolves project/root/log paths.
- Create `projects/ai-board-meeting/src/prompt-template.mjs`
  - Builds the fixed meeting prompt and exports required section names.
- Create `projects/ai-board-meeting/src/file-store.mjs`
  - Creates safe filenames and saves Markdown to `logs/meeting/`.
- Create `projects/ai-board-meeting/src/meeting-generator.mjs`
  - Calls Anthropic with injectable `fetchImpl`, validates generated Markdown, and returns it.
- Create `projects/ai-board-meeting/src/cli.mjs`
  - Parses command-line input, calls the generator, saves the file, and prints the saved path.
- Create `projects/ai-board-meeting/test/prompt-template.test.mjs`
  - Verifies brand rules and required meeting sections are embedded.
- Create `projects/ai-board-meeting/test/file-store.test.mjs`
  - Verifies slugging, directory creation, and Markdown save behavior.
- Create `projects/ai-board-meeting/test/meeting-generator.test.mjs`
  - Verifies Anthropic request shape, Markdown extraction, section validation, and API-key secrecy.
- Create `projects/ai-board-meeting/test/cli.test.mjs`
  - Verifies CLI argument parsing and missing-theme handling without hitting the network.

## Task 1: Project Scaffold And Config

**Files:**
- Create: `projects/ai-board-meeting/package.json`
- Create: `projects/ai-board-meeting/src/config.mjs`
- Create: `projects/ai-board-meeting/test/config.test.mjs`

- [ ] **Step 1: Write the failing config tests**

Create `projects/ai-board-meeting/test/config.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createConfig } from "../src/config.mjs";

test("createConfig resolves root, project, and meeting log paths", () => {
  const rootDir = path.resolve("C:/tmp/saeki-ryo-company");
  const config = createConfig({
    rootDir,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      AI_BOARD_MEETING_MODEL: "claude-test"
    }
  });

  assert.equal(config.rootDir, rootDir);
  assert.equal(config.projectDir, path.join(rootDir, "projects", "ai-board-meeting"));
  assert.equal(config.meetingLogDir, path.join(rootDir, "logs", "meeting"));
  assert.equal(config.anthropicModel, "claude-test");
  assert.equal(config.anthropicApiKey, "test-key");
});

test("createConfig uses a default Anthropic model", () => {
  const config = createConfig({
    rootDir: "C:/repo",
    env: {
      ANTHROPIC_API_KEY: "test-key"
    }
  });

  assert.equal(config.anthropicModel, "claude-sonnet-4-6");
});

test("createConfig requires ANTHROPIC_API_KEY", () => {
  assert.throws(
    () => createConfig({ rootDir: "C:/repo", env: {} }),
    /ANTHROPIC_API_KEY is required/
  );
});
```

- [ ] **Step 2: Add package.json**

Create `projects/ai-board-meeting/package.json`:

```json
{
  "name": "saeki-ai-board-meeting",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/cli.mjs",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.7"
  }
}
```

- [ ] **Step 3: Run config tests and verify they fail**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/config.test.mjs
```

Expected: FAIL with a module-not-found error for `../src/config.mjs`.

- [ ] **Step 4: Implement config module**

Create `projects/ai-board-meeting/src/config.mjs`:

```js
import path from "node:path";
import dotenv from "dotenv";

export function loadRootEnv(rootDir = path.resolve(process.cwd(), "..", "..")) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}

export function createConfig({ rootDir = path.resolve(process.cwd(), "..", ".."), env = process.env } = {}) {
  const anthropicApiKey = env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required in the root .env file.");
  }

  return {
    rootDir,
    projectDir: path.join(rootDir, "projects", "ai-board-meeting"),
    meetingLogDir: path.join(rootDir, "logs", "meeting"),
    anthropicApiKey,
    anthropicModel: env.AI_BOARD_MEETING_MODEL || env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    anthropicEndpoint: env.ANTHROPIC_ENDPOINT || "https://api.anthropic.com/v1/messages"
  };
}

export function getConfig() {
  const rootDir = path.resolve(process.cwd(), "..", "..");
  loadRootEnv(rootDir);
  return createConfig({ rootDir });
}
```

- [ ] **Step 5: Run config tests and verify they pass**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/config.test.mjs
```

Expected: PASS, 3 tests passing.

- [ ] **Step 6: Commit scaffold and config**

```bash
git add projects/ai-board-meeting/package.json projects/ai-board-meeting/src/config.mjs projects/ai-board-meeting/test/config.test.mjs
git commit -m "feat: scaffold AI board meeting config"
```

## Task 2: Prompt Template

**Files:**
- Create: `projects/ai-board-meeting/src/prompt-template.mjs`
- Create: `projects/ai-board-meeting/test/prompt-template.test.mjs`

- [ ] **Step 1: Write failing prompt-template tests**

Create `projects/ai-board-meeting/test/prompt-template.test.mjs`:

```js
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
```

- [ ] **Step 2: Run prompt tests and verify they fail**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/prompt-template.test.mjs
```

Expected: FAIL with a module-not-found error for `../src/prompt-template.mjs`.

- [ ] **Step 3: Implement prompt template**

Create `projects/ai-board-meeting/src/prompt-template.mjs`:

```js
export const REQUIRED_SECTIONS = [
  "テーマの再定義",
  "ブランド接続",
  "Codex視点",
  "Claude Code視点",
  "相互反論",
  "100点化した統合案",
  "実行プラン",
  "発信ネタ",
  "次回会議に残す問い"
];

export function buildMeetingPrompt({
  theme,
  purpose = "佐伯亮ブランドにつながる次の実験、実行プラン、発信ネタを決める",
  constraints = "未指定",
  channels = "X、スレッズ、note、AIラジオ",
  now = new Date()
}) {
  const dateText = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(now);

  return `あなたは佐伯亮のAI役員会です。

現在時刻: ${dateText}

入力テーマ:
${theme}

目的:
${purpose}

制約:
${constraints}

想定発信先:
${channels}

佐伯亮ブランドの前提:
- ペンネームは佐伯亮。
- テーマは AI × 副業 × アプリ開発の実体験。
- トーンは実験者、等身大、小難しくない、沖縄在住の会社員。
- 発信の核心は「やってみたらこうだった」という一次情報。
- 煽り、副業で月何万円、試していない情報の転載、フォロワー自慢、他者批判は禁止。

会議ルール:
- 佐伯さんは粗い種だけを出している。あなたたちはその種を広げ、反論し、磨く。
- Codex視点は実装、仕組み化、検証可能性、今日やる作業を担当する。
- Claude Code視点は発想、体験、物語性、違和感の検出を担当する。
- すぐに同意せず、弱い前提を相互反論で必ず潰す。
- 最終的には佐伯亮ブランドの資産になる案だけを残す。
- 推測だけで断言せず、実験予定または実体験として扱える言葉にする。

Markdownだけを返してください。説明文や前置きは禁止。

必ずこの見出し構造で出力してください。

# AI役員会: 企画名

- 日付: ${dateText}
- 入力テーマ: ${theme}
- 会議ステータス: 実行推奨 または 追加調査 または 保留 または 却下
- 推奨アクション: 1文で書く

## テーマの再定義

## ブランド接続

## Codex視点

## Claude Code視点

## 相互反論

## 100点化した統合案

以下を必ず含める:
- 企画名
- 企画の一文説明
- 誰に向けるか
- どんな体験を提供するか
- 佐伯亮ブランドに積み上がる理由
- 差別化
- マネタイズの可能性
- リスク
- やらないこと

## 実行プラン

以下を必ず含める:
- 今日やること
- 作るもの
- 完了条件
- 検証方法
- 追加で必要な情報
- 後回しにすること

## 発信ネタ

以下を必ず含める:
- X投稿案 3本
- スレッズ投稿案 1本
- note記事タイトル案 3本
- AIラジオ台本の種 1本

## 次回会議に残す問い`;
}
```

- [ ] **Step 4: Run prompt tests and verify they pass**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/prompt-template.test.mjs
```

Expected: PASS, 3 tests passing.

- [ ] **Step 5: Commit prompt template**

```bash
git add projects/ai-board-meeting/src/prompt-template.mjs projects/ai-board-meeting/test/prompt-template.test.mjs
git commit -m "feat: add AI board meeting prompt template"
```

## Task 3: File Store

**Files:**
- Create: `projects/ai-board-meeting/src/file-store.mjs`
- Create: `projects/ai-board-meeting/test/file-store.test.mjs`

- [ ] **Step 1: Write failing file-store tests**

Create `projects/ai-board-meeting/test/file-store.test.mjs`:

```js
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
```

- [ ] **Step 2: Run file-store tests and verify they fail**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/file-store.test.mjs
```

Expected: FAIL with a module-not-found error for `../src/file-store.mjs`.

- [ ] **Step 3: Implement file store**

Create `projects/ai-board-meeting/src/file-store.mjs`:

```js
import fs from "node:fs/promises";
import path from "node:path";

export function createMeetingFilename({ title, now = new Date() }) {
  const date = now.toISOString().slice(0, 10);
  const withoutPrefix = String(title || "")
    .replace(/^#?\s*AI役員会[:：]\s*/u, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const slug = withoutPrefix || "ai-board-meeting";
  return `${date}-${slug}.md`;
}

export function extractTitle(markdown) {
  const heading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  if (!heading) {
    return "AI役員会";
  }
  return heading.replace(/^#\s+/, "").trim();
}

export async function saveMeetingLog({ meetingLogDir, markdown, now = new Date() }) {
  await fs.mkdir(meetingLogDir, { recursive: true });
  const title = extractTitle(markdown);
  const filename = createMeetingFilename({ title, now });
  const filePath = path.join(meetingLogDir, filename);
  await fs.writeFile(filePath, markdown, "utf8");
  return { filePath, filename };
}
```

- [ ] **Step 4: Run file-store tests and verify they pass**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/file-store.test.mjs
```

Expected: PASS, 3 tests passing.

- [ ] **Step 5: Commit file store**

```bash
git add projects/ai-board-meeting/src/file-store.mjs projects/ai-board-meeting/test/file-store.test.mjs
git commit -m "feat: save AI board meeting logs"
```

## Task 4: Meeting Generator

**Files:**
- Create: `projects/ai-board-meeting/src/meeting-generator.mjs`
- Create: `projects/ai-board-meeting/test/meeting-generator.test.mjs`

- [ ] **Step 1: Write failing meeting-generator tests**

Create `projects/ai-board-meeting/test/meeting-generator.test.mjs`:

```js
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
```

- [ ] **Step 2: Run meeting-generator tests and verify they fail**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/meeting-generator.test.mjs
```

Expected: FAIL with a module-not-found error for `../src/meeting-generator.mjs`.

- [ ] **Step 3: Implement meeting generator**

Create `projects/ai-board-meeting/src/meeting-generator.mjs`:

```js
import { buildMeetingPrompt, REQUIRED_SECTIONS } from "./prompt-template.mjs";

export function extractMarkdownFromAnthropicResponse(responseJson) {
  const textParts = responseJson?.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    ?.map((part) => part.text.trim()) || [];

  const markdown = textParts.join("\n\n").trim();
  if (!markdown) {
    throw new Error("Anthropic response did not include text content.");
  }
  return markdown;
}

export function validateMeetingMarkdown(markdown) {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error("Meeting markdown is empty.");
  }
  if (!markdown.startsWith("# AI役員会:")) {
    throw new Error("Meeting markdown must start with '# AI役員会:'.");
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!markdown.includes(`## ${section}`)) {
      throw new Error(`Missing required meeting section: ${section}`);
    }
  }
  return markdown;
}

export async function generateMeetingLog({ config, input, fetchImpl = fetch, now = new Date() }) {
  const prompt = buildMeetingPrompt({ ...input, now });
  const response = await fetchImpl(config.anthropicEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 5000,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${response.status}`);
  }

  const responseJson = await response.json();
  return validateMeetingMarkdown(extractMarkdownFromAnthropicResponse(responseJson));
}
```

- [ ] **Step 4: Run meeting-generator tests and verify they pass**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/meeting-generator.test.mjs
```

Expected: PASS, 4 tests passing.

- [ ] **Step 5: Commit meeting generator**

```bash
git add projects/ai-board-meeting/src/meeting-generator.mjs projects/ai-board-meeting/test/meeting-generator.test.mjs
git commit -m "feat: generate AI board meeting markdown"
```

## Task 5: CLI And Documentation

**Files:**
- Create: `projects/ai-board-meeting/src/cli.mjs`
- Create: `projects/ai-board-meeting/test/cli.test.mjs`
- Create: `projects/ai-board-meeting/README.md`

- [ ] **Step 1: Write failing CLI tests**

Create `projects/ai-board-meeting/test/cli.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, createInputFromArgs } from "../src/cli.mjs";

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
```

- [ ] **Step 2: Run CLI tests and verify they fail**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/cli.test.mjs
```

Expected: FAIL with a module-not-found error for `../src/cli.mjs`.

- [ ] **Step 3: Implement CLI**

Create `projects/ai-board-meeting/src/cli.mjs`:

```js
import { getConfig } from "./config.mjs";
import { generateMeetingLog } from "./meeting-generator.mjs";
import { saveMeetingLog } from "./file-store.mjs";

export function parseArgs(argv) {
  const result = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`値がありません: ${arg}`);
      }
      result[key] = value;
      index += 1;
    } else {
      positional.push(arg);
    }
  }

  if (!result.theme && positional.length > 0) {
    result.theme = positional.join(" ");
  }

  return result;
}

export function createInputFromArgs(args) {
  const theme = args.theme?.trim();
  if (!theme) {
    throw new Error("テーマを指定してください。例: npm start -- \"AIラジオの次の可能性\"");
  }

  const input = { theme };
  for (const key of ["purpose", "constraints", "channels"]) {
    const value = args[key]?.trim();
    if (value) {
      input[key] = value;
    }
  }
  return input;
}

export async function runCli({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = parseArgs(argv);
    const input = createInputFromArgs(args);
    const config = getConfig();
    const markdown = await generateMeetingLog({ config, input });
    const saved = await saveMeetingLog({ meetingLogDir: config.meetingLogDir, markdown });
    stdout.write(`AI役員会ログを保存しました: ${saved.filePath}\n`);
    return saved;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
```

- [ ] **Step 4: Run CLI tests and verify they pass**

Run:

```bash
cd projects/ai-board-meeting
npm test -- test/cli.test.mjs
```

Expected: PASS, 4 tests passing.

- [ ] **Step 5: Add README**

Create `projects/ai-board-meeting/README.md`:

```md
# AI役員会ログメーカー

佐伯亮ブランドのための企画会議ログを生成するCLIです。

佐伯さんが粗いテーマを渡すと、Codex視点、Claude Code視点、相互反論、100点化した統合案、実行プラン、発信ネタをMarkdownで生成し、`logs/meeting/` に保存します。

## セットアップ

```bash
cd projects/ai-board-meeting
npm install
```

ルートの `.env` に以下が必要です。

```text
ANTHROPIC_API_KEY=...
```

任意でモデルを指定できます。

```text
AI_BOARD_MEETING_MODEL=claude-sonnet-4-6
```

## 使い方

```bash
npm start -- "AIラジオが作れた。もっと可能性がありそう。これを副業や発信につなげたい。"
```

詳細指定する場合:

```bash
npm start -- --theme "AIラジオの次の可能性" --purpose "佐伯亮ブランドの次の実験を決める" --constraints "今日2時間だけ使える" --channels "X、note、AIラジオ"
```

## 出力

会議ログは以下に保存されます。

```text
logs/meeting/YYYY-MM-DD-テーマ.md
```

## 検証

```bash
npm test
```

APIキーや秘密情報はログ本文に出さない設計です。エラー時もAPIキー本文は表示しません。
```

- [ ] **Step 6: Run full tests**

Run:

```bash
cd projects/ai-board-meeting
npm install
npm test
```

Expected: PASS, all config, prompt-template, file-store, meeting-generator, and CLI tests passing.

- [ ] **Step 7: Run a manual dry CLI check without API**

Run:

```bash
cd projects/ai-board-meeting
npm start
```

Expected: command exits with code 1 and prints:

```text
テーマを指定してください。例: npm start -- "AIラジオの次の可能性"
```

- [ ] **Step 8: Run a real CLI smoke test**

Run only if `ANTHROPIC_API_KEY` is available in the root `.env`:

```bash
cd projects/ai-board-meeting
npm start -- "AIラジオが作れた。まだまだいろんな可能性がある。佐伯亮のブランディングにつながる次の実験を決めたい。"
```

Expected:

```text
AI役員会ログを保存しました: C:\Users\BENOKI\Desktop\saeki-ryo-company\logs\meeting\YYYY-MM-DD-*.md
```

Open the generated file and verify it contains:

```text
## テーマの再定義
## ブランド接続
## Codex視点
## Claude Code視点
## 相互反論
## 100点化した統合案
## 実行プラン
## 発信ネタ
## 次回会議に残す問い
```

- [ ] **Step 9: Commit CLI and docs**

```bash
git add projects/ai-board-meeting/src/cli.mjs projects/ai-board-meeting/test/cli.test.mjs projects/ai-board-meeting/README.md projects/ai-board-meeting/package-lock.json
git commit -m "feat: add AI board meeting CLI"
```

## Task 6: Final Verification

**Files:**
- Modify only if a verification issue is found in prior tasks.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
cd projects/ai-board-meeting
npm test
```

Expected: PASS, all tests passing.

- [ ] **Step 2: Check git status for intended files**

Run:

```bash
git status --short
```

Expected: only intended project files are modified or committed. Existing unrelated untracked files in the repository may still appear and must not be reverted.

- [ ] **Step 3: Review generated meeting log if smoke test ran**

If Task 5 Step 8 created a log, open the generated file under `logs/meeting/` and check:

```text
No API keys or secrets appear.
The output does not promise "AIで月○万円".
The output does not criticize others.
The output uses first-person experiment language or planned-experiment language.
The output includes X, Threads, note, and AIラジオ ideas.
```

- [ ] **Step 4: Commit any verification fixes**

If fixes were needed:

```bash
git add projects/ai-board-meeting logs/meeting
git commit -m "fix: polish AI board meeting verification"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

Spec coverage:
- Rough seed input is covered by Task 5 CLI positional theme and `--theme`.
- Brand connection is covered by Task 2 prompt rules and Task 4 section validation.
- Codex and Claude Code perspectives are covered by Task 2 required sections.
- Mutual critique and 100-point integration are covered by Task 2 required sections.
- Execution plan and publishing ideas are covered by Task 2 required outputs.
- Markdown saving to `logs/meeting/` is covered by Task 3.
- Anthropic API use with future isolation is covered by Task 4.
- API-key secrecy is covered by Task 4 tests and Task 6 manual checks.
- Browser UI, audio, auto-posting, multi-process AI, and external integrations are intentionally out of scope.

Placeholder scan:
- No `TBD`, `TODO`, `implement later`, or unspecified test steps remain.

Type consistency:
- `config.meetingLogDir`, `generateMeetingLog`, `buildMeetingPrompt`, `saveMeetingLog`, `parseArgs`, and `createInputFromArgs` are named consistently across tasks.
