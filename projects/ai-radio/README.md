# 佐伯亮のAIゆんたくラジオ

沖縄の日常とAI実験を、お笑い芸人の深夜ラジオのような掛け合いで流すローカルAIラジオです。

## 必要な環境

- Node.js 20以上
- ルート `.env` の `ANTHROPIC_API_KEY`
- ルート `.env` の `XAI_API_KEY`

## 起動

```bash
npm install
npm start
```

起動後、ブラウザで `http://localhost:4173` を開きます。

## BGM

`data/bgm/` にMP3、WAV、M4Aファイルを置くと、将来のBGM再生に使えます。
v1ではBGMが無くてもトークだけで動きます。
