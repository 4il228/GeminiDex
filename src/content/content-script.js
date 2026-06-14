(function () {
  'use strict';

  if (document.getElementById('gemini-agent-root')) return;
  if (!chrome || !chrome.runtime || !chrome.runtime.getURL) return;

  var root = document.createElement('div');
  root.id = 'gemini-agent-root';
  document.body.appendChild(root);

  var CONTEXT_LIMITS = { free: 4000, pro: 15000, ultra: 50000 };

  function getPageContext(tier) {
    var limit = CONTEXT_LIMITS[tier] || CONTEXT_LIMITS.free;
    var parts = [];

    var title = document.title;
    if (title) parts.push('[Title] ' + title.trim());

    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content) parts.push('[Description] ' + metaDesc.content.trim());

    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) parts.push('[URL] ' + canonical.href);

    var sel = window.getSelection().toString().trim();
    if (sel) parts.push('[Selected text]\n' + sel);

    var headings = document.querySelectorAll('h1, h2, h3');
    var headingTexts = [];
    headings.forEach(function (h) {
      var t = h.innerText.trim();
      if (t) headingTexts.push(h.tagName + ' ' + t);
    });
    if (headingTexts.length) parts.push('[Headings]\n' + headingTexts.join('\n'));

    var article = document.querySelector('article, main, [role="main"]');
    var contentEl = article || document.body;

    var paragraphs = contentEl.querySelectorAll('p, li, td, th, blockquote, pre, div.task, div.problem, span.question');
    var textParts = [];
    paragraphs.forEach(function (el) {
      var t = el.innerText.trim();
      if (t && t.length > 5) textParts.push(t);
    });
    if (textParts.length) parts.push('[Content]\n' + textParts.join('\n'));

    if (tier === 'pro' || tier === 'ultra') {
      var codeBlocks = document.querySelectorAll('code, pre, .code, .code-block');
      var codeTexts = [];
      codeBlocks.forEach(function (el) {
        var t = el.innerText.trim();
        if (t && t.length > 5) codeTexts.push(t);
      });
      if (codeTexts.length) parts.push('[Code]\n' + codeTexts.join('\n\n'));
    }

    if (tier === 'ultra') {
      var links = document.querySelectorAll('a[href]');
      var linkTexts = [];
      links.forEach(function (el) {
        var t = el.innerText.trim();
        var h = el.href;
        if (t && h && !h.startsWith('javascript:')) linkTexts.push(t + ' -> ' + h);
      });
      if (linkTexts.length > 50) linkTexts = linkTexts.slice(0, 50);
      if (linkTexts.length) parts.push('[Links]\n' + linkTexts.join('\n'));

      var imgs = document.querySelectorAll('img[alt]');
      var imgTexts = [];
      imgs.forEach(function (img) {
        if (img.alt.trim()) imgTexts.push(img.alt.trim());
      });
      if (imgTexts.length > 30) imgTexts = imgTexts.slice(0, 30);
      if (imgTexts.length) parts.push('[Images]\n' + imgTexts.join(', '));
    }

    var result = parts.join('\n\n');
    if (result.length > limit) result = result.substring(0, limit) + '...';
    return result;
  }

  /* ===== Toggle Button (вне iframe) ===== */
  var toggleBtn = document.createElement('button');
  toggleBtn.id = 'gemini-toggle';
  toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
  toggleBtn.style.cssText = 'position:fixed;right:16px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:#1a73e8;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(26,115,232,0.4);z-index:2147483647;transition:all .3s ease;';
  document.body.appendChild(toggleBtn);

  /* ===== CSS для iframe ===== */
  var CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px; color: #e3e3e3; background: #1e1f20; height: 100vh; overflow: hidden;
    }
    .panel { display: flex; flex-direction: column; height: 100vh; background: #1e1f20; }
    .panel.hidden { display: none; }

    /* Header */
    .header {
      padding: 16px 20px; background: #282a2c; border-bottom: 1px solid #3c3f41;
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    .header-icon {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #4285f4 0%, #34a853 33%, #fbbc05 66%, #ea4335 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; color: #fff; font-weight: 700;
    }
    .header-text h1 { font-size: 15px; font-weight: 500; color: #e3e3e3; margin: 0; }
    .header-text p { font-size: 11px; color: #9aa0a6; margin: 2px 0 0 0; }
    #model-badge {
      display: inline-block; padding: 1px 7px; border-radius: 8px;
      background: rgba(66, 133, 244, 0.15); color: #8ab4f8;
      font-size: 10px; font-weight: 500; letter-spacing: 0.3px;
      transition: all 0.3s ease;
    }

    /* Model selector */
    .model-selector {
      position: relative; display: inline-flex; align-items: center; gap: 4px;
      cursor: pointer; margin-top: 3px;
    }
    .model-selector:hover #model-badge {
      background: rgba(66, 133, 244, 0.25);
    }
    .model-chevron {
      color: #8ab4f8; transition: transform 0.2s ease; flex-shrink: 0;
    }
    .model-selector.open .model-chevron {
      transform: rotate(180deg);
    }
    .model-dropdown {
      display: none; position: absolute; top: calc(100% + 6px); left: 0;
      min-width: 200px; background: #2d2f31; border: 1px solid #3c3f41;
      border-radius: 10px; padding: 4px; z-index: 10;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: dropIn 0.15s ease;
    }
    .model-selector.open .model-dropdown {
      display: block;
    }
    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .model-option {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 8px;
      font-size: 12px; color: #e3e3e3; cursor: pointer;
      transition: background 0.15s;
    }
    .model-option:hover {
      background: rgba(255,255,255,0.06);
    }
    .model-option.active {
      background: rgba(66, 133, 244, 0.15); color: #8ab4f8;
    }
    .model-option .model-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
      background: #5f6368;
    }
    .model-option.active .model-dot {
      background: #8ab4f8;
    }
    .model-option-name {
      font-weight: 500;
    }
    .model-option-tag {
      font-size: 9px; color: #9aa0a6; margin-left: auto;
      padding: 1px 5px; border-radius: 4px;
      background: rgba(255,255,255,0.05);
    }

    /* Messages */
    .messages {
      flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px;
      scroll-behavior: smooth;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-track { background: transparent; }
    .messages::-webkit-scrollbar-thumb { background: #5f6368; border-radius: 3px; }
    .messages::-webkit-scrollbar-thumb:hover { background: #80868b; }

    /* Empty state */
    .empty {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; color: #9aa0a6; text-align: center; padding: 40px 20px;
    }
    .empty-icon {
      width: 72px; height: 72px; border-radius: 50%; margin-bottom: 20px;
      background: linear-gradient(135deg, #4285f4 0%, #34a853 33%, #fbbc05 66%, #ea4335 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 32px; opacity: 0.85;
    }
    .header-icon.thinking {
      animation: iconSpin 2s linear infinite;
    }
    @keyframes iconSpin {
      0% { filter: hue-rotate(0deg); transform: scale(1); }
      50% { filter: hue-rotate(60deg); transform: scale(1.05); }
      100% { filter: hue-rotate(0deg); transform: scale(1); }
    }
    .empty h2 { font-size: 18px; font-weight: 500; color: #e3e3e3; margin-bottom: 8px; }
    .empty p { font-size: 13px; color: #9aa0a6; line-height: 1.6; }

    /* Messages */
    .msg {
      padding: 12px 16px; border-radius: 18px; max-width: 85%;
      word-wrap: break-word; line-height: 1.6; font-size: 14px;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
    .msg.user {
      align-self: flex-end; background: #1a73e8; color: #fff;
      border-bottom-right-radius: 6px;
    }
    .msg.bot {
      align-self: flex-start; background: #282a2c; color: #e3e3e3;
      border-bottom-left-radius: 6px;
    }
    .msg.bot code {
      background: #3c3f41; padding: 2px 6px; border-radius: 4px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; color: #8ab4f8;
    }
    .msg.bot pre {
      background: #1a1b1c; color: #e3e3e3; padding: 14px; border-radius: 8px;
      overflow-x: auto; margin: 10px 0; border: 1px solid #3c3f41;
    }
    .msg.bot pre code { background: none; padding: 0; color: inherit; }
    .msg.bot strong { color: #e8eaed; font-weight: 600; }
    .msg.bot em { color: #c4c7cc; }

    /* Error */
    .error {
      color: #f28b82; padding: 12px 16px; text-align: center; font-size: 13px;
      background: rgba(242, 139, 130, 0.08); border-radius: 8px; border: 1px solid rgba(242, 139, 130, 0.15);
    }

    /* Input */
    .input-area {
      padding: 12px 16px 16px; border-top: 1px solid #3c3f41; background: #1e1f20; flex-shrink: 0;
    }
    .input-box {
      display: flex; gap: 8px; align-items: flex-end; background: #282a2c;
      border: 1px solid #3c3f41; border-radius: 16px; padding: 10px 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-box:focus-within {
      border-color: #1a73e8; box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.15);
    }
    .input-box textarea {
      flex: 1; background: transparent; color: #e3e3e3; border: none; outline: none;
      font-family: inherit; font-size: 14px; resize: none;
      min-height: 24px; max-height: 120px; line-height: 1.5; padding: 2px 0;
    }
    .input-box textarea::placeholder { color: #80868b; }
    .send-btn {
      width: 36px; height: 36px; border-radius: 50%; background: #1a73e8;
      color: #fff; border: none; cursor: pointer; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      transition: background 0.2s, transform 0.15s;
    }
    .send-btn:hover { background: #1557b0; transform: scale(1.05); }
    .send-btn:active { transform: scale(0.95); }
    .send-btn:disabled { background: #3c3f41; color: #80868b; cursor: not-allowed; transform: none; }
    .send-btn svg { width: 18px; height: 18px; fill: currentColor; }

    /* Analyze checkbox */
    .analyze-bar {
      padding: 8px 16px; border-top: 1px solid #3c3f41; background: #282a2c;
      display: flex; align-items: center; justify-content: space-between;
    }
    .analyze-label {
      display: flex; align-items: center; gap: 8px; font-size: 13px;
      color: #9aa0a6; cursor: pointer; user-select: none;
    }
    .analyze-bar input[type="checkbox"] {
      width: 14px; height: 14px; accent-color: #1a73e8; cursor: pointer;
    }
    .analyze-text { font-weight: 500; color: #e3e3e3; }
    .analyze-info {
      font-size: 10px; color: #80868b; padding: 2px 8px;
      background: rgba(255,255,255,0.04); border-radius: 6px;
    }

    /* Thinking phase */
    .phase-indicator {
      display: flex; align-items: center; gap: 10px; padding: 0;
      animation: fadeIn 0.3s ease;
    }
    .phase-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      animation: phasePulse 1.2s ease-in-out infinite;
    }
    .phase-dot.think { background: #4285f4; }
    .phase-dot.analyze { background: #34a853; }
    .phase-dot.form { background: #fbbc05; }
    @keyframes phasePulse {
      0%, 100% { transform: scale(1); opacity: 0.5; box-shadow: 0 0 0 0 currentColor; }
      50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 8px 2px currentColor; }
    }
    .phase-text {
      font-size: 13px; color: #9aa0a6; font-style: italic;
    }
    .phase-text span {
      display: inline-block;
    }
    .phase-text span.dot-anim::after {
      content: '';
      animation: dotAppear 1.5s ease-in-out infinite;
    }
    @keyframes dotAppear {
      0% { content: ''; }
      25% { content: '.'; }
      50% { content: '..'; }
      75% { content: '...'; }
      100% { content: ''; }
    }

    /* Streaming with cursor */
    .streaming-cursor::after {
      content: '';
      display: inline-block;
      width: 2px; height: 1em;
      background: #8ab4f8;
      margin-left: 2px;
      vertical-align: text-bottom;
      animation: cursorBlink 0.8s step-end infinite;
    }
    @keyframes cursorBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Shimmer loading bar */
    .shimmer-bar {
      width: 100%; height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, transparent 0%, #4285f4 50%, transparent 100%);
      background-size: 200% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
      margin-top: 8px;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Floating dots (idle animation) */
    .idle-dots {
      display: inline-flex; gap: 5px; padding: 4px 0;
    }
    .idle-dots span {
      width: 5px; height: 5px; background: #80868b; border-radius: 50%;
      animation: idleFloat 2s ease-in-out infinite;
    }
    .idle-dots span:nth-child(2) { animation-delay: 0.3s; }
    .idle-dots span:nth-child(3) { animation-delay: 0.6s; }
    @keyframes idleFloat {
      0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
      50% { transform: translateY(-6px) scale(1.2); opacity: 0.8; }
    }

    /* Success checkmark */
    .success-check {
      display: inline-flex; align-items: center; gap: 6px;
      color: #34a853; font-size: 12px;
      animation: checkPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes checkPop {
      0% { transform: scale(0); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;

  /* ===== HTML ===== */
  var HTML = `
    <div class="panel" id="panel">
      <div class="header">
        <div class="header-icon">G</div>
        <div class="header-text">
          <h1>Gemini Agent</h1>
          <div class="model-selector" id="model-selector">
            <span id="model-badge">AI Assistant</span>
            <svg class="model-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
            <div class="model-dropdown" id="model-dropdown"></div>
          </div>
        </div>
      </div>
      <div class="messages" id="messages">
        <div class="empty" id="empty-state">
          <div class="empty-icon">\u2726</div>
          <h2>Hi there!</h2>
          <p>Ask me anything about this page</p>
        </div>
      </div>
      <div class="input-area">
        <div class="input-box">
          <textarea id="user-input" placeholder="Message Gemini..." rows="1"></textarea>
          <button class="send-btn" id="send-btn">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  /* ===== Iframe ===== */
  var blob = new Blob([
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + HTML + '</body></html>'
  ], { type: 'text/html' });

  var iframe = document.createElement('iframe');
  iframe.src = URL.createObjectURL(blob);
  iframe.style.cssText = 'position:fixed;right:0;top:0;width:380px;height:100vh;border:none;z-index:2147483647;background:#1e1f20;transition:transform .3s cubic-bezier(.4,0,.2,1);';
  root.appendChild(iframe);

  var isVisible = false;
  var isPanelOpen = false;

  iframe.style.transform = 'translateX(380px)';
  toggleBtn.style.display = 'none';

  function updateToggleIcon() {
    toggleBtn.innerHTML = isPanelOpen
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
  }

  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    iframe.style.transform = isPanelOpen ? '' : 'translateX(380px)';
    toggleBtn.style.right = isPanelOpen ? '400px' : '16px';
    updateToggleIcon();
  }

  toggleBtn.addEventListener('click', togglePanel);

  window.addEventListener('keydown', function (e) {
    if (e.altKey && e.code === 'KeyG') {
      e.preventDefault();
      isVisible = !isVisible;
      toggleBtn.style.display = isVisible ? 'flex' : 'none';
      if (!isVisible && isPanelOpen) {
        isPanelOpen = false;
        iframe.style.transform = 'translateX(380px)';
      }
      if (isVisible) updateToggleIcon();
    }
  });

  /* ===== Widget Logic ===== */
  iframe.onload = function () {
    var doc = iframe.contentDocument;
    if (!doc) return;

    var panel = doc.getElementById('panel');
    var messages = doc.getElementById('messages');
    var emptyState = doc.getElementById('empty-state');
    var userInput = doc.getElementById('user-input');
    var sendBtn = doc.getElementById('send-btn');
    var headerIcon = doc.querySelector('.header-icon');

    var isStreaming = false;
    var streamEl = null;
    var streamRaw = '';
    var currentTier = 'free';
    var analyzeCheckbox = null;
    var phaseEl = null;
    var selectedModel = null;

    function renderMarkdown(text) {
      var h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      h = h.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, l, c) {
        return '<pre><code>' + c.trim() + '</code></pre>';
      });
      h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
      h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      h = h.replace(/\n/g, '<br>');
      return h;
    }

    function autoScroll() { messages.scrollTop = messages.scrollHeight; }

    function showPhase(text, dotClass) {
      removePhase();
      phaseEl = doc.createElement('div');
      phaseEl.className = 'phase-indicator';
      phaseEl.innerHTML = '<div class="phase-dot ' + dotClass + '"></div>' +
        '<span class="phase-text"><span class="dot-anim">' + text + '</span></span>';
      messages.appendChild(phaseEl);
      autoScroll();
    }

    function removePhase() {
      if (phaseEl) { phaseEl.remove(); phaseEl = null; }
    }

    function showSuccess() {
      var el = doc.createElement('div');
      el.className = 'success-check';
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> Done';
      messages.appendChild(el);
      autoScroll();
      setTimeout(function () { el.remove(); }, 1500);
    }

    function addMessage(text, role) {
      if (emptyState) emptyState.remove();
      var el = doc.createElement('div');
      el.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
      el.innerHTML = role === 'user' ? text : renderMarkdown(text);
      messages.appendChild(el);
      autoScroll();
    }

    function startStream() {
      if (emptyState) emptyState.remove();
      removePhase();
      streamEl = doc.createElement('div');
      streamEl.className = 'msg bot streaming-cursor';
      streamEl.innerHTML = '<div class="idle-dots"><span></span><span></span><span></span></div>';
      messages.appendChild(streamEl);
      autoScroll();
      streamRaw = '';
    }

    function addChunk(text) {
      streamRaw += text;
      streamEl.innerHTML = renderMarkdown(streamRaw);
      autoScroll();
    }

    function endStream() {
      if (streamEl && streamRaw) {
        streamEl.classList.remove('streaming-cursor');
        streamEl.innerHTML = renderMarkdown(streamRaw);
      }
      streamEl = null;
      streamRaw = '';
    }

    function showError(text) {
      var el = doc.createElement('div');
      el.className = 'error';
      el.textContent = text;
      messages.appendChild(el);
      autoScroll();
    }

    function setLoading(on) {
      isStreaming = on;
      sendBtn.disabled = on;
      userInput.disabled = on;
      if (headerIcon) {
        if (on) { headerIcon.classList.add('thinking'); }
        else { headerIcon.classList.remove('thinking'); }
      }
    }

    var TIER_MODELS = {
      free:  [{ id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', tag: 'Latest' }],
      pro:   [{ id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', tag: 'Latest' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Pro' }],
      ultra: [{ id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', tag: 'Latest' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Pro' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tag: 'Legacy' }]
    };

    function buildModelDropdown(tier) {
      var models = TIER_MODELS[tier] || TIER_MODELS.free;
      var dropdown = doc.getElementById('model-dropdown');
      var badge = doc.getElementById('model-badge');
      if (!dropdown || !badge) return;

      if (!selectedModel || !models.find(function (m) { return m.id === selectedModel; })) {
        selectedModel = models[0].id;
      }

      dropdown.innerHTML = '';
      models.forEach(function (m) {
        var opt = doc.createElement('div');
        opt.className = 'model-option' + (m.id === selectedModel ? ' active' : '');
        opt.innerHTML = '<span class="model-dot"></span>' +
          '<span class="model-name">' + m.name + '</span>' +
          '<span class="model-option-tag">' + m.tag + '</span>';
        opt.addEventListener('click', function (e) {
          e.stopPropagation();
          selectedModel = m.id;
          badge.textContent = m.name;
          buildModelDropdown(tier);
          closeDropdown();
        });
        dropdown.appendChild(opt);
      });

      var activeModel = models.find(function (m) { return m.id === selectedModel; }) || models[0];
      badge.textContent = activeModel.name;
    }

    function closeDropdown() {
      var selector = doc.getElementById('model-selector');
      if (selector) selector.classList.remove('open');
    }

    var TIER_LABELS = {
      free:  { max: '1M tokens', scope: 'full page' },
      pro:   { max: '1M tokens', scope: 'full page + code' },
      ultra: { max: '1M+ tokens', scope: 'full page + links' }
    };

    function setTierUI(tier) {
      currentTier = tier;
      buildModelDropdown(tier);
      var existing = doc.getElementById('analyze-bar');
      if (!existing) {
        var info = TIER_LABELS[tier] || TIER_LABELS.free;
        var bar = doc.createElement('div');
        bar.id = 'analyze-bar';
        bar.className = 'analyze-bar';
        bar.innerHTML =
          '<label class="analyze-label">' +
            '<input type="checkbox" id="analyze-cb" checked>' +
            '<span class="analyze-text">Analyze page</span>' +
          '</label>' +
          '<span class="analyze-info">' + info.scope + ' \u00B7 ' + info.max + '</span>';
        panel.insertBefore(bar, panel.querySelector('.input-area'));
        analyzeCheckbox = doc.getElementById('analyze-cb');
        analyzeCheckbox.addEventListener('change', function () {
          var infoEl = bar.querySelector('.analyze-info');
          if (infoEl) {
            if (analyzeCheckbox.checked) {
              var ctx = getPreviewContext(tier);
              var chars = ctx.length;
              infoEl.textContent = '~' + (chars > 1000 ? Math.round(chars / 1000) + 'k' : chars) + ' chars \u00B7 ' + info.scope;
            } else {
              infoEl.textContent = info.scope + ' \u00B7 ' + info.max;
            }
          }
        });
      }
    }

    function getPreviewContext(tier) {
      try { return getPageContext(tier); } catch (e) { return ''; }
    }

    function clearChat() {
      messages.innerHTML = '';
      streamEl = null;
      streamRaw = '';
      emptyState = null;
      removePhase();
      setLoading(false);
    }

    function send() {
      var text = userInput.value.trim();
      if (!text || isStreaming) return;

      if (text === 'cls') {
        clearChat();
        userInput.value = '';
        userInput.style.height = 'auto';
        return;
      }

      addMessage(text, 'user');
      userInput.value = '';
      userInput.style.height = 'auto';
      setLoading(true);
      showPhase('\u0414\u0443\u043c\u0430\u044e...', 'think');

      var shouldAnalyze = !analyzeCheckbox || analyzeCheckbox.checked;
      root.dispatchEvent(new CustomEvent('gemini-agent-send', {
        detail: { type: 'SEND_PROMPT', payload: { message: text, analyzePage: shouldAnalyze, model: selectedModel } }
      }));
    }

    sendBtn.addEventListener('click', send);
    userInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    userInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    var modelSelector = doc.getElementById('model-selector');
    if (modelSelector) {
      modelSelector.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = modelSelector.classList.contains('open');
        if (isOpen) { closeDropdown(); }
        else { modelSelector.classList.add('open'); }
      });
    }
    doc.addEventListener('click', function () { closeDropdown(); });

    root.addEventListener('gemini-agent-message', function (e) {
      var m = e.detail;
      if (m.type === 'STREAM_CHUNK') {
        if (!streamEl) startStream();
        if (streamRaw === '') {
          streamEl.classList.remove('streaming-cursor');
        }
        addChunk(m.payload.text);
      } else if (m.type === 'STREAM_END') {
        endStream();
        setLoading(false);
        showSuccess();
      } else if (m.type === 'STREAM_ERROR') {
        showError(m.payload.error);
        endStream();
        setLoading(false);
        removePhase();
      }
    });

    root.dispatchEvent(new CustomEvent('gemini-agent-get-tier'));
    root.addEventListener('gemini-agent-tier-response', function (e) {
      setTierUI((e.detail && e.detail.tier) || 'free');
    });
  };

  /* ===== Message Bridge ===== */
  root.addEventListener('gemini-agent-get-tier', function () {
    chrome.runtime.sendMessage({ type: 'GET_USER_TIER' }, function (response) {
      root.dispatchEvent(new CustomEvent('gemini-agent-tier-response', {
        detail: { tier: (response && response.tier) || 'free' }
      }));
    });
  });

  root.addEventListener('gemini-agent-send', function (e) {
    var msg = e.detail;
    if (msg.type === 'SEND_PROMPT') {
      if (msg.payload.analyzePage === false) {
        delete msg.payload.analyzePage;
        chrome.runtime.sendMessage(msg);
        return;
      }
      chrome.runtime.sendMessage({ type: 'GET_USER_TIER' }, function (response) {
        var tier = (response && response.tier) || 'free';
        msg.payload.context = getPageContext(tier);
        delete msg.payload.analyzePage;
        chrome.runtime.sendMessage(msg);
      });
    } else {
      chrome.runtime.sendMessage(msg);
    }
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (['STREAM_CHUNK', 'STREAM_END', 'STREAM_ERROR'].indexOf(msg.type) !== -1) {
      root.dispatchEvent(new CustomEvent('gemini-agent-message', { detail: msg }));
    }
  });
})();
