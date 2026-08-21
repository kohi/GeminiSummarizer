// Background Service Worker for Web & YouTube to Gemini Summarizer
importScripts('../utils/defaults.js', '../utils/content-extractor.js');

/**
 * Update Context Menus based on current account settings
 */
async function updateContextMenus() {
  await chrome.contextMenus.removeAll();

  const settings = await loadSettings();
  const accounts = settings.accounts || DEFAULT_ACCOUNTS;

  // 1. Web Page Summarize Root
  chrome.contextMenus.create({
    id: "gemini-summarize-page-root",
    title: "✨ GeminiでこのWebページを要約 (広告カット)",
    contexts: ["page"]
  });

  // 2. Selection Summarize Root
  chrome.contextMenus.create({
    id: "gemini-summarize-selection-root",
    title: "✂️ Geminiで選択テキストを要約",
    contexts: ["selection"]
  });

  // 3. YouTube / Video Link Summarize Root
  chrome.contextMenus.create({
    id: "gemini-summarize-yt-root",
    title: "🎬 Geminiでこの動画を要約",
    contexts: ["link"],
    targetUrlPatterns: ["*://*.youtube.com/watch*", "*://youtu.be/*", "*://*.youtube.com/shorts/*"]
  });

  // Add Account Submenus
  accounts.forEach((acc) => {
    // Page submenu
    chrome.contextMenus.create({
      id: `gemini-page-acc-${acc.index}`,
      parentId: "gemini-summarize-page-root",
      title: `${acc.label || `アカウント ${acc.index}`}`,
      contexts: ["page"]
    });

    // Selection submenu
    chrome.contextMenus.create({
      id: `gemini-selection-acc-${acc.index}`,
      parentId: "gemini-summarize-selection-root",
      title: `${acc.label || `アカウント ${acc.index}`}`,
      contexts: ["selection"]
    });

    // YouTube link submenu
    chrome.contextMenus.create({
      id: `gemini-yt-acc-${acc.index}`,
      parentId: "gemini-summarize-yt-root",
      title: `${acc.label || `アカウント ${acc.index}`}`,
      contexts: ["link"],
      targetUrlPatterns: ["*://*.youtube.com/watch*", "*://youtu.be/*", "*://*.youtube.com/shorts/*"]
    });
  });
}

/**
 * Handle extension install / update
 */
chrome.runtime.onInstalled.addListener(async () => {
  await updateContextMenus();
});

/**
 * Listen for storage changes to keep context menus in sync
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.accounts || changes.defaultAccountIndex)) {
    updateContextMenus();
  }
});

/**
 * Extract clean content from active tab using scripting API with robust fallback
 */
async function extractContentFromTab(tabId, maxChars = 12000) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (maxLen) => {
        try {
          const NOISE_SELECTORS = [
            'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
            '.ad', '.ads', '.advertisement', '.ad-container', '.ad-box', '.ad-wrapper',
            '.google-auto-placed', '[id*="google_ads"]', '[id*="ad-"]', '[id*="ad_"]',
            '[class*="google_ads"]', '[class*="ad-slot"]', '[class*="advert"]',
            '[aria-label*="advertisement" i]', '[aria-label*="広告" i]',
            'ins.adsbygoogle', '.yom-ad', '.sponsored', '.sponsor',
            'header', 'footer', 'nav', 'aside',
            '[role="banner"]', '[role="navigation"]', '[role="complementary"]', '[role="search"]',
            '.header', '.footer', '.navbar', '.nav', '.menu', '.site-header', '.site-footer',
            '.sidebar', '.side-bar', '#sidebar', '#side-nav',
            '.social-share', '.share-buttons', '.sns-share', '.social-links',
            '.comments', '#comments', '.comment-section', '.disqus', '#disqus_thread',
            '.modal', '.popup', '.cookie-banner', '#cookie-consent'
          ];

          const MAIN_SELECTORS = [
            'article', 'main', '[role="main"]', '.article-body', '.article-content',
            '.post-content', '.entry-content', '.story-body', '#main-content', '#content'
          ];

          let docClone;
          try {
            docClone = document.cloneNode(true);
            NOISE_SELECTORS.forEach(sel => {
              try { docClone.querySelectorAll(sel).forEach(el => el.remove()); } catch(e) {}
            });
          } catch (cloneErr) {
            docClone = document.body;
          }

          let mainEl = null;
          for (const sel of MAIN_SELECTORS) {
            try {
              const el = docClone.querySelector(sel);
              if (el && el.innerText && el.innerText.trim().length > 150) {
                mainEl = el;
                break;
              }
            } catch (e) {}
          }
          if (!mainEl) mainEl = docClone.body || docClone;

          // Clean text formatting
          const blocks = [];
          const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'SECTION', 'ARTICLE']);

          function walk(curr) {
            if (!curr) return;
            if (curr.nodeType === Node.TEXT_NODE) {
              const text = curr.textContent.trim();
              if (text) blocks.push(text);
              return;
            }
            if (curr.nodeType !== Node.ELEMENT_NODE) return;
            const tag = curr.tagName.toUpperCase();
            const isBlock = blockTags.has(tag);
            if (isBlock && blocks.length > 0 && blocks[blocks.length - 1] !== '\n') blocks.push('\n');

            if (tag === 'H1') blocks.push('\n# ');
            else if (tag === 'H2') blocks.push('\n## ');
            else if (tag === 'H3') blocks.push('\n### ');
            else if (tag === 'LI') blocks.push('\n- ');

            for (let child = curr.firstChild; child; child = child.nextSibling) {
              walk(child);
            }
            if (isBlock && blocks.length > 0 && blocks[blocks.length - 1] !== '\n') blocks.push('\n');
          }

          walk(mainEl);

          let content = blocks.join(' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s+\n/g, '\n\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Fallback if structured extraction was empty
          if (!content && document.body) {
            content = (document.body.innerText || '').trim();
          }

          let isTruncated = false;
          if (content.length > maxLen) {
            content = content.slice(0, maxLen) + '\n\n...（文字数上限のため以降省略）';
            isTruncated = true;
          }

          const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
          const h1Title = document.querySelector('h1')?.innerText?.trim();
          const title = ogTitle || h1Title || document.title.trim() || 'Web Page';

          return {
            title,
            url: window.location.href,
            content,
            charCount: content.length,
            isTruncated
          };
        } catch (innerErr) {
          return {
            title: document.title || 'Web Page',
            url: window.location.href,
            content: (document.body ? document.body.innerText.slice(0, maxLen) : ''),
            charCount: (document.body ? document.body.innerText.length : 0),
            isTruncated: false
          };
        }
      },
      args: [maxChars]
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (err) {
    console.warn("Could not execute content extractor script:", err);
  }
  return null;
}

