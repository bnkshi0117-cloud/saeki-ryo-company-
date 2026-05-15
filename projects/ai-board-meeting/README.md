# AI Board Meeting

ラフなテーマを渡すと、AI役員会の議事ログを生成して `logs/meeting/` に保存するCLIです。

## Setup

```powershell
cd projects/ai-board-meeting
npm install
```

## Env

リポジトリルートの `.env` に Anthropic API キーを設定します。

```env
ANTHROPIC_API_KEY=your_api_key
```

必要に応じてモデルやエンドポイントを上書きできます。

```env
AI_BOARD_MEETING_MODEL=claude-sonnet-4-6
ANTHROPIC_ENDPOINT=https://api.anthropic.com/v1/messages
```

## Usage

位置引数でテーマを渡せます。

```powershell
npm start -- "AIラジオの次の可能性"
```

オプションで目的、制約、想定チャネルも渡せます。

```powershell
npm start -- --theme "AIラジオの次の可能性" --purpose "佐伯亮ブランドの次の実験を決める" --constraints "2時間" --channels "X,note,AIラジオ"
```

テーマがない場合はエラーになります。

```powershell
npm start
```

## Output

生成されたMarkdownは、リポジトリルート配下の `logs/meeting/` に保存されます。

保存に成功すると、CLI は保存先を表示します。

```text
AI役員会ログを保存しました: C:\...\logs\meeting\2026-05-15-...
```

## Verification

```powershell
cd projects/ai-board-meeting
npm test
npm start
```

`npm start` を引数なしで実行した場合は、終了コード `1` で「テーマを指定してください」と表示されるのが期待動作です。
