# 佐伯亮 X自動投稿ツール 取扱説明書

最終更新：2026-04-14

---

## 概要

AIがRSSニュースを読んで佐伯亮のX投稿を自動生成・投稿するシステムです。
GitHub Actionsで動いており、1日7回（7:00 / 9:00 / 11:00 / 13:00 / 15:00 / 17:00 / 19:00 JST）自動実行されます。

投稿前にSlackへプレビューが届き、**1分以内**にキャンセルできます。

---

## ファイル構成

```
x-dashboard/
├── auto-poster.mjs              # メインスクリプト
├── MANUAL.md                    # この説明書
├── post-log.json                # 投稿履歴（自動更新）
├── pending-post.json            # 投稿直前の一時ファイル（自動削除）
└── data/
    ├── experiment-scenarios.json  # シミュレーション実験シナリオ一覧
    └── satsuki-posts.json         # さつきアカウント用（別システム）

.github/workflows/
└── saeki-auto-post.yml          # GitHub Actions定義
```

---

## 投稿の種類（タイプ）

| タイプ | 内容 | 頻度目安 |
|--------|------|---------|
| `news_insight` | AIニュースを読んだ佐伯亮の解釈・感想 | 最多 |
| `news_citation` | ニュースURLを引用して一言コメント | 週2〜3本 |
| `side_job` | AI副業・Kindle・アプリ開発の実体験 | 実績あるときのみ |
| `algorithm` | Xのアルゴリズムについての仮説・考察 | 週1本 |
| `simulation` | シナリオリストからAIが仮想実験を実施してレポート | シナリオがある間 |

---

## 日常の使い方

### 1. Slack通知が届いたら

```
⏳ 1分後に投稿します｜AIニュース解釈

投稿内容:
「（投稿テキスト）」

ソース: （参考記事）
選定理由: （理由）

❌ NGの場合（1分以内）: GitHubでキャンセル → 画面右上「Cancel workflow」
```

**OKなら何もしない**（1分後に自動投稿されます）

**NGならGitHubのURLをタップ → 画面右上「Cancel workflow」**をクリック

### 2. 投稿完了通知

```
✅ 投稿完了｜（投稿の冒頭60文字）...
https://x.com/saekiryoAI/status/...
コスト: $0.010
```

### 3. 投稿失敗通知

```
❌ X投稿エラー｜（エラー内容）
GitHubActionsのログを確認してください。
```

---

## シミュレーション実験シナリオの管理

### シナリオを追加する

`x-dashboard/data/experiment-scenarios.json` を開いて追記します。

```json
{
  "id": 11,
  "theme": "（実験テーマ）",
  "hypothesis": "（何を検証するか）",
  "used": false
}
```

`"used": false` にしておくと次回の投稿から使われます。

### シナリオを使い切ったら

全件の `"used"` を `false` に戻すか、新しいシナリオを追加してください。
（現在10件あり、1日最大1件ずつ消費します）

---

## 手動で投稿したいとき

GitHub Actions → `佐伯亮 X自動投稿` → `Run workflow` ボタンで即時実行できます。

---

## エラー・トラブル対応

### 「X投稿エラー：タイムアウト（30秒）」が届いた場合

XのAPIサーバーが応答しなかったケースです。
`pending-post.json` が残っているので、`Run workflow` → postモードで再投稿できます。
（または次回の定時投稿まで待つ）

### 「X APIクレデンシャル未設定」が届いた場合

GitHubリポジトリ → Settings → Secrets and variables → Actions で以下を確認：

| シークレット名 | 内容 |
|--------------|------|
| `X_CONSUMER_KEY` | APIキー |
| `X_CONSUMER_SECRET` | APIシークレット |
| `X_ACCESS_TOKEN` | アクセストークン |
| `X_ACCESS_TOKEN_SECRET` | アクセストークンシークレット |
| `ANTHROPIC_API_KEY` | Claude APIキー |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL |

### 投稿がずっとされない（ワークフローがハングしている）

GitHubのActionsページでワークフローを「Cancel」して止めてください。
30秒タイムアウトで自動停止するはずですが、念のため手動でキャンセルをお願いします。

---

## コスト管理

X APIは2026年2月から従量課金制です。

| 操作 | 単価 |
|------|------|
| 投稿1件 | $0.010（約1.5円） |
| 7投稿/日 | $0.07/日（約10円） |
| 月換算 | 約$2.1/月（約315円） |

**重要：X API管理画面で支出上限を設定してください。**
デフォルトは「無制限の支出を許可」になっています。

---

## 投稿ログの確認

`x-dashboard/post-log.json` に全投稿履歴が残ります。

```json
{
  "type": "news_insight",
  "text": "投稿テキスト",
  "posted_at": "2026-04-13T04:24:00.731Z",
  "tweet_id": "..."
}
```

---

## スケジュール変更・停止したいとき

`.github/workflows/saeki-auto-post.yml` を編集します。

**一時停止**：`on: schedule:` の行を削除またはコメントアウト
**時間変更**：`cron:` の時刻を変更（UTCで指定、JSTはUTC+9）
**頻度変更**：cronエントリを増減

現在の設定（JST）：7:00 / 9:00 / 11:00 / 13:00 / 15:00 / 17:00 / 19:00

---

*作成：瀬野美智（専務取締役）*
