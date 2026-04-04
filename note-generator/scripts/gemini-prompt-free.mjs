/**
 * APIなし・無料版 Gemini用プロンプト変換スクリプト
 * DALL-E英語プロンプトをキーワード置換で日本語化する
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");

// ===== 翻訳辞書（英語フレーズ → 日本語） =====
const dictionary = [
  // スタイル
  [/flat illustration/gi, "フラットイラスト"],
  [/clean and modern flat illustration/gi, "シンプルでモダンなフラットイラスト"],
  [/clean,?\s*minimal flat illustration/gi, "すっきりしたミニマルなフラットイラスト"],
  [/clean and minimal (flat )?illustration/gi, "シンプルなミニマルイラスト"],
  [/minimal(ist)? style/gi, "ミニマルスタイル"],
  [/modern flat design style/gi, "モダンなフラットデザイン"],
  [/modern,? professional/gi, "モダンでプロフェッショナル"],

  // 人物
  [/Japanese (man|person|office worker|worker)/gi, "日本人の会社員"],
  [/non-engineer Japanese office worker/gi, "非エンジニアの日本人会社員"],
  [/a person/gi, "一人の人物"],
  [/the person/gi, "その人物"],

  // 場所・設定
  [/in Okinawa/gi, "沖縄の"],
  [/Okinawa-style/gi, "沖縄風の"],
  [/tropical plants visible outside/gi, "窓の外に南国植物"],
  [/view of the ocean/gi, "海が見える"],
  [/bright office/gi, "明るいオフィス"],
  [/relaxed Okinawa-style room/gi, "くつろいだ沖縄風の部屋"],
  [/at a desk/gi, "デスクに座って"],
  [/sitting at a desk/gi, "デスクに座っている"],
  [/minimalist desk/gi, "ミニマルなデスク"],

  // 光・雰囲気
  [/warm sunrise light coming through the window/gi, "窓から差し込む温かな朝日"],
  [/Okinawa-style light coming through the window/gi, "窓から差し込む沖縄の柔らかな光"],
  [/natural light from a window/gi, "窓からの自然光"],
  [/warm natural light/gi, "温かな自然光"],
  [/warm,? hopeful atmosphere/gi, "温かく希望に満ちた雰囲気"],
  [/calm and motivating atmosphere/gi, "穏やかでやる気が出る雰囲気"],
  [/professional(,? calm)? atmosphere/gi, "プロフェッショナルで落ち着いた雰囲気"],
  [/trustworthy atmosphere/gi, "信頼感のある雰囲気"],
  [/in the early morning/gi, "早朝の"],

  // デバイス・画面
  [/working on a laptop/gi, "ノートパソコンで作業している"],
  [/looking at (a )?laptop screen/gi, "ノートパソコンの画面を見ている"],
  [/on (a )?laptop screen/gi, "ノートパソコンの画面に"],
  [/AI chat interface (visible on screen)?/gi, "画面に表示されたAIチャット画面"],
  [/chat bubble icon/gi, "チャットアイコン"],
  [/web application interface/gi, "Webアプリの画面"],
  [/simple form for writing daily reports/gi, "日報入力フォーム"],
  [/social media posts are being generated/gi, "SNS投稿がAIで生成されている"],
  [/code symbols transforming into simple icons/gi, "コードが簡単なアイコンに変換される"],
  [/neatly formatted meeting minutes document/gi, "きれいに整理された議事録"],

  // グラフ・数字系
  [/simple bar chart showing gradual monthly income growth/gi, "月ごとの収入が徐々に伸びるシンプルな棒グラフ"],
  [/bar chart/gi, "棒グラフ"],
  [/clock on the wall shows (only )?(\d+ minutes? have passed|time moving quickly)/gi, "壁時計が少ない時間の経過を示している"],
  [/clock on the wall/gi, "壁掛け時計"],
  [/A clock/gi, "時計"],

  // 色
  [/soft blue and white (color palette|tones?)/gi, "ソフトなブルーとホワイトのカラーパレット"],
  [/soft pastel colors/gi, "柔らかなパステルカラー"],
  [/soft colors?,? blue and white tones?/gi, "柔らかなブルーとホワイトのトーン"],
  [/light blue,? white,? and warm beige tones?/gi, "ライトブルー・ホワイト・温かみのあるベージュ"],
  [/soft color palette with light blue/gi, "ライトブルーを基調としたソフトなカラーパレット"],
  [/warm,? tropical accents?/gi, "温かみのあるトロピカルなアクセント"],
  [/calm blue and white with/gi, "落ち着いたブルーとホワイトに"],
  [/blue and white tones?/gi, "ブルーとホワイトのトーン"],
  [/orange\/amber tint/gi, "オレンジ・アンバーのトーン"],
  [/green tint/gi, "グリーンのトーン"],
  [/soft colors/gi, "柔らかな色使い"],

  // 特殊要素
  [/speech bubble/gi, "吹き出し"],
  [/small notebook open beside the laptop/gi, "ノートパソコンの横に開いた小さなノート"],
  [/handwritten goals/gi, "手書きのメモ"],
  [/two AI chat interfaces side by side/gi, "2つのAIチャット画面を並べた比較"],
  [/thoughtfully (reviewing|looking)/gi, "じっくりと確認している"],
  [/looking relieved and satisfied/gi, "ほっとした表情で"],
  [/human and an AI robot working side by side/gi, "人間とAIロボットが並んで作業している"],
  [/reviewing documents/gi, "書類を確認している"],
  [/handles data/gi, "データを処理している"],
  [/document pages/gi, "ドキュメントアイコン"],
  [/code brackets/gi, "コードブラケット"],

  // 共通末尾表現
  [/[Nn]o text in (the )?image\.?/gi, "画像内にテキストなし。"],
  [/[Nn]o text except (the )?label names?\.?/gi, "ラベル名以外テキストなし。"],
  [/16:9 (ratio|aspect ratio)\.?/gi, "16:9横長。"],
  [/blog header style\.?/gi, "ブログヘッダー向け。"],
  [/modern tech aesthetic/gi, "モダンなテックデザイン"],
  [/modern Japanese productivity aesthetic/gi, "日本人向けのモダンな生産性デザイン"],
  [/beside the desk/gi, "デスクの隣に"],
  [/on screen/gi, "画面上に"],
  [/on (a )?screen/gi, "画面に"],
  [/visible on screen/gi, "画面に表示された"],
  [/A clean,?/gi, "すっきりとした"],
  [/Simple,? clean design/gi, "シンプルできれいなデザイン"],
  [/simple icons? showing/gi, "シンプルなアイコンで表現された"],
  [/nearby/gi, "周辺に"],
  [/Beside/gi, "横に"],
  [/warm/gi, "温かみのある"],
  [/\bwith\b/gi, "＋"],
];

function translatePrompt(englishText) {
  let text = englishText;

  // 辞書順に置換
  for (const [pattern, replacement] of dictionary) {
    text = text.replace(pattern, replacement);
  }

  // 残った英単語を含む文を検出して後処理
  // 文末の余分なスペース・改行を整理
  text = text
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Gemini向けの定型文を追加
  const geminiPrompt = `${text}\n\nnoteのアイキャッチ画像（1280×670px、横長16:9）。テキストなし。フラットイラスト風。`;

  return geminiPrompt;
}

function hasDalleSection(content) {
  return content.includes("アイキャッチ画像用プロンプト") || content.includes("アイキャッチ画像プロンプト");
}

function hasGeminiSection(content) {
  return content.includes("Gemini向け日本語プロンプト");
}

function extractDallePrompt(content) {
  const match = content.match(/アイキャッチ画像(?:用)?プロンプト[\s\S]*?```[\s\S]*?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function main() {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => parseInt(a) - parseInt(b));

  const targets = files.filter((file) => {
    const content = fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8");
    return hasDalleSection(content) && !hasGeminiSection(content);
  });

  if (targets.length === 0) {
    console.log("✅ 全ファイル変換済みです。");
    return;
  }

  console.log(`\n🔄 Gemini用プロンプト変換開始（APIなし）: ${targets.length}本\n`);

  let done = 0;
  let skipped = 0;

  for (const file of targets) {
    const filePath = path.join(OUTPUT_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const englishPrompt = extractDallePrompt(content);

    if (!englishPrompt) {
      console.log(`⏭️  スキップ: ${file}`);
      skipped++;
      continue;
    }

    const japanesePrompt = translatePrompt(englishPrompt);
    const addition = `\n\n---\n\n## Gemini向け日本語プロンプト\n\n\`\`\`\n${japanesePrompt}\n\`\`\`\n`;
    fs.writeFileSync(filePath, content + addition, "utf-8");

    done++;
    if (done % 10 === 0) {
      console.log(`✅ ${done}本 変換完了...`);
    }
  }

  console.log(`\n🎉 完了: ${done}本変換 / ${skipped}本スキップ\n`);
}

main();
