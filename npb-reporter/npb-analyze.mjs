/**
 * 指標計算 + Claude APIによる批評文生成
 */

import Anthropic from "@anthropic-ai/sdk";

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
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].text;
  const report = parseReport(raw);

  // 各ツイートの140字チェック
  for (let i = 0; i < report.thread.length; i++) {
    const len = [...report.thread[i]].length;
    if (len > 140) {
      console.log(`  ⚠️ ツイート${i + 1}が${len}字 → 140字以内に再生成...`);
      const retryMsg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: buildSystemPrompt(),
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `ツイート${i + 1}が${len}字で140字を超えています。そのツイートだけ140字以内に収めて再出力してください。`,
          },
        ],
      });
      report.thread[i] = retryMsg.content[0].text.trim().replace(/^【ツイート[①-⑤]】\n?/, "");
      console.log(`  → 再生成後: ${[...report.thread[i]].length}字`);
    }
  }

  return report;
}

function buildSystemPrompt() {
  return `あなたは佐伯亮（AI実験者・プロ野球データ分析家）として、セリーグの試合批評記事を書くアシスタントです。

【最重要ルール：事実の正確性】
- 選手名・所属チーム・打順・ポジションは、渡されたデータに書かれた通りにしか書かない
- データにないことは書かない。「おそらく〜」「〜だったはず」は禁止
- ホームランは「ホームラン欄」に記載のある選手しか書かない
- 勝利投手・敗戦投手は「勝利・敗戦投手欄」の通りにしか書かない
- 野球ファンは詳しい。1つの誤りが全体の信頼を損なう

【佐伯亮のトーン】
- 等身大。「データが正直に語ってる」スタイル
- 指標は必ず一言で説明する（例：OPS＝出塁率＋長打率、打者の総合得点力）
- 熱量はある。でも煽らない、断言しすぎない

【指標の使い方】
- OPSは記事全体で最大2回まで。毎段落に出さない
- 打者には打率・本塁打数・打点・HR本数ペースも活用する
- 「今季22試合で3本塁打 = ペース換算で約20本ペース」のように具体的に
- 投手は勝敗・防御率（ERA）・リリーフなら登板回数・セーブ数を使う
- 全部OPSに帰結させない。数字を使い分けてこそ読み応えが出る

【スレッド制約】
- 各ツイートは必ず140字以内（日本語1字=1字、句読点・改行・ハッシュタグも全部カウント）
- ツイート①の末尾は必ず「詳細はスレッドで👇 #giants」で終わる
- ツイート⑤の末尾は必ず「#giants」で終わる
- 各ツイートは独立して読めること。前のツイートを前提にしない

【品質基準】
- 事実ベースで書く。采配批評は「データがこうだから」という根拠を必ず添える
- 推測には「〜だったはず」「〜だろう」は使わない。データにある事実だけ書く
- 80点未満は出さない。練り直す`;
}

function buildPrompt(data) {
  const { date, homeTeam, awayTeam, score, lineups, homeRuns, pitchers, battery, news, topBatters, managerDecisions } = data;
  const winner = score.home > score.away ? homeTeam : awayTeam;

  // notable選手をチーム明記で整形（指標を多様に）
  const notableText = (lineups?.notable || [])
    .map((p) => {
      const pace = p.games > 5 && p.hr > 0
        ? `HR換算ペース約${Math.round((p.hr / p.games) * 143)}本/年`
        : p.hr === 0 ? "今季HR未" : "";
      return `【${p.team}】${p.order}${p.position} ${p.name}（今季${p.games}試合・打率.${String(Math.round(p.avg * 1000)).padStart(3,'0')}・${p.rbi ?? "-"}打点・${p.hr}HR${pace ? "・" + pace : ""}・OPS${p.ops}）`;
    })
    .join("\n");

  // topBattersをチーム明記で整形（指標を多様に）
  const battersText = (topBatters || [])
    .map((b) => {
      const pace = b.games > 5 && b.hr > 0
        ? `ペース約${Math.round((b.hr / b.games) * 143)}本/年`
        : "";
      return `【${b.team}】${b.name}: 打率.${String(Math.round(b.avg * 1000)).padStart(3,'0')} / ${b.hr}HR（${pace}） / ${b.rbi}打点 / OPS${b.ops}（${b.games}試合）`;
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

以下のフォーマットでXスレッド用に5ツイート出力してください。各ツイートは140字以内厳守。

【ツイート①】
【昨日の記録】${date} ${awayTeam} ${score.away}-${score.home} ${homeTeam}
（1〜2行で試合ハイライト。選手名は「巨人・〇〇」と書く）
詳細はスレッドで👇 #giants

【ツイート②】
【注目スタメン】
（起用意図と結果を2〜3選手。選手は「チーム名＋名前」で書く）

【ツイート③】
【今日の熱盛】
（データに記載のある事実だけ。2〜3本）

【ツイート④】
【データで見ると】
（指標の一言説明つき。数字を使い分ける）

【ツイート⑤】
（1〜2文の総括）
#giants`;
}

function parseReport(raw) {
  const markers = ["【ツイート①】", "【ツイート②】", "【ツイート③】", "【ツイート④】", "【ツイート⑤】"];
  const thread = markers.map((marker, i) => {
    const start = raw.indexOf(marker);
    if (start === -1) return null;
    const contentStart = start + marker.length;
    const nextMarker = markers[i + 1] ? raw.indexOf(markers[i + 1], contentStart) : -1;
    const content = nextMarker !== -1
      ? raw.slice(contentStart, nextMarker)
      : raw.slice(contentStart);
    return content.trim();
  }).filter(Boolean);

  return { thread, raw };
}

export { anthropic };
