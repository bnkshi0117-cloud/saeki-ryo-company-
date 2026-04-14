/**
 * 佐伯亮カンパニー X自動投稿（一発実行型）
 * 使い方:
 *   node auto-poster.mjs generate <cancel_url>  → 生成してSlack通知
 *   node auto-poster.mjs post                   → pending-post.json を投稿
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

const PENDING_FILE    = path.join(__dirname, "pending-post.json");
const LOG_FILE        = path.join(__dirname, "post-log.json");
const SCENARIOS_FILE  = path.join(__dirname, "data/experiment-scenarios.json");
const SLACK_WEBHOOK   = process.env.SLACK_WEBHOOK_URL;

const RSS_FEEDS = [
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/",                       lang: "en" },
  { name: "TechCrunch AI",  url: "https://techcrunch.com/category/artificial-intelligence/feed/",    lang: "en" },
  { name: "The Verge AI",   url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", lang: "en" },
  { name: "Ars Technica",   url: "https://feeds.arstechnica.com/arstechnica/technology-lab",          lang: "en" },
  { name: "Zenn AI",        url: "https://zenn.dev/topics/ai/feed",                                   lang: "ja" },
  { name: "The Decoder",    url: "https://the-decoder.com/feed/",                                     lang: "en" },
  { name: "AI News",        url: "https://buttondown.com/ainews/rss",                                 lang: "en" },
];

function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")); }
  catch { return []; }
}
function writeLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}
function pickScenario() {
  try {
    const data = JSON.parse(fs.readFileSync(SCENARIOS_FILE, "utf-8"));
    const unused = data.scenarios.filter(s => !s.used);
    if (unused.length === 0) return null;
    const picked = unused[Math.floor(Math.random() * unused.length)];
    // 使用済みにして保存
    data.scenarios = data.scenarios.map(s =>
      s.id === picked.id ? { ...s, used: true } : s
    );
    fs.writeFileSync(SCENARIOS_FILE, JSON.stringify(data, null, 2));
    return picked;
  } catch { return null; }
}
function getTwitter() {
  return new TwitterApi({
    appKey:      process.env.X_CONSUMER_KEY,
    appSecret:   process.env.X_CONSUMER_SECRET,
    accessToken:  process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

function validateXCredentials() {
  const keys = ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ X APIクレデンシャル未設定: ${missing.join(", ")}`);
    console.error("GitHub SecretsにX API認証情報が正しく設定されているか確認してください。");
    process.exit(1);
  }
}

function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`タイムアウト（${ms / 1000}秒）: ${label}`)), ms)
  );
  return Promise.race([promise, timeout]);
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

// ── 実験シナリオの実データ収集 ────────────────────────────────
async function fetchScenarioData(scenario) {
  if (!scenario?.searchQuery) return "";
  try {
    const q = encodeURIComponent(scenario.searchQuery);
    const url = `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`;
    const parser = new Parser({ timeout: 8000 });
    const feed = await parser.parseURL(url);

    // タイトル一覧
    const titles = feed.items.slice(0, 5).map(item =>
      `・${item.title}（${item.source?.name || ""}）`
    ).join("\n");

    // 上位2件の本文をフェッチ（失敗しても続行）
    const bodyTexts = await Promise.allSettled(
      feed.items.slice(0, 2).map(async item => {
        if (!item.link) return "";
        const res = await withTimeout(fetch(item.link), 8000, "article fetch");
        const html = await res.text();
        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1000);
        return `【${item.title}】\n${text}`;
      })
    );
    const bodies = bodyTexts
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value)
      .join("\n\n");

    console.log(`🔍 実験データ取得: タイトル${feed.items.length}件 + 本文${bodyTexts.filter(r => r.status === "fulfilled").length}件`);
    return `【記事タイトル一覧】\n${titles}\n\n【記事本文（抜粋）】\n${bodies}`;
  } catch { return ""; }
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

  const scenario = pickScenario();
  const scenarioData = await fetchScenarioData(scenario);
  const scenarioBlock = scenario
    ? `【実験シナリオ】\nテーマ: ${scenario.theme}\n仮説: ${scenario.hypothesis}\n\n【収集した実データ（直近ニュース・レポート）】\n${scenarioData || "（データ取得なし）"}\n`
    : "";

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

${scenarioBlock}
【今日のAIニュース一覧】
${newsList}

---

以下のルールでXポストを1件生成してください。

【投稿タイプ選択基準】
- news_insight  : ニュースを読んだ佐伯亮としての解釈・感想（最多・具体的な気づきがあれば）
- news_citation : ニュースURLを引用しつつ一言コメント（週2〜3程度に抑える）
- side_job      : AI副業・Kindle・アプリ開発の実体験や気づき（具体的な数字があれば積極的に）
- algorithm     : Xの仕組みについての仮説・考察（週1程度・必ず「個人の見解ですが、」で始める）
- simulation    : 収集した実データ・記事本文を深く読み込み、【初歩的な情報は絶対に書かない】。「使い分けが大事」「AIは便利」レベルは禁止。必ず①反転・意外な発見（「〇〇かと思ったら逆だった」）②具体的な条件・数値・ケース（「30分超えると〜」「3割が〜」）③自分なりの解釈・仮説（「たぶん〜が原因」「これは〜と同じ構造」）のいずれかを含めること。冒頭は「〇〇を調べてみた。」形式。シナリオと実データがある場合のみ選択可。

【佐伯亮の実際の投稿サンプル（この文体・語尾を完全に模倣すること）】
- 「大手企業連合による「国産AI」開発のニュース。正直、期待よりも「どうやって海外勢と差別化するの？」という疑問が勝るかな。」
- 「AIの便利さに慣れきって、人間の「忍耐力」が奪われてるって記事。これ、めちゃくちゃ痛感する。一瞬でそれっぽい答えを出してくれるから、泥臭い思考力が落ちていく感覚があるんだよね。」
- 「SE歴26年の人が6日間コードを1行も書かず、8体のAIエージェント組織を作った記事を読んだ。「何を作るか」より「AIとどう話すか」が技術になってきてる実感、自分も最近あります 🤔」
- 「Claude Codeのメモリ活用を調べてみた。「Obsidian連携でWiki化」が面白かった。脳の外にAIを記憶媒体として置く発想。結局「どう整理するか」の設計力が効いてくる 📝」

【文体ルール（必ず守ること）】
- 140文字以内
- 語尾は「〜かな。」「〜んだよね。」「〜ある。」「〜実感あります。」「〜感覚がある。」など佐伯亮のサンプルに忠実に
- 「〜です。」「〜ます。」「〜と思います。」「〜でしょう。」など丁寧語で終わるのは禁止
- ニュース引用は「〜って記事。」「〜のニュース。」で始め、「正直、〜」で自分の視点を入れる
- 数字を使う（「たくさん」→「3件」「2時間」など具体的に）
- 煽り表現禁止（革命・最強・爆速・ゲームチェンジャー・衝撃）
- 絵文字は0〜1個まで。不要なら入れない
- 「〜ですか？」で終わるのはNG
- side_jobは実際の数字や体験がない場合は選ばない
- simulationはシナリオと実データが提供されていない場合は選ばない
- 英語ニュースをベースにした投稿（news_insight / news_citation）の場合のみ、末尾に自然な一言を添えること

JSONのみ出力（説明文不要）：
{
  "type": "news_insight|news_citation|side_job|algorithm|simulation",
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
  return {
    id:       crypto.randomUUID(),
    type:     result.type,
    text:     result.text,
    reason:   result.reason,
    source:   source ? { title: source.title, url: source.link, name: source.source } : null,
    scenario: scenario ? { id: scenario.id, theme: scenario.theme } : null,
  };
}

// ── Slack通知（投稿前プレビュー） ─────────────────────────────
async function notifySlackPreview(item, cancelUrl) {
  if (!SLACK_WEBHOOK) return;
  const typeLabel = {
    news_insight:  "AIニュース解釈",
    news_citation: "ニュース引用",
    side_job:      "AI副業ネタ",
    algorithm:     "アルゴリズム考察",
    simulation:    "AI実験シミュレーション",
  }[item.type] || item.type;

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `⏳ 1分後に投稿します｜${typeLabel}` }
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
    text: { type: "mrkdwn", text: `*選定理由:* ${item.reason}` }
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `❌ *NGの場合（1分以内）:* <${cancelUrl}|GitHubでキャンセル> → 画面右上「Cancel workflow」`
    }
  });

  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
}

// ── Slack通知（エラー） ───────────────────────────────────────
async function notifySlackError(errorMessage) {
  if (!SLACK_WEBHOOK) return;
  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `❌ X投稿エラー｜${errorMessage}\nGitHub Actionsのログを確認してください。`,
    }),
  });
}

// ── Slack通知（投稿完了） ─────────────────────────────────────
async function notifySlackDone(item, tweetUrl) {
  if (!SLACK_WEBHOOK) return;
  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `✅ 投稿完了｜${item.text.slice(0, 60)}${item.text.length > 60 ? "..." : ""}\n${tweetUrl}\nコスト: $0.010`,
    }),
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
  const tweet = await withTimeout(
    getTwitter().v2.tweet({ text }),
    30000,
    "X API tweet"
  );
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
const mode = process.argv[2];

if (mode === "generate") {
  // Step1: 生成 → pending-post.json に保存 → Slack通知
  const cancelUrl = process.argv[3] || "https://github.com";
  const news = await fetchNews();
  const item = await generatePost(news);
  fs.writeFileSync(PENDING_FILE, JSON.stringify(item, null, 2));
  console.log("💾 pending-post.json 保存");
  await notifySlackPreview(item, cancelUrl);
  console.log("📲 Slack通知送信");
  process.exit(0);

} else if (mode === "post") {
  // Step2: pending-post.json を読んで投稿
  validateXCredentials();
  if (!fs.existsSync(PENDING_FILE)) {
    console.log("⏭️  pending-post.json が見つかりません（キャンセル済み）");
    process.exit(0);
  }
  const item = JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8"));
  try {
    const tweetId  = await postToX(item);
    const tweetUrl = `https://x.com/saekiryoAI/status/${tweetId}`;
    saveLog(item, tweetId);
    fs.unlinkSync(PENDING_FILE); // pending削除
    await notifySlackDone(item, tweetUrl);
  } catch (err) {
    console.error(`❌ 投稿失敗: ${err.message}`);
    await notifySlackError(err.message);
    // pending-post.json は残しておく（手動リトライ用）
    process.exit(1);
  }

} else {
  console.error("使い方: node auto-poster.mjs generate <cancel_url> | post");
  process.exit(1);
}
