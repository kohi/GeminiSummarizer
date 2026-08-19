/**
 * Smart Content Extractor for Web Pages
 * Extracts main article text while removing ads, banners, navs, footers, and noise.
 */

(function (global) {
  'use strict';

  // Selectors of noise and ad elements to remove
  const NOISE_SELECTORS = [
    // Ads & Tracking
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
    '.ad', '.ads', '.advertisement', '.ad-container', '.ad-box', '.ad-wrapper',
    '.google-auto-placed', '[id*="google_ads"]', '[id*="ad-"]', '[id*="ad_"]',
    '[class*="google_ads"]', '[class*="ad-slot"]', '[class*="advert"]',
    '[aria-label*="advertisement" i]', '[aria-label*="広告" i]',
    'ins.adsbygoogle', '.yom-ad', '.sponsored', '.sponsor',
    
    // Page Layout / Navigation
    'header', 'footer', 'nav', 'aside',
    '[role="banner"]', '[role="navigation"]', '[role="complementary"]', '[role="search"]',
    '.header', '.footer', '.navbar', '.nav', '.menu', '.site-header', '.site-footer',
    '.sidebar', '.side-bar', '#sidebar', '#side-nav',
    
    // Social / Share / Meta
    '.social-share', '.share-buttons', '.sns-share', '.social-links',
    '.sharing', '.share-bar', '.post-share',
    
    // Comments & Engagement
    '.comments', '#comments', '.comment-section', '.disqus', '#disqus_thread',
    '.feedback', '.reactions', '.related-posts', '.recommended', '.popular-posts',
    '.newsletter-signup', '.subscribe-box', '.modal', '.popup', '.dialog',
    '[aria-modal="true"]', '.cookie-banner', '.cookie-notice', '#cookie-consent'
  ];

  // Candidates for main content container
  const MAIN_CONTAINER_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.article-body',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.story-body',
    '.main-content',
    '#main-content',
    '#article-body',
    '#content',
    '.content'
  ];

  /**
   * Clean and extract main article content from DOM
   * @param {Document|HTMLElement} root
   * @param {number} maxChars Maximum character limit for Gemini context
   * @returns {{ title: string, content: string, charCount: number, originalUrl: string, isTruncated: boolean }}
   */
  function extractMainContent(root = document, maxChars = 12000) {
    const url = window.location.href;
    const title = extractPageTitle(root);

    // 1. Clone DOM to avoid altering actual page
    const docClone = root.cloneNode(true);

    // 2. Remove all noise elements from the clone
    NOISE_SELECTORS.forEach(selector => {
      try {
        const elements = docClone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // ignore invalid selectors if any
      }
    });

    // 3. Find the best candidate for main content container
    let mainElement = null;
    for (const selector of MAIN_CONTAINER_SELECTORS) {
      const el = docClone.querySelector(selector);
      if (el && el.innerText && el.innerText.trim().length > 150) {
        mainElement = el;
        break;
      }
    }

    if (!mainElement) {
      mainElement = docClone.body || docClone;
    }

    // 4. Extract structured text preserving headings and paragraphs
    const formattedText = cleanAndFormatText(mainElement);

    // 5. Truncate if exceeds maximum length
    let isTruncated = false;
    let finalContent = formattedText;
    if (finalContent.length > maxChars) {
      finalContent = finalContent.slice(0, maxChars) + '\n\n...（文字数上限のため以降省略）';
      isTruncated = true;
    }

    return {
      title,
      url,
      content: finalContent.trim(),
      charCount: finalContent.trim().length,
      isTruncated
    };
  }

  /**
   * Extract best page title
   */
  function extractPageTitle(root = document) {
    // Check OpenGraph title or meta title
    const ogTitle = root.querySelector?.('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) return ogTitle.trim();

    // Check h1
    const h1 = root.querySelector?.('h1');
    if (h1 && h1.innerText && h1.innerText.trim().length > 3) {
      return h1.innerText.trim();
    }

    // Fallback to document.title
    return document.title.trim();
  }

  /**
   * Format DOM node to clean text with headings and paragraphs
   */
  function cleanAndFormatText(node) {
    const blocks = [];
    const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'SECTION', 'ARTICLE']);

    function walk(curr) {
      if (curr.nodeType === Node.TEXT_NODE) {
        const text = curr.textContent.trim();
        if (text) {
          blocks.push(text);
        }
        return;
      }

      if (curr.nodeType !== Node.ELEMENT_NODE) return;

      const tag = curr.tagName.toUpperCase();

      // Skip hidden elements
      const style = curr.style || {};
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const isBlock = blockTags.has(tag);
      if (isBlock && blocks.length > 0 && blocks[blocks.length - 1] !== '\n') {
        blocks.push('\n');
      }

      // Add markdown-like prefix for headings
      if (tag === 'H1') blocks.push('\n# ');
      else if (tag === 'H2') blocks.push('\n## ');
      else if (tag === 'H3') blocks.push('\n### ');
      else if (tag === 'LI') blocks.push('\n- ');

      for (let child = curr.firstChild; child; child = child.nextSibling) {
        walk(child);
      }

      if (isBlock && blocks.length > 0 && blocks[blocks.length - 1] !== '\n') {
        blocks.push('\n');
      }
    }

    walk(node);

    // Join and clean redundant newlines and whitespaces
    return blocks
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Export for multiple contexts
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractMainContent, extractPageTitle };
  } else {
    global.ContentExtractor = { extractMainContent, extractPageTitle };
  }
})(typeof window !== 'undefined' ? window : this);
