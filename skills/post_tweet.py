"""
X（Twitter）投稿スクリプト
使い方: python skills/post_tweet.py "投稿したいテキスト"
"""

import sys
import os
from dotenv import load_dotenv
import tweepy

load_dotenv()

def post_tweet(text: str):
    client = tweepy.Client(
        consumer_key=os.getenv("X_CONSUMER_KEY"),
        consumer_secret=os.getenv("X_CONSUMER_SECRET"),
        access_token=os.getenv("X_ACCESS_TOKEN"),
        access_token_secret=os.getenv("X_ACCESS_TOKEN_SECRET"),
    )
    response = client.create_tweet(text=text)
    tweet_id = response.data["id"]
    print(f"投稿成功！ https://x.com/saekiryoAI/status/{tweet_id}")
    return tweet_id

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("使い方: python skills/post_tweet.py \"投稿テキスト\"")
        sys.exit(1)

    text = sys.argv[1]

    if len(text) > 140:
        print(f"エラー: {len(text)}字です。140字以内にしてください。")
        sys.exit(1)

    print(f"投稿内容（{len(text)}字）:\n{text}\n")
    confirm = input("投稿しますか？ (y/n): ")
    if confirm.lower() == "y":
        post_tweet(text)
    else:
        print("キャンセルしました。")
