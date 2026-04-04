"""
YouTube文字起こし取得スクリプト
YouTube人気動画を検索 → 文字起こし取得 → 一時ファイルに保存

Claude Codeがこのファイルを読んでnote記事を生成します。
使い方: python skills/note_generator.py
"""

import os
import sys
from datetime import date
from pathlib import Path
from dotenv import load_dotenv
from googleapiclient.discovery import build
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled

load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

# 検索キーワード（日付でローテーション）
KEYWORDS = [
    "Claude AI 活用",
    "ChatGPT 副業",
    "AI 自動化 稼ぐ",
    "生成AI ビジネス",
    "AI アプリ 開発",
]

TRANSCRIPT_FILE = Path(__file__).parent.parent / "logs" / "content" / "temp_transcript.md"


def search_youtube(keyword: str, max_results: int = 5) -> list:
    """再生回数の多い動画を検索"""
    youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    response = youtube.search().list(
        q=keyword,
        part="id,snippet",
        type="video",
        order="viewCount",
        maxResults=max_results,
        relevanceLanguage="ja",
        videoDuration="medium",  # 4〜20分
    ).execute()
    return response.get("items", [])


def get_transcript(video_id: str) -> str | None:
    """YouTube字幕を取得"""
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=["ja", "en"])
        return " ".join([t["text"] for t in transcript])
    except (NoTranscriptFound, TranscriptsDisabled):
        return None


def save_transcript(title: str, video_id: str, keyword: str, transcript: str):
    """文字起こしを一時ファイルに保存"""
    TRANSCRIPT_FILE.parent.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    content = f"""# YouTube文字起こし（Claude Code用）
生成日: {today}
キーワード: {keyword}
動画タイトル: {title}
動画URL: https://www.youtube.com/watch?v={video_id}

## 文字起こし
{transcript[:8000]}

---
## Claude Codeへの指示
上記の文字起こしをもとに、以下の条件でnote記事を生成して `logs/content/{today}-note.md` に保存してください。

### 記事の条件
- 筆者：佐伯亮（沖縄在住の会社員。AI×副業×アプリ開発が専門）
- 文字数：1,500〜2,500字
- 文体：です・ます調、カジュアル寄り
- 構成：タイトル → はじめに → 本文（2〜3セクション） → まとめ
- 動画の内容を要約しつつ「やってみたらこうだった」という一次情報の視点を加える
- 「AIで月○万円！」系の煽りは禁止
- 具体例・数字・実体験を優先
- 最後にKindleまたはWebアプリへの自然な導線を1箇所だけ入れる
- 記事の最後にアイキャッチ画像用のDALL-E向け英語プロンプトを1つ追記する
"""

    with open(TRANSCRIPT_FILE, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"文字起こし保存完了: {TRANSCRIPT_FILE}")


def main():
    if not YOUTUBE_API_KEY:
        print("エラー: YOUTUBE_API_KEY が設定されていません")
        sys.exit(1)

    # 今日のキーワードを選択（日付でローテーション）
    today_index = date.today().toordinal() % len(KEYWORDS)
    keyword = KEYWORDS[today_index]
    print(f"検索キーワード: {keyword}")

    # YouTube検索
    videos = search_youtube(keyword)
    if not videos:
        print("動画が見つかりませんでした")
        sys.exit(1)

    # 字幕が取得できる動画を探す
    for video in videos:
        video_id = video["id"]["videoId"]
        title = video["snippet"]["title"]
        print(f"試行中: {title}")

        transcript = get_transcript(video_id)
        if transcript:
            print(f"文字起こし取得成功: {len(transcript)}字")
            save_transcript(title, video_id, keyword, transcript)
            print("完了！Claude Codeが記事を生成します。")
            return

    print("字幕付き動画が見つかりませんでした")
    sys.exit(1)


if __name__ == "__main__":
    main()
