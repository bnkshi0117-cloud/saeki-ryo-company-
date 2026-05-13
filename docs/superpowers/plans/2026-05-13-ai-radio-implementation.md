# 佐伯亮AIラジオ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `projects/ai-radio/` に、Anthropicで台本生成し、xAI TTSで音声化し、ブラウザで佐伯亮AIラジオを再生できるローカルWebアプリを作る。

**Architecture:** Node.jsのHTTPサーバーがAPIと静的ファイル配信を担当する。台本生成、TTS、記憶管理、キュー管理を小さなモジュールに分け、ブラウザ側は生成済みブロックを取得して順番に再生する。

**Tech Stack:** Node.js ESM, built-in `node:test`, built-in `fetch`, `dotenv`, Anthropic Messages API, xAI TTS API, plain HTML/CSS/JavaScript.

---

## ファイル構成

- Create: `projects/ai-radio/package.json`
  - npm scriptsと依存関係を定義する。
- Create: `projects/ai-radio/README.md`
  - 起動方法、必要なAPIキー、BGM配置場所を書く。
- Create: `projects/ai-radio/.gitignore`
  - 生成音声やローカルデータを除外する。
- Create: `projects/ai-radio/src/config.mjs`
  - ルート `.env` を読み込み、ポート、APIキー、モデル名、パスを返す。
- Create: `projects/ai-radio/src/memory-store.mjs`
  - `data/memory.json` を読み書きする。
- Create: `projects/ai-radio/src/script-generator.mjs`
  - Anthropic APIに送るプロンプトを組み立て、JSON形式のラジオブロックを返す。
- Create: `projects/ai-radio/src/tts-xai.mjs`
  - xAI TTS APIでセリフをMP3化する。
- Create: `projects/ai-radio/src/queue-manager.mjs`
  - 生成済みブロックと生成状態を管理する。
- Create: `projects/ai-radio/src/server.mjs`
  - HTTPサーバー、API、静的ファイル配信を実装する。
- Create: `projects/ai-radio/public/index.html`
  - ラジオ操作画面。
- Create: `projects/ai-radio/public/styles.css`
  - 作業中に横で開けるラジオコンソールの見た目。
- Create: `projects/ai-radio/public/app.js`
  - ブラウザ再生、状態表示、ログ表示を担当する。
- Create: `projects/ai-radio/data/.gitkeep`
  - データディレクトリを保持する。
- Create: `projects/ai-radio/data/audio/.gitkeep`
  - 生成音声ディレクトリを保持する。
- Create: `projects/ai-radio/data/bgm/.gitkeep`
  - BGM配置ディレクトリを保持する。
- Create: `projects/ai-radio/data/show-config.json`
  - 番組名、話者、声ID、コーナー名を定義する。
- Create: `projects/ai-radio/test/memory-store.test.mjs`
  - 記憶ファイルの生成、読み込み、追記をテストする。
- Create: `projects/ai-radio/test/script-generator.test.mjs`
  - AnthropicレスポンスのJSON抽出とバリデーションをテストする。
- Create: `projects/ai-radio/test/queue-manager.test.mjs`
  - キュー生成と状態更新をテストする。

---

### Task 1: プロジェクト骨組み

**Files:**
- Create: `projects/ai-radio/package.json`
- Create: `projects/ai-radio/README.md`
- Create: `projects/ai-radio/.gitignore`
- Create: `projects/ai-radio/data/.gitkeep`
- Create: `projects/ai-radio/data/audio/.gitkeep`
- Create: `projects/ai-radio/data/bgm/.gitkeep`
- Create: `projects/ai-radio/data/show-config.json`

- [ ] **Step 1: `package.json` を作成する**

