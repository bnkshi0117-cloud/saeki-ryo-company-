// ニュース取得 → スクリプト生成 → 音声生成 → 動画合成 の全工程を一括実行
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function run(label, script) {
  console.log(`\n${"=".repeat(40)}`);
  console.log(`🚀 ${label}`);
  console.log("=".repeat(40));
  execSync(`node ${path.join(ROOT, "scripts", script)}`, {
    stdio: "inherit",
    cwd: ROOT,
  });
}

try {
  run("STEP 1: ニュース取得 & スクリプト生成", "fetch-news.mjs");
  run("STEP 2: 音声 & 動画生成", "gen-video.mjs");
  console.log("\n✅ パイプライン完了！output/ フォルダに動画が保存されました。");
} catch (e) {
  console.error("\n❌ エラーが発生しました:", e.message);
  process.exit(1);
}
