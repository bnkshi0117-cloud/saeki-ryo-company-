/**
 * さつき（@satsuki_kurashitime）Threads 自動返信スクリプト
 *
 * 投稿済みスレッドへのコメントを取得し、Claude APIで返信文を生成して自動投稿する。
 * 返信済みコメントIDは data/satsuki-replied.json に記録して重複防止。
 *
 * 使い方：
 *   node satsuki-reply.mjs           → 未返信コメントに自動返信
 *   node satsuki-reply.mjs --dry-run → 返信文を生成するだけ（投稿しない）
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const THREADS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const POSTS_FILE = path.join(__dirname, "data/satsuki-posts.json");
const REPLIED_FILE = path.join(__dirname, "data/satsuki-replied.json");
const API_BASE = "https://graph.threads.net/v1.0";

if (!THREADS_TOKEN) {
  console.error("❌ THREADS_ACCESS_TOKENが設定されていません");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEYが設定されていません");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// さつきのキャラクター設定
const SATSUKI_SYSTEM = `あなたは橘さつき（32歳・埼玉・一人暮らし会社員・猫のきなこと同居）です。
Threadsに日常や猫・100均・食事などを投稿しており、フォロワーからのコメントに返信してください。

キャラクター設定:
- 埼玉で一人暮らしの32歳会社員
- 猫のきなこ（茶白・オス）と同居
- 日常の小さな発見や100均・スーパーのお気に入り商品を投稿
- 明るくて親しみやすい、自然な30代女性の口調
- 「〜だよね」「〜かな」「〜してみた」「〜な笑」など自然な言葉遣い
- 絵文字を適度に使う（🐱😊✨😂など）
- AIや自動化については一切触れない

返信のルール:
- 1〜3文の短い返信
- コメントの内容に自然に共感・反応する
- 過度な敬語は使わない（フレンドリーに）
- 「ありがとうございます！」だけで終わらず、会話を広げる一言を添える
- 猫の話には特に嬉しそうに反応する`;

// ── ユーザーID取得 ──
async function getUserInfo() {
  const res = await fetch(`${API_BASE}/me?fields=id,username&access_token=${THREADS_TOKEN}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "ユーザーID取得失敗");
  return { id: data.id, username: data.username };
}

// ── スレッドの返信取得 ──
async function getThreadReplies(threadId) {
  const res = await fetch(
    `${API_BASE}/${threadId}/replies?fields=id,text,username,timestamp&access_token=${THREADS_TOKEN}`
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    console.warn(`⚠️  replies取得失敗 (${threadId}): ${data.error?.message}`);
    return [];
  }
  return data.data || [];
}

// ── 返信済みID管理 ──
function loadReplied() {
  if (!fs.existsSync(REPLIED_FILE)) return { replied_ids: [] };
  return JSON.parse(fs.readFileSync(REPLIED_FILE, "utf-8"));
}

function saveReplied(data) {
  fs.writeFileSync(REPLIED_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ── Claude APIで返信文生成 ──
async function generateReply(postText, commentText, commentUsername) {
  const prompt = `以下の投稿へのコメントに、さつきとして自然に返信してください。

【さつきの投稿】
${postText}

【コメント（@${commentUsername}さん）】
${commentText}

返信文のみを出力してください（説明や前置き不要）。`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: SATSUKI_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].text.trim();
}

// ── 返信を投稿 ──
async function postReply(userId, replyToId, text) {
  // コンテナ作成
  const createRes = await fetch(`${API_BASE}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "TEXT",
      text,
      reply_to_id: replyToId,
      access_token: THREADS_TOKEN,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || createData.error) throw new Error(createData.error?.message || "コンテナ作成失敗");

  await new Promise(r => setTimeout(r, 1000));

  // 公開
  const pubRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: createData.id, access_token: THREADS_TOKEN }),
  });
  const pubData = await pubRes.json();
  if (!pubRes.ok || pubData.error) throw new Error(pubData.error?.message || "公開失敗");

  return pubData.id;
}

// ── メイン ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("💬 さつき自動返信ツール起動");
  if (dryRun) console.log("🔍 ドライランモード（実際には投稿しません）\n");

  const { id: userId, username: myUsername } = await getUserInfo();

  const postsData = JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
  const repliedData = loadReplied();
  const repliedIds = new Set(repliedData.replied_ids);

  const postedPosts = postsData.posts.filter(p => p.status === "posted" && p.thread_id);
  console.log(`📋 投稿済み: ${postedPosts.length}件をチェック中...\n`);

  let replyCount = 0;

  for (const post of postedPosts) {
    let replies;
    try {
      replies = await getThreadReplies(post.thread_id);
    } catch (e) {
      console.warn(`⚠️  スキップ (ID${post.id}): ${e.message}`);
      continue;
    }

    // 他のユーザーからのコメントのみ対象
    const othersComments = replies.filter(
      r => r.username !== myUsername && !repliedIds.has(r.id)
    );

    if (othersComments.length === 0) continue;

    console.log(`📝 ID${post.id}: ${othersComments.length}件の未返信コメント`);

    for (const comment of othersComments) {
      console.log(`  @${comment.username}: "${comment.text}"`);

      // 返信文生成
      let replyText;
      try {
        replyText = await generateReply(post.text, comment.text, comment.username);
        console.log(`  → 返信案: "${replyText}"`);
      } catch (e) {
        console.error(`  ❌ 返信文生成失敗: ${e.message}`);
        continue;
      }

      if (!dryRun) {
        try {
          const replyThreadId = await postReply(userId, comment.id, replyText);
          console.log(`  ✅ 返信投稿完了 (thread_id: ${replyThreadId})`);

          // 返信済みとして記録
          repliedIds.add(comment.id);
          repliedData.replied_ids.push(comment.id);
          repliedData.last_replied_at = new Date().toISOString();
          saveReplied(repliedData);

          replyCount++;

          // 連続投稿を避けるため少し待つ
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.error(`  ❌ 返信投稿失敗: ${e.message}`);
        }
      } else {
        replyCount++;
      }
    }
  }

  console.log(`\n✅ 完了。返信${dryRun ? "予定" : "済み"}: ${replyCount}件`);
}

main().catch(e => {
  console.error(`\n❌ エラー: ${e.message}`);
  process.exit(1);
});
