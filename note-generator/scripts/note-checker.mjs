import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTICLES_FILE = path.join(ROOT, 'data', 'note-articles.json');
const X_POSTS_DIR = path.join(ROOT, '..', 'logs', 'x-posts');
const NOTE_USER = 'saekiryo_ai';

// ===== note API =====
async function fetchNoteArticles() {
  const url = `https://note.com/api/v2/creators/${NOTE_USER}/contents?kind=note&page=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SaekiRyoBot/1.0)' }
  });
  if (!res.ok) throw new Error(`note API error: ${res.status}`);
  const data = await res.json();
  return data.data?.contents ?? [];
}

// ===== 既知記事のロード =====
async function loadKnownArticles() {
  try {
    const raw = await fs.readFile(ARTICLES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { articles: [], lastRun: null };
  }
}

// ===== X投稿案を生成 =====
async function generateXPosts(article, client) {
  const articleUrl = `https://note.com/${NOTE_USER}/n/${article.key}`;
  const prompt = `以下のnote記事のX（旧Twitter）告知投稿を3パターン生成してください。

記事タイトル: ${article.name}
記事URL: ${articleUrl}
${article.body ? `記事の冒頭: ${article.body.slice(0, 300)}` : ''}

【条件】
- 発信者: 佐伯亮（沖縄在住の会社員、AI×副業×アプリ開発の実験者）
- 「やってみたらこうだった」という一次情報感を出す
- 煽り・「月○万円」系は絶対NG
- 各パターン140文字以内（URLの23文字を除いた実質117文字）
- 末尾にURLを入れる
- 3パターンそれぞれ違うアプローチ（問いかけ／結論先出し／失敗談）

【出力形式】
【パターンA】
（投稿文）

【パターンB】
（投稿文）

【パターンC】
（投稿文）`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });
  return msg.content[0].text;
}

// ===== メイン =====
async function main() {
  const now = new Date();
  const hour = now.getHours();
  const todayStr = now.toISOString().slice(0, 10);

  // 8時前は実行しない（ログオントリガー用）
  if (hour < 8) {
    console.log(`[note-checker] 現在${hour}時 — 8時以降に実行します`);
    process.exit(0);
  }

  const known = await loadKnownArticles();

  // 今日すでに実行済みなら終了
  if (known.lastRun === todayStr) {
    console.log(`[note-checker] 本日(${todayStr})はチェック済みです`);
    process.exit(0);
  }

  console.log(`[note-checker] ${todayStr} チェック開始...`);

  let articles;
  try {
    articles = await fetchNoteArticles();
  } catch (e) {
    console.error(`[note-checker] note API取得失敗: ${e.message}`);
    process.exit(1);
  }

  console.log(`[note-checker] note記事取得: ${articles.length}本`);

  const knownIds = new Set(known.articles.map(a => a.id));
  const newArticles = articles.filter(a => !knownIds.has(a.id));

  if (newArticles.length === 0) {
    console.log('[note-checker] 新着記事なし — 本日のチェック完了');
    known.lastRun = todayStr;
    await fs.writeFile(ARTICLES_FILE, JSON.stringify(known, null, 2));
    process.exit(0);
  }

  console.log(`[note-checker] 新着記事: ${newArticles.length}本 → X投稿案を生成します`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[note-checker] ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  await fs.mkdir(X_POSTS_DIR, { recursive: true });

  let output = `# X投稿案 — ${todayStr}\n\n`;

  for (const article of newArticles) {
    const articleUrl = `https://note.com/${NOTE_USER}/n/${article.key}`;
    console.log(`  生成中: ${article.name}`);

    const xPosts = await generateXPosts(article, client);

    output += `## 📝 ${article.name}\n`;
    output += `URL: ${articleUrl}\n\n`;
    output += `${xPosts}\n\n`;
    output += `---\n\n`;

    known.articles.push({
      id: article.id,
      key: article.key,
      name: article.name,
      publishedAt: article.publish_at ?? null,
      xPostGenerated: todayStr
    });
  }

  const outputFile = path.join(X_POSTS_DIR, `${todayStr}.md`);
  await fs.writeFile(outputFile, output, 'utf-8');

  known.lastRun = todayStr;
  await fs.writeFile(ARTICLES_FILE, JSON.stringify(known, null, 2));

  console.log(`[note-checker] ✅ 完了`);
  console.log(`  → X投稿案: ${outputFile}`);
  console.log(`  → 新着${newArticles.length}本のX投稿案を生成しました`);
}

main().catch(e => {
  console.error('[note-checker] 予期せぬエラー:', e.message);
  process.exit(1);
});
