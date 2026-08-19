// Content Script injected into https://gemini.google.com/*
// Responsible for reliably injecting prompts into the Gemini chat input and auto-submitting.

(function () {
  'use strict';

  // Check if current URL contains a summarize task ID
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('summarize_task_id');

  if (!taskId) {
    return; // No active task on this tab
  }

  // Clean URL to prevent re-execution on refresh
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState(null, '', cleanUrl);

  console.log(`[Gemini Summarizer] Processing Task ID: ${taskId}`);

  // Fetch task data from storage
  chrome.storage.local.get('pendingTasks', async (result) => {
    const pendingTasks = result.pendingTasks || {};
    const task = pendingTasks[taskId];

    if (!task) {
      console.warn(`[Gemini Summarizer] Task ${taskId} not found or already consumed.`);
      return;
    }

    // Immediately remove from pending tasks
    delete pendingTasks[taskId];
    await chrome.storage.local.set({ pendingTasks });

    showStatusToast('✨ 要約プロンプトを準備中...');

    // Wait for chat input box to appear
    try {
      const inputElement = await waitForInputElement(25000);
      showStatusToast('📝 プロンプトを入力中...');
      await injectPrompt(inputElement, task.prompt);

      if (task.autoSubmit) {
        showStatusToast('🚀 要約を自動送信中...');
        const submitted = await robustSubmit(inputElement);
        if (submitted) {
          showStatusToast('✅ 送信完了！Geminiが要約を生成しています');
        } else {
          showStatusToast('💡 プロンプトを入力しました。送信ボタンを押してください');
        }
      } else {
        showStatusToast('💡 プロンプトを入力しました。Enterキーで送信できます');
      }
    } catch (err) {
      console.error('[Gemini Summarizer] Failed to inject prompt:', err);
      showStatusToast('⚠️ 自動入力に失敗しました。プロンプトをクリップボードにコピーしました', true);
      try {
        navigator.clipboard.writeText(task.prompt);
      } catch (clipErr) {
        // ignore
      }
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
        if (el) {
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
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        return element;
      }
    }
    return null;
  }

  function isVisible(elem) {
    return !!(elem && (elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length));
  }

  /**
   * Inject text into the contenteditable / textarea with all required framework events
   */
  async function injectPrompt(inputEl, text) {
    inputEl.focus();
    await sleep(200);

    if (inputEl.tagName.toLowerCase() === 'textarea') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return;
    }

    // Clear existing content
    inputEl.innerHTML = '';

    // Method 1: execCommand('insertText') is best for rich-text editors (Quill, Lit, Angular)
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(inputEl);
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (e) {
      inserted = false;
    }

    // Fallback: direct paragraph elements insertion
    if (!inserted || !inputEl.textContent.trim()) {
      inputEl.innerHTML = '';
      const lines = text.split('\n');
      lines.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line || '\u00A0';
        inputEl.appendChild(p);
      });
    }

    // Comprehensive synthetic events to wake up Angular / Lit / React reactive binders
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, composed: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true, composed: true }));

    await sleep(300);
  }

  /**
   * Robust Submit: tries multiple mechanisms (Click send button, Enter key, Container dispatch)
   */
  async function robustSubmit(inputEl) {
    // Attempt multiple times as Gemini may take a moment to enable the send button
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(350);

      // Check if send button is available and enabled
      const sendButton = findSendButton();
      if (sendButton) {
        const isAriaDisabled = sendButton.getAttribute('aria-disabled') === 'true';
        const isDisabled = sendButton.disabled;

        if (!isDisabled && !isAriaDisabled) {
          sendButton.click();
          await sleep(500);

          // Verify if submitted (either button changed to stop or input cleared or streaming started)
          if (isSubmissionTriggered()) {
            return true;
          }
        }
      }

      // Simultaneously try Enter key event on input element
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
    // Check for Stop generating button or loading indicators
    const stopSelectors = [
      'button[aria-label*="停止"]',
      'button[aria-label*="Stop"]',
      'mat-icon[data-mat-icon-name="stop"]',
      '.stop-button',
      '.generating'
    ];
    for (const sel of stopSelectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return true;
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
      } catch (e) {
        // ignore selector errors
      }
    }

    // Secondary search: Look inside input area container
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
