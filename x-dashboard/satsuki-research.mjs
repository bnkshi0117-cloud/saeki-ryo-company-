/**
 * さつき リサーチ・分析スクリプト
 *
 * 1. 投稿済みスレッドのインサイト（いいね・表示数・返信数）を取得
 * 2. テーマ別パフォーマンスをClaude APIで分析
 * 3. 結果を data/satsuki-trends.json に保存 → 投稿生成で活用
 *
 * 使い方：
 *   node satsuki-research.mjs
 *   node satsuki-research.mjs --dry-run  → 取得のみ（保存しない）
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const TOKEN = process.env.THREADS_ACCESS_TOKEN;
const POSTS_FILE = path.join(__dirname, "data/satsuki-posts.json");
const TRENDS_FILE = path.join(__dirname, "data/satsuki-trends.json");
const API_BASE = "https://graph.threads.net/v1.0";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── テーマ判定 ──
function detectTheme(text) {
  if (/きなこ|🐱/.test(text)) return "cat";
  if (/ダイソー|セリア|100均|キャンドゥ|スリーコインズ/.test(text)) return "100yen";
  if (/業スー|業務スーパー/.test(text)) return "gyosu";
  if (/節約|ポイ活|楽天|ハピタス|ふるさと/.test(text)) return "savings";
  if (/ごはん|料理|レシピ|炒め|チャーハン|スープ|弁当|お昼/.test(text)) return "food";
  if (/在宅|仕事|勤務|残業|会社/.test(text)) return "work";
  if (/甥|姪|兄夫婦の子|子どもたちと|公園|児童館/.test(text)) return "family";
  if (/映画|カフェ|おでかけ|ひとり時間/.test(text)) return "leisure";
  return "other";
}

const THEME_LABELS = {
  cat: "きなこ（猫）",
  "100yen": "100均",
  gyosu: "業務スーパー",
  savings: "節約・ポイ活",
  food: "食事・料理",
  work: "仕事・在宅",
  family: "甥っ子・姪っ子",
  leisure: "おでかけ・ひとり時間",
  other: "その他",
};

// ── Threads インサイト取得（失敗してもスキップ）──
async function fetchInsights(threadId) {
  try {
    const res = await fetch(
      `${API_BASE}/${threadId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${TOKEN}`
    );
    const data = await res.json();
    if (!res.ok || data.error) return null;

    const metrics = {};
    for (const item of data.data || []) {
      metrics[item.name] = item.total_value?.value ?? 0;
    }
    return metrics;
  } catch {
    return null;
  }
}

// ── Claude でパターン分析 ──
async function analyzeWithClaude(postData) {
  const themeCounts = {};
  const themeScores = {};

  for (const p of postData) {
    const t = p.theme;
    themeCounts[t] = (themeCounts[t] || 0) + 1;
    themeScores[t] = (themeScores[t] || 0) + p.score;
  }

  // テーマ別平均スコア
  const themeAvg = Object.entries(themeCounts).map(([t, count]) => ({
    theme: t,
    label: THEME_LABELS[t] || t,
    count,
    avgScore: themeScores[t] / count,
  })).sort((a, b) => b.avgScore - a.avgScore);

  const top5Posts = [...postData].sort((a, b) => b.score - a.score).slice(0, 5);
  const low3Posts = [...postData].sort((a, b) => a.score - b.score).slice(0, 3);

  const prompt = `さつき（32歳・埼玉一人暮らし会社員・猫きなこ）のThreadsアカウントの投稿分析をしてください。

【テーマ別パフォーマンス（スコア = いいね×3 + 返信×5 + リポスト×4 + 表示数×0.1）】
${themeAvg.map(t => `${t.label}: 投稿${t.count}件, 平均スコア${t.avgScore.toFixed(1)}`).join("\n")}

【高パフォーマンス投稿（上位5件）】
${top5Posts.map(p => `[${THEME_LABELS[p.theme]}] スコア${p.score.toFixed(1)}: ${p.text}`).join("\n")}

【低パフォーマンス投稿（下位3件）】
${low3Posts.map(p => `[${THEME_LABELS[p.theme]}] スコア${p.score.toFixed(1)}: ${p.text}`).join("\n")}

以下のJSON形式のみで返答してください（説明不要）：
{
  "topThemes": ["最もエンゲージメントが高いテーマ（最大3つ、日本語で）"],
  "avoidThemes": ["エンゲージメントが低いテーマ（最大2つ、日本語で）"],
  "viralPatterns": ["バズりやすい投稿パターン（最大4つ、具体的に）"],
  "insights": "全体分析（80字以内）",
  "nextGuidance": "次回投稿への具体的指示（100字以内）"
}`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  return { analysis: JSON.parse(raw), themeAvg };
}

// ── メイン ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("🔍 さつきリサーチ開始\n");

  const data = JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
  const postedPosts = data.posts.filter(p => p.status === "posted" && p.thread_id);

  if (postedPosts.length === 0) {
    console.log("投稿済み記事なし。スキップ。");
    return;
  }

  console.log(`📈 ${postedPosts.length}件の投稿を分析中...`);

  // インサイト取得 & スコア計算
  const postData = [];
  for (const post of postedPosts) {
    const metrics = await fetchInsights(post.thread_id);
    const score = metrics
      ? (metrics.likes || 0) * 3 + (metrics.replies || 0) * 5 + (metrics.reposts || 0) * 4 + (metrics.views || 0) * 0.1
      : 0;

    postData.push({
      id: post.id,
      theme: detectTheme(post.text),
      text: post.text.replace(/\n/g, " ").substring(0, 80),
      score,
      hasMetrics: !!metrics,
      ...(metrics || {}),
    });

    await new Promise(r => setTimeout(r, 300));
  }

  const hasMetrics = postData.some(p => p.hasMetrics);
  if (!hasMetrics) {
    console.log("⚠️  インサイトAPIが取得できませんでした。テキスト分析のみで実行します。");
  }

  console.log("🤖 Claude でパターン分析中...");
  let result;
  try {
    result = await analyzeWithClaude(postData);
  } catch (e) {
    console.error(`❌ 分析失敗: ${e.message}`);
    process.exit(1);
  }

  const { analysis, themeAvg } = result;

  // テーマ分布サマリー
  console.log("\n📊 テーマ別投稿数:");
  for (const t of themeAvg) {
    console.log(`   ${t.label}: ${t.count}件 (平均スコア: ${t.avgScore.toFixed(1)})`);
  }

  console.log(`\n💡 インサイト: ${analysis.insights}`);
  console.log(`📝 次の指示: ${analysis.nextGuidance}`);

  if (dryRun) {
    console.log("\n✅ ドライラン完了（保存はしていません）");
    return;
  }

  // satsuki-trends.json に保存
  const trends = {
    updatedAt: new Date().toISOString().slice(0, 10),
    postCount: postedPosts.length,
    hasRealMetrics: hasMetrics,
    themeDistribution: Object.fromEntries(themeAvg.map(t => [t.theme, { count: t.count, avgScore: t.avgScore }])),
    ...analysis,
  };

  fs.writeFileSync(TRENDS_FILE, JSON.stringify(trends, null, 2), "utf-8");
  console.log(`\n✅ リサーチ完了 → data/satsuki-trends.json を更新しました`);
}

main().catch(e => {
  console.error(`\n❌ 致命的エラー: ${e.message}`);
  process.exit(1);
});
