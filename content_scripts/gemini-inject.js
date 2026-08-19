// Content Script injected into https://gemini.google.com/*
// Responsible for detecting pending summarize tasks, injecting prompts into the chat input, and auto-submitting.

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

  console.log(`[Web/YouTube->Gemini] Processing Task ID: ${taskId}`);

  // Fetch task data from storage
  chrome.storage.local.get('pendingTasks', async (result) => {
    const pendingTasks = result.pendingTasks || {};
    const task = pendingTasks[taskId];

    if (!task) {
      console.warn(`[Web/YouTube->Gemini] Task ${taskId} not found or already consumed.`);
      return;
    }

    // Immediately remove from pending tasks
    delete pendingTasks[taskId];
    await chrome.storage.local.set({ pendingTasks });

    showStatusToast('✨ 要約プロンプトを準備中...');

    // Wait for chat input box to appear
    try {
      const inputElement = await waitForInputElement(20000);
      await injectPrompt(inputElement, task.prompt);

      if (task.autoSubmit) {
        showStatusToast('🚀 要約プロンプトを送信しています...');
        await attemptSubmit(inputElement);
        showStatusToast('✅ 送信完了！Geminiが要約を生成しています');
      } else {
        showStatusToast('💡 プロンプトを入力しました。Enterキーで送信できます');
      }
    } catch (err) {
      console.error('[Web/YouTube->Gemini] Failed to inject prompt:', err);
      showStatusToast('⚠️ プロンプトの自動入力に失敗しました。クリップボードにコピーします', true);
      navigator.clipboard.writeText(task.prompt);
    }
  });

  /**
   * Wait for Gemini chat input element
   */
  function waitForInputElement(timeoutMs = 20000) {
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

        setTimeout(check, 300);
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
    return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
  }

  /**
   * Inject text into the contenteditable / textarea
   */
  async function injectPrompt(inputEl, text) {
    inputEl.focus();
    await sleep(200);

    if (inputEl.tagName.toLowerCase() === 'textarea') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Clear placeholder / previous contents
    inputEl.innerHTML = '';

    // Method 1: Using document.execCommand('insertText') ensures Quill / Angular state updates properly
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

    if (!inserted || !inputEl.textContent.trim()) {
      // Fallback Method 2: Create paragraph nodes
      const lines = text.split('\n');
      inputEl.innerHTML = '';
      lines.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line || '\u00A0';
        inputEl.appendChild(p);
      });
    }

    // Dispatch input events
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

    await sleep(300);
  }

  /**
   * Attempt to find and click submit button
   */
  async function attemptSubmit(inputEl) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(350);

      const sendButton = findSendButton();
      if (sendButton && !sendButton.disabled && sendButton.getAttribute('aria-disabled') !== 'true') {
        sendButton.click();
        return;
      }
    }

    // Fallback: Simulate Enter key
    inputEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
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
      'rich-textarea ~ * button[aria-label]',
      'button:has(mat-icon[data-mat-icon-name="send"])',
      'button:has(svg)'
    ];

    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      for (const btn of buttons) {
        if (isVisible(btn)) {
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (ariaLabel.includes('send') || ariaLabel.includes('送信') || ariaLabel.includes('submit')) {
            return btn;
          }
        }
      }
    }

    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea) {
      const container = richTextarea.closest('.input-area') || richTextarea.parentElement;
      if (container) {
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
          if (isVisible(btn) && !btn.disabled) return btn;
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
    }, 4000);
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

})();
