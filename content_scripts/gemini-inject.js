// Content Script injected into https://gemini.google.com/*
// Responsible for reliably injecting prompts into the Gemini chat input and auto-submitting.

(function () {
  'use strict';

  // Only run in the top-level window (never inside iframes)
  if (window !== window.top) {
    return;
  }

  // Check if current URL contains a summarize task ID
  const urlParams = new URLSearchParams(window.location.search);
  let taskId = urlParams.get('summarize_task_id');

  // Clean URL query parameter without reloading page
  if (taskId) {
    try {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    } catch (e) {}
  }

  // Fetch task from storage (supports fallback for recently created active tasks)
  chrome.storage.local.get(['pendingTasks', 'latestTaskId'], async (result) => {
    const pendingTasks = result.pendingTasks || {};
    const now = Date.now();

    // Cleanup expired tasks older than 5 minutes
    Object.keys(pendingTasks).forEach((key) => {
      if (pendingTasks[key].createdAt && now - pendingTasks[key].createdAt > 300000) {
        delete pendingTasks[key];
      }
    });

    let targetTask = null;
    let targetTaskId = taskId;

    // 1. Try URL taskId
    if (targetTaskId && pendingTasks[targetTaskId]) {
      targetTask = pendingTasks[targetTaskId];
    }

    // 2. Fallback: If URL has no taskId (e.g. stripped by 302 redirect), check latest task within 45 seconds
    if (!targetTask) {
      const latestId = result.latestTaskId;
      if (latestId && pendingTasks[latestId] && (now - pendingTasks[latestId].createdAt < 45000)) {
        targetTask = pendingTasks[latestId];
        targetTaskId = latestId;
      }
    }

    // 3. Fallback: Find the newest pending task created within 45 seconds
    if (!targetTask) {
      const recentKeys = Object.keys(pendingTasks).filter(
        (key) => !pendingTasks[key].completed && now - pendingTasks[key].createdAt < 45000
      );
      if (recentKeys.length > 0) {
        recentKeys.sort((a, b) => pendingTasks[b].createdAt - pendingTasks[a].createdAt);
        targetTaskId = recentKeys[0];
        targetTask = pendingTasks[targetTaskId];
      }
    }

    if (!targetTask) {
      if (taskId) {
        console.log(`[Gemini Summarizer] Task ${taskId} already processed or expired.`);
      }
      return;
    }

    // Avoid double execution on the same tab
    if (targetTask.inProgress) {
      return;
    }
    targetTask.inProgress = true;
    await chrome.storage.local.set({ pendingTasks });

    console.log(`[Gemini Summarizer] Processing Task: ${targetTaskId}`);
    showStatusToast('✨ 要約プロンプトを準備中...');

    // Wait for chat input box to appear in DOM
    try {
      await waitForInputElement(25000);
      showStatusToast('📝 プロンプトを入力中...');

      const injected = await safelyInjectPrompt(targetTask.prompt);
      if (!injected) {
        throw new Error('Failed to inject prompt into input element');
      }

      if (targetTask.autoSubmit) {
        showStatusToast('🚀 要約を自動送信中...');
        const submitted = await robustSubmit();
        if (submitted) {
          showStatusToast('✅ 送信完了！Geminiが要約を生成しています');
        } else {
          showStatusToast('💡 プロンプトを入力しました。送信ボタンを押してください');
        }
      } else {
        showStatusToast('💡 プロンプトを入力しました。Enterキーで送信できます');
      }

      // Mark completed and clean up
      delete pendingTasks[targetTaskId];
      await chrome.storage.local.set({ pendingTasks, latestTaskId: null });
    } catch (err) {
      console.error('[Gemini Summarizer] Failed to inject prompt:', err);
      showStatusToast('⚠️ 自動入力に失敗しました。プロンプトをクリップボードにコピーしました', true);
      try {
        navigator.clipboard.writeText(targetTask.prompt);
      } catch (clipErr) {}
    }
  });

  /**
   * Wait for Gemini chat input element
   */
  function waitForInputElement(timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      function check() {
        const el = findInputBox();
        if (el && document.contains(el)) {
          resolve(el);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Timed out waiting for Gemini chat input'));
          return;
        }

        setTimeout(check, 250);
      }

      check();
    });
  }

  /**
   * Find Gemini chat input element
   */
  function findInputBox() {
    const selectors = [
      'rich-textarea div[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][aria-label*="プロンプト"]',
      'div[contenteditable="true"][aria-label*="Prompt"]',
      'div[contenteditable="true"][aria-label*="Ask"]',
      'rich-textarea p',
      'div[contenteditable="true"]',
      'textarea[aria-label*="Prompt"]',
      'textarea'
    ];

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
          return element;
        }
      } catch (e) {}
    }
    return null;
  }

  function isVisible(elem) {
    return !!(elem && (elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length));
  }

  /**
   * Safely inject prompt text without throwing addRange / DOMException errors
   */
  async function safelyInjectPrompt(text) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const inputEl = findInputBox();
      if (!inputEl || !document.contains(inputEl)) {
        await sleep(300);
        continue;
      }

      inputEl.focus();
      await sleep(150);

      // Textarea input
      if (inputEl.tagName.toLowerCase() === 'textarea') {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
      }

      // Contenteditable injection
      let inserted = false;

      // Method 1: execCommand with safe range selection
      try {
        if (document.contains(inputEl)) {
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(inputEl);
            selection.addRange(range);
            inserted = document.execCommand('insertText', false, text);
          }
        }
      } catch (rangeErr) {
        inserted = false;
      }

      // Method 2: Direct DOM node population
      if (!inserted || !inputEl.textContent.trim()) {
        try {
          inputEl.innerHTML = '';
          const lines = text.split('\n');
          lines.forEach((line) => {
            const p = document.createElement('p');
            p.textContent = line || '\u00A0';
            inputEl.appendChild(p);
          });
          inserted = true;
        } catch (domErr) {}
      }

      // Dispatch comprehensive synthetic events
      try {
        inputEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
        inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, composed: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true, composed: true }));
      } catch (evtErr) {}

      await sleep(300);

      if (inputEl.textContent.trim().length > 0) {
        return true;
      }

      await sleep(400);
    }

    return false;
  }

  /**
   * Robust Submit: tries multiple mechanisms (Click send button, Enter key)
   */
  async function robustSubmit() {
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(350);

      const inputEl = findInputBox();

      // Check send button
      const sendButton = findSendButton();
      if (sendButton) {
        const isAriaDisabled = sendButton.getAttribute('aria-disabled') === 'true';
        const isDisabled = sendButton.disabled;

        if (!isDisabled && !isAriaDisabled) {
          sendButton.click();
          await sleep(500);

          if (isSubmissionTriggered()) {
            return true;
          }
        }
      }

      // Try Enter key event
      if (inputEl && document.contains(inputEl)) {
        inputEl.focus();
        inputEl.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          composed: true,
          cancelable: true
        }));
      }

      await sleep(300);
      if (isSubmissionTriggered()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if Gemini has started generating / submitted prompt
   */
  function isSubmissionTriggered() {
    const stopSelectors = [
      'button[aria-label*="停止"]',
      'button[aria-label*="Stop"]',
      'mat-icon[data-mat-icon-name="stop"]',
      '.stop-button',
      '.generating'
    ];
    for (const sel of stopSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return true;
      } catch (e) {}
    }
    return false;
  }

  /**
   * Locate Gemini Send Button
   */
  function findSendButton() {
    const selectors = [
      'button[aria-label*="送信"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="プロンプトを送信"]',
      'button[aria-label*="Submit"]',
      'button.send-button',
      'button.send-button-container',
      '.send-button-container button',
      'rich-textarea ~ * button[aria-label]',
      'button:has(mat-icon[data-mat-icon-name="send"])',
      'button:has(svg[path*="M2.01"])',
      'div[role="button"][aria-label*="送信"]',
      'div[role="button"][aria-label*="Send"]'
    ];

    for (const selector of selectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          if (isVisible(btn)) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (ariaLabel.includes('send') || ariaLabel.includes('送信') || ariaLabel.includes('submit')) {
              return btn;
            }
          }
        }
      } catch (e) {}
    }

    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea) {
      const container = richTextarea.closest('.input-area') || 
                        richTextarea.closest('.input-wrapper') || 
                        richTextarea.parentElement;
      if (container) {
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
          if (isVisible(btn) && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
            return btn;
          }
        }
      }
    }

    return null;
  }

  /**
   * Display floating toast for clear feedback
   */
  function showStatusToast(message, isError = false) {
    let toast = document.getElementById('yt-gemini-status-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'yt-gemini-status-toast';
      Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: '999999',
        padding: '12px 20px',
        borderRadius: '12px',
        backgroundColor: isError ? '#D93025' : '#1A73E8',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px',
        fontWeight: '500',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.3s ease',
        opacity: '0',
        transform: 'translateY(10px)'
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#D93025' : '#1A73E8';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
      if (toast && toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 400);
      }
    }, 4500);
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

})();
