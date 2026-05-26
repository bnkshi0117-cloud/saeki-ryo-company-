/**
 * 指標計算 + Claude APIによる批評文生成
 */

import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./npb-fetch.mjs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 指標計算 ──

export function calcOPS(stats) {
  const { atBats: ab, hits: h, walks: bb, hbp = 0, sf = 0, doubles: d = 0, triples: t = 0, hr = 0 } = stats;
  if (ab + bb + hbp + sf === 0) return 0;
  const obp = (h + bb + hbp) / (ab + bb + hbp + sf);
  const singles = h - d - t - hr;
  const tb = singles + 2 * d + 3 * t + 4 * hr;
  const slg = ab > 0 ? tb / ab : 0;
  return Math.round((obp + slg) * 1000) / 1000;
}

export function calcFIP(stats, constant = 3.15) {
  const { hr, bb, hbp = 0, k, ip } = stats;
  if (ip === 0) return 0;
  return Math.round(((13 * hr + 3 * (bb + hbp) - 2 * k) / ip + constant) * 100) / 100;
}

export function calcBABIP(stats) {
  const { hits: h, hr = 0, atBats: ab, k = 0, sf = 0 } = stats;
  const denom = ab - k - hr + sf;
  if (denom === 0) return 0;
  return Math.round(((h - hr) / denom) * 1000) / 1000;
}

export function gradeOPS(ops) {
  if (ops >= 0.9) return { grade: "S", label: "超一流" };
  if (ops >= 0.8) return { grade: "A", label: "一流" };
  if (ops >= 0.7) return { grade: "B", label: "平均以上" };
  if (ops >= 0.6) return { grade: "C", label: "平均的" };
  return { grade: "D", label: "改善が必要" };
}

export function gradeFIP(fip) {
  if (fip <= 2.5) return { grade: "S", label: "エース級" };
  if (fip <= 3.2) return { grade: "A", label: "好投手" };
  if (fip <= 4.0) return { grade: "B", label: "平均的" };
  if (fip <= 5.0) return { grade: "C", label: "やや不安" };
  return { grade: "D", label: "打ち込まれた" };
}

// ── データ検証 ──

/**
 * Claudeに渡す前にデータの整合性を検証する
 * エラーがあれば例外を投げる
 */
export function validateGameData(data) {
  const errors = [];

  // 1. notable選手に全員team名があるか
  for (const p of data.lineups?.notable || []) {
    if (!p.team) errors.push(`notable選手「${p.name}」にteamが未設定`);
  }

  // 2. topBattersに全員team名があるか
  for (const b of data.topBatters || []) {
    if (!b.team) errors.push(`topBatter「${b.name}」にteamが未設定`);
  }

  // 3. スコアが取れているか
  if (data.score.away === 0 && data.score.home === 0) {
    errors.push("スコアが両方0（取得失敗の可能性）");
  }

  if (errors.length > 0) {
    throw new Error("データ検証エラー:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }

  // OPS異常値は警告のみ（除外済みのはずだが念のため）
  for (const p of [...(data.lineups?.notable || []), ...(data.topBatters || [])]) {
    if (p.ops > 2.0) {
      console.warn(`  ⚠️ 警告: 「${p.name}」のOPS${p.ops}は小サンプルの可能性（打数${p.atBats || "不明"}）`);
    }
  }
}

// ── Claude API 批評文生成 ──

export async function generateReport(gameData) {
  // 生成前にデータ検証
  validateGameData(gameData);

  const prompt = buildPrompt(gameData);
  const message = await withRetry(
    () => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: prompt }],
    }),
    { retries: 3, delay: 5000, label: "Claude生成API" }
  );

  const raw = message.content[0].text;
  const report = parseReport(raw);

  // 600字超えの場合は再生成
  const len = [...report.thread[0]].length;
  if (len > 600) {
    console.log(`  ⚠️ 投稿が${len}字 → 600字以内に再生成...`);
    const retryMsg = await withRetry(
      () => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: buildSystemPrompt(),
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: raw },
          { role: "user", content: `投稿が${len}字で600字を超えています。600字以内に収めて【投稿】フォーマットで再出力してください。` },
        ],
      }),
      { retries: 2, delay: 3000, label: "600字再生成API" }
    );
    return parseReport(retryMsg.content[0].text);
  }

  return report;
}

