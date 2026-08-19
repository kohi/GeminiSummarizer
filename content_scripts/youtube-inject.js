// Content script injected into YouTube pages
// Inserts the "Geminiで要約" button reliably on video watch pages and Shorts.

(function () {
  'use strict';

  const SPARKLE_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
    </svg>
  `;

  let lastInjectedUrl = '';

  /**
   * Check if current page is a video watch page or shorts
   */
  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/shorts/');
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
   * Find best target container with exhaustive fallbacks
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

    // Candidate 1: Right after the Subscribe button (#subscribe-button)
    const subscribeBtn = document.querySelector('ytd-watch-metadata #subscribe-button') ||
                         document.querySelector('#subscribe-button') ||
                         document.querySelector('ytd-subscribe-button-renderer');
    if (subscribeBtn && subscribeBtn.parentElement) {
      return { element: subscribeBtn, position: 'after' };
    }

    // Candidate 2: Next to Channel Owner section (#owner)
    const owner = document.querySelector('ytd-watch-metadata #owner') || 
                  document.querySelector('#owner') ||
                  document.querySelector('ytd-video-owner-renderer');
    if (owner && owner.parentElement) {
      return { element: owner, position: 'after' };
    }

    // Candidate 3: Inside top-level action buttons bar (Like/Share buttons)
    const topLevelButtons = document.querySelector('ytd-watch-metadata #top-level-buttons-computed') ||
                            document.querySelector('#top-level-buttons-computed') ||
                            document.querySelector('#actions-inner #top-level-buttons-computed') ||
                            document.querySelector('ytd-menu-renderer #top-level-buttons-computed');
    if (topLevelButtons) {
      return { element: topLevelButtons, position: 'prepend' };
    }

    // Candidate 4: Next to Title section (#title)
    const titleContainer = document.querySelector('ytd-watch-metadata #title') ||
                           document.querySelector('#above-the-fold #title') ||
                           document.querySelector('h1.ytd-watch-metadata');
    if (titleContainer && titleContainer.parentElement) {
      return { element: titleContainer, position: 'after' };
    }

    // Candidate 5: Generic metadata container (#above-the-fold or ytd-watch-metadata)
    const aboveTheFold = document.querySelector('#above-the-fold') || document.querySelector('ytd-watch-metadata');
    if (aboveTheFold) {
      return { element: aboveTheFold, position: 'append' };
    }

    return null;
  }

  /**
   * Safe settings fetch with default fallback
   */
  async function getSafeSettings() {
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
   * Inject Summarize Button into YouTube UI
   */
  async function tryInjectButton() {
    if (!isWatchPage()) {
      removeExistingButton();
      return;
    }

    const currentUrl = getVideoUrl();
    const existing = document.getElementById('yt-gemini-summary-container');

    // If button already exists in DOM
    if (existing && document.body.contains(existing)) {
      // Check if attached button is visible and URL matches
      const rect = existing.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;

      if (lastInjectedUrl === currentUrl && isVisible) {
        return; // Already cleanly rendered
      }

      // If URL changed or previous container became hidden/detached, remove and re-inject
      existing.remove();
    }

    const targetInfo = findTargetContainer();
    if (!targetInfo || !targetInfo.element) {
      return; // DOM not ready yet
    }

    const settings = await getSafeSettings();
    if (settings.showOnPageButton === false) {
      removeExistingButton();
      return;
    }

    const accounts = settings.accounts || [{ index: 0, label: 'アカウント 0' }];
    const defaultIndex = settings.defaultAccountIndex ?? 0;
    const activeAccount = accounts.find(a => a.index === defaultIndex) || accounts[0];

    // Build button container
    const container = document.createElement('div');
    container.id = 'yt-gemini-summary-container';
    container.className = 'yt-gemini-btn-container';

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

    // Dropdown for multiple accounts
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

    // Insert according to position
    const { element, position } = targetInfo;
    try {
      if (position === 'after' && element.parentElement) {
        element.parentElement.insertBefore(container, element.nextSibling);
      } else if (position === 'prepend' && element.firstChild) {
        element.insertBefore(container, element.firstChild);
      } else {
        element.appendChild(container);
      }
      lastInjectedUrl = currentUrl;
    } catch (insertErr) {
      console.warn('[YouTube Summarizer] Failed to insert button:', insertErr);
    }
  }

  function removeExistingButton() {
    const existing = document.getElementById('yt-gemini-summary-container');
    if (existing) existing.remove();
  }

  /**
   * Trigger Summarize Request
   */
  function runSummarize(accountIndex) {
    const url = getVideoUrl();
    const title = getVideoTitle();

    chrome.runtime.sendMessage({
      action: 'START_SUMMARIZE',
      payload: {
        url,
        title,
        accountIndex
      }
    });
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

  // Event Listeners for YouTube navigation
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(tryInjectButton, 200);
    setTimeout(tryInjectButton, 800);
    setTimeout(tryInjectButton, 1800);
  });

  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(tryInjectButton, 300);
    setTimeout(tryInjectButton, 1000);
  });

  window.addEventListener('load', () => {
    tryInjectButton();
  });

  // Safety net: Continuous check with MutationObserver
  const observer = new MutationObserver(() => {
    if (isWatchPage()) {
      const btn = document.getElementById('yt-gemini-summary-container');
      if (!btn || !document.body.contains(btn)) {
        tryInjectButton();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic safety check every 1.2 seconds if on watch page and button is missing
  setInterval(() => {
    if (isWatchPage()) {
      const btn = document.getElementById('yt-gemini-summary-container');
      if (!btn || !document.body.contains(btn)) {
        tryInjectButton();
      }
    }
  }, 1200);

  // Initial trigger
  tryInjectButton();

})();
