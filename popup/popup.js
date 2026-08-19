// Popup script for Web & YouTube to Gemini Summarizer

document.addEventListener('DOMContentLoaded', async () => {
  const pageTitleEl = document.getElementById('page-title');
  const pageUrlEl = document.getElementById('page-url');
  const badgePageType = document.getElementById('badge-page-type');
  const badgeCleanStatus = document.getElementById('badge-clean-status');
  const extractStatsBar = document.getElementById('extract-stats-bar');
  const statCharCount = document.getElementById('stat-char-count');
  const statTruncatedNote = document.getElementById('stat-truncated-note');

  const accountSelect = document.getElementById('account-select');
  const templateSelect = document.getElementById('template-select');
  const promptPreview = document.getElementById('prompt-preview');
  const btnResetPrompt = document.getElementById('btn-reset-prompt');
  const chkAutoSubmit = document.getElementById('chk-autosubmit');
  const btnSummarize = document.getElementById('btn-summarize');
  const btnSummarizeText = document.getElementById('btn-summarize-text');
  const btnOpenOptions = document.getElementById('btn-open-options');
  const linkManageAccounts = document.getElementById('link-manage-accounts');
  const statusMessageEl = document.getElementById('status-message');

  let currentTitle = '';
  let currentUrl = '';
  let extractedContent = '';
  let isYt = false;
  let settings = await loadSettings();

  // 1. Get active tab and detect type
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentUrl = tab.url || '';
    currentTitle = tab.title || '';
    isYt = isYouTubeUrl(currentUrl);

    if (isYt) {
      currentTitle = currentTitle.replace(/ - YouTube$/, '');
      badgePageType.className = 'badge badge-yt';
      badgePageType.textContent = '🎬 YouTube動画';
      badgeCleanStatus.style.display = 'none';
      extractStatsBar.style.display = 'none';
      pageTitleEl.textContent = currentTitle;
      pageUrlEl.textContent = currentUrl;
    } else {
      badgePageType.className = 'badge badge-web';
      badgePageType.textContent = '🌐 Webページ';
      badgeCleanStatus.style.display = 'inline-block';
      pageTitleEl.textContent = currentTitle || 'Webページ';
      pageUrlEl.textContent = currentUrl;

      // Extract clean content from active tab
      if (tab.id && !currentUrl.startsWith('chrome://') && !currentUrl.startsWith('about:')) {
        try {
          const res = await sendMessagePromise({
            action: 'EXTRACT_PAGE_CONTENT',
            tabId: tab.id,
            maxChars: settings.maxExtractChars || 12000
          });

          if (res && res.success && res.data) {
            extractedContent = res.data.content || '';
            currentTitle = res.data.title || currentTitle;
            pageTitleEl.textContent = currentTitle;
            statCharCount.textContent = (res.data.charCount || 0).toLocaleString();
            if (res.data.isTruncated) {
              statTruncatedNote.style.display = 'inline';
            }
            extractStatsBar.style.display = 'flex';
          }
        } catch (e) {
          console.warn('Content extraction failed:', e);
        }
      }
    }
  }

  // Populate Accounts
  function populateAccounts() {
    accountSelect.innerHTML = '';
    const accounts = settings.accounts || DEFAULT_ACCOUNTS;
    accounts.forEach((acc) => {
      const option = document.createElement('option');
      option.value = acc.index;
      option.textContent = `${acc.label || `アカウント ${acc.index}`} (u/${acc.index})`;
      if (acc.index === settings.defaultAccountIndex) {
        option.selected = true;
      }
      accountSelect.appendChild(option);
    });
  }

  // Populate Templates with Contextual Defaults and Independent Memory
  function populateTemplates() {
    templateSelect.innerHTML = '';
    const templates = settings.promptTemplates || DEFAULT_PROMPT_TEMPLATES;

    const primaryCategory = isYt ? 'youtube' : 'web';
    
    // Choose saved ID independently for YouTube and Web
    let savedTemplateId = isYt 
      ? (settings.activeYtPromptId || 'yt_standard') 
      : (settings.activeWebPromptId || 'web_standard');

    // If the saved ID is not in templates or belongs to wrong category, get the first valid template for this category
    let activeTemplate = templates.find(t => t.id === savedTemplateId);
    if (!activeTemplate || (activeTemplate.category && activeTemplate.category !== primaryCategory)) {
      activeTemplate = templates.find(t => t.category === primaryCategory) || templates[0];
      savedTemplateId = activeTemplate ? activeTemplate.id : (isYt ? 'yt_standard' : 'web_standard');
    }

    const primaryOptGroup = document.createElement('optgroup');
    primaryOptGroup.label = isYt ? '🎬 YouTube用テンプレート (自動選択)' : '🌐 Web記事用テンプレート (自動選択)';

    const secondaryOptGroup = document.createElement('optgroup');
    secondaryOptGroup.label = isYt ? 'その他のテンプレート (Web用)' : 'その他のテンプレート (YouTube用)';

    templates.forEach((tmpl) => {
      const option = document.createElement('option');
      option.value = tmpl.id;
      option.textContent = tmpl.name;

      if (tmpl.id === savedTemplateId) {
        option.selected = true;
      }

      const isPrimary = (tmpl.category === primaryCategory) || (!tmpl.category && isYt === tmpl.id.startsWith('yt_'));
      if (isPrimary) {
        primaryOptGroup.appendChild(option);
      } else {
        secondaryOptGroup.appendChild(option);
      }
    });

    templateSelect.appendChild(primaryOptGroup);
    if (secondaryOptGroup.children.length > 0) {
      templateSelect.appendChild(secondaryOptGroup);
    }
  }

  // Update Prompt Preview Textarea
  function updatePromptPreview() {
    const templates = settings.promptTemplates || DEFAULT_PROMPT_TEMPLATES;
    const selectedTemplateId = templateSelect.value;
    const template = templates.find((t) => t.id === selectedTemplateId) || templates[0];
    promptPreview.value = buildPrompt(template.content, currentTitle, currentUrl, extractedContent);
  }

  populateAccounts();
  populateTemplates();
  chkAutoSubmit.checked = settings.autoSubmit ?? true;
  updatePromptPreview();

  // Event Listeners
  templateSelect.addEventListener('change', () => {
    updatePromptPreview();
    const selectedId = templateSelect.value;
    if (isYt) {
      settings.activeYtPromptId = selectedId;
      saveSettings({ activeYtPromptId: selectedId });
    } else {
      settings.activeWebPromptId = selectedId;
      saveSettings({ activeWebPromptId: selectedId });
    }
  });

  accountSelect.addEventListener('change', () => {
    settings.defaultAccountIndex = parseInt(accountSelect.value, 10);
    saveSettings({ defaultAccountIndex: settings.defaultAccountIndex });
  });

  chkAutoSubmit.addEventListener('change', () => {
    settings.autoSubmit = chkAutoSubmit.checked;
    saveSettings({ autoSubmit: settings.autoSubmit });
  });

  btnResetPrompt.addEventListener('click', () => {
    updatePromptPreview();
  });

  btnOpenOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  linkManageAccounts.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Start Summarization
  btnSummarize.addEventListener('click', async () => {
    const selectedAccountIndex = parseInt(accountSelect.value, 10);
    const customPrompt = promptPreview.value.trim();
    const autoSubmit = chkAutoSubmit.checked;

    btnSummarize.disabled = true;
    btnSummarizeText.textContent = 'Geminiを開いています...';
    setStatus('Geminiタブを開いています...');

    try {
      const response = await sendMessagePromise({
        action: 'START_SUMMARIZE',
        payload: {
          url: currentUrl,
          title: currentTitle,
          content: extractedContent,
          accountIndex: selectedAccountIndex,
          customPrompt,
          autoSubmit
        }
      });

      if (response && response.success) {
        setStatus('✅ Geminiを開きました！');
        setTimeout(() => window.close(), 600);
      } else {
        setStatus('⚠️ 送信に失敗しました', true);
        btnSummarize.disabled = false;
        btnSummarizeText.textContent = 'Geminiで要約を開始';
      }
    } catch (err) {
      console.error(err);
      setStatus('⚠️ エラーが発生しました', true);
      btnSummarize.disabled = false;
      btnSummarizeText.textContent = 'Geminiで要約を開始';
    }
  });

  function setStatus(msg, isError = false) {
    statusMessageEl.textContent = msg;
    statusMessageEl.style.color = isError ? '#D93025' : '#1A73E8';
  }

  function sendMessagePromise(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => {
        resolve(res);
      });
    });
  }
});
