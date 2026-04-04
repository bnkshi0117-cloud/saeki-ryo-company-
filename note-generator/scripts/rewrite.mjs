import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(ROOT, "..");

config({ path: path.join(PROJECT_ROOT, ".env") });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OUTPUT_DIR = path.join(ROOT, "output");
const REPORT_FILE = path.join(ROOT, "data", "quality-report.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rewrite(content, issues) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: "あなたはnote記事のリライト専門家です。指摘された問題点を修正しながら、元の構成と一次情報の視点を維持します。",
    messages: [
      {
        role: "user",
        content: `以下のnote記事を改善してください。

【改善ポイント】
${issues.join("\n")}

【現在の記事】
${content}

改善ポイントをすべて修正した上で、元の文体・構成・一次情報の視点は維持してください。`,
      },
    ],
  });

  return message.content[0].text;
}

async function main() {
  if (!fs.existsSync(REPORT_FILE)) {
    console.log("quality-report.json がありません。先に quality-check.mjs を実行してください。");
    process.exit(1);
  }

  const { results } = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
  const targets = results.filter((r) => r.rank === "C" || r.rank === "D");

  if (targets.length === 0) {
    console.log("✅ リライト対象なし（全記事がBランク以上）");
    return;
  }

  console.log(`\n✏️  リライト開始: ${targets.length}本\n`);

  for (const target of targets) {
    const filePath = path.join(OUTPUT_DIR, target.file);
    console.log(`🔄 リライト中: ${target.file} (${target.rank}ランク)`);

    try {
      const original = fs.readFileSync(filePath, "utf-8");
      const rewritten = await rewrite(original, target.issues);
      fs.writeFileSync(filePath, rewritten, "utf-8");
      console.log(`✅ 完了: ${target.file}`);
      await sleep(3000);
    } catch (err) {
      console.error(`❌ エラー: ${target.file} - ${err.message}`);
    }
  }

  console.log("\n🎉 リライト完了。再度 quality-check.mjs で確認してください。");
}

main().catch(console.error);
