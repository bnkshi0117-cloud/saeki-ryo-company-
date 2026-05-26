/**
 * NPB セリーグ 試合批評ジェネレーター
 *
 * 使い方：
 *   node npb-report.mjs                   → 当日のセリーグ全試合（データそろい次第即投稿）
 *   node npb-report.mjs --date 20260422   → 指定日
 *   node npb-report.mjs --team 巨人        → 指定球団の試合のみ
 *   node npb-report.mjs --dry-run         → データ取得のみ（Claude生成しない）
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TwitterApi } from "twitter-api-v2";

import {
  fetchCentralGameUrls,
  fetchGameDetail,
  fetchLineupStats,
  fetchBaseballNews,
  getTodayStr,
} from "./npb-fetch.mjs";
import { generateReport, verifyReport, fixReport } from "./npb-analyze.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const dateIdx = args.indexOf("--date");
const dateArg = dateIdx !== -1 ? args[dateIdx + 1] : null;
const teamIdx = args.indexOf("--team");
const teamFilter = teamIdx !== -1 ? args[teamIdx + 1] : null;

function alreadyPosted(date, teamFilter) {
  const logPath = path.join(__dirname, "data", "post-log.json");
  if (!fs.existsSync(logPath)) return false;
  const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
  const dateLabel = `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`;
  return log.some((entry) => {
    if (entry.date !== dateLabel) return false;
    if (!teamFilter) return true;
    return entry.matchup?.includes(teamFilter);
  });
}

async function main() {
  const date = dateArg || getTodayStr();
  const dateLabel = `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`;

  console.log(`\n⚾ NPB批評ジェネレーター 起動`);
  console.log(`📅 対象日: ${dateLabel}`);
  console.log(`🏟 リーグ: セントラルリーグ\n`);

  // 二重投稿防止：既に今日の試合をポスト済みなら終了
  if (!isDryRun && alreadyPosted(date, teamFilter)) {
    console.log("  → 本日分は投稿済みです。スキップします。");
    return;
  }

  // Step 1: 試合URL一覧取得
  console.log("Step 1: セリーグ試合を取得中...");
  const gameUrls = await fetchCentralGameUrls(date);

  if (gameUrls.length === 0) {
    console.log("  → 試合データなし（試合なし or まだ終了していない）");
    return;
  }

  console.log(`  → ${gameUrls.length}試合取得\n`);

  // Step 2: ニュース取得（対象球団を検索クエリに含める）
  console.log("Step 2: 野球ニュースを取得中...");
  const teamQuery = teamFilter || "セリーグ";
  const news = await fetchBaseballNews(8, teamQuery);
  console.log(`  → ${news.length}件取得\n`);

  // Step 3: 各試合を処理
  for (const { url, awayCode, homeCode } of gameUrls) {
    const awayName = { g: "巨人", t: "阪神", c: "広島", db: "DeNA", s: "ヤクルト", d: "中日" }[awayCode] || awayCode;
    const homeName = { g: "巨人", t: "阪神", c: "広島", db: "DeNA", s: "ヤクルト", d: "中日" }[homeCode] || homeCode;

    if (teamFilter && awayName !== teamFilter && homeName !== teamFilter) continue;

    console.log(`Step 3: ${awayName} vs ${homeName} の詳細取得中...`);
    const detail = await fetchGameDetail(url, awayCode, homeCode);
    if (!detail) { console.log("  → 取得失敗、スキップ\n"); continue; }

    // Step 4: スタメン選手の累積成績取得（投手除く）
    console.log(`Step 4: スタメン選手の今季成績を取得中...`);
    const allPlayers = [...(detail.lineups.away || []), ...(detail.lineups.home || [])]
      .filter((p) => p.position !== "投"); // 投手の打撃成績は除外
    const playerStats = await fetchLineupStats(allPlayers);
    console.log(`  → ${Object.keys(playerStats).length}人分取得\n`);

    const gameData = buildGameData(detail, playerStats, news, dateLabel);

    if (isDryRun) {
      console.log("[dry-run] 取得データ:");
      console.log(JSON.stringify(gameData, null, 2));
      continue;
    }

    // Step 5: Claude で批評文生成
    console.log("Step 5: 批評文を生成中（Claude API）...");
    const report = await generateReport(gameData);
    console.log(`  ✅ 生成完了（${[...report.thread[0]].length}字）`);

    // Step 6: 出力・保存
    outputReport(report, gameData, date);

    // Step 7: Xスレッド投稿
    if (!isDryRun) {
      await postToX(report.thread, gameData);
    }
    console.log("");
  }
}

function buildGameData(detail, playerStats, news, dateLabel) {
  const { awayTeam, homeTeam, score, lineups, homeRuns, gameInfo, playerIds } = detail;

  // スタメン注目選手（3〜5番クリーンナップ + 今季OPS高い選手）
  const notablePlayers = extractNotablePlayers(lineups, playerStats, awayTeam, homeTeam);

  // チーム別に選手を紐付けてからtopBattersを作る
  const playerTeamMap = {};
  for (const p of lineups.away || []) playerTeamMap[p.name] = awayTeam;
  for (const p of lineups.home || []) playerTeamMap[p.name] = homeTeam;

  // 打数20以上の野手のみ・小サンプル異常値を除外
  const topBatters = Object.entries(playerStats)
    .filter(([, s]) => s && s.ops > 0 && s.atBats >= 20)
    .sort(([, a], [, b]) => b.ops - a.ops)
    .slice(0, 6)
    .map(([name, s]) => ({
      team: playerTeamMap[name] || "不明",
      name,
      avg: s.avg,
      ops: s.ops,
      hr: s.hr,
      rbi: s.rbi,
      games: s.games,
      atBats: s.atBats,
      iso: s.iso,
      bbPct: s.bbPct,
      kPct: s.kPct,
    }));

  return {
    date: dateLabel,
    homeTeam,
    awayTeam,
    score,
    gameInfo,
    lineups: {
      away: lineups.away,
      home: lineups.home,
      notable: notablePlayers,
    },
    homeRuns,
    pitchers: detail.pitchers || {},
    battery: detail.battery || {},
    news: news.slice(0, 5),
    topBatters,
    keyPlays: [],
    managerDecisions: extractManagerDecisions(lineups, playerStats, awayTeam, homeTeam),
  };
}

function extractNotablePlayers(lineups, playerStats, awayTeam, homeTeam) {
  const notable = [];
  const sides = [
    { players: lineups.away || [], teamName: awayTeam },
    { players: lineups.home || [], teamName: homeTeam },
  ];

  for (const { players, teamName } of sides) {
    for (const player of players) {
      const stats = playerStats[player.name];
      const isCleanup = ["3", "4", "5"].includes(player.order);
      const isHotBatter = stats && stats.ops >= 0.85;
      const isRookie = stats && stats.games <= 20 && stats.games > 0;

      // OPS異常値（打数20未満で2.0超え）はnotableから除外
      const opsReliable = !stats || stats.atBats >= 20 || stats.ops <= 1.5;

      if ((isCleanup || isHotBatter || isRookie) && opsReliable) {
        notable.push({
          team: teamName,
          order: `${player.order}番`,
          name: player.name,
          position: player.position,
          ops: stats?.ops || null,
          avg: stats?.avg || null,
          hr: stats?.hr || null,
          rbi: stats?.rbi || null,
          iso: stats?.iso || null,
          bbPct: stats?.bbPct || null,
          kPct: stats?.kPct || null,
          doubles: stats?.doubles || null,
          steals: stats?.steals || null,
          games: stats?.games || null,
          atBats: stats?.atBats || null,
          note: isRookie
            ? `今季${stats.games}試合の若手`
            : isHotBatter
            ? `OPS${stats.ops}・今季好調`
            : "クリーンナップ",
        });
      }
    }
  }

  return notable.slice(0, 6);
}

function extractManagerDecisions(lineups, playerStats, awayTeam, homeTeam) {
  const decisions = [];

  const sides = [
    { players: lineups.away, teamName: awayTeam },
    { players: lineups.home, teamName: homeTeam },
  ];

  for (const { players, teamName } of sides) {
    const player3rd = players?.find((p) => p.order === "3");
    if (!player3rd) continue;

    const stats = playerStats[player3rd.name];
    // 今季試合数が少ない選手をクリーンナップに起用した場合
    if (stats && stats.games <= 15 && stats.atBats >= 5) {
      decisions.push({
        scene: `${teamName}が${player3rd.name}を3番起用`,
        context: `今季${stats.games}試合・打率${stats.avg}・OPS${stats.ops}`,
        question: "1軍実績の少ない選手をクリーンナップに置いた監督の意図は？",
      });
    }
  }

  return decisions;
}

function outputReport(report, gameData, date, { draftOnly = false } = {}) {
  const { awayTeam, homeTeam, score } = gameData;
  const scoreLine = `${awayTeam} ${score.away}-${score.home} ${homeTeam}`;
  const suffix = draftOnly ? "-DRAFT" : "";
  const filename = `${date}-${awayTeam}vs${homeTeam}${suffix}.md`;
  const outputPath = path.join(__dirname, "data", filename);

  const postText = report.thread[0];

  const content = `# ${gameData.date} ${scoreLine}

---

> ※ この記事はAIが試合データをもとに生成しています。数値に誤差が生じる場合があります。

### 投稿（${[...postText].length}字）
${postText}

---
*生成: ${new Date().toLocaleString("ja-JP")}*
`;

  fs.writeFileSync(outputPath, content, "utf-8");

  console.log("=".repeat(60));
  console.log(`⚾ ${gameData.date} ${scoreLine}`);
  console.log("=".repeat(60));
  console.log(`\n【投稿】${[...postText].length}字`);
  console.log(postText);
  console.log("=".repeat(60));
  console.log(`💾 保存: ${outputPath}`);
}

// ── デモモード ──
async function runDemoMode(dateLabel, dryRun) {
  const demoData = {
    date: dateLabel,
    homeTeam: "阪神",
    awayTeam: "巨人",
    score: { home: 3, away: 5 },
    gameInfo: { venue: "甲子園", startTime: "18:00", duration: "3時間12分", attendance: "43500" },
    lineups: {
      notable: [
        { order: "3番", name: "石塚裕惺", position: "遊撃手", ops: 0.72, avg: 0.28, note: "今季7試合の若手" },
        { order: "4番", name: "岡本和真", position: "一塁手", ops: 0.92, avg: 0.31, note: "OPS0.92・今季好調" },
      ],
      away: [],
      home: [],
    },
    homeRuns: [{ team: "巨人", detail: "岡本和真 8号（7回ソロ）" }],
    news: [
      { title: "巨人・石塚が1軍昇格、阿部監督が3番起用を明言" },
      { title: "阪神・大山が打撃好調を維持" },
    ],
    topBatters: [
      { name: "岡本和真", avg: 0.31, ops: 0.92, hr: 8, rbi: 18, games: 22 },
      { name: "石塚裕惺", avg: 0.28, ops: 0.72, hr: 0, rbi: 3, games: 7 },
    ],
    keyPlays: [
      { inning: 3, description: "石塚タイムリー2塁打で先制" },
      { inning: 7, description: "岡本ソロホームラン" },
    ],
    managerDecisions: [
      { scene: "3番に石塚起用", context: "今季7試合・打率.280", question: "実績の薄い若手をクリーンナップに置いた判断は？" },
    ],
  };

  if (dryRun) {
    console.log(JSON.stringify(demoData, null, 2));
    return;
  }

  console.log("Claude APIで批評文を生成中...");
  const report = await generateReport(demoData);
  outputReport(report, demoData, dateLabel.replace(/\//g, ""));
  await postToX(report.thread, demoData);
}

// ── Xスレッド投稿 ──
async function postToX(thread, gameData) {
  const keys = ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.log(`  ⚠️ X APIキー未設定（${missing.join(", ")}）→ 投稿スキップ`);
    return;
  }

  const client = new TwitterApi({
    appKey:      process.env.X_CONSUMER_KEY,
    appSecret:   process.env.X_CONSUMER_SECRET,
    accessToken:  process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  console.log("Step 7: Xスレッド投稿中...");
  let replyToId = null;
  const tweetIds = [];

  for (let i = 0; i < thread.length; i++) {
    const params = { text: thread[i] };
    if (replyToId) params.reply = { in_reply_to_tweet_id: replyToId };
    const res = await client.v2.tweet(params);
    replyToId = res.data.id;
    tweetIds.push(replyToId);
    console.log(`  ✅ ツイート${i + 1}: https://x.com/saekiryoAI/status/${replyToId}`);
  }

  // 投稿ログ保存
  const logPath = path.join(__dirname, "data", "post-log.json");
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
  log.push({
    date: gameData.date,
    matchup: `${gameData.awayTeam}vs${gameData.homeTeam}`,
    score: `${gameData.score.away}-${gameData.score.home}`,
    tweet_ids: tweetIds,
    url: `https://x.com/saekiryoAI/status/${tweetIds[0]}`,
    posted_at: new Date().toISOString(),
  });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

main().catch((e) => {
  console.error("エラー:", e.message);
  process.exit(1);
});
