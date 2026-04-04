import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(ROOT, "..");
const OUTPUT_DIR = path.join(ROOT, "output");

config({ path: path.join(PROJECT_ROOT, ".env") });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractDallePrompt(content) {
  const match = content.match(/```[\s\S]*?\n([\s\S]*?)```\s*$/);
  return match ? match[1].trim() : null;
}

function hasDalleSection(content) {
  return content.includes("アイキャッチ画像用プロンプト");
}

function hasGeminiSection(content) {
  return content.includes("Gemini向け日本語プロンプト");
}

async function convertToGemini(englishPrompt, title) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `以下のDALL-E向け英語画像プロンプトを、Gemini（Google）向けの日本語プロンプトに変換してください。

記事タイトル：${title}

英語プロンプト：
${englishPrompt}

条件：
- 日本語で書く
- Geminiは具体的な描写が得意なので、色・構図・雰囲気を詳しく書く
- noteのアイキャッチ（1280×670px、横長）に適した構図を指定
- 「テキストなし」「シンプルな背景」などの制約も日本語で入れる
- 50〜100文字程度でまとめる
- プロンプト文のみ出力（前置きなし）`,
      },
    ],
  });

  return message.content[0].text.trim();
}

async function main() {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => parseInt(a) - parseInt(b));

  // 未変換ファイルのみ対象
  const targets = files.filter((file) => {
    const content = fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8");
    return hasDalleSection(content) && !hasGeminiSection(content);
  });

  if (targets.length === 0) {
    console.log("✅ 全ファイル変換済みです。");
    return;
  }

  console.log(`\n🔄 Gemini用プロンプト変換開始: ${targets.length}本\n`);

  let done = 0;
  for (const file of targets) {
    const filePath = path.join(OUTPUT_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // タイトル取得
    const titleMatch = content.match(/^# (.+)/m);
    const title = titleMatch ? titleMatch[1] : file;

    // 英語プロンプト取得
    const englishPrompt = extractDallePrompt(content);
    if (!englishPrompt) {
      console.log(`⏭️  スキップ（プロンプト未検出）: ${file}`);
      continue;
    }

    try {
      process.stdout.write(`🔄 変換中 [${++done}/${targets.length}]: ${file} ... `);
      const japanesePrompt = await convertToGemini(englishPrompt, title);

      // MDファイルの末尾にGemini向けセクションを追記
      const addition = `\n\n---\n\n## Gemini向け日本語プロンプト\n\n\`\`\`\n${japanesePrompt}\n\`\`\`\n`;
      fs.writeFileSync(filePath, content + addition, "utf-8");

      console.log("✅");
      await sleep(2000);
    } catch (err) {
      console.log(`❌ エラー: ${err.message}`);
      await sleep(3000);
    }
  }

  console.log(`\n🎉 変換完了。note-viewer.htmlを再ビルドします...\n`);

  // ビューワー再ビルド
  const { execSync } = await import("child_process");
  try {
    execSync("node scripts/build-viewer.mjs", { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    console.log("ビューワー再ビルドは手動で: npm run build-viewer");
  }
}

main().catch(console.error);
