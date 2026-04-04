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

const CLAUDE_MD = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf-8");
const OUTPUT_DIR = path.join(ROOT, "output");
const TITLES_FILE = path.join(ROOT, "data", "titles.json");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const { notes } = JSON.parse(fs.readFileSync(TITLES_FILE, "utf-8"));

function getTemplate(genre) {
  const templatePath = path.join(ROOT, "templates", `${genre}.md`);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, "utf-8");
  }
  return "";
}

function getOutputPath(note) {
  return path.join(OUTPUT_DIR, `${note.id}_${note.genre}.md`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateNote(note) {
  const template = getTemplate(note.genre);

  const prompt = `
以下の条件でnote記事を生成してください。

【タイトル】${note.title}
【ジャンル】${note.genre}
【切り口】${note.angle}
【感情トリガー】${note.emotion}
【目標文字数】${note.target_length}字
【価格帯】${note.price}円

【テンプレート】
${template}

【CLAUDE.mdのスタイルルール】
${CLAUDE_MD}

【生成ルール】
- 無料パートと有料パートを明確に分ける
- 有料パートの区切りに「---ここから有料---」を入れる
- 記事の最後にアイキャッチ画像用のDALL-E向け英語プロンプトを追記する
- 「自分がやってみたらこうだった」という一次情報の視点を入れる
- 煽り表現・誇張は禁止
`;

  let retries = 0;
  while (retries < 3) {
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system:
          "あなたは佐伯亮（沖縄在住の会社員。AI×副業×アプリ開発が専門）として記事を書くプロのライターです。実体験ベースで、等身大の文章を書きます。",
        messages: [{ role: "user", content: prompt }],
      });

      return message.content[0].text;
    } catch (err) {
      retries++;
      console.error(`❌ API Error (${retries}/3): ${err.message}`);
      if (retries >= 3) throw err;
      console.log(`⏳ 30秒待ってリトライ...`);
      await sleep(30000);
    }
  }
}

async function main() {
  const startTime = Date.now();
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // コマンドライン引数でID範囲指定（例: node generate.mjs 1 10）
  const startId = parseInt(process.argv[2]) || 1;
  const endId = parseInt(process.argv[3]) || notes.length;

  const targets = notes.filter((n) => n.id >= startId && n.id <= endId);
  console.log(`\n📝 生成開始: ID ${startId}〜${endId}（${targets.length}本）\n`);

  for (const note of targets) {
    const outputPath = getOutputPath(note);

    // 生成済みはスキップ
    if (fs.existsSync(outputPath)) {
      console.log(`[${note.id}/${notes.length}] ⏭  スキップ: ${note.title}`);
      skipCount++;
      continue;
    }

    console.log(`[${note.id}/${notes.length}] 🔄 生成中: ${note.title}`);

    try {
      const content = await generateNote(note);
      const charCount = content.length;

      const fileContent = `# ${note.title}\n\nジャンル: ${note.genre} | 切り口: ${note.angle} | 感情: ${note.emotion} | 価格: ${note.price}円\n\n---\n\n${content}`;
      fs.writeFileSync(outputPath, fileContent, "utf-8");

      console.log(
        `[${note.id}/${notes.length}] ✅ 完了: ${note.title} (${charCount.toLocaleString()}字)`
      );
      successCount++;

      // レート制限対策: 3秒待機
      await sleep(3000);
    } catch (err) {
      console.error(`[${note.id}/${notes.length}] ❌ エラー: ${err.message}`);
      errorCount++;

      if (errorCount >= 5) {
        console.error("\n⛔ エラーが5回連続しました。処理を一時停止します。");
        break;
      }
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━
📊 生成完了サマリー
━━━━━━━━━━━━━━━━━━━━━━
✅ 成功: ${successCount}本
⏭  スキップ: ${skipCount}本
❌ エラー: ${errorCount}本
⏱  所要時間: ${elapsed}秒
━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(console.error);
