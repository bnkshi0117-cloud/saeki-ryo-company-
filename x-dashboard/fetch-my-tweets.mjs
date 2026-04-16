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

try {
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

  // 自分の投稿を保存
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

  // いいねした投稿を取得（参考スタイル用）
  try {
    const liked = await client.v2.userLikedTweets(me.data.id, {
      max_results: 50,
      "tweet.fields": ["created_at", "public_metrics", "author_id"],
    });
    const likedTweets = liked.data.data || [];
    console.log(`❤️  いいね取得: ${likedTweets.length}件`);

    const likedOutput = {
      fetched_at: new Date().toISOString(),
      tweets: likedTweets.map(t => ({
        id: t.id,
        text: t.text,
        created_at: t.created_at,
      })),
    };
    fs.writeFileSync(
      path.join(__dirname, "data/liked-tweets.json"),
      JSON.stringify(likedOutput, null, 2)
    );
    console.log("✅ data/liked-tweets.json に保存しました");
  } catch (e) {
    console.warn("⚠️  いいね取得スキップ:", e.message);
  }

  // 参照アカウントの投稿を取得（エンゲージメント分析用）
  try {
    const refConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data/reference-accounts.json"), "utf-8")
    );
    const results = [];

    for (const account of refConfig.accounts) {
      try {
        const user = await client.v2.userByUsername(account.username);
        if (!user.data) { console.warn(`⚠️  @${account.username} 見つからず`); continue; }

        const tl = await client.v2.userTimeline(user.data.id, {
          max_results: 20,
          exclude: ["retweets", "replies"],
          "tweet.fields": ["created_at", "public_metrics"],
        });
        const userTweets = (tl.data.data || [])
          .filter(t => t.public_metrics.impression_count > 0)
          .sort((a, b) => b.public_metrics.impression_count - a.public_metrics.impression_count)
          .slice(0, 5)
          .map(t => ({
            text: t.text,
            created_at: t.created_at,
            metrics: t.public_metrics,
          }));

        results.push({ username: account.username, note: account.note, tweets: userTweets });
        console.log(`✅ @${account.username}: ${userTweets.length}件取得`);
      } catch (e) {
        console.warn(`⚠️  @${account.username} スキップ: ${e.message}`);
      }
    }

    fs.writeFileSync(
      path.join(__dirname, "data/reference-tweets.json"),
      JSON.stringify({ fetched_at: new Date().toISOString(), accounts: results }, null, 2)
    );
    console.log("✅ data/reference-tweets.json に保存しました");
  } catch (e) {
    console.warn("⚠️  参照アカウント取得スキップ:", e.message);
  }

  // 文体サンプルを表示
  console.log("\n--- 直近20件のツイート ---");
  tweets.slice(0, 20).forEach((t, i) => {
    console.log(`[${i+1}] ${t.text.slice(0, 80)}${t.text.length > 80 ? "..." : ""}`);
  });

} catch (e) {
  console.warn(`⚠️  ツイート取得スキップ（エラー）: ${e.message}`);
  console.warn("  既存の data/my-tweets.json を使用して続行します");
  process.exit(0);
}
