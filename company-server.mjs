/**
 * 佐伯亮カンパニー ローカルサーバー
 * 起動: node company-server.mjs
 * → http://localhost:3355 をブラウザで開く
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3355;
const OUTPUT_DIR = path.join(__dirname, "note-generator", "output");
const REPORT_FILE = path.join(__dirname, "note-generator", "data", "quality-report.json");
const HTML_FILE = path.join(__dirname, "company-rpg.html");
const VIEWER_FILE = path.join(__dirname, "note-viewer.html");

function getStatus() {
  // 記事数カウント
  let totalArticles = 0;
  let rankCounts = { A: 0, B: 0, C: 0, D: 0 };

  if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".md"));
    totalArticles = files.length;
  }

  // 品質レポート読み込み
  let articles = [];
  if (fs.existsSync(REPORT_FILE)) {
    try {
      const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
      rankCounts = report.summary || rankCounts;
      articles = (report.results || []).map((r) => ({
        id: r.id,
        file: r.file,
        rank: r.rank,
        score: r.score,
        charCount: r.charCount,
      }));
    } catch (e) {}
  }

  // 推定売上（480円平均として）
  const avgPrice = 480;
  const estimatedRevenue = totalArticles * avgPrice;

  return {
    totalArticles,
    rankCounts,
    estimatedRevenue,
    articles,
    lastUpdated: new Date().toLocaleTimeString("ja-JP"),
    serverTime: new Date().toISOString(),
  };
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(getStatus()));
    return;
  }

  // メインHTML
  if (req.url === "/" || req.url === "/index.html") {
    if (fs.existsSync(HTML_FILE)) {
      const html = fs.readFileSync(HTML_FILE, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("company-rpg.html not found");
    }
    return;
  }

  // note記事ビューワー
  if (req.url === "/viewer" || req.url === "/viewer.html") {
    if (fs.existsSync(VIEWER_FILE)) {
      const html = fs.readFileSync(VIEWER_FILE, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("note-viewer.html not found. Run: npm run build-viewer");
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🏢 佐伯亮カンパニー サーバー起動中`);
  console.log(`👉 会社ページ:     http://localhost:${PORT}`);
  console.log(`👉 note記事一覧:   http://localhost:${PORT}/viewer`);
  console.log(`\nCtrl+C で停止\n`);
});
