import { recentTopics } from "./memory-store.mjs";
import { defaultSettings, normalizeSettings } from "./settings-store.mjs";

export function buildScriptPrompt({
  showConfig,
  memory,
  settings = defaultSettings,
  newsContext,
  now = new Date(),
  isFirstBlock = true,
  isFinalBlock = false
}) {
  const normalizedSettings = normalizeSettings(settings);
  const timeText = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(now);

  const topics = recentTopics(memory).join("、") || "まだ過去テーマなし";
  const hosts = showConfig.hosts.map((host) => `${host.name}: ${host.role || ""}`).join("\n");
  const corners = showConfig.corners.join("、");

  const openingLines = isFirstBlock
    ? `冒頭3行は必ずこの順番にしてください:
1. speakerId "saeki" / speakerName "佐伯亮" / text "どうも、佐伯亮のAIゆんたくラジオです。"
2. speakerId "saeki" / speakerName "佐伯亮" / text "パーソナリティの佐伯亮です。"
3. speakerId "higa" / speakerName "比嘉" / text "相方の比嘉です。"`
    : `番組の冒頭挨拶（「どうも〜です」「パーソナリティの〜」「相方の〜」）は一切入れないでください。
前のトークから自然につながる会話として始めてください。`;

  const blockShape = isFinalBlock
    ? `これは締めブロックです。
本編を広げず、リスナーへの軽い一言、比嘉の短い返し、佐伯亮の終わりの挨拶だけでスッと終えてください。
linesは3から6個にしてください。`
    : `1ブロックは2から3分のラジオ尺を目安にしてください。
短い一問一答で終わらせず、話題の導入、脱線、ツッコミ、リスナーメール、少し深掘り、次への余韻まで入れてください。`;

  const lineCountRule = isFinalBlock ? "linesは3から6個" : "linesは18から26個";

  const closingLine = isFinalBlock
    ? `最後の1行は必ず以下にしてください:
- speakerId "saeki" / speakerName "佐伯亮" / text "それではお時間になりましたので、また次回お会いしましょう。"`
    : `最後の1行は会話が一段落したところで自然に終わらせてください。番組終了の挨拶は入れないでください（番組はまだ続きます）。`;

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

${newsContext?.enabled ? `今回参照できるニュース素材:
${newsContext.promptText}

ニュース素材を使う場合も、投資助言ではなく雑談として扱ってください。
` : ""}

最近話したテーマを避けて、番組全体の一部として1ブロック分の台本をJSONだけで返してください。
${blockShape}
架空リスナーメールを1つ含めてください。

${openingLines}

${closingLine}

JSON形式:
{
  "title": "ブロックタイトル",
  "corner": "使ったコーナー名",
  "summary": "このブロックの短い要約",
  "topics": ["テーマ1", "テーマ2"],
  "lines": [
    {
      "speakerId": "saeki",
      "speakerName": "佐伯亮",
      "text": "読み上げるセリフ。長すぎない自然な日本語。",
      "segment": "opening"
    }
  ]
}

制約:
- ${lineCountRule}
- speakerIdは saeki または higa
- 1セリフは120文字以内
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
    if (!["saeki", "higa"].includes(line.speakerId)) {
      throw new Error("Line speakerId must be saeki or higa.");
    }
    if (typeof line.text !== "string" || line.text.trim() === "") {
      throw new Error("Line text is required.");
    }
  }
  return block;
}

export async function generateScriptBlock({
  config,
  showConfig,
  memory,
  settings,
  newsContext,
  isFirstBlock = true,
  isFinalBlock = false,
  fetchImpl = fetch
}) {
  const prompt = buildScriptPrompt({ showConfig, memory, settings, newsContext, isFirstBlock, isFinalBlock });
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 4200,
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
