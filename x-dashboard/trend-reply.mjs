/**
 * トレンド返信システム
 * 使い方:
 *   node trend-reply.mjs generate  → 候補生成・Slack通知
 *   node trend-reply.mjs check     → Slack返信を確認して処理
 *
 * ⚠️ 佐伯さんの承認なしには絶対に投稿しない設計
 */

import Anthropic from "@anthropic-ai/sdk";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PENDING_FILE   = path.join(__dirname, "data/pending-reply.json");
const SLACK_TOKEN    = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL  = process.env.SLACK_CHANNEL_ID;
const SLACK_WEBHOOK  = process.env.SLACK_WEBHOOK_URL;

const action = process.argv[2];
if (!["generate", "check", "action"].includes(action)) {
  console.error("使い方: node trend-reply.mjs [generate|check|action]");
  process.exit(1);
}

// ── ファイル読み書き ──────────────────────────────────────────
function readPending() {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8")); }
  catch { return null; }
}
function writePending(data) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

// ── Twitter クライアント ──────────────────────────────────────
function getTwitter() {
  return new TwitterApi({
    appKey:       process.env.X_CONSUMER_KEY,
    appSecret:    process.env.X_CONSUMER_SECRET,
    accessToken:  process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

// ── トレンドツイート検索 ──────────────────────────────────────
async function findTrendingTweet(twitter) {
  // Basic APIプランで使えるシンプルなクエリ（min_favesは上位プランのみ）
  const queries = [
    "lang:ja -is:retweet (事件 OR 事故 OR 速報 OR 話題)",
    "lang:ja -is:retweet (AI OR ChatGPT OR Claude OR 生成AI)",
  ];

  for (const query of queries) {
    try {
      console.log(`🔍 検索: ${query}`);
      const result = await twitter.v2.search(query, {
        max_results: 10,
        "tweet.fields": ["public_metrics", "created_at"],
        sort_order: "relevancy",
      });
      const tweets = result.data?.data || [];
      console.log(`  → ${tweets.length}件取得`);
      if (tweets.length === 0) continue;

      // いいね数でソートして上位を返す
      const sorted = tweets.sort((a, b) =>
        (b.public_metrics.like_count + b.public_metrics.reply_count) -
        (a.public_metrics.like_count + a.public_metrics.reply_count)
      );
      console.log(`  → 最高エンゲージメント: ${sorted[0].public_metrics.like_count}いいね`);
      return sorted[0];
    } catch (e) {
      console.warn(`⚠️  検索失敗: ${e.message}`);
    }
  }
  return null;
}

// ── Claude で返信案生成 ───────────────────────────────────────
async function generateReply(tweetText, instruction = null) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content = instruction
    ? `元ツイート：「${tweetText}」\n\n現在の引用コメント：「${readPending()?.draft || ""}」\n\n修正指示：${instruction}\n\n修正後のコメント文のみ出力。140文字以内。`
    : `あなたは佐伯亮（沖縄在住の会社員・AI×副業の実験者）です。
以下のツイートを引用リツイートするコメントを1件書いてください。

ツイート：「${tweetText}」

【ルール】
- 140文字以内
- 語尾は「〜かな。」「〜んだよね。」「〜ある。」「〜実感あります。」など
- 「です」「ます」「思います」などの丁寧語禁止
- 共感・ツッコミ・自分の見解のどれか
- 批判・煽り禁止
- 絵文字は0〜1個

コメント文のみ出力（説明不要）`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [{ role: "user", content }],
  });

  return msg.content[0].text.trim();
}

