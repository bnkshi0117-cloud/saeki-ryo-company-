import express from "express";
import { TwitterApi } from "twitter-api-v2";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const twitter = new TwitterApi({
  appKey: process.env.X_CONSUMER_KEY,
  appSecret: process.env.X_CONSUMER_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let cachedUserId = null;
async function getMyId() {
  if (!cachedUserId) {
    const me = await twitter.v2.me();
    cachedUserId = me.data.id;
  }
  return cachedUserId;
}

// タイムライン取得
app.get("/api/timeline", async (req, res) => {
  try {
    const id = await getMyId();
    const timeline = await twitter.v2.homeTimeline({
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
    const result = await twitter.v2.userTimeline(id, {
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

    const msg = await anthropic.messages.create({
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
    const tweet = await twitter.v2.tweet({
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
    await twitter.v2.retweet(id, tweet_id);
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
    await twitter.v2.like(id, tweet_id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3366, () => {
  console.log("✅ X Dashboard起動: http://localhost:3366");
});
