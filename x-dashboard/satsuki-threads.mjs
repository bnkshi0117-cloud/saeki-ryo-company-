/**
 * さつき（@satsuki_kurashitime）Threads自動投稿スクリプト
 * 使い方：node satsuki-threads.mjs
 * キューから次のpending投稿を1件取り出して投稿する
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
  return data.id;
}

// ── 投稿コンテナ作成 ──
async function createContainer(userId, text) {
  const res = await fetch(`${API_BASE}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "TEXT",
      text,
      access_token: TOKEN,
    }),
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
    body: JSON.stringify({
      creation_id: creationId,
      access_token: TOKEN,
    }),
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

// ── メイン ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("🧵 さつきスレッズ投稿ツール起動");
  if (dryRun) console.log("🔍 ドライランモード（実際には投稿しません）");

  const data = loadPosts();
  const post = getNextPost(data);

  if (!post) {
    console.log("✅ 投稿キューが空です。新しい投稿を追加してください。");

    // 統計表示
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

  try {
    const userId = await getUserId();

    // コンテナ作成
    console.log("\n⏳ 投稿コンテナ作成中...");
    const creationId = await createContainer(userId, post.text);

    // 少し待つ（API推奨）
    await new Promise(r => setTimeout(r, 1000));

    // 公開
    console.log("⏳ 公開中...");
    const threadId = await publishThread(userId, creationId);

    // キュー更新
    const now = new Date().toISOString();
    post.status = "posted";
    post.posted_at = now;
    post.thread_id = threadId;
    data.lastPostedAt = now;
    savePosts(data);

    console.log(`\n✅ 投稿完了！`);
    console.log(`   スレッドID: ${threadId}`);
    console.log(`   投稿時刻: ${new Date(now).toLocaleString("ja-JP")}`);

    // 残りキュー表示
    const remaining = data.posts.filter(p => p.status === "pending").length;
    console.log(`   残りキュー: ${remaining}件`);

  } catch (e) {
    console.error(`\n❌ 投稿失敗: ${e.message}`);
    process.exit(1);
  }
}

main();
