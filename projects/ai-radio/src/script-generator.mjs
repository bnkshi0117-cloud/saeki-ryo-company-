import { recentTopics } from "./memory-store.mjs";
import { defaultSettings, normalizeSettings } from "./settings-store.mjs";

export function buildScriptPrompt({ showConfig, memory, settings = defaultSettings, now = new Date() }) {
  const normalizedSettings = normalizeSettings(settings);
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

今回の指定テーマ: ${normalizedSettings.theme}
番組全体の目標時間: 約${normalizedSettings.targetMinutes}分

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

最近話したテーマを避けて、番組全体の一部として1ブロック分の台本をJSONだけで返してください。
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

export async function generateScriptBlock({ config, showConfig, memory, settings, fetchImpl = fetch }) {
  const prompt = buildScriptPrompt({ showConfig, memory, settings });
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
