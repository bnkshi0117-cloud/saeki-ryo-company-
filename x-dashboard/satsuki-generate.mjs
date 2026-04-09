/**
 * さつき 投稿キュー自動補充スクリプト
 *
 * pendingが3件以下になったらClaude APIで新しい投稿文を5件生成してキューに追加する。
 * GitHub Actionsから自動実行される（satsuki-post.yml内）。
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
const REPLENISH_THRESHOLD = 3;  // この件数以下になったら補充
const GENERATE_COUNT = 5;       // 一度に生成する件数

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SATSUKI_SYSTEM = `あなたは橘さつき（32歳・埼玉・一人暮らし会社員・猫のきなこと同居）です。
Threadsに日常を投稿しています。

キャラクター設定:
- 埼玉で一人暮らしの32歳会社員
- 猫のきなこ（茶白・オス）と同居
- スーパーや100均で見つけたお気に入りを正直に紹介
- 明るくて親しみやすい、自然な30代女性の口調
- 「〜だよね」「〜かな」「〜してみた」「〜な笑」など自然な言葉遣い
- 絵文字を適度に使う（🐱😊✨😂🙌など）
- 週末は兄夫婦の子ども（甥っ子5歳・姪っ子3歳）と遊ぶことが多い
- 子どもと公園・児童館・おでかけ・お菓子作りなどを楽しんでいる

投稿テーマ（バランスよく混ぜる）:
- きなこの日常（昼寝・甘え・ごはん前の行動・不思議な習性など）
- 100均・スーパーで見つけたいいもの（ダイソー・セリア・業スーなど）
- 一人暮らしの食事（簡単レシピ・冷蔵庫の残り物・コンビニ活用など）
- 節約・ポイ活・楽天活用のちょっとした気づき
- 在宅勤務の日常・仕事終わりのリラックス
- 甥っ子・姪っ子との週末（おでかけ・おもちゃ・子ども向けグッズの発見など）

絶対に避けること:
- 「月曜」「火曜」などの曜日を固定した表現（「今日」「この前の週末」はOK）
- AIや自動化への言及
- 「〜万円稼げる」などの煽り文句`;

function loadPosts() {
  return JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(data) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function generatePosts(recentTexts) {
  const recentSample = recentTexts.slice(-5).join("\n---\n");

  const prompt = `以下はさつきの最近の投稿です。これと重複しない新しい投稿を${GENERATE_COUNT}件生成してください。

【最近の投稿】
${recentSample}

【出力形式】
JSON配列で返してください。各投稿は {"text": "投稿本文"} の形式で。
改行は \\n で表現してください。
余計な説明は不要です。JSON配列のみを出力してください。

例：
[
  {"text": "今日のきなこ🐱\\n\\nごはんの前だけやたら甘えてくる。\\n計算高いのはわかってるけど、それでもかわいいからあげてしまう😂"},
  {"text": "ダイソーで買ったシリコンスプーン、\\n意外と使いやすくてびっくりした。\\n\\n100円なのに洗いやすいし、鍋を傷つけないし、もっと早く買えばよかった笑"}
]`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SATSUKI_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].text.trim();

  // JSON部分だけ抽出
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("JSONの抽出に失敗しました: " + raw);

  return JSON.parse(match[0]);
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

  // 最近の投稿テキストを渡して重複を避ける
  const recentTexts = data.posts
    .filter(p => p.status === "posted")
    .slice(-10)
    .map(p => p.text);

  let generated;
  try {
    generated = await generatePosts(recentTexts);
  } catch (e) {
    console.error(`❌ 生成失敗: ${e.message}`);
    process.exit(1);
  }

  // 現在の最大IDを取得
  const maxId = Math.max(...data.posts.map(p => p.id));

  // 新しい投稿をキューに追加
  generated.forEach((post, i) => {
    data.posts.push({
      id: maxId + i + 1,
      text: post.text,
      status: "pending",
      posted_at: null,
      thread_id: null,
    });
  });

  savePosts(data);

  console.log(`\n✅ ${generated.length}件追加しました`);
  generated.forEach((p, i) => {
    console.log(`\n  ID${maxId + i + 1}: ${p.text.split("\\n")[0].substring(0, 30)}...`);
  });
}

main().catch(e => {
  console.error(`\n❌ エラー: ${e.message}`);
  process.exit(1);
});
