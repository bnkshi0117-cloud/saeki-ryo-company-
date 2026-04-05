import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// NHK政治ニュースのRSSフィード
const RSS_URLS = [
  "https://www3.nhk.or.jp/rss/news/cat4.xml", // 政治
  "https://www3.nhk.or.jp/rss/news/cat6.xml", // 社会
];

async function fetchRSS(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`RSS取得失敗: ${url}`);
  return await res.text();
}

function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of itemMatches) {
    const item = match[1];
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      || item.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      || item.match(/<description>(.*?)<\/description>/)?.[1] || "";
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
    if (title) items.push({ title, desc: desc.replace(/<[^>]+>/g, "").trim(), link });
  }
  return items;
}

async function generateScript(newsItems) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const newsSummary = newsItems.slice(0, 5).map((n, i) =>
    `${i + 1}. ${n.title}\n   ${n.desc.slice(0, 100)}`
  ).join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `以下の最新政治ニュースから1本、YouTubeショート動画（20〜25秒）のスクリプトを作成してください。

【今日のニュース】
${newsSummary}

【スクリプトのルール】
- 最も視聴者が関心を持ちそなニュースを1本選ぶ
- 保守・自民党寄りの視点で解説する
- 冒頭3秒は強いフック（「〜を知ってましたか？」「実は〜」などの問いかけ）
- ナレーション全体で200〜250文字（20〜25秒分）
- 短い文で区切る（一文20字以内）
- 難しい言葉は使わない
- 最後は「チャンネル登録よろしくお願いします」で締める

【出力形式（JSON）】
{
  "news_title": "選んだニュースのタイトル",
  "hook": "フック文（冒頭3秒、20字以内）",
  "points": ["ポイント1（20字以内）", "ポイント2（20字以内）", "ポイント3（20字以内）"],
  "narration": "ナレーション全文（200〜250文字）",
  "thumbnail_text": "サムネ用キャッチコピー（15字以内）"
}`
    }]
  });

  const text = message.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON解析失敗");
  return JSON.parse(jsonMatch[0]);
}

// メイン
const dotenv = await import("dotenv");
dotenv.config({ path: path.join(ROOT, "../.env") });
dotenv.config({ path: path.join(ROOT, "../../.env") });

console.log("📡 ニュース取得中...");
let allItems = [];
for (const url of RSS_URLS) {
  try {
    const xml = await fetchRSS(url);
    const items = parseRSS(xml);
    allItems = allItems.concat(items);
    console.log(`  ✅ ${items.length}件取得: ${url}`);
  } catch (e) {
    console.log(`  ❌ 取得失敗: ${url}`);
  }
}

if (allItems.length === 0) {
  console.error("ニュースが取得できませんでした");
  process.exit(1);
}

console.log("✍️  スクリプト生成中...");
const script = await generateScript(allItems);
console.log(`  ✅ ニュース選定: ${script.news_title}`);

const today = new Date().toISOString().split("T")[0];
const outPath = path.join(ROOT, "output", `${today}-script.json`);
fs.writeFileSync(outPath, JSON.stringify(script, null, 2), "utf-8");
console.log(`  💾 保存: ${outPath}`);
console.log("\n📋 生成スクリプト:");
console.log(`  フック: ${script.hook}`);
console.log(`  ナレーション: ${script.narration.slice(0, 50)}...`);