/**
 * Execute Summarization Flow
 */
async function triggerSummarize({ url, title, content, accountIndex, promptTemplate, customPrompt, autoSubmit, isSelection = false }) {
  const settings = await loadSettings();

  const finalAccountIndex = (accountIndex !== undefined && accountIndex !== null)
    ? accountIndex
    : settings.defaultAccountIndex;

  const isAutoSubmit = (autoSubmit !== undefined) ? autoSubmit : settings.autoSubmit;
  const isYt = isYouTubeUrl(url);

  let promptText = "";
  if (customPrompt) {
    promptText = customPrompt;
  } else {
    let template = promptTemplate;
    if (!template) {
      if (isSelection) {
        const selTmpl = settings.promptTemplates.find(t => t.id === "selection_summary") ||
                       DEFAULT_PROMPT_TEMPLATES.find(t => t.id === "selection_summary");
        template = selTmpl ? selTmpl.content : DEFAULT_PROMPT_TEMPLATES[0].content;
      } else if (isYt) {
        const ytTmpl = settings.promptTemplates.find(t => t.id === settings.activeYtPromptId) || 
                       settings.promptTemplates.find(t => t.category === "youtube") || 
                       settings.promptTemplates.find(t => t.id === "yt_standard") ||
                       DEFAULT_PROMPT_TEMPLATES.find(t => t.category === "youtube");
        template = ytTmpl ? ytTmpl.content : DEFAULT_PROMPT_TEMPLATES[4].content;
      } else {
        const webTmpl = settings.promptTemplates.find(t => t.id === settings.activeWebPromptId) || 
                        settings.promptTemplates.find(t => t.category === "web") || 
                        settings.promptTemplates.find(t => t.id === "web_standard") ||
                        DEFAULT_PROMPT_TEMPLATES.find(t => t.category === "web");
        template = webTmpl ? webTmpl.content : DEFAULT_PROMPT_TEMPLATES[0].content;
      }
    }
    promptText = buildPrompt(template, title, url, content);
  }

  const taskId = `gemini_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Store task in local storage
  const taskData = {
    taskId,
    prompt: promptText,
    url,
    title,
    autoSubmit: isAutoSubmit,
    createdAt: Date.now()
  };

  const tasksStorage = await chrome.storage.local.get("pendingTasks");
  const pendingTasks = tasksStorage.pendingTasks || {};
  pendingTasks[taskId] = taskData;
  await chrome.storage.local.set({ pendingTasks });

  const targetUrl = getGeminiUrl(finalAccountIndex, taskId);

  // Open in new tab
  const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
  return { success: true, taskId, tabId: newTab.id };
}

/**
 * Handle Context Menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = String(info.menuItemId);
  let accountIndex = 0;
  const match = menuItemId.match(/-acc-(\d+)$/);
  if (match) {
    accountIndex = parseInt(match[1], 10);
  }

  // 1. Text Selection
  if (info.selectionText && menuItemId.startsWith("gemini-selection-")) {
    const title = tab?.title || "選択テキスト";
    const url = tab?.url || "";
    await triggerSummarize({
      url,
      title,
      content: info.selectionText,
      accountIndex,
      isSelection: true
    });
    return;
  }

  // 2. YouTube Link click
  if (info.linkUrl && (info.linkUrl.includes("youtube.com/watch") || info.linkUrl.includes("youtu.be/") || info.linkUrl.includes("youtube.com/shorts/"))) {
    const title = tab?.title?.replace(/ - YouTube$/, "") || "YouTube Video";
    await triggerSummarize({
      url: info.linkUrl,
      title,
      accountIndex
    });
    return;
  }

  // 3. General Page click
  if (tab && tab.id) {
    const extracted = await extractContentFromTab(tab.id);
    const title = extracted?.title || tab.title || "Web Page";
    const url = extracted?.url || tab.url || "";
    const content = extracted?.content || "";

    await triggerSummarize({
      url,
      title,
      content,
      accountIndex
    });
  }
});

/**
 * Handle runtime messages from Popup and Content Scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_SUMMARIZE") {
    (async () => {
      try {
        const result = await triggerSummarize(request.payload);
        sendResponse({ success: true, result });
      } catch (error) {
        console.error("Error triggering summarize:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === "EXTRACT_PAGE_CONTENT") {
    (async () => {
      try {
        const tabId = request.tabId || sender?.tab?.id;
        if (!tabId) {
          sendResponse({ success: false, error: "No tab ID" });
          return;
        }
        const data = await extractContentFromTab(tabId, request.maxChars || 12000);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.action === "GET_SETTINGS") {
    (async () => {
      const settings = await loadSettings();
      sendResponse({ success: true, settings });
    })();
    return true;
  }
});