function buildSystemPrompt() {
  return `あなたは佐伯亮（AI実験者・プロ野球データ分析家）として、セリーグの試合批評を1投稿にまとめるアシスタントです。

【最重要ルール：事実の正確性】
- 選手名・所属チーム・打順・ポジションは、渡されたデータに書かれた通りにしか書かない
- データにないことは書かない。「おそらく〜」「〜だったはず」は禁止
- ホームランは「ホームラン欄」に記載のある選手しか書かない
- 勝利投手・敗戦投手は「勝利・敗戦投手欄」の通りにしか書かない
- 野球ファンは詳しい。1つの誤りが全体の信頼を損なう

【佐伯亮のトーン】
- 等身大。「データが正直に語ってる」スタイル
- 指標は必ず一言で説明する（例：OPS＝出塁率＋長打率）
- 熱量はある。でも煽らない、断言しすぎない

【指標の使い方】
- OPSは1回まで。打率・本塁打・打点・防御率も使う
- 「今季22試合で3本塁打 = ペース換算で約20本ペース」のように具体的に
- 投手は勝敗・防御率・セーブ数を使う
- BB%（四球率）= 選球眼の指標。NPB平均は約8〜9%。10%超えは選球眼優秀
- K%（三振率）= コンタクト力の指標。NPB平均は約18〜20%。15%以下は接触力高い
- ISO（純長打力 = 長打率−打率）= 長打力のみを示す指標。0.150以上は長打力あり
- これらの指標を「一言で意味を添えて」使う（例：「BB%11%と選球眼が良く」）
- 全指標を羅列しない。試合の文脈に合う1〜2個を選んで使う

【投稿制約】
- 400〜600字を目安（日本語1字=1字）。600字を超えない
- 末尾は必ず「#giants」で終わる
- 適度に改行を入れて読みやすくする
- 以下の構成で書く：
  ①スコア・勝敗投手（1〜2行）
  ②ポイントシーン・注目選手（2〜3行）
  ③データで見ると（指標1〜2個、一言説明つき）
  ④総括（1行）
- 読んで30秒で試合の全体像がわかること

【品質基準】
- 事実ベースで書く。采配批評は根拠を添える
- 推測には「〜だったはず」「〜だろう」は使わない
- 80点未満は出さない。練り直す`;
}

function buildPrompt(data) {
  const { date, homeTeam, awayTeam, score, lineups, homeRuns, pitchers, battery, news, topBatters, managerDecisions } = data;
  const winner = score.home > score.away ? homeTeam : awayTeam;

  // notable選手をチーム明記で整形（詳細指標つき）
  const notableText = (lineups?.notable || [])
    .map((p) => {
      const pace = p.games > 5 && p.hr > 0
        ? `HRペース約${Math.round((p.hr / p.games) * 143)}本/年`
        : "";
      const adv = [
        p.iso != null ? `ISO${p.iso}` : "",
        p.bbPct != null ? `BB%${p.bbPct}%` : "",
        p.kPct != null ? `K%${p.kPct}%` : "",
        p.steals > 0 ? `${p.steals}盗塁` : "",
      ].filter(Boolean).join("・");
      const avgStr = p.avg != null ? `.${String(Math.round(p.avg * 1000)).padStart(3,'0')}` : "-";
      return `【${p.team}】${p.order}${p.position} ${p.name}（${p.games}試合・打率${avgStr}・${p.rbi ?? "-"}打点・${p.hr ?? 0}HR${pace ? "・" + pace : ""}・OPS${p.ops}${adv ? "｜" + adv : ""}）`;
    })
    .join("\n");

  // topBattersをチーム明記で整形（詳細指標つき）
  const battersText = (topBatters || [])
    .map((b) => {
      const pace = b.games > 5 && b.hr > 0
        ? `ペース約${Math.round((b.hr / b.games) * 143)}本/年`
        : "";
      const adv = [
        b.iso != null ? `ISO${b.iso}` : "",
        b.bbPct != null ? `BB%${b.bbPct}%` : "",
        b.kPct != null ? `K%${b.kPct}%` : "",
      ].filter(Boolean).join(" / ");
      return `【${b.team}】${b.name}: 打率.${String(Math.round(b.avg * 1000)).padStart(3,'0')} / ${b.hr}HR（${pace}） / ${b.rbi}打点 / OPS${b.ops}（${b.games}試合）${adv ? " ｜ " + adv : ""}`;
    })
    .join("\n");

  return `以下のデータを使って、今日の試合批評記事を生成してください。

【重要】渡されたデータにない事実は書かないこと。選手の所属チームは【チーム名】の通りにすること。

## 試合情報
日付: ${date}
カード: ${awayTeam}（先攻） ${score.away} - ${score.home} ${homeTeam}（後攻）
結果: ${winner}の勝利

## 勝利・敗戦投手
勝: ${pitchers?.win ? `${pitchers.win.name}（${pitchers.win.record}）` : "不明"}
負: ${pitchers?.lose ? `${pitchers.lose.name}（${pitchers.lose.record}）` : "不明"}
${pitchers?.save ? `セーブ: ${pitchers.save.name}（${pitchers.save.record}）` : ""}

## バッテリー
${Object.entries(battery || {}).map(([team, b]) => `${team}: 投手=${b.pitchers.join("→")} / 捕手=${b.catcher}`).join("\n") || "不明"}

## ホームラン（この欄にある選手だけ書くこと）
${homeRuns?.length > 0 ? homeRuns.map((hr) => `${hr.team}: ${hr.detail}`).join("\n") : "なし"}

## 注目スタメン（チーム・打順・ポジション・名前・今季成績）
${notableText || "なし"}

## 采配ポイント
${(managerDecisions || []).map((d) => `・${d.scene}（${d.context}）`).join("\n") || "なし"}

## 今日のニュース
${(news || []).map((n) => `・${n.title}`).join("\n") || "なし"}

## 今季成績上位打者（チーム明記）
${battersText || "なし"}

---

以下のフォーマットで1投稿（400〜600字、600字以内厳守）として出力してください。

【投稿】
【${date} ${awayTeam}${score.away}-${score.home}${homeTeam}】
（スコア・勝敗投手・ポイントシーン・データ一言・総括を凝縮。選手名は「巨人・〇〇」と書く）
#giants`;
}

