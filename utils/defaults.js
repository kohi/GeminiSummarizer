// Default settings and configuration for Web & YouTube to Gemini Summarizer

const DEFAULT_PROMPT_TEMPLATES = [
  // Web Information Sites / Articles
  {
    id: "web_standard",
    category: "web",
    name: "🌐 情報サイト・記事要約 (概要 + 要点 + まとめ)",
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
    name: "⚡ 情報サイト・記事 3行サマリー",
    content: `以下のWeb記事・情報ページの内容について、要点を3行で簡潔にまとめてください。

【記事タイトル】: {title}
【記事URL】: {url}

【記事本文（抜粋）】:
{content}`
  },
  {
    id: "web_detailed",
    category: "web",
    name: "📖 情報サイト・記事 構造化・詳細まとめ",
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
  // Video Platforms (YouTube, Vimeo, Niconico, etc.)
  {
    id: "yt_standard",
    category: "youtube",
    name: "🎬 動画標準要約 (概要 + 要点 + 結論)",
    content: `以下の動画の内容を詳細かつ分かりやすく要約・まとめてください。

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
    name: "⚡ 動画 3行サマリー",
    content: `以下の動画の内容を、最も重要なポイントが3行でわかるように簡潔に要約してください。

【動画タイトル】: {title}
【動画URL】: {url}`
  },
  {
    id: "yt_detailed",
    category: "youtube",
    name: "📖 動画 詳細まとめ・章立て解説",
    content: `以下の動画の内容を詳しく網羅的にまとめてください。
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
  version: "1.2.2",
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
 * Load settings with automatic migration
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, async (items) => {
      const merged = { ...DEFAULT_SETTINGS, ...items };

      if (!merged.accounts || merged.accounts.length === 0) {
        merged.accounts = DEFAULT_ACCOUNTS;
      }

      const templates = merged.promptTemplates || [];
      const hasWebTemplate = templates.some(t => t.id === 'web_standard' || t.category === 'web');

      if (!hasWebTemplate || merged.version !== '1.2.2') {
        merged.promptTemplates = DEFAULT_PROMPT_TEMPLATES;
        merged.activeWebPromptId = merged.activeWebPromptId || 'web_standard';
        merged.activeYtPromptId = merged.activeYtPromptId || 'yt_standard';
        merged.version = '1.2.2';
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
 * Detect if a URL belongs to a video platform (YouTube, Vimeo, Niconico, TikTok, Twitch, etc.)
 */
function isVideoSourceUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes("youtube.com/watch") ||
    lower.includes("youtu.be/") ||
    lower.includes("youtube.com/shorts/") ||
    lower.includes("vimeo.com/") ||
    lower.includes("nicovideo.jp/watch/") ||
    lower.includes("tiktok.com/@") ||
    lower.includes("twitch.tv/videos/") ||
    lower.includes("dailymotion.com/video/")
  );
}

// Backward-compatible alias
function isYouTubeUrl(url) {
  return isVideoSourceUrl(url);
}

/**
 * Generate Gemini URL for the specified account index (Direct to /app to avoid 302 redirects)
 */
function getGeminiUrl(accountIndex, taskId) {
  const idx = parseInt(accountIndex, 10) || 0;
  let url = `https://gemini.google.com/u/${idx}/app`;
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
    isVideoSourceUrl,
    isYouTubeUrl,
    getGeminiUrl
  };
}
