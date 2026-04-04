import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const REPORT_FILE = path.join(ROOT, "data", "quality-report.json");

function countKanji(text) {
  const kanjiRegex = /[\u4e00-\u9faf]/g;
  const matches = text.match(kanjiRegex) || [];
  return matches.length / text.replace(/\s/g, "").length;
}

function checkQuality(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const issues = [];
  let score = 100;

  // 文字数チェック
  const charCount = content.length;
  if (charCount < 3000) {
    issues.push(`文字数不足: ${charCount}字（3000字以上必要）`);
    score -= 20;
  } else if (charCount > 8000) {
    issues.push(`文字数超過: ${charCount}字（8000字以下推奨）`);
    score -= 5;
  }

  // 冒頭フックチェック
  const firstLines = content.split("\n").slice(0, 5).join("\n");
  const hookWords = ["あなた", "悩み", "困", "辛", "不安", "失敗", "やってみ", "実際に", "正直"];
  const hasHook = hookWords.some((w) => firstLines.includes(w));
  if (!hasHook) {
    issues.push("冒頭フックが弱い可能性あり");
    score -= 10;
  }

  // 数字チェック
  const numbers = content.match(/\d+/g) || [];
  if (numbers.length < 5) {
    issues.push(`数字が少ない: ${numbers.length}個（5個以上推奨）`);
    score -= 10;
  }

  // 有料パート区切りチェック
  if (!content.includes("---ここから有料---")) {
    issues.push("有料パートの区切りがない");
    score -= 15;
  }

  // 漢字率チェック
  const kanjiRate = countKanji(content);
  if (kanjiRate > 0.35) {
    issues.push(`漢字率が高い: ${(kanjiRate * 100).toFixed(1)}%（35%以下推奨）`);
    score -= 10;
  }

  // アイキャッチプロンプトチェック
  if (!content.includes("DALL-E") && !content.includes("prompt") && !content.includes("eye-catch")) {
    issues.push("アイキャッチ画像プロンプトがない");
    score -= 5;
  }

  // ランク付け
  let rank;
  if (score >= 90) rank = "A";
  else if (score >= 75) rank = "B";
  else if (score >= 60) rank = "C";
  else rank = "D";

  return { score, rank, issues, charCount };
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log("output/ フォルダがありません。先に generate.mjs を実行してください。");
    process.exit(1);
  }

  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.log("生成済みファイルがありません。");
    process.exit(1);
  }

  const results = [];
  const summary = { A: 0, B: 0, C: 0, D: 0 };

  console.log(`\n🔍 品質チェック開始: ${files.length}ファイル\n`);

  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const result = checkQuality(filePath);
    const id = parseInt(file.split("_")[0]);

    results.push({ id, file, ...result });
    summary[result.rank]++;

    const icon = { A: "🟢", B: "🟡", C: "🟠", D: "🔴" }[result.rank];
    console.log(`${icon} [${result.rank}] ${file} (${result.charCount}字, ${result.score}点)`);
    if (result.issues.length > 0) {
      result.issues.forEach((issue) => console.log(`   ⚠ ${issue}`));
    }
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify({ results, summary }, null, 2), "utf-8");

  const lowRank = results.filter((r) => r.rank === "C" || r.rank === "D");

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━
📊 品質チェック結果
━━━━━━━━━━━━━━━━━━━━━━
🟢 Aランク: ${summary.A}本
🟡 Bランク: ${summary.B}本
🟠 Cランク: ${summary.C}本
🔴 Dランク: ${summary.D}本
━━━━━━━━━━━━━━━━━━━━━━
⚠  要リライト(C/D): ${lowRank.length}本
📄 レポート保存: data/quality-report.json
━━━━━━━━━━━━━━━━━━━━━━`);
}

main();
