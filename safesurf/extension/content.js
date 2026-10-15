/**
 * SafeSurf - Content Script Engine (Manifest V3)
 * 
 * Multi-layer Content Filter:
 * 1. Real-time DOM Text & Profanity Masker (English & Indic dictionaries)
 * 2. On-Device AI Image Classifier (NSFW.js / MobileNetV2 with TensorFlow.js)
 *    - Viewport lazy-loading with IntersectionObserver
 *    - Cross-origin aware classification
 *    - CSS blur overlay with anti-bypass click lock
 *    - Dynamic DOM MutationObserver
 */

(function () {
  'use strict';

  if (window.__SAFESURF_CONTENT_INITIALIZED__) return;
  window.__SAFESURF_CONTENT_INITIALIZED__ = true;

  // Global State
  let isProtectionActive = true;
  let profanityRegex = null;
  let domObserver = null;
  let imageObserver = null;

  // Shadow DOM observers (web components, e.g. search result widgets)
  const shadowObservers = new Map();

  // Batching & Sets
  const pendingTextNodes = new Set();
  const processedImages = new WeakSet();
  const flaggedImages = new WeakSet();
  let textBatchTimer = null;

  // AI Model State
  let nsfwModel = null;
  let isModelLoading = false;

  // Excluded tags from text scanning
  const SKIPPED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
    'CODE', 'PRE', 'SVG', 'CANVAS', 'IFRAME', 'AUDIO', 'VIDEO'
  ]);

  // Seed dictionary for instant fallback
  const SEED_PROFANITY = [
    'fuck', 'fucking', 'fucker', 'shit', 'shitty', 'bitch', 'asshole',
    'dick', 'cock', 'pussy', 'cunt', 'bastard', 'slut', 'whore', 'porn',
    'nigger', 'nigga', 'faggot', 'chutiya', 'madarchod', 'bhenchod',
    'bhosdike', 'gandu', 'harami', 'kameena', 'thevidiya', 'punda',
    'oombu', 'sunni', 'mayiru', 'lavde', 'lund', 'randi', 'gaand'
  ];

  // ============================================================================
  // SECTION 1: Profanity Regex & Text Masking Engine
  // ============================================================================

  function compileProfanityRegex(words) {
    if (!words || words.length === 0) return null;
    const unique = Array.from(new Set(words.map(w => w.trim().toLowerCase()))).filter(Boolean);
    unique.sort((a, b) => b.length - a.length);
    const escaped = unique.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');
  }

  async function loadProfanityDictionaries() {
    try {
      const [enRes, indicRes] = await Promise.allSettled([
        fetch(chrome.runtime.getURL('data/profanity/en.json')).then(r => r.json()),
        fetch(chrome.runtime.getURL('data/profanity/indic.json')).then(r => r.json())
      ]);

      const enWords = enRes.status === 'fulfilled' ? enRes.value : [];
      const indicWords = indicRes.status === 'fulfilled' ? indicRes.value : [];
      const combined = [...SEED_PROFANITY, ...enWords, ...indicWords];

      profanityRegex = compileProfanityRegex(combined);
      console.log(`[SafeSurf] Profanity engine ready with ${combined.length} words`);
    } catch (err) {
      console.warn('[SafeSurf] Using seed profanity list:', err);
      profanityRegex = compileProfanityRegex(SEED_PROFANITY);
    }
  }

  function maskTextString(text) {
    if (!profanityRegex || !text || text.length < 2) {
      return { maskedText: text, count: 0 };
    }
    let count = 0;
    const maskedText = text.replace(profanityRegex, (match) => {
      count++;
      return '*'.repeat(match.length);
    });
    return { maskedText, count };
  }

  function reportStat(key, amount = 1) {
    try {
      chrome.runtime.sendMessage({
        type: 'INCREMENT_STAT',
        payload: { key, amount }
      });
    } catch (err) {
      // Background worker inactive
    }
  }

  function processTextNode(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const parent = textNode.parentElement;
    if (!parent || SKIPPED_TAGS.has(parent.tagName) || parent.isContentEditable) return;

    const original = textNode.nodeValue;
    if (!original || !original.trim()) return;

    if (profanityRegex && profanityRegex.test(original)) {
      const { maskedText, count } = maskTextString(original);
      if (count > 0) {
        textNode.nodeValue = maskedText;
        reportStat('maskedWords', count);
      }
    }
  }

  function scanTextSubtree(rootNode) {
    if (!isProtectionActive || !profanityRegex || !rootNode) return;
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent || SKIPPED_TAGS.has(parent.tagName) || parent.isContentEditable) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let curr = walker.nextNode();
    while (curr) {
      processTextNode(curr);
      curr = walker.nextNode();
    }
  }

  // ============================================================================
  // SECTION 2: AI Image Classification & Blurring (NSFW.js / TF.js)
  // ============================================================================

  async function loadNSFWModel() {
    if (nsfwModel) return nsfwModel;
    if (isModelLoading) return null;

    if (typeof window.nsfwjs === 'undefined') {
      console.warn('[SafeSurf] NSFW.js library not detected yet in page context');
      return null;
    }

    try {
      isModelLoading = true;
      const modelUrl = chrome.runtime.getURL('models/mobilenet_v2/');
      console.log('[SafeSurf AI] Loading bundled NSFW.js model from:', modelUrl);
      nsfwModel = await window.nsfwjs.load(modelUrl);
      console.log('[SafeSurf AI] MobileNetV2 model successfully initialized on-device!');
      return nsfwModel;
    } catch (err) {
      console.error('[SafeSurf AI] Error loading local model:', err);
      return null;
    } finally {
      isModelLoading = false;
    }
  }

  /**
   * Applies CSS blur filter and locking overlay to explicit images
   * @param {HTMLImageElement} img 
   * @param {string} reason 
   */
  function blurAndLockImage(img, reason = 'Explicit / NSFW') {
    if (flaggedImages.has(img)) return;
    flaggedImages.add(img);

    img.classList.add('safesurf-blurred-image');
    img.setAttribute('data-safesurf-flagged', 'true');

    // Anti-reveal click shield: prevent click events from exposing content
    img.addEventListener('click', (e) => {
      if (isProtectionActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Create wrapper overlay if parent is not already wrapped
    const parent = img.parentElement;
    if (parent && !parent.classList.contains('safesurf-blur-container')) {
      const container = document.createElement('div');
      container.className = 'safesurf-blur-container';
      
      const overlay = document.createElement('div');
      overlay.className = 'safesurf-blur-overlay';
      overlay.innerHTML = `
        <svg class="safesurf-blur-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span class="safesurf-blur-label">Image Blurred by SafeSurf</span>
        <span class="safesurf-blur-subtext">Protection Active • Click-reveal locked</span>
      `;

      // Prevent clicks on overlay as well
      overlay.addEventListener('click', (e) => {
        if (isProtectionActive) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);

      parent.insertBefore(container, img);
      container.appendChild(img);
      container.appendChild(overlay);
    }

    reportStat('blurredImages', 1);
  }

  /**
   * Evaluates image with NSFW.js classifier
   * @param {HTMLImageElement} img 
   */
  async function evaluateImage(img) {
    if (!isProtectionActive) return;
    if (processedImages.has(img)) return;
    processedImages.add(img);

    // Skip tiny icons, tracking pixels, or non-visible elements
    const width = img.naturalWidth || img.clientWidth || 0;
    const height = img.naturalHeight || img.clientHeight || 0;
    if (width < 90 || height < 90) return;

    const model = await loadNSFWModel();
    if (!model) return;

    try {
      // Run classification
      const predictions = await model.classify(img);
      if (!predictions || predictions.length === 0) return;

      const predMap = {};
      predictions.forEach(p => { predMap[p.className] = p.probability; });

      const pornScore = predMap['Porn'] || 0;
      const hentaiScore = predMap['Hentai'] || 0;
      const sexyScore = predMap['Sexy'] || 0;

      // Threshold evaluation: Porn > 40%, Hentai > 40%, Sexy > 65%, or combined > 48%
      if (pornScore > 0.40 || hentaiScore > 0.40 || sexyScore > 0.65 || (pornScore + hentaiScore) > 0.48) {
        console.warn(`[SafeSurf AI] Flagged explicit image:`, {
          src: img.src?.substring(0, 60),
          porn: pornScore.toFixed(2),
          hentai: hentaiScore.toFixed(2),
          sexy: sexyScore.toFixed(2)
        });
        blurAndLockImage(img);
      }
    } catch (classifyErr) {
      // May happen with tainted canvas on cross-origin image lacking CORS headers
      // Silent catch to prevent console spam
    }
  }

  /**
   * IntersectionObserver for viewport-lazy image classification
   */
  function initImageObserver() {
    if (imageObserver) return;

    imageObserver = new IntersectionObserver((entries) => {
      if (!isProtectionActive) return;

      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target;
          imageObserver.unobserve(img);

          if (img.complete && img.naturalWidth > 0) {
            evaluateImage(img);
          } else {
            img.addEventListener('load', () => evaluateImage(img), { once: true });
          }
        }
      }
    }, {
      rootMargin: '200px' // Pre-evaluate 200px before entering viewport
    });
  }

  function observeAllImages(rootNode = document) {
    if (!isProtectionActive) return;
    initImageObserver();

    const images = rootNode.querySelectorAll ? rootNode.querySelectorAll('img') : [];
    images.forEach((img) => {
      if (!processedImages.has(img)) {
        imageObserver.observe(img);
      }
    });
  }

  // ============================================================================
  // SECTION 3: Dynamic Mutation Handling & State Synchronization
  // ============================================================================

  function processBatchedTextMutations() {
    if (!isProtectionActive || pendingTextNodes.size === 0) return;
    const nodes = Array.from(pendingTextNodes);
    pendingTextNodes.clear();

    for (const node of nodes) {
      if (!node.isConnected) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        scanSubtreeDeep(node);
      }
    }
  }

  // ============================================================================
  // Shadow DOM Traversal (web components / Brave-style search widgets)
  // ============================================================================

  /**
   * Scans an element subtree and descends into any open shadow roots
   * @param {Element} node 
   */
  function scanSubtreeDeep(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    scanTextSubtree(node);
    observeAllImages(node);
    registerShadowRoots(node);
  }

  /**
   * Finds open shadow roots inside a subtree and hooks them into the engine
   * @param {Element|ShadowRoot} root 
   */
  function registerShadowRoots(root) {
    try {
      if (root.shadowRoot) attachShadowEngine(root.shadowRoot);
      const nested = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (let i = 0; i < nested.length; i++) {
        if (nested[i].shadowRoot) attachShadowEngine(nested[i].shadowRoot);
      }
    } catch (err) {
      // Ignore detached/inaccessible roots
    }
  }

  /**
   * Scans a shadow root, then watches it for dynamic content
   * @param {ShadowRoot} shadowRoot 
   */
  function attachShadowEngine(shadowRoot) {
    if (!shadowRoot || shadowObservers.has(shadowRoot)) return;

    if (isProtectionActive) {
      scanTextSubtree(shadowRoot);
      observeAllImages(shadowRoot);
      registerShadowRoots(shadowRoot);
    }

    const obs = new MutationObserver(handleMutations);
    obs.observe(shadowRoot, { childList: true, subtree: true, characterData: true });
    shadowObservers.set(shadowRoot, obs);
  }

  /**
   * Patches Element.prototype.attachShadow to catch roots created after init
   */
  function patchAttachShadow() {
    const original = Element.prototype.attachShadow;
    if (!original || original.__safesurfPatched) return;

    const patched = function (init) {
      const shadowRoot = original.call(this, init);
      try {
        if (shadowRoot && (!init || init.mode !== 'closed')) {
          attachShadowEngine(shadowRoot);
        }
      } catch (err) {
        // Ignore
      }
      return shadowRoot;
    };
    patched.__safesurfPatched = true;
    Element.prototype.attachShadow = patched;
  }

  function scheduleTextBatch() {
    if (textBatchTimer) return;
    textBatchTimer = setTimeout(() => {
      textBatchTimer = null;
      if (window.requestIdleCallback) {
        window.requestIdleCallback(processBatchedTextMutations, { timeout: 80 });
      } else {
        processBatchedTextMutations();
      }
    }, 40);
  }

  /**
   * Shared MutationObserver callback, reused for document and shadow roots
   * @param {MutationRecord[]} mutations 
   */
  function handleMutations(mutations) {
    if (!isProtectionActive) return;

    for (const m of mutations) {
      if (m.type === 'childList') {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const added = m.addedNodes[i];
          pendingTextNodes.add(added);
          if (added.nodeType === Node.ELEMENT_NODE && added.tagName === 'IMG') {
            initImageObserver();
            imageObserver.observe(added);
          }
        }
      } else if (m.type === 'characterData') {
        pendingTextNodes.add(m.target);
      }
    }

    if (pendingTextNodes.size > 0) {
      scheduleTextBatch();
    }
  }

  function startDynamicObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver(handleMutations);
    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Toggle active/inactive state dynamically
  function handleProtectionToggle(enabled) {
    isProtectionActive = enabled;
    console.log('[SafeSurf Content] Master protection state:', isProtectionActive);

    const flaggedList = document.querySelectorAll('[data-safesurf-flagged="true"]');
    const overlays = document.querySelectorAll('.safesurf-blur-overlay');

    if (!isProtectionActive) {
      // Unblur
      flaggedList.forEach(img => img.classList.remove('safesurf-blurred-image'));
      overlays.forEach(ov => ov.style.display = 'none');
      if (domObserver) { domObserver.disconnect(); domObserver = null; }
      if (imageObserver) { imageObserver.disconnect(); imageObserver = null; }
      shadowObservers.forEach((obs) => obs.disconnect());
      shadowObservers.clear();
    } else {
      // Re-blur & re-activate
      flaggedList.forEach(img => img.classList.add('safesurf-blurred-image'));
      overlays.forEach(ov => ov.style.display = 'flex');
      scanSubtreeDeep(document.body);
      startDynamicObserver();
    }
  }

  // ============================================================================
  // SECTION 4: Initialization Lifecycle
  // ============================================================================

  async function initializeEngine() {
    // 0. Hook shadow-root creation before any awaits (catches web components)
    patchAttachShadow();

    try {
      const data = await chrome.storage.sync.get('enabled');
      isProtectionActive = data.enabled ?? true;
    } catch (err) {
      isProtectionActive = true;
    }

    // 1. Load dictionaries & pre-warm AI model
    await loadProfanityDictionaries();
    loadNSFWModel(); // Async load in background

    // 2. Initial document pass (including existing open shadow roots)
    if (isProtectionActive) {
      scanSubtreeDeep(document.body || document.documentElement);
      startDynamicObserver();
    }

    // 4. Listen for popup toggle events
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.enabled) {
        handleProtectionToggle(changes.enabled.newValue);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEngine);
  } else {
    initializeEngine();
  }
})();
