/**
 * 佐伯亮のX投稿を取得して文体分析用に保存するスクリプト
 * 使い方: node fetch-my-tweets.mjs
 */

import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const client = new TwitterApi({
  appKey:      process.env.X_CONSUMER_KEY,
  appSecret:   process.env.X_CONSUMER_SECRET,
  accessToken:  process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

// 自分のユーザー情報取得
const me = await client.v2.me();
console.log(`ユーザー: @${me.data.username} (ID: ${me.data.id})`);

// 直近100件のツイート取得（リプライ・RTは除外）
const timeline = await client.v2.userTimeline(me.data.id, {
  max_results: 100,
  exclude: ["retweets", "replies"],
  "tweet.fields": ["created_at", "public_metrics"],
});

const tweets = timeline.data.data || [];
console.log(`取得件数: ${tweets.length}件`);

// 保存
const output = {
  fetched_at: new Date().toISOString(),
  username: me.data.username,
  tweets: tweets.map(t => ({
    id: t.id,
    text: t.text,
    created_at: t.created_at,
    metrics: t.public_metrics,
  })),
};

fs.writeFileSync(
  path.join(__dirname, "data/my-tweets.json"),
  JSON.stringify(output, null, 2)
);
console.log("✅ data/my-tweets.json に保存しました");

// 文体サンプルを表示
console.log("\n--- 直近20件のツイート ---");
tweets.slice(0, 20).forEach((t, i) => {
  console.log(`[${i+1}] ${t.text.slice(0, 80)}${t.text.length > 80 ? "..." : ""}`);
});
