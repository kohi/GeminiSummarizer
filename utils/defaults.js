// Default settings and configuration for Web & YouTube to Gemini Summarizer

const DEFAULT_PROMPT_TEMPLATES = [
  // Web Articles
  {
    id: "web_standard",
    category: "web",
    name: "🌐 Web記事・ニュース要約 (概要 + 要点 + まとめ)",
    content: `以下のWebページの内容を、広告や不要な情報を除いて詳細かつ分かりやすく要約・まとめてください。

【記事タイトル】: {title}
【記事URL】: {url}

【記事本文（抜粋）】:
{content}

【要約の構成】
1. 記事の概要・全体テーマ（2〜3行）
2. 主要なポイント・重要事実（箇条書き）
3. 結論・示唆・今後の見通し`
  },
  {
    id: "web_quick3",
    category: "web",
    name: "⚡ Web記事 3行サマリー",
    content: `以下のWeb記事の内容について、要点を3行で簡潔にまとめてください。

【記事タイトル】: {title}
【記事URL】: {url}

【記事本文（抜粋）】:
{content}`
  },
  {
    id: "web_detailed",
    category: "web",
    name: "📖 Web記事 構造化・詳細まとめ",
    content: `以下のWebページの内容を網羅的かつ構造的にまとめてください。
記事内で語られている各トピック、論点、背景、具体例、根拠を整理し、章立てて分かりやすく解説してください。

【記事タイトル】: {title}
【記事URL】: {url}

【記事本文（抜粋）】:
{content}`
  },
  {
    id: "web_action_plan",
    category: "web",
    name: "🎯 学び・アクションプラン抽出",
    content: `以下のWeb記事から、読者がすぐに実践・活用できる具体的な学び・アクションプラン・要点チェックリストを抽出して整理してください。

【記事タイトル】: {title}
【記事URL】: {url}

【記事本文（抜粋）】:
{content}`
  },
  // YouTube Videos
  {
    id: "yt_standard",
    category: "youtube",
    name: "🎬 YouTube動画 標準要約 (概要 + 要点 + 結論)",
    content: `以下のYouTube動画の内容を詳細かつ分かりやすく要約・まとめてください。

【動画タイトル】: {title}
【動画URL】: {url}

【要約の構成】
1. 動画の概要・全体テーマ（2〜3行）
2. 主要なポイント・要点まとめ（箇条書き）
3. 結論・重要メッセージ`
  },
  {
    id: "yt_quick3",
    category: "youtube",
    name: "⚡ YouTube動画 3行サマリー",
    content: `以下のYouTube動画の内容を、最も重要なポイントが3行でわかるように簡潔に要約してください。

【動画タイトル】: {title}
【動画URL】: {url}`
  },
  {
    id: "yt_detailed",
    category: "youtube",
    name: "📖 YouTube動画 詳細まとめ・章立て解説",
    content: `以下のYouTube動画の内容を詳しく網羅的にまとめてください。
動画内で語られている論点や根拠、重要なトピックを整理し、章立てて分かりやすく解説してください。

【動画タイトル】: {title}
【動画URL】: {url}`
  },
  // Text Selection
  {
    id: "selection_summary",
    category: "text",
    name: "✂️ 選択テキストの要約・解説",
    content: `以下のテキスト（Webページから抜粋）の内容を分かりやすく要約・解説してください。

【参照元】: {title} ({url})

【選択されたテキスト】:
{content}`
  }
];

const DEFAULT_ACCOUNTS = [
  { index: 0, label: "アカウント 0 (メイン / デフォルト)" },
  { index: 1, label: "アカウント 1 (サブ / 仕事用)" },
  { index: 2, label: "アカウント 2" }
];

const DEFAULT_SETTINGS = {
  version: "1.1.0",
  accounts: DEFAULT_ACCOUNTS,
  defaultAccountIndex: 0,
  autoSubmit: true,
  openInNewTab: true,
  activeWebPromptId: "web_standard",
  activeYtPromptId: "yt_standard",
  promptTemplates: DEFAULT_PROMPT_TEMPLATES,
  showOnPageButton: true,
  includeContentForWeb: true,
  maxExtractChars: 12000
};

/**
 * Load settings with automatic migration for old template formats
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, async (items) => {
      const merged = { ...DEFAULT_SETTINGS, ...items };

      // Ensure accounts array is valid
      if (!merged.accounts || merged.accounts.length === 0) {
        merged.accounts = DEFAULT_ACCOUNTS;
      }

      // Check if templates need migration (e.g. from v1.0.0 where only YouTube templates existed without category)
      let needsMigration = false;
      const templates = merged.promptTemplates || [];
      const hasWebTemplate = templates.some(t => t.id === 'web_standard' || t.category === 'web');

      if (!hasWebTemplate || merged.version !== '1.1.0') {
        // Migrate templates: replace or prepend new Web templates
        merged.promptTemplates = DEFAULT_PROMPT_TEMPLATES;
        merged.activeWebPromptId = 'web_standard';
        merged.activeYtPromptId = 'yt_standard';
        merged.version = '1.1.0';
        needsMigration = true;
      }

      if (needsMigration) {
        await saveSettings(merged);
      }

      resolve(merged);
    });
  });
}

/**
 * Save settings to chrome.storage.sync
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve();
    });
  });
}

/**
 * Format prompt template with variables
 */
function buildPrompt(templateString, title, url, content = "") {
  let res = templateString
    .replace(/\{title\}/g, title || "Web Page")
    .replace(/\{url\}/g, url || "");

  if (res.includes("{content}")) {
    res = res.replace(/\{content\}/g, content || "(本文なし)");
  } else if (content && content.trim()) {
    res += `\n\n【本文（抜粋）】:\n${content}`;
  }

  return res;
}

/**
 * Check if a URL is a YouTube video URL
 */
function isYouTubeUrl(url) {
  if (!url) return false;
  return url.includes("youtube.com/watch") || url.includes("youtu.be/") || url.includes("youtube.com/shorts/");
}

/**
 * Generate Gemini URL for the specified account index
 */
function getGeminiUrl(accountIndex, taskId) {
  const idx = parseInt(accountIndex, 10) || 0;
  let url = `https://gemini.google.com/u/${idx}/`;
  if (taskId) {
    url += `?summarize_task_id=${encodeURIComponent(taskId)}`;
  }
  return url;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    DEFAULT_ACCOUNTS,
    DEFAULT_PROMPT_TEMPLATES,
    loadSettings,
    saveSettings,
    buildPrompt,
    isYouTubeUrl,
    getGeminiUrl
  };
}
