import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const DATA_DIR = path.join(ROOT, "data");
const POSTED_FILE = path.join(DATA_DIR, "posted.json");
const TODAY_FILE = path.join(DATA_DIR, "today.json");
const RESULT_FILE = path.join(ROOT, "..", "today-note.txt");

// 無料記事の優先順（集客用）
const FREE_QUEUE = [
  "20_claude_ai.md",
  "21_fukugyou_ai.md",
  "36_fukugyou_ai.md",
  "41_claude_code.md",
  "56_sns_unyo.md",
  "59_sns_unyo.md",
];

function parseMd(content) {
  const lines = content.split("\n");

  // アイキャッチ・Geminiセクションを除外
  const cutIndex = lines.findIndex((l) => l.includes("アイキャッチ画像"));
  const articleLines = cutIndex !== -1 ? lines.slice(0, cutIndex) : lines;

  // 2つ目の # タイトルから本文開始（メタ情報をスキップ）
  let startIndex = 0;
  let titleCount = 0;
  for (let i = 0; i < articleLines.length; i++) {
    if (articleLines[i].startsWith("# ")) {
      titleCount++;
      if (titleCount === 2) { startIndex = i; break; }
    }
  }

  const body = articleLines.slice(startIndex).join("\n").trim();
  const metaLine = lines.find((l) => l.includes("ジャンル:"));
  const priceMatch = metaLine?.match(/価格:\s*(\d+)円/);
  const price = priceMatch ? priceMatch[1] : null;
  const title = lines[0].replace(/^#\s*/, "");

  return { title, body, price };
}

function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "・")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^---ここから有料---$/gm, "")
    .replace(/^---+$/gm, "─────────")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 投稿済みリスト読み込み
const postedData = JSON.parse(fs.readFileSync(POSTED_FILE, "utf-8"));
const postedFiles = new Set(postedData.posted.map((p) => p.file));

// 次の記事を選ぶ
let nextFile = null;
let nextType = "paid";

// 無料優先キューから選ぶ
const nextFree = FREE_QUEUE.find((f) => !postedFiles.has(f));
if (nextFree) {
  nextFile = nextFree;
  nextType = "free";
} else {
  // 有料記事から選ぶ（カテゴリをローテーション）
  const allFiles = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      return na - nb;
    });
  nextFile = allFiles.find((f) => !postedFiles.has(f)) || null;
  nextType = "paid";
}

if (!nextFile) {
  console.log("🎉 全記事投稿済みです！新しい記事を生成してください。");
  process.exit(0);
}

// 記事を読み込んでクリーンアップ
const content = fs.readFileSync(path.join(OUTPUT_DIR, nextFile), "utf-8");
const { title, body, price } = parseMd(content);
const cleanBody = stripMarkdown(body);

// 今日の選定記事を保存（mark-posted用）
fs.writeFileSync(TODAY_FILE, JSON.stringify({ file: nextFile, type: nextType, price, title }, null, 2));

// 出力テキスト生成
const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
const priceInfo = nextType === "free" ? "無料" : `有料（${price || 980}円）`;

const output = `
========================================
📅 ${today} の投稿記事
========================================
タイトル : ${title}
公開設定 : ${priceInfo}
ファイル : ${nextFile}
========================================

${cleanBody}

========================================
✅ 投稿が完了したら実行してください:
   npm run mark-posted
========================================
`.trimStart();

fs.writeFileSync(RESULT_FILE, output, "utf-8");

console.log(`✅ 本日の記事を選定しました`);
console.log(`   タイトル: ${title}`);
console.log(`   公開設定: ${priceInfo}`);
console.log(`   出力先: today-note.txt`);