function parseReport(raw) {
  const match = raw.match(/【投稿】\s*([\s\S]+)/);
  const post = match ? match[1].trim() : raw.trim();
  const len = [...post].length;
  if (len > 600) {
    console.warn(`  ⚠️ 投稿が${len}字（600字超え）`);
  }
  return { thread: [post], raw };
}

// ── 自己検証・修正 ──

export async function fixReport(report, gameData, issues) {
  const tweetText = report.thread.map((t, i) => `【ツイート${i + 1}】\n${t}`).join("\n\n");
  const issueList = issues.map((i) => `- ${i}`).join("\n");

  const startersAway = (gameData.lineups.away || []).map((p) => `${p.order}番 ${p.position} ${p.name}`).join("\n");
  const startersHome = (gameData.lineups.home || []).map((p) => `${p.order}番 ${p.position} ${p.name}`).join("\n");
  const homeRunText = gameData.homeRuns?.length > 0
    ? gameData.homeRuns.map((h) => `${h.team}: ${h.detail}`).join("\n")
    : "なし";

  const fixPrompt = `以下のXスレッドに事実誤認が見つかりました。修正してください。

## 発見された問題点
${issueList}

## 正しい試合データ
スコア: ${gameData.awayTeam}（先攻）${gameData.score.away} - ${gameData.score.home}${gameData.homeTeam}（後攻）
勝利投手: ${gameData.pitchers?.win?.name || "なし"}
敗戦投手: ${gameData.pitchers?.lose?.name || "なし"}
セーブ: ${gameData.pitchers?.save?.name || "なし"}
ホームラン: ${homeRunText}
【スタメン（打順1〜9番のみ）】
${gameData.awayTeam}: ${startersAway}
${gameData.homeTeam}: ${startersHome}

## 修正前のスレッド
${tweetText}

問題のあるツイートを修正し、同じフォーマット（【ツイート①】〜【ツイート⑤】）で全5ツイートを出力してください。各ツイートは140字以内厳守。`;

  const message = await withRetry(
    () => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: fixPrompt }],
    }),
    { retries: 3, delay: 5000, label: "修正API" }
  );

  return parseReport(message.content[0].text);
}

export async function verifyReport(report, gameData) {
  const tweetText = report.thread.map((t, i) => `【ツイート${i + 1}】\n${t}`).join("\n\n");

  const startersAway = (gameData.lineups.away || []).map((p) => `${p.order}番 ${p.position} ${p.name}`).join("\n");
  const startersHome = (gameData.lineups.home || []).map((p) => `${p.order}番 ${p.position} ${p.name}`).join("\n");
  const homeRunText = gameData.homeRuns?.length > 0
    ? gameData.homeRuns.map((h) => `${h.team}: ${h.detail}`).join("\n")
    : "なし";

  const verifyPrompt = `以下の試合データ（事実）と、生成したXスレッドの内容を照合してください。

## 試合データ（事実）
スコア: ${gameData.awayTeam}（先攻）${gameData.score.away} - ${gameData.score.home}${gameData.homeTeam}（後攻）
勝利投手: ${gameData.pitchers?.win?.name || "なし"}
敗戦投手: ${gameData.pitchers?.lose?.name || "なし"}
セーブ: ${gameData.pitchers?.save?.name || "なし"}
ホームラン: ${homeRunText}

【スタメン（1〜9番のみ・代打代走は含まない）】
${gameData.awayTeam}:
${startersAway || "なし"}
${gameData.homeTeam}:
${startersHome || "なし"}

## 生成したXスレッド
${tweetText}

## 検証指示
ツイート内の事実的な主張（選手名・打順・ポジション・「スタメン」「途中出場」等の区別・数値）を上記データと照合してください。
データに存在しない選手をスタメンと記述している場合、打順やポジションが違う場合、ホームランを打っていない選手の記述がある場合は問題として報告してください。

問題がなければ1行目に「OK」とだけ書いてください。
問題があれば1行目に「NG」、2行目以降に「- （問題の具体的内容）」の形式で列挙してください。`;

  const message = await withRetry(
    () => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: verifyPrompt }],
    }),
    { retries: 3, delay: 5000, label: "検証API" }
  );

  const result = message.content[0].text.trim();
  const ok = result.startsWith("OK");
  const issues = ok
    ? []
    : result.split("\n").filter((l) => l.startsWith("-")).map((l) => l.slice(2).trim());

  return { ok, issues, raw: result };
}

export { anthropic };
