/**
 * 佐伯亮カンパニー X自動投稿（一発実行型）
 * GitHub Actionsから呼ばれる想定。
 * RSS収集 → Claude生成 → Slack通知 → X投稿 → ログ保存
 */

import Anthropic from "@anthropic-ai/sdk";
import { TwitterApi } from "twitter-api-v2";
import Parser from "rss-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const LOG_FILE      = path.join(__dirname, "post-log.json");
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

// ── RSSフィード ──────────────────────────────────────────────
const RSS_FEEDS = [
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/",                       lang: "en" },
  { name: "TechCrunch AI",  url: "https://techcrunch.com/category/artificial-intelligence/feed/",    lang: "en" },
  { name: "The Verge AI",   url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", lang: "en" },
  { name: "Ars Technica",   url: "https://feeds.arstechnica.com/arstechnica/technology-lab",          lang: "en" },
  { name: "Zenn AI",        url: "https://zenn.dev/topics/ai/feed",                                   lang: "ja" },
];

// ── ユーティリティ ────────────────────────────────────────────
function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")); }
  catch { return []; }
}
function writeLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}
function getTwitter() {
  return new TwitterApi({
    appKey:      process.env.X_CONSUMER_KEY,
    appSecret:   process.env.X_CONSUMER_SECRET,
    accessToken:  process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

// ── RSS収集 ──────────────────────────────────────────────────
async function fetchNews() {
  const parser = new Parser({ timeout: 8000 });
  const all = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(f =>
      parser.parseURL(f.url).then(r =>
        r.items.slice(0, 5).map(item => ({
          source:  f.name,
          lang:    f.lang,
          title:   item.title || "",
          summary: item.contentSnippet?.slice(0, 300) || "",
          link:    item.link || "",
          pubDate: item.pubDate || "",
        }))
      )
    )
  );

  results.forEach(r => { if (r.status === "fulfilled") all.push(...r.value); });
  const sorted = all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 12);
  console.log(`📰 ニュース取得: ${sorted.length}件`);
  return sorted;
}

// ── Claude投稿生成 ────────────────────────────────────────────
async function generatePost(news) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const log = readLog();

  const recentTexts = log.slice(-10).map(p => p.text).join("\n---\n");
  const recentTypes = log.slice(-5).map(p => p.type).join(", ");

  const newsList = news.map((n, i) =>
    `[${i + 1}] [${n.lang === "ja" ? "日本語" : "英語"}] ${n.source}\nタイトル: ${n.title}\n概要: ${n.summary?.slice(0, 200)}\nURL: ${n.link}`
  ).join("\n\n");

  console.log("🤖 Claude生成中...");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: `あなたは「佐伯亮」（沖縄在住の会社員・AI×副業の実験者）のX投稿生成AIです。

【最近の投稿内容（重複回避用）】
${recentTexts || "なし"}

【最近の投稿タイプ（偏り確認用）】
${recentTypes || "なし"}

【今日のAIニュース一覧】
${newsList}

---

以下のルールでXポストを1件生成してください。

【投稿タイプ選択基準】
- news_insight  : ニュースを読んだ佐伯亮としての解釈・感想（最多・具体的な気づきがあれば）
- news_citation : ニュースURLを引用しつつ一言コメント（週2〜3程度に抑える）
- side_job      : AI副業・Kindle・アプリ開発の実体験や気づき（具体的な数字があれば積極的に）
- algorithm     : Xの仕組みについての仮説・考察（週1程度・必ず「個人の見解ですが、」で始める）

【文体ルール（必ず守ること）】
- 140文字以内
- 等身大・カジュアル・体験談ベース
- 数字を使う（「たくさん」→「3件」「2時間」など具体的に）
- 煽り表現禁止（革命・最強・爆速・ゲームチェンジャー・衝撃）
- 絵文字は1〜2個まで
- 「〜ですか？」で終わるのはNG
- 推測・受け売りはNG（一次情報・実体験ベースのみ）
- side_jobは実際の数字や体験がない場合は選ばない

JSONのみ出力（説明文不要）：
{
  "type": "news_insight|news_citation|side_job|algorithm",
  "text": "140字以内の投稿文",
  "source_index": null または引用する記事番号（1始まり）,
  "reason": "このタイプ・この内容を選んだ理由（30字以内）"
}`,
    }],
  });

  const raw = msg.content[0].text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  const result = JSON.parse(raw);
  const source = (result.source_index != null) ? news[result.source_index - 1] : null;

  console.log(`✍️  生成完了 [${result.type}]: ${result.text.slice(0, 50)}...`);
  console.log(`📌 選定理由: ${result.reason}`);

  return {
    id:     crypto.randomUUID(),
    type:   result.type,
    text:   result.text,
    reason: result.reason,
    source: source ? { title: source.title, url: source.link, name: source.source } : null,
  };
}

// ── Slack通知 ─────────────────────────────────────────────────
async function notifySlack(item, tweetUrl) {
  if (!SLACK_WEBHOOK) return;

  const typeLabel = {
    news_insight:  "AIニュース解釈",
    news_citation: "ニュース引用",
    side_job:      "AI副業ネタ",
    algorithm:     "アルゴリズム考察",
  }[item.type] || item.type;

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `✅ 投稿完了｜${typeLabel}` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*投稿内容:*\n\`\`\`${item.text}\`\`\`` }
    },
  ];

  if (item.source) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*ソース:* <${item.source.url}|${item.source.title}>` }
    });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*選定理由:* ${item.reason}${tweetUrl ? `\n*ポスト:* <${tweetUrl}|Xで確認>` : ""}` }
  });

  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
}

// ── X投稿 ─────────────────────────────────────────────────────
async function postToX(item) {
  let text = item.text;
  if (item.type === "news_citation" && item.source?.url) {
    const candidate = `${text}\n${item.source.url}`;
    if (candidate.length <= 280) text = candidate;
  }

  console.log("📤 X投稿中...");
  const tweet = await getTwitter().v2.tweet({ text });
  const tweetId = tweet.data.id;
  console.log(`✅ 投稿完了: https://x.com/saekiryoAI/status/${tweetId}`);
  return tweetId;
}

// ── ログ保存 ──────────────────────────────────────────────────
function saveLog(item, tweetId) {
  const log = readLog();
  log.push({
    id:        item.id,
    type:      item.type,
    text:      item.text,
    reason:    item.reason,
    source:    item.source,
    posted_at: new Date().toISOString(),
    tweet_id:  tweetId,
  });
  writeLog(log);
  console.log(`💾 ログ保存: ${log.length}件目`);
}

// ── メイン ────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 X自動投稿開始: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);

  const news  = await fetchNews();
  const item  = await generatePost(news);

  const tweetId  = await postToX(item);
  const tweetUrl = `https://x.com/saekiryoAI/status/${tweetId}`;

  saveLog(item, tweetId);
  await notifySlack(item, tweetUrl);

  console.log("🎉 完了");
}

main().catch(e => {
  console.error("❌ エラー:", e.message);
  process.exit(1);
});