```json
{
  "name": "saeki-ai-radio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.mjs",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.7"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: `.gitignore` を作成する**

```gitignore
data/audio/*.mp3
data/audio/*.wav
data/memory.json
node_modules/
```

- [ ] **Step 3: `data/show-config.json` を作成する**

```json
{
  "programTitle": "佐伯亮のAIゆんたくラジオ",
  "tagline": "沖縄の日常とAI実験を、深夜ラジオくらいの温度で。",
  "hosts": [
    {
      "id": "saeki",
      "name": "佐伯",
      "role": "沖縄在住の会社員。AIとアプリ開発を実際に試す人。",
      "voiceId": "ara"
    },
    {
      "id": "aikata",
      "name": "相方",
      "role": "佐伯の話を聞いてツッコむ相方。難しい話を生活感に戻す。",
      "voiceId": "leo"
    }
  ],
  "corners": [
    "今日のAI実験報告",
    "沖縄あるあるAI変換",
    "副業、夢見すぎ注意報",
    "リスナーAI相談室",
    "今週のCodex反省会",
    "今日の小さな自動化",
    "AIに言わせたい一言"
  ]
}
```

- [ ] **Step 4: `README.md` を作成する**

```markdown
# 佐伯亮のAIゆんたくラジオ

沖縄の日常とAI実験を、お笑い芸人の深夜ラジオのような掛け合いで流すローカルAIラジオです。

## 必要な環境

- Node.js 20以上
- ルート `.env` の `ANTHROPIC_API_KEY`
- ルート `.env` の `XAI_API_KEY`

## 起動

```bash
npm install
npm start
```

起動後、ブラウザで `http://localhost:4173` を開きます。

## BGM

`data/bgm/` にMP3、WAV、M4Aファイルを置くと、将来のBGM再生に使えます。
v1ではBGMが無くてもトークだけで動きます。
```

- [ ] **Step 5: ディレクトリ保持ファイルを作成する**

`projects/ai-radio/data/.gitkeep`、`projects/ai-radio/data/audio/.gitkeep`、`projects/ai-radio/data/bgm/.gitkeep` は空ファイルでよい。

- [ ] **Step 6: npm installを実行する**

Run: `npm install` from `projects/ai-radio/`

Expected: `package-lock.json` が作成され、エラーなく終了する。

- [ ] **Step 7: コミットする**

```bash
git add projects/ai-radio/package.json projects/ai-radio/package-lock.json projects/ai-radio/README.md projects/ai-radio/.gitignore projects/ai-radio/data/.gitkeep projects/ai-radio/data/audio/.gitkeep projects/ai-radio/data/bgm/.gitkeep projects/ai-radio/data/show-config.json
git commit -m "feat: scaffold AI radio project"
```

---

### Task 2: 設定読み込み

**Files:**
- Create: `projects/ai-radio/src/config.mjs`
- Test: `projects/ai-radio/test/config.test.mjs`

- [ ] **Step 1: 設定テストを書く**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createConfig } from "../src/config.mjs";

test("createConfig reads defaults without exposing secrets", () => {
  const rootDir = path.resolve("..", "..");
  const config = createConfig({
    rootDir,
    env: {
      ANTHROPIC_API_KEY: "anthropic-test",
      XAI_API_KEY: "xai-test",
      AI_RADIO_PORT: "4999"
    }
  });

  assert.equal(config.port, 4999);
  assert.equal(config.anthropicApiKey, "anthropic-test");
  assert.equal(config.xaiApiKey, "xai-test");
  assert.equal(config.anthropicModel, "claude-sonnet-4-6");
  assert.equal(config.publicDir.endsWith(path.join("projects", "ai-radio", "public")), true);
});

test("createConfig throws when required API keys are missing", () => {
  assert.throws(
    () => createConfig({ rootDir: path.resolve("..", ".."), env: {} }),
    /ANTHROPIC_API_KEY/
  );
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm test -- test/config.test.mjs`

Expected: `Cannot find module '../src/config.mjs'` で失敗する。

- [ ] **Step 3: `config.mjs` を実装する**

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");

export function loadRootEnv(rootDir = path.resolve(projectDir, "..", "..")) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}

export function createConfig({ rootDir = path.resolve(projectDir, "..", ".."), env = process.env } = {}) {
  const anthropicApiKey = env.ANTHROPIC_API_KEY;
  const xaiApiKey = env.XAI_API_KEY;

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required in the root .env file.");
  }

  if (!xaiApiKey) {
    throw new Error("XAI_API_KEY is required in the root .env file.");
  }

  const port = Number.parseInt(env.AI_RADIO_PORT || "4173", 10);

  return {
    rootDir,
    projectDir,
    port,
    anthropicApiKey,
    xaiApiKey,
    anthropicModel: env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    xaiTtsEndpoint: env.XAI_TTS_ENDPOINT || "https://api.x.ai/v1/tts",
    publicDir: path.join(projectDir, "public"),
    dataDir: path.join(projectDir, "data"),
    audioDir: path.join(projectDir, "data", "audio"),
    bgmDir: path.join(projectDir, "data", "bgm"),
    memoryPath: path.join(projectDir, "data", "memory.json"),
    showConfigPath: path.join(projectDir, "data", "show-config.json")
  };
}

export function getConfig() {
  loadRootEnv();
  return createConfig();
}
```

- [ ] **Step 4: テストを通す**

Run: `npm test -- test/config.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: コミットする**

```bash
git add projects/ai-radio/src/config.mjs projects/ai-radio/test/config.test.mjs
git commit -m "feat: load AI radio configuration"
```

---

### Task 3: 記憶ストア

**Files:**
- Create: `projects/ai-radio/src/memory-store.mjs`
- Test: `projects/ai-radio/test/memory-store.test.mjs`

- [ ] **Step 1: 記憶ストアのテストを書く**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadMemory, appendMemory } from "../src/memory-store.mjs";

test("loadMemory creates a clean memory file when missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-radio-memory-"));
  const memoryPath = path.join(dir, "memory.json");

  const memory = await loadMemory(memoryPath);

  assert.deepEqual(memory.blocks, []);
  const saved = JSON.parse(await fs.readFile(memoryPath, "utf8"));
  assert.deepEqual(saved.blocks, []);
});

test("appendMemory keeps the latest 30 blocks", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-radio-memory-"));
  const memoryPath = path.join(dir, "memory.json");

  for (let i = 0; i < 35; i += 1) {
    await appendMemory(memoryPath, {
      id: `block-${i}`,
      summary: `summary ${i}`,
      topics: [`topic-${i}`],
      corner: "今日のAI実験報告"
    });
  }

  const memory = await loadMemory(memoryPath);
  assert.equal(memory.blocks.length, 30);
  assert.equal(memory.blocks[0].id, "block-5");
  assert.equal(memory.blocks[29].id, "block-34");
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm test -- test/memory-store.test.mjs`

Expected: `Cannot find module '../src/memory-store.mjs'` で失敗する。

- [ ] **Step 3: `memory-store.mjs` を実装する**

```js
import fs from "node:fs/promises";
import path from "node:path";

export function createEmptyMemory() {
  return {
    version: 1,
    blocks: []
  };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function saveMemory(memoryPath, memory) {
  await ensureParentDir(memoryPath);
  await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), "utf8");
}

export async function loadMemory(memoryPath) {
  try {
    const raw = await fs.readFile(memoryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.blocks)) {
      throw new Error("Invalid memory format.");
    }
    return parsed;
  } catch {
    const memory = createEmptyMemory();
    await saveMemory(memoryPath, memory);
    return memory;
  }
}

export async function appendMemory(memoryPath, blockSummary) {
  const memory = await loadMemory(memoryPath);
  memory.blocks.push({
    ...blockSummary,
    savedAt: new Date().toISOString()
  });
  memory.blocks = memory.blocks.slice(-30);
  await saveMemory(memoryPath, memory);
  return memory;
}

export function recentTopics(memory) {
  return memory.blocks.flatMap((block) => block.topics || []).slice(-40);
}
```

- [ ] **Step 4: テストを通す**

Run: `npm test -- test/memory-store.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: コミットする**

```bash
git add projects/ai-radio/src/memory-store.mjs projects/ai-radio/test/memory-store.test.mjs
git commit -m "feat: add AI radio memory store"
```

---

### Task 4: 台本生成モジュール

**Files:**
- Create: `projects/ai-radio/src/script-generator.mjs`
- Test: `projects/ai-radio/test/script-generator.test.mjs`

- [ ] **Step 1: 台本生成のテストを書く**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildScriptPrompt, parseScriptResponse, validateRadioBlock } from "../src/script-generator.mjs";

test("buildScriptPrompt includes Okinawa, AI, comedy radio, and recent topics", () => {
  const prompt = buildScriptPrompt({
    showConfig: {
      programTitle: "佐伯亮のAIゆんたくラジオ",
      hosts: [{ name: "佐伯" }, { name: "相方" }],
      corners: ["今日のAI実験報告"]
    },
    memory: {
      blocks: [{ topics: ["台風の日のCodex修正"] }]
    },
    now: new Date("2026-05-13T21:00:00+09:00")
  });

  assert.match(prompt, /沖縄の日常/);
  assert.match(prompt, /AI関連/);
  assert.match(prompt, /お笑い芸人の深夜ラジオ/);
  assert.match(prompt, /台風の日のCodex修正/);
});

test("parseScriptResponse extracts valid JSON from text", () => {
  const response = `以下です。\n\n{\n  "title": "湿気とCodex",\n  "corner": "今日のAI実験報告",\n  "summary": "湿気のある夜にCodexを試した話",\n  "topics": ["沖縄の湿気", "Codex"],\n  "lines": [\n    {"speakerId": "saeki", "speakerName": "佐伯", "text": "湿気がすごい夜です。", "segment": "opening"},\n    {"speakerId": "aikata", "speakerName": "相方", "text": "パソコンより先に人間が熱暴走してる。", "segment": "opening"}\n  ]\n}\n\n以上です。`;

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
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm test -- test/script-generator.test.mjs`

Expected: `Cannot find module '../src/script-generator.mjs'` で失敗する。

- [ ] **Step 3: `script-generator.mjs` を実装する**

```js
import { recentTopics } from "./memory-store.mjs";

export function buildScriptPrompt({ showConfig, memory, now = new Date() }) {
  const timeText = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(now);

  const topics = recentTopics(memory).join("、") || "まだ過去テーマなし";
  const hosts = showConfig.hosts.map((host) => `${host.name}: ${host.role || ""}`).join("\n");
  const corners = showConfig.corners.join("、");

  return `あなたはローカルAIラジオ番組「${showConfig.programTitle}」の放送作家です。

現在時刻: ${timeText}

番組テーマ:
- 沖縄の日常
- AI関連
- ChatGPT、Codex、アプリ開発、小さな自動化
- 実際に試した感想のような一次情報感

トーン:
- お笑い芸人の深夜ラジオのような2人の掛け合い
- 片方が少し脱線し、もう片方がツッコむ
- 難しいAI話は生活感に戻す
- 煽り、副業で月何万円、他者批判、フォロワー自慢は禁止

話者:
${hosts}

使えるコーナー:
${corners}

最近話したテーマ:
${topics}

最近話したテーマを避けて、1ブロック分の台本をJSONだけで返してください。
架空リスナーメールを1つ含めてください。

JSON形式:
{
  "title": "ブロックタイトル",
  "corner": "使ったコーナー名",
  "summary": "このブロックの短い要約",
  "topics": ["テーマ1", "テーマ2"],
  "lines": [
    {
      "speakerId": "saeki",
      "speakerName": "佐伯",
      "text": "読み上げるセリフ。長すぎない自然な日本語。",
      "segment": "opening"
    }
  ]
}

制約:
- linesは8から14個
- speakerIdは saeki または aikata
- 1セリフは80文字以内
- JSON以外の説明文は禁止`;
}

export function parseScriptResponse(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in script response.");
  }
  return validateRadioBlock(JSON.parse(text.slice(start, end + 1)));
}

export function validateRadioBlock(block) {
  if (!block || typeof block !== "object") {
    throw new Error("Radio block must be an object.");
  }
  for (const key of ["title", "corner", "summary"]) {
    if (typeof block[key] !== "string" || block[key].trim() === "") {
      throw new Error(`Radio block requires ${key}.`);
    }
  }
  if (!Array.isArray(block.topics)) {
    throw new Error("Radio block requires topics array.");
  }
  if (!Array.isArray(block.lines) || block.lines.length === 0) {
    throw new Error("Radio block requires lines array.");
  }
  for (const line of block.lines) {
    if (!["saeki", "aikata"].includes(line.speakerId)) {
      throw new Error("Line speakerId must be saeki or aikata.");
    }
    if (typeof line.text !== "string" || line.text.trim() === "") {
      throw new Error("Line text is required.");
    }
  }
  return block;
}

export async function generateScriptBlock({ config, showConfig, memory, fetchImpl = fetch }) {
  const prompt = buildScriptPrompt({ showConfig, memory });
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic script generation failed: ${response.status}`);
  }

  const payload = await response.json();
  const text = payload.content?.map((part) => part.text || "").join("\n") || "";
  return parseScriptResponse(text);
}
```

- [ ] **Step 4: テストを通す**

Run: `npm test -- test/script-generator.test.mjs`

Expected: 3 tests pass.

- [ ] **Step 5: コミットする**

```bash
git add projects/ai-radio/src/script-generator.mjs projects/ai-radio/test/script-generator.test.mjs
git commit -m "feat: generate AI radio scripts"
```

---

### Task 5: xAI TTSモジュール

**Files:**
- Create: `projects/ai-radio/src/tts-xai.mjs`

- [ ] **Step 1: `tts-xai.mjs` を作成する**

```js
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export function safeAudioName({ blockId, index, speakerId }) {
  const cleanSpeaker = speakerId.replace(/[^a-z0-9_-]/gi, "");
  return `${blockId}-${String(index).padStart(2, "0")}-${cleanSpeaker}.mp3`;
}

export function createBlockId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export async function synthesizeLine({ config, line, voiceId, outputPath, fetchImpl = fetch }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const response = await fetchImpl(config.xaiTtsEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.xaiApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      text: line.text,
      voice_id: voiceId,
      language: "ja",
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    throw new Error(`xAI TTS failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  return {
    ...line,
    audioPath: outputPath,
    audioUrl: `/audio/${path.basename(outputPath)}`
  };
}

export async function synthesizeBlock({ config, showConfig, block, fetchImpl = fetch }) {
  const blockId = createBlockId();
  const voiceBySpeaker = new Map(showConfig.hosts.map((host) => [host.id, host.voiceId]));
  const lines = [];

  for (let index = 0; index < block.lines.length; index += 1) {
    const line = block.lines[index];
    const voiceId = voiceBySpeaker.get(line.speakerId) || showConfig.hosts[0].voiceId;
    const outputPath = path.join(config.audioDir, safeAudioName({ blockId, index, speakerId: line.speakerId }));
    const spokenLine = await synthesizeLine({ config, line, voiceId, outputPath, fetchImpl });
    lines.push(spokenLine);
  }

  return {
    ...block,
    id: blockId,
    lines
  };
}
```

- [ ] **Step 2: 既存テストが壊れていないか確認する**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: コミットする**

```bash
git add projects/ai-radio/src/tts-xai.mjs
git commit -m "feat: add xAI text to speech provider"
```

---

### Task 6: キュー管理

**Files:**
- Create: `projects/ai-radio/src/queue-manager.mjs`
- Test: `projects/ai-radio/test/queue-manager.test.mjs`

- [ ] **Step 1: キューマネージャーのテストを書く**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createQueueManager } from "../src/queue-manager.mjs";

test("queue manager generates one block and exposes public state", async () => {
  const manager = createQueueManager({
    generateReadyBlock: async () => ({
      id: "block-1",
      title: "湿気とAI",
      corner: "今日のAI実験報告",
      summary: "沖縄の湿気とAI作業の話",
      topics: ["湿気", "AI"],
      lines: [{ speakerName: "佐伯", text: "湿気がすごいですね。", audioUrl: "/audio/a.mp3" }]
    }),
    onBlockCompleted: async () => {}
  });

  await manager.ensureQueue();
  const state = manager.getState();

  assert.equal(state.queue.length, 1);
  assert.equal(state.status, "ready");
  assert.equal(state.queue[0].title, "湿気とAI");
});

test("completeBlock removes the block and calls completion hook", async () => {
  const completed = [];
  const manager = createQueueManager({
    generateReadyBlock: async () => ({
      id: "block-1",
      title: "湿気とAI",
      corner: "今日のAI実験報告",
      summary: "沖縄の湿気とAI作業の話",
      topics: ["湿気", "AI"],
      lines: []
    }),
    onBlockCompleted: async (block) => completed.push(block.id)
  });

  await manager.ensureQueue();
  await manager.completeBlock("block-1");

  assert.deepEqual(completed, ["block-1"]);
  assert.equal(manager.getState().queue.length, 0);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm test -- test/queue-manager.test.mjs`

Expected: `Cannot find module '../src/queue-manager.mjs'` で失敗する。

- [ ] **Step 3: `queue-manager.mjs` を実装する**

```js
export function createQueueManager({ generateReadyBlock, onBlockCompleted }) {
  const queue = [];
  let status = "idle";
  let lastError = null;
  let inflight = null;

  async function ensureQueue() {
    if (queue.length > 0 || inflight) {
      return inflight;
    }

    status = "generating";
    lastError = null;
    inflight = generateReadyBlock()
      .then((block) => {
        queue.push(block);
        status = "ready";
        return block;
      })
      .catch((error) => {
        status = "error";
        lastError = error.message;
        throw error;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  }

  async function completeBlock(blockId) {
    const index = queue.findIndex((block) => block.id === blockId);
    if (index === -1) {
      return;
    }
    const [block] = queue.splice(index, 1);
    await onBlockCompleted(block);
  }

  function getState() {
    return {
      status,
      lastError,
      queue: queue.map((block) => ({
        id: block.id,
        title: block.title,
        corner: block.corner,
        summary: block.summary,
        topics: block.topics,
        lines: block.lines.map((line) => ({
          speakerId: line.speakerId,
          speakerName: line.speakerName,
          text: line.text,
          segment: line.segment,
          audioUrl: line.audioUrl
        }))
      }))
    };
  }

  return {
    ensureQueue,
    completeBlock,
    getState
  };
}
```

- [ ] **Step 4: テストを通す**

Run: `npm test -- test/queue-manager.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: コミットする**

```bash
git add projects/ai-radio/src/queue-manager.mjs projects/ai-radio/test/queue-manager.test.mjs
git commit -m "feat: manage AI radio playback queue"
```

---

### Task 7: HTTPサーバー

**Files:**
- Create: `projects/ai-radio/src/server.mjs`

- [ ] **Step 1: `server.mjs` を実装する**

```js
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config.mjs";
import { loadMemory, appendMemory } from "./memory-store.mjs";
import { generateScriptBlock } from "./script-generator.mjs";
import { synthesizeBlock } from "./tts-xai.mjs";
import { createQueueManager } from "./queue-manager.mjs";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"]
]);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function serveFile(res, baseDir, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(baseDir, safePath));
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": contentTypes.get(path.extname(filePath)) || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

export async function createServer() {
  const config = getConfig();
  const showConfig = await readJson(config.showConfigPath);

  const manager = createQueueManager({
    generateReadyBlock: async () => {
      const memory = await loadMemory(config.memoryPath);
      const scriptBlock = await generateScriptBlock({ config, showConfig, memory });
      return synthesizeBlock({ config, showConfig, block: scriptBlock });
    },
    onBlockCompleted: async (block) => {
      await appendMemory(config.memoryPath, {
        id: block.id,
        summary: block.summary,
        topics: block.topics,
        corner: block.corner
      });
      manager.ensureQueue().catch(() => {});
    }
  });

  manager.ensureQueue().catch(() => {});

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/state") {
      await manager.ensureQueue().catch(() => {});
      sendJson(res, 200, manager.getState());
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/complete/")) {
      const blockId = decodeURIComponent(url.pathname.replace("/api/complete/", ""));
      await manager.completeBlock(blockId);
      sendJson(res, 200, manager.getState());
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
      await serveFile(res, config.audioDir, url.pathname.replace("/audio", ""));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/bgm/")) {
      await serveFile(res, config.bgmDir, url.pathname.replace("/bgm", ""));
      return;
    }

    if (req.method === "GET") {
      await serveFile(res, config.publicDir, url.pathname);
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  });

  return { server, config };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, config } = await createServer();
  server.listen(config.port, () => {
    console.log(`佐伯亮AIラジオ: http://localhost:${config.port}`);
  });
}
```

- [ ] **Step 2: 既存テストを通す**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: コミットする**

```bash
git add projects/ai-radio/src/server.mjs
git commit -m "feat: serve AI radio app"
```

---

### Task 8: ブラウザUI

**Files:**
- Create: `projects/ai-radio/public/index.html`
- Create: `projects/ai-radio/public/styles.css`
- Create: `projects/ai-radio/public/app.js`

- [ ] **Step 1: `index.html` を作成する**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>佐伯亮のAIゆんたくラジオ</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="shell">
      <section class="console">
        <div class="masthead">
          <p class="eyebrow">LOCAL AI RADIO</p>
          <h1>佐伯亮のAIゆんたくラジオ</h1>
          <p>沖縄の日常とAI実験を、深夜ラジオくらいの温度で。</p>
        </div>

        <div class="now-playing">
          <div>
            <p class="label">NOW</p>
            <h2 id="speaker">待機中</h2>
          </div>
          <p id="line" class="line">生成が終わったらスタートできます。</p>
        </div>

        <div class="meta-grid">
          <div>
            <span>コーナー</span>
            <strong id="corner">-</strong>
          </div>
          <div>
            <span>生成状況</span>
            <strong id="status">idle</strong>
          </div>
          <div>
            <span>キュー</span>
            <strong id="queue">0</strong>
          </div>
        </div>

        <div class="controls">
          <button id="start" type="button">開始</button>
          <button id="stop" type="button">停止</button>
        </div>
      </section>

      <aside class="log-panel">
        <h2>再生ログ</h2>
        <ol id="log"></ol>
      </aside>
    </main>

    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: `styles.css` を作成する**

```css
:root {
  color-scheme: dark;
  --bg: #141414;
  --panel: #202020;
  --panel-2: #2a2a2a;
  --text: #f6f2e8;
  --muted: #b9b2a5;
  --accent: #5cc8a7;
  --accent-2: #f4b942;
  font-family: "Yu Gothic", "Meiryo", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
}

.console,
.log-panel {
  background: var(--panel);
  border: 1px solid #353535;
  border-radius: 8px;
  padding: 24px;
}

.eyebrow,
.label,
.meta-grid span {
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 0;
  margin: 0 0 8px;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  font-size: 34px;
  line-height: 1.2;
}

.masthead p:last-child,
.line,
.log-panel {
  color: var(--muted);
}

.now-playing {
  margin: 28px 0;
  padding: 22px;
  background: var(--panel-2);
  border-radius: 8px;
}

.now-playing h2 {
  color: var(--accent-2);
  font-size: 22px;
}

.line {
  font-size: 20px;
  line-height: 1.8;
  min-height: 72px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.meta-grid div {
  background: #181818;
  border-radius: 8px;
  padding: 14px;
}

.meta-grid strong {
  display: block;
  margin-top: 6px;
  color: var(--text);
}

.controls {
  display: flex;
  gap: 12px;
  margin-top: 22px;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 12px 18px;
  color: #101010;
  background: var(--accent);
  font-weight: 700;
  cursor: pointer;
}

button#stop {
  background: #d8d2c4;
}

.log-panel h2 {
  color: var(--text);
  font-size: 18px;
}

ol {
  padding-left: 20px;
}

li {
  margin-bottom: 12px;
  line-height: 1.6;
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: `app.js` を作成する**

```js
const speakerEl = document.querySelector("#speaker");
const lineEl = document.querySelector("#line");
const cornerEl = document.querySelector("#corner");
const statusEl = document.querySelector("#status");
const queueEl = document.querySelector("#queue");
const logEl = document.querySelector("#log");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");

let stopped = true;
let currentAudio = null;

async function fetchState() {
  const response = await fetch("/api/state");
  if (!response.ok) {
    throw new Error(`state failed: ${response.status}`);
  }
  return response.json();
}

function updateState(state) {
  statusEl.textContent = state.status;
  queueEl.textContent = String(state.queue.length);
  const block = state.queue[0];
  cornerEl.textContent = block?.corner || "-";
}

function appendLog(line) {
  const item = document.createElement("li");
  item.textContent = `${line.speakerName}: ${line.text}`;
  logEl.prepend(item);
  while (logEl.children.length > 20) {
    logEl.lastElementChild.remove();
  }
}

function playAudio(url) {
  return new Promise((resolve, reject) => {
    currentAudio = new Audio(url);
    currentAudio.addEventListener("ended", resolve, { once: true });
    currentAudio.addEventListener("error", reject, { once: true });
    currentAudio.play().catch(reject);
  });
}

async function completeBlock(blockId) {
  await fetch(`/api/complete/${encodeURIComponent(blockId)}`, { method: "POST" });
}

async function playLoop() {
  while (!stopped) {
    const state = await fetchState();
    updateState(state);
    const block = state.queue[0];

    if (!block) {
      speakerEl.textContent = "生成待ち";
      lineEl.textContent = "次のブロックを準備しています。";
      await new Promise((resolve) => setTimeout(resolve, 2500));
      continue;
    }

    for (const line of block.lines) {
      if (stopped) {
        break;
      }
      speakerEl.textContent = line.speakerName;
      lineEl.textContent = line.text;
      appendLog(line);
      await playAudio(line.audioUrl);
    }

    if (!stopped) {
      await completeBlock(block.id);
    }
  }
}

startButton.addEventListener("click", () => {
  if (!stopped) {
    return;
  }
  stopped = false;
  playLoop().catch((error) => {
    speakerEl.textContent = "エラー";
    lineEl.textContent = error.message;
    stopped = true;
  });
});

stopButton.addEventListener("click", () => {
  stopped = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
});

fetchState().then(updateState).catch((error) => {
  statusEl.textContent = "error";
  lineEl.textContent = error.message;
});
```

- [ ] **Step 4: 既存テストを通す**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: コミットする**

```bash
git add projects/ai-radio/public/index.html projects/ai-radio/public/styles.css projects/ai-radio/public/app.js
git commit -m "feat: add AI radio browser player"
```

---

### Task 9: 実APIでの動作確認

**Files:**
- Modify only if verification reveals a bug in files from previous tasks.

- [ ] **Step 1: テストを全部通す**

Run: `npm test` from `projects/ai-radio/`

Expected: all tests pass.

- [ ] **Step 2: アプリを起動する**

Run: `npm start` from `projects/ai-radio/`

Expected: terminalに `佐伯亮AIラジオ: http://localhost:4173` が表示される。

- [ ] **Step 3: API状態を確認する**

Run from another terminal:

```bash
curl http://localhost:4173/api/state
```

Expected: JSONが返り、`queue[0].lines[0].audioUrl` が `/audio/....mp3` になっている。

- [ ] **Step 4: 音声ファイルが作成されたか確認する**

Run:

```bash
dir data\audio
```

Expected: `.mp3` ファイルが1つ以上ある。

- [ ] **Step 5: ブラウザで再生確認する**

Open: `http://localhost:4173`

Expected:
- UIが表示される
- スタートボタンで音声が再生される
- 現在の話者とセリフが切り替わる
- 再生ログが増える

- [ ] **Step 6: 記憶更新を確認する**

1ブロック再生後に確認する。

Run:

```bash
type data\memory.json
```

Expected: `blocks` に再生済みブロックの `summary`、`topics`、`corner` が保存されている。

- [ ] **Step 7: コミットする**

```bash
git add projects/ai-radio
git commit -m "chore: verify AI radio MVP"
```

---

## 自己レビュー

- 設計書のv1範囲である、台本生成、xAI TTS、ブラウザ再生、記憶更新、APIキー非露出を各タスクに含めた。
- BGMはv1で必須にせず、`data/bgm/` の箱だけ作る。これは設計書の「BGMが無い場合はトークだけで続ける」に合わせる。
- OBS、録音、本物のリスナーメール、ニュース取得はPhase 2以降なので、この実装計画には入れない。
- プレースホルダーは使わず、初期実装に必要なコードと確認コマンドを明記した。
