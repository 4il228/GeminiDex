(function () {
  'use strict';

  var root = document.getElementById('gemini-agent-root');
  if (!root || !root.shadowRoot) return;
  var shadow = root.shadowRoot;

  var chatWrapper = shadow.getElementById('chat-wrapper');
  var messages = shadow.getElementById('messages');
  var emptyState = shadow.getElementById('empty-state');
  var userInput = shadow.getElementById('user-input');
  var sendBtn = shadow.getElementById('send-btn');
  var toggleBtn = shadow.getElementById('toggle-btn');

  var isCollapsed = false;
  var isStreaming = false;
  var currentStreamEl = null;
  var currentStreamRaw = '';
  var currentTier = 'free';
  var analyzeCheckbox = null;

  function renderMarkdown(text) {
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (match, lang, code) {
      return '<pre><code class="language-' + lang + '">' + code.trim() + '</code></pre>';
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  toggleBtn.addEventListener('click', function () {
    isCollapsed = !isCollapsed;
    chatWrapper.classList.toggle('collapsed', isCollapsed);
    toggleBtn.classList.toggle('shifted', !isCollapsed);
    toggleBtn.innerHTML = isCollapsed
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  });

  function autoScroll() {
    messages.scrollTop = messages.scrollHeight;
  }

  function appendMessage(text, role) {
    if (emptyState) emptyState.remove();
    var div = document.createElement('div');
    div.className = 'message ' + role;
    if (role === 'assistant') {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messages.appendChild(div);
    autoScroll();
    return div;
  }

  function createStreamElement() {
    if (emptyState) emptyState.remove();
    var div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = '<div class="streaming-indicator"><span></span><span></span><span></span></div>';
    messages.appendChild(div);
    autoScroll();
    return div;
  }

  function appendStreamChunk(text) {
    if (!currentStreamEl) {
      currentStreamEl = createStreamElement();
      currentStreamRaw = '';
    }
    currentStreamRaw += text;
    currentStreamEl.innerHTML = renderMarkdown(currentStreamRaw);
    autoScroll();
  }

  function finalizeStream() {
    if (currentStreamEl && currentStreamRaw) {
      currentStreamEl.innerHTML = renderMarkdown(currentStreamRaw);
    }
    currentStreamEl = null;
    currentStreamRaw = '';
  }

  function showError(text) {
    var div = document.createElement('div');
    div.className = 'error-message';
    div.textContent = text;
    messages.appendChild(div);
    autoScroll();
  }

  function setLoading(loading) {
    isStreaming = loading;
    sendBtn.disabled = loading;
    userInput.disabled = loading;
    if (analyzeCheckbox) analyzeCheckbox.disabled = loading;
  }

  function setTierUI(tier) {
    currentTier = tier;
    var wrapper = shadow.getElementById('analyze-wrapper');
    if (tier === 'pro' || tier === 'ultra') {
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'analyze-wrapper';
        wrapper.className = 'analyze-wrapper';
        wrapper.innerHTML = '<label class="analyze-label"><input type="checkbox" id="analyze-checkbox"> Analyze page</label>';
        chatWrapper.insertBefore(wrapper, chatWrapper.querySelector('.input-area'));
        analyzeCheckbox = shadow.getElementById('analyze-checkbox');
      }
    } else {
      if (wrapper) {
        wrapper.remove();
        analyzeCheckbox = null;
      }
    }
  }

  function sendMessage() {
    var text = userInput.value.trim();
    if (!text || isStreaming) return;

    appendMessage(text, 'user');
    userInput.value = '';
    userInput.style.height = 'auto';
    setLoading(true);

    var shouldAnalyze = (currentTier !== 'free') ? !!(analyzeCheckbox && analyzeCheckbox.checked) : false;

    root.dispatchEvent(new CustomEvent('gemini-agent-send', {
      detail: { type: 'SEND_PROMPT', payload: { message: text, analyzePage: shouldAnalyze } }
    }));
  }

  sendBtn.addEventListener('click', sendMessage);

  userInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  root.addEventListener('gemini-agent-message', function (e) {
    var msg = e.detail;
    if (msg.type === 'STREAM_CHUNK') {
      appendStreamChunk(msg.payload.text);
    } else if (msg.type === 'STREAM_END') {
      finalizeStream();
      setLoading(false);
    } else if (msg.type === 'STREAM_ERROR') {
      showError(msg.payload.error);
      finalizeStream();
      setLoading(false);
    }
  });

  root.dispatchEvent(new CustomEvent('gemini-agent-get-tier'));
  root.addEventListener('gemini-agent-tier-response', function (e) {
    var tier = (e.detail && e.detail.tier) || 'free';
    setTierUI(tier);
  });
})();
