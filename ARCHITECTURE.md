# システム設計書 (Architecture & System Design)

**プロジェクト名**: Web & YouTube to Gemini Summarizer  
**アーキテクチャ**: Chrome Extension (Manifest V3)

---

## 1. 全体アーキテクチャ図

```mermaid
graph TD
    subgraph Browser["Google Chrome Browser"]
        subgraph ActiveTab["ユーザー閲覧中のタブ"]
            YT["YouTube ページ<br/>(content_scripts/youtube-inject.js)"]
            WEB["一般Webページ<br/>(utils/content-extractor.js)"]
        end

        subgraph ExtUI["拡張機能 UI"]
            POPUP["ポップアップ UI<br/>(popup/popup.html/js)"]
            OPTIONS["オプション設定画面<br/>(options/options.html/js)"]
            CTX["右クリックメニュー<br/>(Context Menus)"]
        end

        subgraph Background["バックグラウンド"]
            SW["Service Worker<br/>(background/service-worker.js)"]
            STORAGE[("chrome.storage<br/>(設定 & タスクキュー)")]
        end

        subgraph GeminiTab["Google Gemini タブ"]
            GEMINI_PAGE["Gemini Web UI<br/>https://gemini.google.com/u/{index}/"]
            INJECTOR["Gemini Influx Script<br/>(content_scripts/gemini-inject.js)"]
        end
    end

    YT -- "1. 要約ボタン押下" --> SW
    POPUP -- "1. 要約開始" --> SW
    CTX -- "1. 右クリック要約" --> SW

    SW -- "本文抽出実行" --> WEB
    SW -- "タスク登録 & タブ生成" --> STORAGE
    SW -- "Geminiタブを開く" --> GEMINI_PAGE

    INJECTOR -- "タスク取得 & 削除" --> STORAGE
    INJECTOR -- "入力欄検知・自動送信" --> GEMINI_PAGE
```

---

## 2. 処理シーケンス

### 2.1 Webページ要約フロー (広告カット)
```mermaid
sequenceDiagram
    autonumber
    actor User as ユーザー
    participant Tab as Webページ
    participant Popup as 拡張機能ポップアップ
    participant SW as Service Worker
    participant Gemini as Gemini タブ

    User->>Popup: 拡張機能アイコンをクリック
    Popup->>SW: EXTRACT_PAGE_CONTENT 要求
    SW->>Tab: scripting.executeScript (広告除去・本文抽出)
    Tab-->>SW: 広告カット済みクリーン本文
    SW-->>Popup: 本文データ返却
    Popup-->>User: タイトル・URL・文字数プレビュー表示
    User->>Popup: 「Geminiで要約を開始」クリック
    Popup->>SW: START_SUMMARIZE
    SW->>SW: ストレージにtaskIdとプロンプトを保存
    SW->>Gemini: chrome.tabs.create(gemini.google.com/u/{acc}/?summarize_task_id=...)
    Gemini->>Gemini: gemini-inject.js が起動
    Gemini->>Gemini: 入力欄検知 & プロンプト自動注入
    Gemini->>Gemini: 自動送信ボタンクリック
    Gemini-->>User: 要約結果をストリーミング生成
```

### 2.2 YouTube画面内ボタン要約フロー
```mermaid
sequenceDiagram
    autonumber
    actor User as ユーザー
    participant YT as YouTube Watch画面
    participant SW as Service Worker
    participant Gemini as Gemini タブ

    User->>YT: 動画再生ページを開く
    YT->>YT: youtube-inject.js がUI内にボタンを自動配置
    User->>YT: 「✨ Geminiで要約」ボタンをクリック
    YT->>SW: START_SUMMARIZE (url, title, accountIndex)
    SW->>SW: YouTube用プロンプト生成 & タスク登録
    SW->>Gemini: chrome.tabs.create(gemini.google.com/u/{acc}/?summarize_task_id=...)
    Gemini->>Gemini: gemini-inject.js がプロンプト注入 & 送信
    Gemini-->>User: 要約生成開始
```

---

## 3. スマート本文抽出アルゴリズム (`utils/content-extractor.js`)

```mermaid
flowchart TD
    Start([DOM読み込み]) --> Clone[DOMクローンを作成]
    Clone --> RemoveNoise[不要要素の一括削除<br/>・広告要素<br/>・header/footer/nav/aside<br/>・SNS共有/コメント欄<br/>・スクリプト/スタイル]
    RemoveNoise --> FindContainer{メインコンテナ探索<br/>article, main, .article-body, etc.}
    FindContainer -- 見つかった --> TargetMain[コンテナノードを選択]
    FindContainer -- 見つからない --> TargetBody[document.body を選択]
    TargetMain --> ParseTree[DOM木走査<br/>見出し: # ## ###<br/>段落: \n\n<br/>リスト: - ]
    TargetBody --> ParseTree
    ParseTree --> Format[空白・改行の正規化]
    Format --> CheckLength{最大文字数超過?}
    CheckLength -- Yes --> Truncate[最大文字数でトリミング<br/>+ 省略注記追加]
    CheckLength -- No --> Output([クリーン本文出力])
    Truncate --> Output
```

---

## 4. ディレクトリ・モジュール責務一覧

| ディレクトリ / ファイル | 責務・役割 |
| :--- | :--- |
| `manifest.json` | 拡張機能のメタデータ、権限（`storage`, `tabs`, `contextMenus`, `scripting`）、ホスト権限定義 |
| `utils/content-extractor.js` | 広告・ノイズの自動除去とメイン本文の構造化抽出エンジン |
| `utils/defaults.js` | 初期設定、プロンプトテンプレート、マイグレーション、URL生成ヘルパー |
| `background/service-worker.js` | コンテキストメニュー制御、タスク登録、Geminiタブ生成、メッセージ中継 |
| `content_scripts/youtube-inject.js` | YouTube画面への要約ボタン配置、SPA遷移監視、セーフティネット監視 |
| `content_scripts/youtube-inject.css` | YouTube画面内ボタン・ドロップダウンメニューのスタイリング |
| `content_scripts/gemini-inject.js` | Gemini画面での入力欄検知、プロンプト自動注入、自動送信、ステータストースト |
| `popup/` | ポップアップUI（Web/YouTube自動判別、文字数プレビュー、テンプレート選択） |
| `options/` | 設定画面UI（アカウント管理、テンプレート編集、最大文字数設定） |
| `icons/` | 16x16, 48x48, 128x128 のPNGアイコンアセット |
| `generate_icons.py` | 依存ライブラリなしでPNGアイコンを自動生成するスクリプト |
| `REQUIREMENTS.md` | 機能要件・非機能要件定義書 |
| `ARCHITECTURE.md` | 本システム設計書 |
| `README.md` | ユーザー向け利用マニュアル・インストール手順書 |
| `CHROMEWEBSTORE.md` | Chrome Web Store公開用メタデータ・権限正当性ドキュメント |
