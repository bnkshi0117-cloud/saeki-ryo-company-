import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const POSTED_FILE = path.join(DATA_DIR, "posted.json");
const TODAY_FILE = path.join(DATA_DIR, "today.json");

if (!fs.existsSync(TODAY_FILE)) {
  console.error("❌ today.json が見つかりません。先に npm run daily を実行してください。");
  process.exit(1);
}

const today = JSON.parse(fs.readFileSync(TODAY_FILE, "utf-8"));
const postedData = JSON.parse(fs.readFileSync(POSTED_FILE, "utf-8"));

// すでに登録済みなら終了
if (postedData.posted.some((p) => p.file === today.file)) {
  console.log(`ℹ️ ${today.file} はすでに投稿済みとして記録されています。`);
  process.exit(0);
}

// URLを入力してもらう（任意）
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("noteのURL（省略可、Enterでスキップ）: ", (url) => {
  rl.close();

  const dateStr = new Date().toISOString().split("T")[0];
  const entry = {
    file: today.file,
    date: dateStr,
    type: today.type,
    ...(today.price && today.type === "paid" ? { price: parseInt(today.price) } : {}),
    ...(url.trim() ? { url: url.trim() } : {}),
  };

  postedData.posted.push(entry);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(postedData, null, 2));

  console.log(`✅ 投稿済みとして記録しました`);
  console.log(`   ファイル: ${today.file}`);
  console.log(`   日付: ${dateStr}`);
  console.log(`   投稿済み合計: ${postedData.posted.length}本`);
});