// ── Slack にメッセージ送信（Bot Token 使用） ──────────────────
async function postToSlack(payload) {
  console.log(`📤 Slack送信: TOKEN=${SLACK_TOKEN ? "あり" : "なし"}, CHANNEL=${SLACK_CHANNEL || "なし"}, WEBHOOK=${SLACK_WEBHOOK ? "あり" : "なし"}`);

  // Bot Token で送信（スレッド返信に必要）
  if (SLACK_TOKEN && SLACK_CHANNEL) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: SLACK_CHANNEL, ...payload }),
      });
      const data = await res.json();
      if (!data.ok) {
        console.warn(`⚠️  Bot Token送信失敗: ${data.error} → Webhookにフォールバック`);
      } else {
        console.log(`✅ Bot Token送信成功 (ts: ${data.ts})`);
        return data.ts;
      }
    } catch (e) {
      console.warn(`⚠️  Bot Token送信エラー: ${e.message} → Webhookにフォールバック`);
    }
  }

  // Webhook フォールバック（thread_tsは取れないがメッセージは届く）
  if (SLACK_WEBHOOK) {
    const res = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`✅ Webhook送信完了 (status: ${res.status})`);
    return null;
  }

  throw new Error("Slack設定が見つかりません（SLACK_BOT_TOKEN または SLACK_WEBHOOK_URL が必要）");
}

// ── Slack スレッド返信を取得 ──────────────────────────────────
async function getThreadReplies(threadTs) {
  if (!SLACK_TOKEN || !SLACK_CHANNEL) return [];
  const res = await fetch(
    `https://slack.com/api/conversations.replies?channel=${SLACK_CHANNEL}&ts=${threadTs}`,
    { headers: { "Authorization": `Bearer ${SLACK_TOKEN}` } }
  );
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API エラー: ${data.error}`);
  // 最初のメッセージ（本文）を除いたスレッド返信のみ返す
  return (data.messages || []).slice(1);
}

// ── Slack スレッドに返信 ──────────────────────────────────────
async function replyToThread(threadTs, text) {
  await postToSlack({ thread_ts: threadTs, text });
}

// ── 候補生成（generate） ──────────────────────────────────────
if (action === "generate") {
  const pending = readPending();
  if (pending?.status === "pending") {
    console.log("⏳ まだ承認待ちの返信があります。新しい候補はスキップします。");
    process.exit(0);
  }

  const twitter = getTwitter();
  console.log("🔍 トレンドツイートを検索中...");
  const tweet = await findTrendingTweet(twitter);

  if (!tweet) {
    console.log("📭 返信対象ツイートが見つかりませんでした");
    process.exit(0);
  }
  console.log(`🎯 対象: ${tweet.text.slice(0, 60)}...`);

  console.log("🤖 返信案を生成中...");
  const draft = await generateReply(tweet.text);
  console.log(`✍️  返信案: ${draft}`);

  const tweetUrl = `https://x.com/i/web/status/${tweet.id}`;
  const threadTs = await postToSlack({
    text: "🔥 トレンド返信候補",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🔥 トレンド返信候補" } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*元ツイート:*\n${tweet.text.slice(0, 120)}${tweet.text.length > 120 ? "..." : ""}\n<${tweetUrl}|ツイートを見る>`,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*返信案:*\n\`\`\`${draft}\`\`\`` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "─────────────────",
            `✅ *承認* → <https://github.com/bnkshi0117-cloud/saeki-ryo-company-/actions/workflows/trend-reply-action.yml|このリンク> を開いて *Run workflow* → action: *approve*`,
            `✏️ *修正* → 同じリンクを開いて *Run workflow* → action: *modify* → instruction欄に指示を記入`,
            `❌ *キャンセル* → 同じリンクを開いて *Run workflow* → action: *cancel*`,
          ].join("\n"),
        },
      },
    ],
  });

  writePending({
    tweet_id: tweet.id,
    tweet_text: tweet.text,
    draft,
    thread_ts: threadTs,
    status: "pending",
    created_at: new Date().toISOString(),
  });

  console.log("✅ Slackに通知しました");
}

