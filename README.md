# Web & YouTube to Gemini Summarizer (Chrome拡張機能)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

Webページ（ブログ、ニュース、技術記事、ドキュメントなど）やYouTube動画をワンクリックでGoogle Gemini ([gemini.google.com](https://gemini.google.com/)) に転送し、スマートに要約・重要ポイントまとめを自動出力するChrome拡張機能です。

**不要な広告バナーやサイドバー・ナビゲーション等のノイズを自動カット**してクリーンな本文のみをGeminiに渡すため、非常に高精度な要約が可能です。  
また、**Googleアカウントの複数使い分け（マルチアカウント: `u/0`, `u/1`, `u/2`...）** に標準対応し、YouTubeとWebページそれぞれの要約スタイルを独立して自動記憶します。

---

## 🚀 主な機能

### 1. 🛡️ Webページの広告・ノイズ自動カット要約
- ページ内の広告（Google Ads等）、ヘッダー/フッター、ナビゲーション、サイドバー、SNSシェアボタン、コメント欄などをスマートに自動除外。
- 記事の見出し（H1〜H3）や段落、リスト構造を保ったままクリーンな本文を抽出し、Geminiに送信。

### 2. 🎬 YouTube動画の画面内ワンクリック要約
- YouTube動画再生ページ（`/watch?v=...`）やショート動画（`/shorts/...`）に **「✨ Geminiで要約」** ボタンを自動配置。
- チャンネル登録ボタン横やアクションバーに自然に溶け込み、クリックするだけで指定アカウントのGeminiを開いて自動生成を開始。
- 画面サイズやシアターモード、新旧UIのあらゆるレイアウトに完全対応。

### 3. 👤 複数Googleアカウント（Multi-Account）完全対応
- Googleマルチログイン（`https://gemini.google.com/u/0/`, `u/1/`, `u/2/` 等）のアカウント番号を指定可能。
- 「メイン」「仕事用」「個人用」などの表示ラベルを付けて簡単に管理・切り替え。
- ポップアップ、YouTube画面内ドロップダウン、右クリックメニューから利用アカウントをワンタップで選択。

### 4. 🧠 要約スタイルの自動記憶（YouTubeとWebを独立保存）
- **YouTube動画を開いた時**: 自動的にYouTube用の前回スタイル（標準要約、3行サマリー、詳細まとめ等）が選択。
- **通常のWebページを開いた時**: 自動的にWeb記事用の前回スタイル（記事要約、3行、構造化解説等）が選択。
- ポップアップを開いて **「Geminiで要約を開始」を押すだけ（選択し直す手間ゼロ）** で即座に実行できます。

### 5. ✂️ 選択テキスト要約 & 右クリックメニュー
- 記事の気になる部分だけをドラッグ選択して右クリック → **「✂️ Geminiで選択テキストを要約」**。
- ページ上での右クリック → **「✨ GeminiでこのWebページを要約 (広告カット)」**。

---

## 📦 インストール方法（Chromeへの導入手順）

### 方法 A: 配布用ZIPをダウンロードして使う（最も簡単）
1. [Releases ページ](https://github.com/kohi/GeminiSummarizer/releases/latest) またはリポジトリから **`GeminiSummarizer_v1.2.0.zip`** をダウンロードして解凍します。
2. Google Chromeを開き、アドレスバーに `chrome://extensions/` と入力して移動します。
3. 画面右上にある **「デベロッパー モード」** のトグルスイッチを **ON** にします。
4. 画面左上の **「パッケージ化されていない拡張機能を読み込む」**（Load unpacked）ボタンをクリックし、解凍したフォルダを選択します。

### 方法 B: Gitからクローンして使う
```bash
git clone https://github.com/kohi/GeminiSummarizer.git
```
解凍／クローンしたフォルダを同様に `chrome://extensions/` から読み込みます。

---

## 💡 使い方

### 1. 通常のWebページ・記事を要約する
- **ポップアップから**: 要約したい記事ページを開き、ツールバーの拡張機能アイコンをクリック。「🛡️ 広告・ノイズカット済」の表示を確認し、**「Geminiで要約を開始」** をクリックします。
- **右クリックから**: ページ上の任意の場所で右クリック → **「✨ GeminiでこのWebページを要約 (広告カット)」** → 送信先アカウントを選択します。

### 2. 記事の一部（選択したテキスト）だけを要約する
- ページ上のテキストをマウスでドラッグ選択します。
- 右クリック → **「✂️ Geminiで選択テキストを要約」** → 送信先アカウントを選択します。

### 3. YouTube動画を要約する
- **画面内ボタンから**: YouTube動画を開くと、タイトルの下・チャンネル登録ボタン横に **「✨ Geminiで要約」** ボタンが表示されます。クリックすると自動でGeminiが開き要約が始まります。
- **ポップアップから**: ツールバーのアイコンをクリックすると自動で「🎬 YouTube動画」モードになり、動画要約テンプレートで送信できます。

---

## ⚙️ Googleアカウント番号（u/0, u/1...）の設定

1. 拡張機能アイコンを右クリックして「オプション」を開くか、ポップアップ内の設定アイコンをクリックします。
2. [Google Gemini](https://gemini.google.com/) をブラウザで開いた際のアドレスバーURLをご確認ください：
   - `https://gemini.google.com/u/0/` → アカウント番号 **`0`**
   - `https://gemini.google.com/u/1/` → アカウント番号 **`1`**
   - `https://gemini.google.com/u/2/` → アカウント番号 **`2`**
3. 設定画面で使用したい番号とラベル（例: `メイン`, `仕事用`）を登録し、**「設定を保存」** してください。

---

## 📝 プリセット・プロンプトテンプレート一覧

| カテゴリ | テンプレート名 | 特徴・用途 |
| :--- | :--- | :--- |
| **Web記事** | 🌐 Web記事・ニュース要約 | 概要・箇条書き要点・結論のバランス型 |
| **Web記事** | ⚡ Web記事 3行サマリー | 忙しい時向けの超短時間要点把握 |
| **Web記事** | 📖 Web記事 構造化・詳細まとめ | 論文・技術記事・長文コラム向けの章立て解説 |
| **Web記事** | 🎯 学び・アクションプラン抽出 | 実践的な学び・ToDoチェックリストの整理 |
| **YouTube** | 🎬 YouTube動画 標準要約 | 動画概要・主要ポイント・結論メッセージ |
| **YouTube** | ⚡ YouTube動画 3行サマリー | 最重要ポイントのみを3行で要約 |
| **YouTube** | 📖 YouTube動画 詳細まとめ | 講義・セミナー・解説動画向けの構造化まとめ |
| **テキスト** | ✂️ 選択テキスト要約 | 引用テキストの解説・要点整理 |

※ 設定画面から独自のプロンプトテンプレートを自由に追加・編集できます（`{title}`, `{url}`, `{content}` タグ対応）。

---

## 📚 ドキュメント一覧

- [要件定義書 (REQUIREMENTS.md)](./REQUIREMENTS.md): 機能要件・非機能要件・セキュリティ仕様
- [システム設計書 (ARCHITECTURE.md)](./ARCHITECTURE.md): アーキテクチャ図・シーケンス図・本文抽出アルゴリズム
- [Chrome Web Storeメタデータ (CHROMEWEBSTORE.md)](./CHROMEWEBSTORE.md): 公開用ストアメタデータ・権限正当性

---

## 🛠️ ファイル構成

```
GeminiSummarizer/
├── manifest.json                  # Manifest V3 定義ファイル
├── icons/                         # アイコンアセット (16, 48, 128px)
├── utils/
│   ├── defaults.js                # 初期設定値・テンプレート管理・マイグレーション
│   └── content-extractor.js       # 広告・ノイズ除去 & 本文構造化抽出モジュール
├── background/
│   └── service-worker.js          # バックグラウンド処理・コンテキストメニュー・Gemini連携
├── content_scripts/
│   ├── youtube-inject.js          # YouTube画面への要約ボタン配置・SPA監視・自己修復
│   ├── youtube-inject.css         # YouTube画面内ボタンスタイル
│   └── gemini-inject.js           # Gemini画面での入力欄検知・長文自動注入＆自動送信
├── popup/
│   ├── popup.html                 # ポップアップ画面（Web/YouTube自動判別UI）
│   ├── popup.js                   # ポップアップ制御ロジック（スタイル個別記憶）
│   └── popup.css                  # ポップアップスタイル
├── options/
│   ├── options.html               # 詳細設定画面（アカウント・プロンプト・最大文字数）
│   ├── options.js                 # 設定画面制御ロジック
│   └── options.css                # 設定画面スタイル
├── generate_icons.py              # アイコン自動生成スクリプト
├── REQUIREMENTS.md                # 要件定義書
├── ARCHITECTURE.md                # システム設計書
├── CHROMEWEBSTORE.md              # Webストア公開用ドキュメント
└── README.md                      # 本ドキュメント
```

---

## 📄 ライセンス

[MIT License](LICENSE)