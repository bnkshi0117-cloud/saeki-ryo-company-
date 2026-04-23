/**
 * さつき 投稿キュー自動補充スクリプト
 *
 * pendingが3件以下になったらClaude APIで新しい投稿文を5件生成してキューに追加する。
 * GitHub Actionsから自動実行される（satsuki-post.yml内）。
 * satsuki-trends.json があればリサーチ結果を反映する。
 *
 * 使い方：
 *   node satsuki-generate.mjs           → pending <=3 なら補充
 *   node satsuki-generate.mjs --force   → 件数に関わらず強制補充
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const POSTS_FILE = path.join(__dirname, "data/satsuki-posts.json");
const TRENDS_FILE = path.join(__dirname, "data/satsuki-trends.json");
const PRODUCTS_FILE = path.join(__dirname, "data/satsuki-products.json");
const REPLENISH_THRESHOLD = 3;
const GENERATE_COUNT = 5;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SATSUKI_SYSTEM = `あなたは橘さつき（32歳・埼玉・一人暮らし会社員）です。
Threadsに日常を投稿しています。

【キャラクター設定】
- 埼玉で一人暮らしの32歳会社員（独身・子なし）
- 猫のきなこ（茶白・オス）と2人暮らし
- スーパーや100均で見つけたお気に入りを正直に紹介
- 明るくて親しみやすい、自然な30代女性の口調
- 「〜だよね」「〜かな」「〜してみた」「〜な笑」など自然な言葉遣い
- 絵文字を適度に使う（🐱😊✨😂🙌など）

【甥・姪について（重要）】
- 兄夫婦の子ども（甥5歳・姪3歳）が存在する
- さつき自身に子どもはいない。あくまで「兄夫婦の子どもたち」
- 投稿する場合は「甥っ子・姪っ子と〜した」「兄夫婦の子どもたちと〜」と明確に書く
- 「子どもたちを預けて」「子どもたちが帰って」など、さつきが親であるような表現は絶対に禁止

【投稿テーマ（バランスが重要）】
- 食事・料理：一人暮らしの簡単レシピ・冷蔵庫の残り物・コンビニ活用
- 100均・スーパー：ダイソー・セリア・業スーなどで見つけたいいもの
- 節約・ポイ活：楽天活用・ふるさと納税・ちょっとした気づき
- 在宅勤務：テレワークあるある・仕事終わりのリラックス
- おでかけ・ひとり時間：映画・カフェ・週末の過ごし方
- 甥っ子・姪っ子：週末の外出・子ども向けグッズの発見
- きなこ（猫）：日常の一コマ（※全体の20%以内に抑える）

【絶対に避けること】
- 「月曜」「火曜」などの曜日を固定（「今日」「この前の週末」はOK）
- AIや自動化への言及
- 「〜万円稼げる」などの煽り文句
- さつきが親であると読める表現

【アフィリエイトリンク】
ふるさと納税について投稿するときは、必ず以下のリンクを末尾に入れること：
「au PAYふるさと納税はこちら↓\nhttps://px.a8.net/svt/ejp?a8mat=4B1RXV+BG0062+54OC+5YJRM」
#PR タグも必ず入れること。`;

// ── テーマ判定 ──
function detectTheme(text) {
  if (/きなこ|🐱/.test(text)) return "cat";
  if (/ダイソー|セリア|100均|キャンドゥ|スリーコインズ/.test(text)) return "100yen";
  if (/業スー|業務スーパー/.test(text)) return "gyosu";
  if (/節約|ポイ活|楽天|ハピタス|ふるさと/.test(text)) return "savings";
  if (/ごはん|料理|レシピ|炒め|チャーハン|スープ|弁当|お昼/.test(text)) return "food";
  if (/在宅|仕事|勤務|残業|会社/.test(text)) return "work";
  if (/甥|姪|兄夫婦の子|公園|児童館/.test(text)) return "family";
  if (/映画|カフェ|おでかけ|ひとり時間/.test(text)) return "leisure";
  return "other";
}

// ── 直近の投稿からテーマ偏りを分析 ──
function analyzeRecentThemes(recentTexts) {
  const counts = {};
  for (const text of recentTexts) {
    const t = detectTheme(text);
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

// ── トレンドデータ読み込み ──
function loadTrends() {
  try {
    if (fs.existsSync(TRENDS_FILE)) {
      return JSON.parse(fs.readFileSync(TRENDS_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

// ── 商品DBから未使用品を取得 ──
function loadUnusedProducts() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
    return (data.products || []).filter(p => !p.used);
  } catch {}
  return [];
}

// ── 使用した商品をusedにマーク ──
function markProductsUsed(usedNames) {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
    for (const p of data.products) {
      if (usedNames.includes(p.name)) p.used = true;
    }
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

function loadPosts() {
  return JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(data) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function generatePosts(recentTexts, themeCounts, trends) {
  const recentSample = recentTexts.slice(-5).join("\n---\n");

  // 猫投稿の比率チェック
  const totalRecent = recentTexts.length;
  const catCount = themeCounts.cat || 0;
  const catRatio = totalRecent > 0 ? catCount / totalRecent : 0;
  const catInstruction = catRatio >= 0.3
    ? "今回の生成では「きなこ（猫）」の話題は使わないでください。"
    : catRatio >= 0.2
    ? "きなこ（猫）の話題は5件中1件まで。残りは他のテーマにしてください。"
    : "";

  // 過多テーマの抽出（直近で2件以上）
  const overUsed = Object.entries(themeCounts)
    .filter(([t, c]) => c >= 2 && t !== "other")
    .map(([t]) => t);

  // テーマ指示
  const themeInstruction = overUsed.length > 0
    ? `直近で多い話題（${overUsed.join("、")}）は避け、他のテーマを優先してください。`
    : "";

  // リサーチ結果からの指示
  let trendsInstruction = "";
  if (trends) {
    trendsInstruction = `
【リサーチ結果からの指示】
${trends.nextGuidance || ""}
バズりやすいパターン: ${(trends.viralPatterns || []).join("、")}`;
  }

  // 実在商品リスト（使用可能なもの）
  const unusedProducts = loadUnusedProducts();
  let productInstruction = "";
  let productMap = {};
  if (unusedProducts.length > 0) {
    const productList = unusedProducts.map(p =>
      `- 「${p.name}」（${p.shop} ${p.price}円）: ${p.features}`
    ).join("\n");
    productInstruction = `
【実在商品リスト（優先使用）】
以下の実在商品を積極的に使ってください。商品名は正確に記載すること。
${productList}
商品を使った投稿には必ず "product_name" フィールドに商品名を入れてください。`;

    productMap = Object.fromEntries(unusedProducts.map(p => [p.name, p]));
  }

  const prompt = `以下はさつきの最近の投稿です。これと重複しない新しい投稿を${GENERATE_COUNT}件生成してください。

【最近の投稿】
${recentSample}

【生成ルール】
${catInstruction}
${themeInstruction}
${trendsInstruction}
${productInstruction}
- 1件あたり4〜6行程度、改行で読みやすく
- Threadsらしい等身大のトーン（共感・発見・日常のひとコマ）
- 具体的な商品名・数字を入れるとリアリティが出る
- 必ず末尾に「質問・二択・共感募集」のどれか一つを入れてコメントを誘う
  例：「同じもの使ってる人いる？」「◯◯派？◯◯派？笑」「これ知ってた？」

【出力形式】
JSON配列のみ。各要素は以下の形式：
{"text": "投稿本文（改行は\\nで）", "product_name": "使った商品名（なければnull）"}
余計な説明は不要。`;

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1500,
    system: SATSUKI_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("JSONの抽出に失敗しました: " + raw);

  const generated = JSON.parse(match[0]);

  // 商品DBと紐付けてimage_urlを付与（部分一致）
  const usedProductNames = [];
  for (const post of generated) {
    const name = post.product_name;
    if (name) {
      const matched = Object.keys(productMap).find(k =>
        k.includes(name) || name.includes(k) || k.replace(/[（）\s]/g, "").includes(name.replace(/[（）\s]/g, ""))
      );
      if (matched && productMap[matched].image_url) {
        post.image_url = productMap[matched].image_url;
        usedProductNames.push(matched);
      }
    }
    delete post.product_name;
  }

  // 使用した商品をusedにマーク
  if (usedProductNames.length > 0) {
    markProductsUsed(usedProductNames);
  }

  return generated;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  console.log("📝 さつきキュー補充チェック");

  const data = loadPosts();
  const pending = data.posts.filter(p => p.status === "pending");
  console.log(`   現在のpending: ${pending.length}件`);

  if (!force && pending.length > REPLENISH_THRESHOLD) {
    console.log(`   ✅ 補充不要（閾値: ${REPLENISH_THRESHOLD}件）`);
    return;
  }

  console.log(`   ⚡ 補充開始（${GENERATE_COUNT}件生成）...`);

  // 直近の投稿テキストとテーマ分析
  const recentTexts = data.posts
    .filter(p => p.status === "posted")
    .slice(-10)
    .map(p => p.text);

  const pendingTexts = pending.map(p => p.text);
  const allRecentTexts = [...recentTexts, ...pendingTexts];
  const themeCounts = analyzeRecentThemes(allRecentTexts);

  console.log(`   テーマ分布: ${JSON.stringify(themeCounts)}`);

  const trends = loadTrends();
  if (trends) {
    console.log(`   📊 トレンドデータ読み込み済み (${trends.updatedAt})`);
  }

  let generated;
  try {
    generated = await generatePosts(recentTexts, themeCounts, trends);
  } catch (e) {
    console.error(`❌ 生成失敗: ${e.message}`);
    process.exit(1);
  }

  const maxId = Math.max(...data.posts.map(p => p.id));

  generated.forEach((post, i) => {
    const entry = {
      id: maxId + i + 1,
      text: post.text,
      status: "pending",
      posted_at: null,
      thread_id: null,
    };
    if (post.image_url) entry.image_url = post.image_url;
    data.posts.push(entry);
  });

  savePosts(data);

  console.log(`\n✅ ${generated.length}件追加しました`);
  generated.forEach((p, i) => {
    const theme = detectTheme(p.text);
    console.log(`\n  ID${maxId + i + 1} [${theme}]: ${p.text.split("\\n")[0].substring(0, 40)}...`);
  });
}

main().catch(e => {
  console.error(`\n❌ エラー: ${e.message}`);
  process.exit(1);
});