// ── Slack 返信確認・処理（check） ─────────────────────────────
if (action === "check") {
  const pending = readPending();

  if (!pending || pending.status !== "pending") {
    console.log("📭 承認待ちの返信なし");
    process.exit(0);
  }

  if (!pending.thread_ts) {
    console.log("⚠️  thread_ts がありません（Webhook のみ設定の場合は確認不可）");
    process.exit(0);
  }

  console.log("💬 Slackのスレッドを確認中...");
  let replies;
  try {
    replies = await getThreadReplies(pending.thread_ts);
  } catch (e) {
    console.error(`❌ Slack確認失敗: ${e.message}`);
    process.exit(1);
  }

  if (replies.length === 0) {
    console.log("💬 返信なし、引き続き待機");
    process.exit(0);
  }

  // 既読済みの返信を除外（processed_replies で管理）
  const processed = new Set(pending.processed_replies || []);
  const newReplies = replies.filter(r => !processed.has(r.ts));

  if (newReplies.length === 0) {
    console.log("💬 新しい返信なし");
    process.exit(0);
  }

  const lastReply = newReplies[newReplies.length - 1];
  const text = lastReply.text?.trim() || "";
  console.log(`📩 新しい返信: ${text}`);

  // 処理済みに追加
  pending.processed_replies = [...processed, ...newReplies.map(r => r.ts)];

  const upperText = text.toUpperCase();

  // ✅ 承認
  if (upperText === "OK" || text === "承認" || text === "OK") {
    console.log("✅ 承認されました。投稿します...");
    const twitter = getTwitter();
    await twitter.v2.tweet({
      text: pending.draft,
      reply: { in_reply_to_tweet_id: pending.tweet_id },
    });
    pending.status = "posted";
    pending.posted_at = new Date().toISOString();
    writePending(pending);
    await replyToThread(pending.thread_ts, `✅ 投稿しました！\n返信内容: 「${pending.draft}」`);
    console.log("✅ 投稿完了");

  // ❌ キャンセル
  } else if (upperText === "NG" || text === "キャンセル" || text === "NG") {
    console.log("❌ キャンセルされました");
    pending.status = "cancelled";
    writePending(pending);
    await replyToThread(pending.thread_ts, "❌ キャンセルしました");

  // ✏️ 修正指示
  } else {
    console.log(`✏️  修正指示として処理: ${text}`);
    const newDraft = await generateReply(pending.tweet_text, text);
    pending.draft = newDraft;
    writePending(pending);
    await replyToThread(
      pending.thread_ts,
      `✏️ 修正しました:\n\`\`\`${newDraft}\`\`\`\n\n投稿する場合は *OK*、さらに修正は内容を返信、キャンセルは *NG*`
    );
    console.log("✏️  修正案をSlackに送りました");
  }
}

// ── GitHub Actions 経由の承認・修正・キャンセル（action） ──────
if (action === "action") {
  const pending = readPending();
  if (!pending || pending.status !== "pending") {
    console.log("📭 承認待ちの返信なし");
    process.exit(0);
  }

  const actionInput = process.env.ACTION_INPUT || "approve";
  const instruction = process.env.INSTRUCTION_INPUT || "";

  console.log(`📩 アクション: ${actionInput}${instruction ? ` / 指示: ${instruction}` : ""}`);

  if (actionInput === "approve") {
    console.log("✅ 承認。投稿します...");
    const twitter = getTwitter();
    await twitter.v2.tweet({
      text: pending.draft,
      quote_tweet_id: pending.tweet_id,
    });
    pending.status = "posted";
    pending.posted_at = new Date().toISOString();
    writePending(pending);
    await postToSlack({
      text: `✅ 投稿しました！\n返信内容:\n\`\`\`${pending.draft}\`\`\`\n元ツイート: https://x.com/i/web/status/${pending.tweet_id}`,
    });
    console.log("✅ 投稿完了");

  } else if (actionInput === "cancel") {
    pending.status = "cancelled";
    writePending(pending);
    await postToSlack({ text: "❌ キャンセルしました" });
    console.log("❌ キャンセル完了");

  } else if (actionInput === "modify") {
    if (!instruction) {
      console.error("❌ 修正指示が空です。instruction欄に指示を入力してください。");
      process.exit(1);
    }
    console.log("✏️  修正中...");
    const newDraft = await generateReply(pending.tweet_text, instruction);
    pending.draft = newDraft;
    writePending(pending);
    await postToSlack({
      text: [
        `✏️ 修正しました（指示: ${instruction}）`,
        `\`\`\`${newDraft}\`\`\``,
        "",
        `✅ 承認 → <https://github.com/bnkshi0117-cloud/saeki-ryo-company-/actions/workflows/trend-reply-action.yml|リンク> で approve`,
        `✏️ さらに修正 → 同リンクで modify`,
        `❌ キャンセル → 同リンクで cancel`,
      ].join("\n"),
    });
    console.log("✏️  修正案をSlackに送りました");
  }
}
