const statusText = {
  complete: {
    speaker: "番組終了",
    line: "指定した長さまで再生しました。録音リンクからMP3を開けます。"
  },
  waiting: {
    speaker: "生成待ち",
    line: "次のブロックを準備しています。音声ができるまでBGMは流しません。"
  },
  checking: {
    speaker: "ブロック終了",
    line: "次に続くか、番組を終了するか確認しています。"
  }
};

export function playbackStatusText(status) {
  return statusText[status] || statusText.waiting;
}
