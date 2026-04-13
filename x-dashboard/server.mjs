import express from "express";
import { TwitterApi } from "twitter-api-v2";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let twitter = null;
function getTwitter() {
  if (!twitter) {
    twitter = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
  }
  return twitter;
}

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  return new Anthropic({ apiKey: key });
}

let cachedUserId = null;
async function getMyId() {
  if (!cachedUserId) {
    const me = await getTwitter().v2.me();
    cachedUserId = me.data.id;
  }
  return cachedUserId;
}

// タイムライン取得
app.get("/api/timeline", async (req, res) => {
  try {
    const id = await getMyId();
    const timeline = await getTwitter().v2.homeTimeline({
      max_results: 20,
      "tweet.fields": ["author_id", "created_at", "public_metrics"],
      "user.fields": ["name", "username", "profile_image_url"],
      expansions: ["author_id"],
    });

    const users = {};
    (timeline.includes?.users || []).forEach(u => { users[u.id] = u; });

    const tweets = (timeline.data?.data || []).map(t => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      metrics: t.public_metrics,
      author: users[t.author_id] || { name: "Unknown", username: "unknown" },
    }));

    res.json({ tweets });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 自分の最近の投稿を取得（コンテキスト用）
async function getMyRecentTweets() {
  try {
    const id = await getMyId();
    const result = await getTwitter().v2.userTimeline(id, {
      max_results: 5,
      "tweet.fields": ["text"],
    });
    return (result.data?.data || []).map(t => t.text).join("\n---\n");
  } catch {
    return "";
  }
}

// AI返信生成
app.post("/api/generate-reply", async (req, res) => {
  const { tweet_text, author_name } = req.body;
  try {
    // profile.jsonを毎回読み込み（日々更新に対応）
    const profile = JSON.parse(
      fs.readFileSync(path.join(__dirname, "profile.json"), "utf-8")
    );

    // 自分の最近の投稿も取得
    const recentTweets = await getMyRecentTweets();

    const context = `
【あなたのプロフィール】
名前: ${profile.name}（${profile.handle}）
立ち位置: ${profile.tagline} / ${profile.location}
発信スタンス: ${profile.description}

【実績】
- ${profile.achievements.kindle}
- ${profile.achievements.apps}
- ${profile.achievements.tools}

【現在の状況】
- Xフォロワー: ${profile.sns.x_followers}人（開設2ヶ月弱）
- note投稿済み: ${profile.note.published}本（無料${profile.note.free}本・有料${profile.note.paid}本 ${profile.note.paid_price}円）
- 生成済み記事: ${profile.note.total_articles}本ストック中
- 今の注力: ${profile.current_focus}

【自分の最近のポスト（参考）】
${recentTweets || "（取得なし）"}
`.trim();

    const msg = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `${context}

---

以下のXの投稿に返信してください。

投稿者: ${author_name}
投稿内容: ${tweet_text}

【返信のルール】
- 140文字以内
- 質問で終わらせない（「〜ですか？」で終わるのはNG）
- 感想・共感・「自分も参考にします」「頑張ります」系のトーン
- 自分の状況を絡めてもOK（ただし宣伝はしない）
- 等身大でカジュアル、押しつけない
- 絵文字は1〜2個まで

返信文のみ出力してください。`,
      }],
    });
    res.json({ reply: msg.content[0].text.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 返信投稿
app.post("/api/reply", async (req, res) => {
  const { text, reply_to_id } = req.body;
  try {
    const tweet = await getTwitter().v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: reply_to_id },
    });
    res.json({ success: true, id: tweet.data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// リポスト
app.post("/api/retweet", async (req, res) => {
  const { tweet_id } = req.body;
  try {
    const id = await getMyId();
    await getTwitter().v2.retweet(id, tweet_id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// いいね
app.post("/api/like", async (req, res) => {
  const { tweet_id } = req.body;
  try {
    const id = await getMyId();
    await getTwitter().v2.like(id, tweet_id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── メモ → Xポスト変換 ────────────────────────────────────────

app.post("/api/memo-to-post", async (req, res) => {
  const { memo } = req.body;
  if (!memo?.trim()) return res.status(400).json({ error: "メモが空です" });

  try {
    const msg = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `あなたは「佐伯亮」（沖縄在住の会社員・AI×副業の実験者）のXポスト代筆AIです。

【佐伯亮のプロフィール】
- 沖縄在住の会社員、副業でAI活用・Kindle出版・アプリ開発
- Kindle5冊出版、Webアプリ2本リリース
- Claude/ChatGPT歴が長い
- 「やってみたらこうだった」という一次情報だけを発信するスタイル

【文体ルール】
- 一文は60字以内
- 「でも」「だから」「だって」でよくつなぐ
- 体験談・実験結果ベース
- 数字を入れる（「たくさん」→「3時間」）
- 語尾は「〜でした」「〜だと思ってます」が多め
- 絵文字は1〜2個まで
- 煽り表現禁止（革命・最強・爆速・ゲームチェンジャー）
- 「〜ですか？」で終わるのはNG
- 140文字以内

以下のメモをもとに、Xポスト案を3パターン作ってください。
角度を変えて（例：失敗談・気づき・ノウハウ）。

JSONのみ出力（説明文不要）：
[
  { "pattern": "失敗談", "post": "ポスト文" },
  { "pattern": "気づき", "post": "ポスト文" },
  { "pattern": "ノウハウ", "post": "ポスト文" }
]

【今日のメモ】
${memo.trim()}`,
      }],
    });

    const raw = msg.content[0].text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const posts = JSON.parse(raw);
    res.json({ posts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── AI トレンド 引用ポスト生成 ────────────────────────────────

const RSS_FEEDS = [
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "TechCrunch AI",  url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "The Verge AI",   url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml" },
  { name: "Ars Technica AI",url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
];

let trendsCache = null;
let trendsCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30分

app.get("/api/trends", async (req, res) => {
  try {
    // キャッシュが有効なら返す
    if (trendsCache && Date.now() - trendsCacheTime < CACHE_TTL) {
      return res.json({ items: trendsCache, cached: true });
    }

    const parser = new Parser({ timeout: 8000 });
    const allItems = [];

    // RSS並列取得
    const results = await Promise.allSettled(
      RSS_FEEDS.map(feed =>
        parser.parseURL(feed.url).then(result =>
          result.items.slice(0, 5).map(item => ({
            source: feed.name,
            title: item.title || "",
            summary: item.contentSnippet || item.content || "",
            link: item.link || "",
            pubDate: item.pubDate || "",
          }))
        )
      )
    );

    results.forEach(r => {
      if (r.status === "fulfilled") allItems.push(...r.value);
    });

    if (allItems.length === 0) {
      return res.status(502).json({ error: "RSSの取得に失敗しました" });
    }

    // 新着順にソートして上位10件をClaudeに渡す
    const top = allItems
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 10);

    const listText = top.map((item, i) =>
      `[${i + 1}] ${item.source}\nタイトル: ${item.title}\n概要: ${item.summary?.slice(0, 300)}`
    ).join("\n\n");

    const msg = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `あなたは「佐伯亮」（沖縄在住の会社員・AI×副業の実験者）のSNS運用アシスタントです。

以下は海外AIニュースの一覧です。日本のAIユーザーにとって「知らなかった！」「面白い！」と感じるニュースを上位5件選び、それぞれについて以下のJSON形式で返してください。

【出力ルール】
- JSONのみ出力（説明文不要）
- quote_post は140文字以内（Xの文字数制限）
- トーンは等身大・カジュアル・沖縄在住の会社員目線
- 煽り表現（革命・最強・爆速）禁止
- 絵文字は1〜2個まで
- 「〜ですか？」で終わるのはNG

【出力形式】
[
  {
    "rank": 1,
    "index": 1,
    "source": "ソース名",
    "title_en": "英語タイトル",
    "title_ja": "日本語タイトル（簡潔に）",
    "summary_ja": "日本語で50〜80字の要約",
    "quote_post": "140字以内の引用ポスト文"
  }
]

※ index は【ニュース一覧】の[番号]をそのまま使ってください。

【ニュース一覧】
${listText}`,
      }],
    });

    let items;
    try {
      const raw = msg.content[0].text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
      items = JSON.parse(raw);
      // indexを使ってRSSの実際のURLをセット（0始まりに変換）
      items = items.map(item => {
        const idx = (item.index || item.rank || 1) - 1;
        const original = top[idx] || {};
        return { ...item, link: original.link || "" };
      });
    } catch {
      return res.status(500).json({ error: "Claude応答のパースに失敗しました" });
    }

    trendsCache = items;
    trendsCacheTime = Date.now();
    res.json({ items, cached: false });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 自動投稿キュー管理 ───────────────────────────────────────

const QUEUE_FILE = path.join(__dirname, "post-queue.json");
const LOG_FILE   = path.join(__dirname, "post-log.json");

function readQueueFile() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8")); }
  catch { return []; }
}

// キュー一覧（pending を先頭に）
app.get("/api/queue", (req, res) => {
  const queue = readQueueFile();
  const sorted = [...queue].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  res.json({ items: sorted.slice(0, 30) });
});

// キャンセル
app.post("/api/queue/:id/cancel", (req, res) => {
  const queue = readQueueFile();
  const target = queue.find(q => q.id === req.params.id);
  if (!target) return res.status(404).json({ error: "見つかりません" });
  if (target.status !== "pending") return res.status(400).json({ error: `既に ${target.status} です` });

  const updated = queue.map(q =>
    q.id === req.params.id ? { ...q, status: "cancelled" } : q
  );
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(updated, null, 2));
  res.json({ success: true });
});

// 投稿ログ
app.get("/api/post-log", (req, res) => {
  try {
    const log = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
    res.json({ items: [...log].reverse().slice(0, 50) });
  } catch {
    res.json({ items: [] });
  }
});

app.listen(3366, () => {
  console.log("✅ X Dashboard起動: http://localhost:3366");
});
