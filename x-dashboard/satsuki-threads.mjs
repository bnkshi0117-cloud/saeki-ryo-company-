/**
 * さつき（@satsuki_kurashitime）Threads投稿・返信ツール
 *
 * 使い方：
 *   node satsuki-threads.mjs                          → 通常投稿（キューから1件）
 *   node satsuki-threads.mjs --dry-run                → ドライラン（投稿しない）
 *   node satsuki-threads.mjs --check-replies          → 未返信コメント一覧表示
 *   node satsuki-threads.mjs --reply <thread_id> "<text>"  → 指定スレッドに返信
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const TOKEN = process.env.THREADS_ACCESS_TOKEN;
const POSTS_FILE = path.join(__dirname, "data/satsuki-posts.json");
const API_BASE = "https://graph.threads.net/v1.0";

if (!TOKEN) {
  console.error("❌ THREADS_ACCESS_TOKENが設定されていません");
  process.exit(1);
}

// ── ユーザーID取得 ──
async function getUserId() {
  const res = await fetch(`${API_BASE}/me?fields=id,username&access_token=${TOKEN}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "ユーザーID取得失敗");
  console.log(`👤 ユーザー: @${data.username} (ID: ${data.id})`);
  return { id: data.id, username: data.username };
}

// ── 投稿コンテナ作成 ──
async function createContainer(userId, text, imageUrl = null, replyToId = null) {
  const body = {
    media_type: imageUrl ? "IMAGE" : "TEXT",
    text,
    access_token: TOKEN,
    ...(imageUrl && { image_url: imageUrl }),
    ...(replyToId && { reply_to_id: replyToId }),
  };

  const res = await fetch(`${API_BASE}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "コンテナ作成失敗");
  return data.id;
}

// ── 投稿公開 ──
async function publishThread(userId, creationId) {
  const res = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: TOKEN }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "公開失敗");
  return data.id;
}

// ── キュー管理 ──
function loadPosts() {
  return JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(data) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function getNextPost(data) {
  return data.posts.find(p => p.status === "pending") || null;
}

// ── スレッドの返信を取得 ──
async function getThreadReplies(threadId) {
  const res = await fetch(
    `${API_BASE}/${threadId}/replies?fields=id,text,username,timestamp&access_token=${TOKEN}`
  );
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "返信取得失敗");
  return data.data || [];
}

// ── 未返信コメント確認 ──
async function checkReplies() {
  console.log("💬 未返信コメントを確認中...\n");

  const { id: userId, username: myUsername } = await getUserId();
  const data = loadPosts();
  const postedPosts = data.posts.filter(p => p.status === "posted" && p.thread_id);

  if (postedPosts.length === 0) {
    console.log("投稿済みのスレッドがありません。");
    return;
  }

  let foundAny = false;

  for (const post of postedPosts) {
    let replies;
    try {
      replies = await getThreadReplies(post.thread_id);
    } catch (e) {
      console.warn(`⚠️  ID${post.id} の返信取得失敗: ${e.message}`);
      continue;
    }

    if (replies.length === 0) continue;

    // 自分（さつき）が返信済みかチェック
    const myReplies = replies.filter(r => r.username === myUsername);
    const othersReplies = replies.filter(r => r.username !== myUsername);

    if (othersReplies.length === 0) continue;

    const hasReplied = myReplies.length > 0;
    const statusMark = hasReplied ? "✅ 返信済み" : "❗ 未返信";

    console.log(`─────────────────────────────────`);
    console.log(`📝 投稿ID${post.id} [thread_id: ${post.thread_id}] ${statusMark}`);
    console.log(`本文: ${post.text.split("\n")[0]}...`);
    console.log(`コメント${othersReplies.length}件:`);
    for (const r of othersReplies) {
      const time = new Date(r.timestamp).toLocaleString("ja-JP");
      console.log(`  @${r.username} (${time}): ${r.text}`);
      console.log(`  reply_id: ${r.id}`);
    }

    if (!hasReplied) {
      foundAny = true;
      console.log(`\n  👉 返信するには:`);
      console.log(`  node satsuki-threads.mjs --reply ${post.thread_id} "返信テキスト"`);
    }
    console.log();
  }

  if (!foundAny) {
    console.log("✅ 未返信のコメントはありません。");
  }
}

// ── コメントへの返信投稿 ──
async function postReply(replyToId, text) {
  console.log(`💬 返信投稿を開始します...`);
  console.log(`宛先スレッドID: ${replyToId}`);
  console.log(`返信テキスト: ${text}\n`);

  const { id: userId } = await getUserId();

  console.log("⏳ 返信コンテナ作成中...");
  const creationId = await createContainer(userId, text, null, replyToId);

  console.log("⏳ 1秒待機...");
  await new Promise(r => setTimeout(r, 1000));

  console.log("⏳ 公開中...");
  const threadId = await publishThread(userId, creationId);

  console.log(`\n✅ 返信完了！`);
  console.log(`   返信スレッドID: ${threadId}`);
  console.log(`   投稿時刻: ${new Date().toLocaleString("ja-JP")}`);
}

// ── 通常投稿 ──
async function postNext(dryRun) {
  const data = loadPosts();
  const post = getNextPost(data);

  if (!post) {
    console.log("✅ 投稿キューが空です。新しい投稿を追加してください。");
    const done = data.posts.filter(p => p.status === "posted").length;
    const skipped = data.posts.filter(p => p.status === "skipped").length;
    console.log(`📊 投稿済み: ${done}件 / スキップ: ${skipped}件`);
    return;
  }

  console.log(`\n📝 次の投稿 (ID: ${post.id}):`);
  console.log("─".repeat(40));
  console.log(post.text);
  console.log("─".repeat(40));

  if (dryRun) {
    console.log("\n✅ ドライラン完了（投稿はしていません）");
    return;
  }

  const { id: userId } = await getUserId();

  const hasImage = !!post.image_url;
  console.log(`\n⏳ 投稿コンテナ作成中...${hasImage ? "（画像付き）" : ""}`);
  const creationId = await createContainer(userId, post.text, post.image_url || null);

  const wait = hasImage ? 30000 : 1000;
  console.log(`⏳ ${hasImage ? "30秒" : "1秒"}待機中...`);
  await new Promise(r => setTimeout(r, wait));

  console.log("⏳ 公開中...");
  const threadId = await publishThread(userId, creationId);

  const now = new Date().toISOString();
  post.status = "posted";
  post.posted_at = now;
  post.thread_id = threadId;
  data.lastPostedAt = now;
  savePosts(data);

  console.log(`\n✅ 投稿完了！`);
  console.log(`   スレッドID: ${threadId}`);
  console.log(`   投稿時刻: ${new Date(now).toLocaleString("ja-JP")}`);

  const remaining = data.posts.filter(p => p.status === "pending").length;
  console.log(`   残りキュー: ${remaining}件`);
}

// ── メイン ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("🧵 さつきスレッズツール起動");

  if (args.includes("--check-replies")) {
    await checkReplies();
    return;
  }

  if (args.includes("--reply")) {
    const idx = args.indexOf("--reply");
    const replyToId = args[idx + 1];
    const text = args[idx + 2];
    if (!replyToId || !text) {
      console.error("❌ 使い方: --reply <thread_id> \"<返信テキスト>\"");
      process.exit(1);
    }
    await postReply(replyToId, text);
    return;
  }

  if (dryRun) console.log("🔍 ドライランモード（実際には投稿しません）");
  await postNext(dryRun);
}

main().catch(e => {
  console.error(`\n❌ エラー: ${e.message}`);
  process.exit(1);
});
