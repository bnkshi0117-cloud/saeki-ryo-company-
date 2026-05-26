/**
 * NPBデータ取得モジュール（NPB公式 + ニュースRSS）
 *
 * データソース:
 * - npb.jp/games/2026/        → セリーグ試合URL一覧
 * - npb.jp/scores/2026/MMDD/  → スコア・スタメン
 * - npb.jp/bis/players/*.html → 選手累積成績
 * - スポーツニュースRSS         → 試合前ニュース
 */

import fetch from "node-fetch";
import RSSParser from "rss-parser";

const BASE = "https://npb.jp";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept-Language": "ja,en;q=0.5",
};

// セリーグ球団コード（URLに使われる）
const CENTRAL_CODES = ["g", "t", "c", "db", "s", "d"];
const TEAM_NAMES = {
  g: "巨人", t: "阪神", c: "広島", db: "DeNA", s: "ヤクルト", d: "中日",
};

// ── メイン取得関数 ──

/**
 * 指定日のセリーグ試合URLリストを取得
 */
export async function fetchCentralGameUrls(dateStr) {
  const mmdd = dateStr.slice(4); // "20260422" → "0422"
  const url = `${BASE}/games/2026/`;

  const html = await fetchHtml(url); // エラー時はthrow（リトライ済み）
  const pattern = new RegExp(`/scores/2026/${mmdd}/([a-z]+-[a-z]+-\\d+)/`, "g");
  const found = new Set();
  let match;
  while ((match = pattern.exec(html)) !== null) {
    found.add(match[1]);
  }

  // セリーグの試合のみ絞り込む
  return [...found]
    .filter((path) => {
      const [away, home] = path.split("-");
      return CENTRAL_CODES.includes(away) && CENTRAL_CODES.includes(home);
    })
    .map((path) => ({
      path,
      url: `${BASE}/scores/2026/${mmdd}/${path}/`,
      // NPBのURL形式は home-away-gameNo
      homeCode: path.split("-")[0],
      awayCode: path.split("-")[1],
    }));
}

/**
 * 試合スコアページから詳細を取得
 */
export async function fetchGameDetail(gameUrl, awayCode, homeCode) {
  try {
    const html = await fetchHtml(gameUrl);

    const detail = {
      url: gameUrl,
      awayTeam: TEAM_NAMES[awayCode] || awayCode,
      homeTeam: TEAM_NAMES[homeCode] || homeCode,
      score: parseScore(html),
      innings: parseInnings(html),
      lineups: parseLineups(html),
      homeRuns: parseHomeRuns(html),
      pitchers: parsePitchers(html),
      battery: parseBattery(html),
      gameInfo: parseGameInfo(html),
      playerIds: extractPlayerIds(html),
    };

    return detail;
  } catch (e) {
    console.error("試合詳細取得エラー:", e.message);
    return null;
  }
}

/**
 * 選手の今季累積成績を取得
 * playerId: NPBの選手ID (e.g. "61165150")
 */
export async function fetchPlayerStats(playerId) {
  const url = `${BASE}/bis/players/${playerId}.html`;
  try {
    const html = await fetchHtml(url);
    return parsePlayerSeasonStats(html, playerId);
  } catch (e) {
    return null;
  }
}

/**
 * 試合に関連する選手の成績を一括取得（スタメン全員）
 */
export async function fetchLineupStats(playerIds) {
  const results = {};
  // 並列取得（最大8人）
  const targets = playerIds.slice(0, 16);
  await Promise.all(
    targets.map(async ({ id, name }) => {
      const stats = await fetchPlayerStats(id);
      if (stats) results[name] = stats;
    })
  );
  return results;
}

/**
 * 野球ニュースを取得（Google News RSS + 専門メディア）
 * @param {string} teamQuery - 球団名でフィルタ（例: "巨人 阪神"）
 */
export async function fetchBaseballNews(limit = 8, teamQuery = "セリーグ") {
  const parser = new RSSParser();

  // Google News RSSで試合結果ニュースを検索
  const googleQuery = encodeURIComponent(`プロ野球 ${teamQuery}`);
  const feeds = [
    `https://news.google.com/rss/search?q=${googleQuery}&hl=ja&gl=JP&ceid=JP:ja`,
    "https://full-count.jp/feed/",
    "https://baseballking.jp/feed",
  ];

  const results = [];
  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = feed.items
        .filter((item) =>
          /巨人|阪神|広島|DeNA|ヤクルト|中日|セリーグ|NPB|プロ野球/.test(item.title || "")
        )
        .slice(0, 4)
        .map((item) => ({
          title: item.title?.trim().replace(/\s*[-|｜].*$/, ""), // ソース名を除去
          link: item.link,
          pubDate: item.pubDate,
        }));
      results.push(...items);
    } catch {
      // RSS取得失敗は無視して続行
    }
  }

  return results.slice(0, limit);
}

