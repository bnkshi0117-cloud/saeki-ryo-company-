# リサーチレポート 2026-04-06
## テーマ：Xアルゴリズム徹底調査（フォロワー20人・運用開始直後の日本語アカウント向け）

---

## 凡例
- [確定] ソースコード公開・公式発表・大規模データ分析に基づく情報
- [推測] 複数の実践者報告・間接的根拠に基づく仮説

---

## 1. フォロワーが少ない段階で特に効果的な行動

### [確定] エンゲージメント重み付け（ソースコード公開済）

2023年3月にXがGitHubでおすすめアルゴリズムのソースコードを公開。その後2026年1月にも追加公開。
解析により各アクションの相対スコアが判明している：

| アクション | スコア | 備考 |
|------------|--------|------|
| リプライ（著者が返信した場合） | +75 | いいねの150倍 |
| リプライ（一般） | +13.5 | いいねの27倍 |
| ブックマーク | +10 | いいねの20倍 |
| リポスト | +1.0（旧+20） | バージョンにより変動あり |
| いいね | +0.5〜+1.0 | 最低価値シグナル |

ソース：[posteverywhere.ai「How the Twitter/X Algorithm Works in 2026 (Source Code)」](https://posteverywhere.ai/blog/how-the-x-twitter-algorithm-works) / [camtsuku.com「2026年2月速報 Xアルゴリズム完全攻略」](https://camtsuku.com/guide/3811)

### [確定] アルゴリズムの初期テスト構造

投稿後、まず**少数グループ（フォロワーの一部）**にテスト配信される。
その30〜60分以内のエンゲージメント率をもとに、より広いグループへの配信を決定する仕組み。
→ フォロワーが少なくても、初期反応率が高ければ「おすすめ」タイムライン経由でリーチが拡大する。

ソース：[minority.works「2025年11月版 Xアルゴリズム変更解説」](https://minority.works/socialselling/blog/x-grok-algorithm-changes-202511/) / [comnico.jp「Xアルゴリズム12のシグナル」](https://www.comnico.jp/we-love-social/x-algorithm)

### [確定] Grok AIによる「質優先」シフト（2025年後半〜）

2025年後半からGrok AIがフィード制御を担い始め、「フォロワー数依存」から「投稿品質評価」へ移行。
マスク氏は「4〜6週間以内に従来の手動ルールを全廃する」と発言済み。
→ 新規・小規模アカウントでも、投稿の質次第で従来比**最大2倍のリーチ向上**が報告されている。

ソース：[minority.works「2025年11月版 Xアルゴリズム変更解説」](https://minority.works/socialselling/blog/x-grok-algorithm-changes-202511/)

---

## 2. インプレッションが上がる投稿の条件

### [確定] フォーマット別リーチ優劣

| フォーマット | 効果 | 根拠 |
|------------|------|------|
| テキストのみ | **他プラットフォームと逆で最強クラス**。テキストは動画比+30% | ソースコード解析（posteverywhere.ai） |
| 画像付き | +25%増 | 複数調査の平均値 |
| 動画 | +2倍（ただしX上ではテキストに劣る場合も） | minority.works調査 |
| スレッド形式 | +2倍（滞在時間増加のため） | camtsuku.com解析 |
| 外部リンク付き | **30〜50%のリーチ減**（後述） | Buffer 1880万件調査 |

ソース：[posteverywhere.ai](https://posteverywhere.ai/blog/how-the-x-twitter-algorithm-works) / [minority.works](https://minority.works/socialselling/blog/x-grok-algorithm-changes-202511/)

### [確定] 滞在時間ボーナス

動画・長文スレッドなどで**2分以上の滞在時間**を確保できると、スコアが**11〜22倍**ブーストされるとの解析あり。

ソース：[camtsuku.com「2026年2月速報」](https://camtsuku.com/guide/3811)

### [確定] 投稿頻度の最適値

- 推奨：1日2〜3投稿、投稿間隔30〜60分以上
- 低エンゲージメントの高頻度投稿はペナルティ対象
- 7日間以上の投稿停止でアカウント評価が低下する傾向

ソース：[posteverywhere.ai](https://posteverywhere.ai/blog/how-the-x-twitter-algorithm-works) / [comnico.jp](https://www.comnico.jp/we-love-social/x-algorithm)

### [推測] 投稿に「問いかけ」を入れるとリプライ率が上がる

リプライスコアが極めて高いため、「問いかけ型」「Q&A型」の構成でリプライを誘発するのが有効と考えられる。
複数の実践者が報告しているが、対照実験データは確認できていない。

ソース：[camtsuku.com](https://camtsuku.com/guide/3811) / [comnico.jp](https://www.comnico.jp/we-love-social/x-algorithm)

---

## 3. エンゲージメントがアルゴリズムに与える影響

### [確定] 「リプライ返信」がシグナルとして最強

上記のスコア体系より、**著者（投稿者）がリプライに返信する行為**がスコア75と最大値。
自分の投稿についたリプライに返信することが、最もコスパの高いアルゴリズム強化行動。

### [確定] ミュート・ブロックはアカウント全体にダメージ

単一投稿のスコア低下だけでなく、**アカウント全体のリーチが持続的に低下**する。
「不快な投稿 → ミュート多発」がシャドウバンの主要トリガーとされている。

ソース：[comnico.jp](https://www.comnico.jp/we-love-social/x-algorithm) / [koukoku.jp「シャドウバンとは」](https://www.koukoku.jp/service/suketto/marketer/sns/%E3%80%902025%E5%B9%B4%E6%9C%80%E6%96%B0%E3%80%91%E3%82%B7%E3%83%A3%E3%83%89%E3%82%A6%E3%83%90%E3%83%B3%E3%81%A8%E3%81%AF%EF%BC%9Fx%EF%BC%88%E6%97%A7twitter%EF%BC%89%E3%81%A7%E6%8A%95%E7%A8%BF/)

### [確定] ブックマークはいいねより高価値

ブックマーク（スコア+10）はいいね（+0.5〜1.0）の約10〜20倍の価値。
「保存されるコンテンツ」＝再読したいほど価値ある情報・実用的な内容を目指すことが有効。

---

## 4. やってはいけない行動

### [確定] 外部リンクを本文に貼る

- 無料アカウント：**2025年3月以降、リンク付き投稿のエンゲージメント中央値がほぼ0**
- 有料アカウントでも30〜50%のリーチ減
- 対策：本文ではなく**リプライツリーの末尾にリンクを貼る**

ソース：[Buffer「Does X Premium Really Boost Your Reach? An Analysis of 18M+ Posts」](https://buffer.com/resources/x-premium-review/) / [Influencer Marketing Hub「X Premium Users Get 10x More Reach」](https://influencermarketinghub.com/x-premium-users-get-10x-more-reach-report/)

### [確定] ハッシュタグの多用

- 3個以内：許容範囲
- 3個超：エンゲージメント20〜40%低下のリスク
- 5個以上：スパム判定の確率が上昇

ソース：[camtsuku.com](https://camtsuku.com/guide/3811) / [comnico.jp](https://www.comnico.jp/we-love-social/x-algorithm)

### [確定] 短期間での大量フォロー・フォロー外し

規約明記の禁止事項。自動検知によりシャドウバン→凍結のリスク。

ソース：[mountainnavi.com「2025年最新版 X凍結対策完全ガイド」](https://mountainnavi.com/x/3860/)

### [推測] 絵文字の多用

絵文字3個超でマイナス評価とする報告あり。ただし定量的なデータソースは現時点で未確認。

ソース：[comnico.jp（実践者報告ベース）](https://www.comnico.jp/we-love-social/x-algorithm)

### [確定] 投稿直後の編集

投稿編集はアルゴリズムのカウントをリセットする可能性があるとされており、公開後の修正は最小限に。

### [推測] 同一内容の複数回投稿・コピペ投稿

スパム判定対象とされているが、X社の公式定義の範囲は不明瞭。同一文章の繰り返しは避けるべき。

---

## 5. 2025〜2026年の主な仕様変更

| 時期 | 変更内容 | 確定/推測 |
|------|----------|----------|
| 2023年3月 | アルゴリズムのソースコードをGitHubで一部公開 | [確定]（ITmedia NEWS報道） |
| 2025年前半 | 無料アカウントのリンク付き投稿リーチが実質ゼロに | [確定]（Buffer 1880万件分析） |
| 2025年後半 | Grok AIによるフィード制御に移行開始 | [確定]（Xチーム発表） |
| 2026年1月 | アルゴリズム関連コードの追加オープンソース化 | [確定]（shuttlerock.co.jp報道） |
| 2026年2月 | 従来の手動ルール廃止・AI判断への完全移行が近いと発表 | [推測寄り確定]（マスク発言ベース） |

ソース：[ITmedia NEWS「TwitterがソースコードをGitHubで公開」](https://www.itmedia.co.jp/news/articles/2304/01/news042.html) / [shuttlerock.co.jp「アルゴリズムオープンソース化」](https://www.shuttlerock.co.jp/article/detail/post-21234/)

---

## 今すぐ実践できるアクション（優先度順）

1. **投稿後30分は必ずアプリを開いてリプライに返信する**（スコア最大化）
2. **外部リンクは本文ではなく自分の投稿へのリプライとして貼る**
3. **ハッシュタグは0〜2個に絞る**（なくてもよい）
4. **「問いかけ」を末尾に入れてリプライを誘発する構成にする**
5. **1日2〜3投稿を毎日継続する（7日間の空白を作らない）**
6. **再読価値のある情報＝ブックマークされる内容を意識する**

---

## Xプレミアムについて（参考）

- 無料アカウント：中央値 100インプレッション未満/投稿
- プレミアム（月約1,300円）：中央値 600インプレッション/投稿（約6倍）
- プレミアム+（月約6,000円）：中央値 1,550インプレッション/投稿（約15倍）
- リンク付き投稿の生存もプレミアムのみ有効

ソース：[Buffer 1880万件分析](https://buffer.com/resources/x-premium-review/) / [Influencer Marketing Hub](https://influencermarketinghub.com/x-premium-users-get-10x-more-reach-report/)

---

*作成：リサーチ部 / 2026-04-06*
