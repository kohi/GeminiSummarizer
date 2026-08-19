# Chrome Web Store Listing: Web & YouTube to Gemini Summarizer

## Basic Metadata

- **Extension Name**: Web & YouTube to Gemini Summarizer (広告カット・アカウント指定対応)
- **Short Description**: Webページ（広告・ノイズ自動除去）やYouTube動画をGoogle Geminiに直接送信して要約。複数アカウント切り替え対応。
- **Primary Category**: Productivity
- **Secondary Category**: Search Tools / Utilities
- **Version**: 1.1.0
- **Language**: Japanese (ja)

---

## Detailed Description (Store Listing)

### 日本語 (Japanese)
Web上の記事（ニュース、ブログ、技術記事、ドキュメントなど）やYouTube動画をワンクリックでGoogle Gemini (https://gemini.google.com/) に転送し、スマートに要約・重要ポイントのまとめを出力するChrome拡張機能です。

記事内の**不要な広告バナー、ナビゲーション、サイドバー、ヘッダー/フッターなどを自動でカット（除去）**し、クリーンな本文のみを抽出してGeminiに送信するため、圧倒的にノイズの少ない高精度な要約が得られます。

また、Googleアカウントを複数お持ちの方でも、利用したいGeminiのアカウント（メイン、仕事用、サブなど）を簡単かつ確実に指定して実行できます。

#### 🌟 主な特徴
1. **Webページの広告・ノイズ自動カット機能**
   広告枠、SNSシェアボタン、コメント欄、追従ヘッダーなどをスマートに除外し、メイン本文のみを構造化して抽出・送信。
2. **YouTube画面内ワンクリック要約**
   動画視聴ページに「✨ Geminiで要約」ボタンを表示。クリックするだけでGeminiが開き、動画要約プロンプトが自動入力・送信されます。
3. **複数アカウント（Multi-Account）完全対応**
   Googleのマルチログイン仕様（u/0, u/1, u/2...）に対応。使用するアカウント番号に「個人用」「仕事用」などのラベルを付けて管理・切り替えできます。
4. **選択テキストの要約**
   Webページ上で気になったテキストを選択して右クリックするだけで、その部分だけの解説・要約をGeminiに依頼できます。
5. **豊富な要約テンプレート & 自由なカスタマイズ**
   - Web記事・ニュース標準要約（概要・要点箇条書き・結論）
   - Web記事 3行サマリー
   - Web記事 構造化・詳細まとめ
   - 学び・アクションプラン抽出
   - YouTube標準要約 / 3行 / 詳細まとめ
   - 選択テキスト要約
   ユーザー独自のプロンプトテンプレートも自由に追加・保存可能（`{title}`, `{url}`, `{content}` タグ対応）！
6. **自動送信（Auto Submit）オプション**
   プロンプト入力後に自動で送信ボタンを押すか、入力状態にして確認後に手動送信するかを選択可能。

---

## Permissions Justification

| Permission | Justification |
| :--- | :--- |
| `storage` | ユーザーの登録アカウント情報、プロンプトテンプレート、一般設定などをローカル同期ストレージに保存するために使用します。 |
| `tabs` | 現在開いているタブのURLやタイトルを取得し、Geminiタブを開くために使用します。 |
| `contextMenus` | Webページ上や選択テキスト、YouTubeリンクの右クリックメニューから即座にGemini要約を実行するために使用します。 |
| `activeTab` | ポップアップUIから現在のアクティブなページ情報を取得するために使用します。 |
| `scripting` | WebページのDOMから広告やナビゲーション等のノイズを除去し、クリーンな本文テキストを抽出するために使用します。 |

### Host Permissions
| Host | Justification |
| :--- | :--- |
| `<all_urls>` | ユーザーが閲覧中の任意のWebサイト（ニュース・記事・ブログ・ドキュメント等）から、広告を除去した本文テキストを抽出してGemini要約プロンプトに反映するために必要です。外部サーバーへのデータ送信は行いません。 |

---

## Privacy & Data Usage

- **データ収集**: 外部サーバーへの個人情報や閲覧履歴の送信は一切行いません。
- **データ保持**: すべての設定（アカウント番号、プロンプトテンプレート）はユーザーのブラウザ内（`chrome.storage`）にのみ安全に保存されます。
- **データ通信**: 抽出された本文データは、ユーザーの指定したGoogle Geminiタブへのプロンプト入力にのみ使用されます。