// ── パーサー関数 ──

function parseScore(html) {
  // top行=先攻(away), bottom行=後攻(home)
  const totals = [...html.matchAll(/<td class="total-1">(\d+)<\/td>/g)].map(
    (m) => parseInt(m[1])
  );
  // NPBのURL形式はhome-awayなので、topがaway(第2チーム)
  return { away: totals[0] ?? 0, home: totals[1] ?? 0 };
}

function parseInnings(html) {
  // tbody > tr の各td（イニングスコア）
  const rows = [...html.matchAll(/<tr class="(top|bottom)">([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    const side = row[1]; // "top" = 先攻, "bottom" = 後攻
    const scores = [...row[2].matchAll(/<td>(\d+)<\/td>/g)].map((m) =>
      parseInt(m[1])
    );
    return { side, scores };
  });
}

function parseLineups(html) {
  // half_left（先攻）と half_right（後攻）を直接抽出
  const leftSection = extractTableSection(html, 'class="half_left"');
  const rightSection = extractTableSection(html, 'class="half_right"');

  return {
    away: parseLineupTable(leftSection || ""),
    home: parseLineupTable(rightSection || ""),
  };
}

function extractTableSection(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  // tableタグを探して、その終わり</table>を見つける
  const tableStart = html.indexOf("<table", start);
  if (tableStart === -1) return null;
  const tableEnd = html.indexOf("</table>", tableStart);
  if (tableEnd === -1) return null;
  return html.slice(tableStart, tableEnd + 8);
}

function parseLineupTable(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  return rows
    .map((row) => {
      const ths = [...row[1].matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1].trim());
      const playerMatch = row[1].match(/href="\/bis\/players\/(\d+)\.html">([^<]+)<\/a>/);
      if (!playerMatch || ths.length < 2) return null;
      return {
        order: ths[0],
        position: ths[1],
        name: playerMatch[2].trim(),
        id: playerMatch[1],
      };
    })
    // 打順が1〜9の数字の行だけ残す（代打・代走・守備交代を除外）
    .filter((p) => p !== null && /^[1-9]$/.test(p.order) && !/代打|代走/.test(p.position));
}

function parseHomeRuns(html) {
  // table[5]がホームラン情報（table[3]=勝投手、table[4]=バッテリー、table[5]=HR）
  const tables = html.split("<table");
  if (tables.length < 6) return [];

  const hrTable = tables[5];
  const rows = [...hrTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  return rows
    .map((row) => {
      const teamMatch = row[1].match(/<th>【([^】]+)】<\/th>/);
      const tdMatch = row[1].match(/<td>([\s\S]*?)<\/td>/);
      if (!teamMatch || !tdMatch) return null;
      const detail = tdMatch[1].replace(/<[^>]+>/g, "").trim();
      if (!detail) return null;
      return { team: teamMatch[1], detail };
    })
    .filter(Boolean);
}

function parsePitchers(html) {
  // table[3] = 勝投手・敗投手
  const tables = html.split("<table");
  if (tables.length < 4) return {};

  const pitcherTable = tables[3];
  const text = pitcherTable.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const winMatch = text.match(/【勝投手】\s*([^\s（]+)\s*（([^）]+)）/);
  const loseMatch = text.match(/【敗投手】\s*([^\s（]+)\s*（([^）]+)）/);
  const saveMatch = text.match(/【セーブ】\s*([^\s（]+)\s*（([^）]+)）/);

  return {
    win: winMatch ? { name: winMatch[1], record: winMatch[2] } : null,
    lose: loseMatch ? { name: loseMatch[1], record: loseMatch[2] } : null,
    save: saveMatch ? { name: saveMatch[1], record: saveMatch[2] } : null,
  };
}

function parseBattery(html) {
  // table[4] = バッテリー情報
  const tables = html.split("<table");
  if (tables.length < 5) return {};

  const batteryTable = tables[4];
  const rows = [...batteryTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  const result = {};

  rows.forEach((row) => {
    const teamMatch = row[1].match(/<th>【([^】]+)】<\/th>/);
    const tdMatch = row[1].match(/<td>([\s\S]*?)<\/td>/);
    if (!teamMatch || !tdMatch) return;
    const battery = tdMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    // 「投手1、投手2 ‐ キャッチャー」形式
    const parts = battery.split("‐").map((s) => s.trim());
    result[teamMatch[1]] = {
      pitchers: parts[0] ? parts[0].split(/[、,，]/).map((s) => s.trim()).filter(Boolean) : [],
      catcher: parts[1] || "",
    };
  });

  return result;
}

function parseGameInfo(html) {
  const infoMatch = html.match(/◇開始\s*([\d:]+)[\s\S]*?◇試合時間\s*([^\s◇]+)[\s\S]*?◇入場者\s*([\d,]+)人/);
  const venueMatch = html.match(/<span class="place">([^<]+)<\/span>/);
  const dateMatch = html.match(/<time>([^<]+)<\/time>/);

  return {
    date: dateMatch ? dateMatch[1].trim() : "",
    venue: venueMatch ? venueMatch[1].trim() : "",
    startTime: infoMatch ? infoMatch[1] : "",
    duration: infoMatch ? infoMatch[2] : "",
    attendance: infoMatch ? infoMatch[3].replace(",", "") : "",
  };
}

function extractPlayerIds(html) {
  const matches = [...html.matchAll(/href="\/bis\/players\/(\d+)\.html">([^<]+)<\/a>/g)];
  return [...new Map(matches.map((m) => [m[1], { id: m[1], name: m[2].trim() }])).values()];
}

function parsePlayerSeasonStats(html, playerId) {
  const rows = [...html.matchAll(/<tr class="registerStats">([\s\S]*?)<\/tr>/g)];
  if (rows.length === 0) return null;

  // 各行の年度を確認して2026年を探す
  for (let i = rows.length - 1; i >= 0; i--) {
    const rowHtml = rows[i][1];
    const yearMatch = rowHtml.match(/<td class="year">\s*(\d{4})\s*<\/td>/);
    if (yearMatch && yearMatch[1] === "2026") {
      return parseStatsRow(rowHtml, playerId);
    }
  }

  // 2026年行が見つからない場合は最新行を使う（念のため）
  return parseStatsRow(rows[rows.length - 1][1], playerId);
}

function parseStatsRow(rowHtml, playerId) {
  const cells = [...rowHtml.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) =>
    m[1].trim().replace(/\s+/g, "")
  );

  if (cells.length < 10) return null;

  // カラム順: year, team, 試合, 打席, 打数, 得点, 安打, 二塁打, 三塁打, 本塁打, 打点,
  //           盗塁, 盗塁死, 犠打, 犠飛, 四球, 死球, 三振, 併殺, 打率, 長打率, 出塁率
  const avg = parseFloat(cells[cells.length - 3]) || 0;
  const slg = parseFloat(cells[cells.length - 2]) || 0;
  const obp = parseFloat(cells[cells.length - 1]) || 0;
  const ops = Math.round((slg + obp) * 1000) / 1000;

  const pa  = parseInt(cells[3]) || 0;
  const bb  = parseInt(cells[15]) || 0;
  const k   = parseInt(cells[17]) || 0;
  const iso = Math.round((slg - avg) * 1000) / 1000;
  const bbPct = pa > 0 ? Math.round((bb / pa) * 1000) / 10 : 0; // %表示
  const kPct  = pa > 0 ? Math.round((k  / pa) * 1000) / 10 : 0;

  return {
    playerId,
    games:  parseInt(cells[2]) || 0,
    pa,
    atBats: parseInt(cells[4]) || 0,
    hits:   parseInt(cells[6]) || 0,
    doubles: parseInt(cells[7]) || 0,
    triples: parseInt(cells[8]) || 0,
    hr:     parseInt(cells[9]) || 0,
    rbi:    parseInt(cells[10]) || 0,
    steals: parseInt(cells[11]) || 0,
    bb,
    k,
    avg,
    slg,
    obp,
    ops,
    iso,    // 純長打力 = 長打率 - 打率
    bbPct,  // 四球率(%)
    kPct,   // 三振率(%)
  };
}

// ── ユーティリティ ──

export async function withRetry(fn, { retries = 3, delay = 2000, label = "" } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === retries) throw e;
      const wait = delay * attempt;
      console.warn(`  ⚠️ ${label ? label + " " : ""}失敗（${attempt}回目）: ${e.message} → ${wait / 1000}秒後にリトライ`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function fetchHtml(url) {
  return withRetry(
    async () => {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return res.text();
    },
    { retries: 3, delay: 3000, label: url.slice(-40) }
  );
}

function extractSection(html, startMark, endMark) {
  const start = html.indexOf(startMark);
  if (start === -1) return null;
  const end = html.indexOf(endMark, start + startMark.length);
  if (end === -1) return null;
  return html.slice(start, end + endMark.length);
}

export function getTodayStr() {
  const d = new Date();
  return formatDate(d);
}

export function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export { TEAM_NAMES, CENTRAL_CODES };
