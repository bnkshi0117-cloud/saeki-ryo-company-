import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const VIEWER_FILE = path.join(ROOT, "..", "note-viewer.html");

function parseMd(content) {
  // メタ情報（1行目のタイトル＋ジャンル行＋区切り）を除去
  // 2つ目の # タイトル行から本文開始
  const lines = content.split("\n");

  // DAL-Eプロンプトセクションを分離
  const dallEIndex = lines.findIndex((l) => l.includes("アイキャッチ画像"));
  const geminiIndex = lines.findIndex((l) => l.includes("Gemini向け日本語プロンプト"));

  let articleLines, dallEPrompt = "", geminiPrompt = "";

  if (dallEIndex !== -1) {
    articleLines = lines.slice(0, dallEIndex);
    const rest = lines.slice(dallEIndex).join("\n");
    const match = rest.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (match) dallEPrompt = match[1].trim();
  } else {
    articleLines = lines;
  }

  if (geminiIndex !== -1) {
    const geminiRest = lines.slice(geminiIndex).join("\n");
    const geminiMatch = geminiRest.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (geminiMatch) geminiPrompt = geminiMatch[1].trim();
  }

  // 最初の区切り（メタ情報）をスキップ：2つ目の # タイトルから取得
  let startIndex = 0;
  let titleCount = 0;
  for (let i = 0; i < articleLines.length; i++) {
    if (articleLines[i].startsWith("# ")) {
      titleCount++;
      if (titleCount === 2) {
        startIndex = i;
        break;
      }
    }
  }

  const articleBody = articleLines.slice(startIndex).join("\n").trim();

  // メタ情報から価格・ジャンルを取得
  const metaLine = lines.find((l) => l.includes("ジャンル:"));
  const priceMatch = metaLine?.match(/価格:\s*(\d+)円/);
  const price = priceMatch ? priceMatch[1] + "円" : "—";

  // タイトル（1行目）
  const title = lines[0].replace(/^#\s*/, "");

  return { title, articleBody, dallEPrompt, geminiPrompt, price };
}

// Markdown記号を除去してnoteに貼れるきれいなテキストにする
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

const hashtagMap = {
  claude_ai:        "#Claude #AI活用 #Claude活用術",
  fukugyou_ai:      "#AI副業 #副業 #AI活用",
  claude_code:      "#ClaudeCode #AI開発 #副業",
  sns_unyo:         "#SNS運用 #AI活用 #副業",
  general_fukugyou: "#副業 #会社員副業 #AI活用",
  business_skill:   "#仕事術 #AI活用 #ビジネススキル",
};

function generateXPost(title, genre, cleanBody, price) {
  const lines = cleanBody.split("\n").map(l => l.trim()).filter(l => l.length > 20 && !l.startsWith("─") && !l.startsWith("・"));
  const tags = hashtagMap[genre] || "#AI活用 #副業";
  const priceStr = price || "480円";

  // 本文から数字を含む文を探す（具体性を出すため）
  const numLine = lines.find(l => /\d+/.test(l) && l.length < 60) || "";

  // 本文の2〜3行目あたりの「気づき」になりそうな行
  const insight = lines[2] || lines[1] || "";

  // ジャンル別のオープニングパターン
  const openings = {
    claude_ai: [
      `Claudeでこんなことができるとは思ってなかった。`,
      `正直、ここまで使えるとは思ってなかった。`,
      `会社員しながら副業やってる自分には刺さった話。`,
    ],
    fukugyou_ai: [
      `AIを副業に使い始めて気づいたこと。`,
      `副業×AIで変わったことを正直に書く。`,
      `試してみて「あ、これは続けよう」と思った話。`,
    ],
    claude_code: [
      `非エンジニアでもここまでできるようになった。`,
      `Claude Codeを使い始めてから明らかに変わった。`,
      `コードが書けなくても関係なかった話。`,
    ],
    sns_unyo: [
      `SNS運用をAIに任せたら何が変わったか。`,
      `投稿を自動化してみてわかったこと。`,
      `AIで発信が楽になった話、正直に書く。`,
    ],
    general_fukugyou: [
      `副業を続けてきてわかってきたこと。`,
      `会社員×副業、実際やってみてどうだったか。`,
      `副業で一番大事だと気づいたこと。`,
    ],
    business_skill: [
      `AIと仕事のやり方を変えて気づいたこと。`,
      `仕事でAIを使い始めて半年、正直な話。`,
      `働き方が変わった話を書いた。`,
    ],
  };

  const opList = openings[genre] || openings.general_fukugyou;
  const opening = opList[Math.floor(Math.random() * opList.length)];

  // 数字があれば活かす
  const numberHook = numLine ? `\n${numLine}\n` : "\n";

  return `${opening}

「${title}」

${insight}${numberHook}
実際にやって気づいたこと全部まとめた（${priceStr}）
🔗 （noteのURLを貼る）

${tags} #note #沖縄`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log("output/ フォルダがありません。");
    process.exit(1);
  }

  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => {
      const ai = parseInt(a.split("_")[0]);
      const bi = parseInt(b.split("_")[0]);
      return ai - bi;
    });

  const articles = files.map((file) => {
    const content = fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8");
    return { file, ...parseMd(content) };
  });

  const listItems = articles.map((a, i) =>
    `<li class="list-item" onclick="show(${i})" id="li-${i}">
      <span class="num">${i + 1}</span>
      <span class="list-title">${escapeHtml(a.title)}</span>
      <span class="price-tag">${a.price}</span>
    </li>`
  ).join("\n");

  const articleData = JSON.stringify(
    articles.map((a) => {
      const genre = a.file.replace(/^\d+_/, "").replace(".md", "");
      const clean = stripMarkdown(a.articleBody);
      return {
        title: a.title,
        file: a.file,
        price: a.price,
        body: a.articleBody,
        clean,
        xpost: generateXPost(a.title, genre, clean, a.price),
        dalle: a.dallEPrompt,
        gemini: a.geminiPrompt,
      };
    })
  );

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>note記事ビューワー | 佐伯亮カンパニー</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; background: #f5f5f0; color: #333; display: flex; height: 100vh; overflow: hidden; }

    /* サイドバー */
    #sidebar {
      width: 320px; min-width: 280px; background: #1a1a2e; color: #eee;
      display: flex; flex-direction: column; overflow: hidden;
    }
    #sidebar-header {
      padding: 16px; background: #16213e; border-bottom: 1px solid #0f3460;
    }
    #sidebar-header h1 { font-size: 14px; color: #e94560; letter-spacing: 1px; }
    #sidebar-header p { font-size: 11px; color: #888; margin-top: 4px; }
    #search {
      width: 100%; padding: 8px 12px; background: #0f3460; border: none;
      color: #eee; font-size: 12px; outline: none;
    }
    #search::placeholder { color: #666; }
    #article-list {
      list-style: none; overflow-y: auto; flex: 1;
    }
    .list-item {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      cursor: pointer; border-bottom: 1px solid #0f3460; transition: background 0.15s;
    }
    .list-item:hover, .list-item.active { background: #0f3460; }
    .num { font-size: 10px; color: #666; min-width: 22px; }
    .list-title { font-size: 11px; flex: 1; line-height: 1.4; }
    .price-tag { font-size: 10px; background: #e94560; color: white; padding: 2px 5px; border-radius: 3px; white-space: nowrap; }

    /* メインエリア */
    #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    #toolbar {
      background: white; padding: 12px 20px; border-bottom: 1px solid #ddd;
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    #current-title { font-size: 15px; font-weight: bold; flex: 1; }
    .btn {
      padding: 7px 14px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 13px; font-weight: bold; transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.8; }
    .btn-blue { background: #4f8ef7; color: white; }
    .btn-green { background: #41b883; color: white; }
    .btn-gray { background: #eee; color: #555; }
    .btn-x { background: #000; color: white; }

    #content-area { flex: 1; overflow-y: auto; padding: 20px; display: flex; gap: 16px; }

    .panel {
      background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; overflow: hidden;
    }
    #article-panel { flex: 2; }
    #dalle-panel { width: 340px; min-width: 300px; }

    .panel-header {
      padding: 12px 16px; background: #f8f8f8; border-bottom: 1px solid #eee;
      display: flex; align-items: center; justify-content: space-between;
    }
    .panel-header h2 { font-size: 13px; color: #666; }
    .panel-body { flex: 1; overflow-y: auto; }

    textarea {
      width: 100%; height: 100%; min-height: 400px;
      border: none; outline: none; resize: none;
      font-size: 13px; line-height: 1.8; padding: 16px;
      font-family: inherit; color: #333;
    }

    #dalle-text {
      width: 100%; height: 100%; min-height: 200px;
      border: none; outline: none; resize: none;
      font-size: 12px; line-height: 1.7; padding: 16px;
      font-family: 'Courier New', monospace; color: #2d6a4f; background: #f0faf4;
    }

    .copied { background: #41b883 !important; }

    #placeholder {
      flex: 1; display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 12px; color: #bbb;
    }
    #placeholder .big { font-size: 48px; }
    #placeholder p { font-size: 14px; }

    /* 区切り線の強調 */
    .paid-divider {
      background: #fff3cd; border-left: 4px solid #ffc107;
      padding: 8px 12px; font-size: 12px; color: #856404;
      margin: 0;
    }
  </style>
</head>
<body>

<div id="sidebar">
  <div id="sidebar-header">
    <h1>📝 NOTE VIEWER</h1>
    <p>佐伯亮カンパニー / ${articles.length}本</p>
  </div>
  <input type="text" id="search" placeholder="🔍 タイトルで絞り込み..." oninput="filterList(this.value)">
  <ul id="article-list">
    ${listItems}
  </ul>
</div>

<div id="main">
  <div id="toolbar">
    <span id="current-title" style="color:#bbb">← 左のリストから記事を選択</span>
    <button class="btn btn-blue" onclick="copyArticle()" id="copy-btn">📋 記事本文をコピー</button>
    <button class="btn btn-x" onclick="copyXPost()" id="x-btn">𝕏 X投稿文をコピー</button>
    <button class="btn btn-green" onclick="copyGemini()" id="gemini-btn">🤖 Gemini画像プロンプト</button>
    <button class="btn btn-gray" onclick="copyDalle()" id="dalle-btn">🎨 英語プロンプト</button>
    <span id="file-info" style="font-size:11px;color:#999;"></span>
  </div>

  <div id="content-area">
    <div id="placeholder">
      <div class="big">📄</div>
      <p>左のリストから記事を選んでください</p>
      <p style="font-size:12px;">記事本文と画像プロンプトをコピーできます</p>
    </div>
  </div>
</div>

<script>
const articles = ${articleData};
let currentIndex = -1;

function show(i) {
  currentIndex = i;
  const a = articles[i];

  document.querySelectorAll('.list-item').forEach((el, idx) => {
    el.classList.toggle('active', idx === i);
  });

  document.getElementById('current-title').textContent = a.title;
  document.getElementById('current-title').style.color = '#333';
  document.getElementById('file-info').textContent = a.file + ' / ' + a.price;

  const area = document.getElementById('content-area');

  // 有料パート区切り位置をハイライト
  const bodyWithMark = a.body.replace(
    '---ここから有料---',
    '\\n⬇️ ここから有料パート（noteで設定）\\n'
  );

  area.innerHTML = \`
    <div class="panel" id="article-panel" style="flex:2">
      <div class="panel-header">
        <h2>📝 記事本文（noteに貼り付け）</h2>
        <span style="font-size:11px;color:#999">\${countChars(a.body)}字</span>
      </div>
      <div class="panel-body">
        <textarea id="article-text" readonly>\${escHtml(a.body)}</textarea>
      </div>
    </div>
    <div class="panel" id="x-panel" style="width:280px;min-width:260px;display:flex;flex-direction:column">
      <div class="panel-header">
        <h2>𝕏 X投稿文</h2>
        <span id="x-char-count" style="font-size:11px;color:#999"></span>
      </div>
      <div class="panel-body" style="flex:1">
        <textarea id="x-text" style="width:100%;height:100%;min-height:200px;border:none;outline:none;resize:none;font-size:13px;line-height:1.8;padding:14px;font-family:inherit;color:#333">\${escHtml(a.xpost)}</textarea>
      </div>
      <div style="padding:8px 12px;font-size:11px;color:#888;border-top:1px solid #eee;background:#fafafa">
        ※ URLは投稿後に入力してください
      </div>
    </div>
    <div class="panel" id="dalle-panel" style="width:280px;min-width:260px;display:flex;flex-direction:column">
      <div class="panel-header">
        <h2>🤖 Gemini用プロンプト（日本語）</h2>
        <span style="font-size:10px;color:\${a.gemini ? '#41b883' : '#f0a500'}">\${a.gemini ? '✅ 変換済み' : '⏳ 未変換'}</span>
      </div>
      <div class="panel-body" style="flex:1">
        <textarea id="gemini-text" readonly style="font-family:inherit;font-size:13px;line-height:1.8;color:#1a3a2a;background:#f0faf4;min-height:150px">\${a.gemini ? escHtml(a.gemini) : '（まだ変換されていません）\\nnpm run gemini-prompt を実行してください'}</textarea>
      </div>
      <div class="panel-header" style="border-top:1px solid #eee;border-bottom:none">
        <h2>🎨 英語プロンプト（DALL-E用）</h2>
      </div>
      <div class="panel-body" style="flex:1">
        <textarea id="dalle-text" readonly style="font-family:monospace;font-size:11px;line-height:1.6;color:#555;background:#f8f8f8;min-height:120px">\${escHtml(a.dalle)}</textarea>
      </div>
      <div style="padding:10px 12px;font-size:11px;color:#666;line-height:1.7;background:#fafafa;border-top:1px solid #eee">
        🤖 Gemini → <a href="https://gemini.google.com" target="_blank" style="color:#4f8ef7">gemini.google.com</a> に日本語プロンプトを貼る<br>
        📁 生成画像をダウンロード → noteのアイキャッチに設定
      </div>
    </div>
  \`;
}

function copyArticle() {
  if (currentIndex < 0) return;
  const clean = articles[currentIndex].clean || articles[currentIndex].body;
  navigator.clipboard.writeText(clean).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✅ コピーしました！';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 記事本文をコピー'; btn.classList.remove('copied'); }, 2000);
  });
}

function copyXPost() {
  if (currentIndex < 0) return;
  const text = articles[currentIndex].xpost || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('x-btn');
    btn.textContent = '✅ コピーしました！';
    btn.style.background = '#41b883';
    setTimeout(() => { btn.textContent = '𝕏 X投稿文をコピー'; btn.style.background = '#000'; }, 2000);
  });
}

function copyGemini() {
  const el = document.getElementById('gemini-text');
  if (!el || !articles[currentIndex]?.gemini) return;
  navigator.clipboard.writeText(el.value).then(() => {
    const btn = document.getElementById('gemini-btn');
    btn.textContent = '✅ コピーしました！';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '🤖 Gemini用プロンプト'; btn.classList.remove('copied'); }, 2000);
  });
}

function copyDalle() {
  const el = document.getElementById('dalle-text');
  if (!el) return;
  navigator.clipboard.writeText(el.value).then(() => {
    const btn = document.getElementById('dalle-btn');
    btn.textContent = '✅ コピーしました！';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '🎨 画像プロンプトをコピー'; btn.classList.remove('copied'); }, 2000);
  });
}

function countChars(str) {
  return str.replace(/\\s/g, '').length.toLocaleString();
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function filterList(query) {
  const items = document.querySelectorAll('.list-item');
  items.forEach((el, i) => {
    const title = articles[i].title;
    el.style.display = title.includes(query) ? '' : 'none';
  });
}

// キーボードナビ
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { show(Math.min(currentIndex + 1, articles.length - 1)); }
  if (e.key === 'ArrowUp') { show(Math.max(currentIndex - 1, 0)); }
});
</script>
</body>
</html>`;

  fs.writeFileSync(VIEWER_FILE, html, "utf-8");
  console.log(`✅ ビューワー生成完了: note-viewer.html (${articles.length}本)`);
}

main();
