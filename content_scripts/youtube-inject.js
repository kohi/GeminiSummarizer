// Content script injected into YouTube pages
// Inserts the "Geminiで要約" button cleanly, handles context invalidation gracefully, and strictly prevents duplicates.

(function () {
  'use strict';

  const SPARKLE_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
    </svg>
  `;

  const BUTTON_CONTAINER_ID = 'yt-gemini-summary-container';
  const BUTTON_CLASS = 'yt-gemini-btn-container';

  let isInjecting = false;
  let lastInjectedVideoId = '';

  /**
   * Safe check for extension runtime validity (prevents Extension Context Invalidated errors)
   */
  function isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if current page is a video watch page or shorts
   */
  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/shorts/');
  }

  /**
   * Get unique Video Identifier
   */
  function getVideoId() {
    const url = new URL(window.location.href);
    if (url.pathname === '/watch') {
      return url.searchParams.get('v') || url.href;
    }
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2] || url.href;
    }
    return url.href;
  }

  /**
   * Get clean Video URL
   */
  function getVideoUrl() {
    const url = new URL(window.location.href);
    if (url.pathname === '/watch') {
      const v = url.searchParams.get('v');
      return v ? `https://www.youtube.com/watch?v=${v}` : window.location.href;
    }
    return window.location.href;
  }

  /**
   * Get Video Title
   */
  function getVideoTitle() {
    const selectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'ytd-watch-metadata #title h1 yt-formatted-string',
      '#title h1 yt-formatted-string',
      'h1.title yt-formatted-string',
      'h1.title',
      'ytd-reel-video-renderer[is-active] .title',
      'meta[name="title"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() || el.getAttribute('content');
        if (text) return text;
      }
    }
    return document.title.replace(/ - YouTube$/, '').trim() || 'YouTube Video';
  }

  /**
   * Strictly remove all duplicate / existing summary buttons across the entire page
   */
  function cleanupExistingButtons() {
    const allButtons = document.querySelectorAll(`.${BUTTON_CLASS}, #${BUTTON_CONTAINER_ID}`);
    allButtons.forEach(btn => btn.remove());
  }

  /**
   * Ensure only a single button exists. If multiple, remove excess.
   */
  function deduplicateButtons() {
    const allButtons = document.querySelectorAll(`.${BUTTON_CLASS}, #${BUTTON_CONTAINER_ID}`);
    if (allButtons.length > 1) {
      for (let i = 1; i < allButtons.length; i++) {
        allButtons[i].remove();
      }
    }
    return allButtons.length >= 1;
  }

  /**
   * Find single best container location with strict hierarchy
   */
  function findTargetContainer() {
    const isShorts = window.location.pathname.startsWith('/shorts/');

    if (isShorts) {
      const activeReel = document.querySelector('ytd-reel-video-renderer[is-active]') || document.querySelector('ytd-reel-video-renderer');
      if (activeReel) {
        const shortsActions = activeReel.querySelector('#actions') || activeReel.querySelector('#overlay');
        if (shortsActions) return { element: shortsActions, position: 'prepend' };
      }
      return null;
    }

    // 1. Channel Subscribe Button Area
    const subscribeBtn = document.querySelector('ytd-watch-metadata #subscribe-button') ||
                         document.querySelector('#subscribe-button') ||
                         document.querySelector('ytd-subscribe-button-renderer');
    if (subscribeBtn && subscribeBtn.parentElement && document.body.contains(subscribeBtn)) {
      return { element: subscribeBtn, position: 'after' };
    }

    // 2. Action Bar (Like/Share/Download buttons)
    const topLevelButtons = document.querySelector('ytd-watch-metadata #top-level-buttons-computed') ||
                            document.querySelector('#top-level-buttons-computed') ||
                            document.querySelector('#actions-inner #top-level-buttons-computed');
    if (topLevelButtons && document.body.contains(topLevelButtons)) {
      return { element: topLevelButtons, position: 'prepend' };
    }

    // 3. Channel Owner block
    const owner = document.querySelector('ytd-watch-metadata #owner') || 
                  document.querySelector('#owner') ||
                  document.querySelector('ytd-video-owner-renderer');
    if (owner && owner.parentElement && document.body.contains(owner)) {
      return { element: owner, position: 'after' };
    }

    // 4. Above the fold metadata container
    const aboveTheFold = document.querySelector('#above-the-fold') || document.querySelector('ytd-watch-metadata');
    if (aboveTheFold && document.body.contains(aboveTheFold)) {
      return { element: aboveTheFold, position: 'append' };
    }

    return null;
  }

  /**
   * Fetch extension settings safely
   */
  async function getSafeSettings() {
    if (!isExtensionContextValid()) {
      return {
        accounts: [{ index: 0, label: 'アカウント 0' }],
        defaultAccountIndex: 0,
        showOnPageButton: true
      };
    }

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'GET_SETTINGS' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve(null);
          } else {
            resolve(res.settings);
          }
        });
      });
      if (response) return response;
    } catch (e) {
      // ignore
    }

    return {
      accounts: [{ index: 0, label: 'アカウント 0' }],
      defaultAccountIndex: 0,
      showOnPageButton: true
    };
  }

  /**
   * Show clear user-friendly banner when extension was reloaded in Chrome
   */
  function showReloadNotice() {
    let notice = document.getElementById('yt-gemini-reload-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'yt-gemini-reload-notice';
      Object.assign(notice.style, {
        position: 'fixed',
        top: '64px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9999999',
        padding: '12px 24px',
        borderRadius: '12px',
        backgroundColor: '#1E1E1E',
        color: '#ffffff',
        border: '1px solid #1A73E8',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      });

      const text = document.createElement('span');
      text.textContent = '🔄 拡張機能が更新されました。最新版を有効にするためページを再読み込みしてください。';
      notice.appendChild(text);

      const reloadBtn = document.createElement('button');
      reloadBtn.textContent = 'ページを再読み込み (F5)';
      Object.assign(reloadBtn.style, {
        padding: '6px 14px',
        backgroundColor: '#1A73E8',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold'
      });
      reloadBtn.onclick = () => window.location.reload();
      notice.appendChild(reloadBtn);

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        color: '#aaaaaa',
        cursor: 'pointer',
        fontSize: '16px'
      });
      closeBtn.onclick = () => notice.remove();
      notice.appendChild(closeBtn);

      document.body.appendChild(notice);
    }
  }

  /**
   * Main injection routine with concurrency lock and strict single-instance guarantee
   */
  async function injectSummarizeButton() {
    if (!isWatchPage()) {
      cleanupExistingButtons();
      lastInjectedVideoId = '';
      return;
    }

    const currentVideoId = getVideoId();
    const hasExisting = deduplicateButtons();

    if (hasExisting && lastInjectedVideoId === currentVideoId) {
      return;
    }

    if (isInjecting) return;
    isInjecting = true;

    try {
      const settings = await getSafeSettings();
      if (settings.showOnPageButton === false) {
        cleanupExistingButtons();
        return;
      }

      const targetInfo = findTargetContainer();
      if (!targetInfo || !targetInfo.element) {
        return;
      }

      cleanupExistingButtons();

      const accounts = settings.accounts || [{ index: 0, label: 'アカウント 0' }];
      const defaultIndex = settings.defaultAccountIndex ?? 0;
      const activeAccount = accounts.find(a => a.index === defaultIndex) || accounts[0];

      const container = document.createElement('div');
      container.id = BUTTON_CONTAINER_ID;
      container.className = BUTTON_CLASS;

      // Main button
      const mainBtn = document.createElement('button');
      mainBtn.className = 'yt-gemini-summary-btn';
      mainBtn.title = `Geminiで要約 (${activeAccount.label || `アカウント ${activeAccount.index}`})`;
      mainBtn.innerHTML = `
        ${SPARKLE_ICON_SVG}
        <span>Geminiで要約</span>
        ${accounts.length > 1 ? `<span class="yt-gemini-account-badge">u/${activeAccount.index}</span>` : ''}
      `;

      mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        runSummarize(defaultIndex);
      });

      container.appendChild(mainBtn);

      // Dropdown menu for multiple accounts
      if (accounts.length > 1) {
        const dropdownBtn = document.createElement('button');
        dropdownBtn.className = 'yt-gemini-dropdown-btn';
        dropdownBtn.title = '別のアカウントを選択';
        dropdownBtn.innerHTML = '▾';

        const menu = document.createElement('div');
        menu.className = 'yt-gemini-menu';

        const accHeader = document.createElement('div');
        accHeader.className = 'yt-gemini-menu-header';
        accHeader.textContent = '送信先アカウント';
        menu.appendChild(accHeader);

        accounts.forEach((acc) => {
          const item = document.createElement('div');
          item.className = `yt-gemini-menu-item ${acc.index === defaultIndex ? 'active' : ''}`;
          item.innerHTML = `<span>${escapeHtml(acc.label || `アカウント ${acc.index}`)}</span><span>u/${acc.index}</span>`;
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('open');
            runSummarize(acc.index);
          });
          menu.appendChild(item);
        });

        dropdownBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.toggle('open');
        });

        document.addEventListener('click', () => {
          menu.classList.remove('open');
        });

        container.appendChild(dropdownBtn);
        container.appendChild(menu);
      }

      // Insert into DOM
      const { element, position } = targetInfo;
      if (position === 'after' && element.parentElement) {
        element.parentElement.insertBefore(container, element.nextSibling);
      } else if (position === 'prepend' && element.firstChild) {
        element.insertBefore(container, element.firstChild);
      } else {
        element.appendChild(container);
      }

      lastInjectedVideoId = currentVideoId;
      deduplicateButtons();
    } catch (err) {
      console.warn('[YouTube Summarizer] Button injection error:', err);
    } finally {
      isInjecting = false;
    }
  }

  /**
   * Trigger Summarize Request with robust context check
   */
  function runSummarize(accountIndex) {
    if (!isExtensionContextValid()) {
      showReloadNotice();
      return;
    }

    const url = getVideoUrl();
    const title = getVideoTitle();

    try {
      chrome.runtime.sendMessage({
        action: 'START_SUMMARIZE',
        payload: {
          url,
          title,
          accountIndex
        }
      }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('Runtime message error:', chrome.runtime.lastError);
          showReloadNotice();
        }
      });
    } catch (e) {
      showReloadNotice();
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  // Debounced injection trigger
  let debounceTimer = null;
  function scheduleInjection(delay = 300) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      injectSummarizeButton();
    }, delay);
  }

  // YouTube Navigation and lifecycle events
  window.addEventListener('yt-navigate-finish', () => {
    scheduleInjection(200);
  });

  window.addEventListener('yt-page-data-updated', () => {
    scheduleInjection(300);
  });

  window.addEventListener('load', () => {
    scheduleInjection(100);
  });

  // DOM Mutation Observer
  const observer = new MutationObserver(() => {
    if (isWatchPage()) {
      const btns = document.querySelectorAll(`.${BUTTON_CLASS}, #${BUTTON_CONTAINER_ID}`);
      if (btns.length === 0) {
        scheduleInjection(300);
      } else if (btns.length > 1) {
        deduplicateButtons();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  scheduleInjection(100);

})();
