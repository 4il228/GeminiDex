// Background Service Worker — обработка сообщений, запросы к бэкенду

const BACKEND_URL = 'http://localhost:3000';

// Декодирование JWT (без верификации)
function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Генерация dev JWT токена (для разработки — без верификации подписи на клиенте)
function generateDevToken() {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = btoa(JSON.stringify({ userId: 'dev-user', tier: 'free', iat: Math.floor(Date.now() / 1000) })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signature = btoa('dev-signature').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${payload}.${signature}`;
}

// Инициализация при установке/обновлении расширения
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['authToken', 'userTier'], (result) => {
    const defaults = {
      authToken: result.authToken || generateDevToken(),
      userTier: result.userTier || 'free'
    };
    chrome.storage.local.set(defaults);
  });
});

// Обработчик сообщений от Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'SET_AUTH_TOKEN': {
      chrome.storage.local.set({ authToken: payload.token }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    case 'GET_USER_TIER': {
      chrome.storage.local.get(['authToken'], (result) => {
        if (!result.authToken) {
          sendResponse({ tier: 'free' });
          return;
        }
        const decoded = decodeJWT(result.authToken);
        if (decoded && decoded.tier) {
          sendResponse({ tier: decoded.tier });
        } else {
          sendResponse({ tier: 'free' });
        }
      });
      return true;
    }

    case 'SEND_PROMPT': {
      chrome.storage.local.get(['authToken'], async (result) => {
        if (!result.authToken) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'STREAM_ERROR',
            payload: { error: 'Unauthorized' }
          });
          return;
        }

        try {
          const response = await fetch(`${BACKEND_URL}/api/v1/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${result.authToken}`
            },
            body: JSON.stringify({
              message: payload.message,
              context: payload.context,
              model: payload.model
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            chrome.tabs.sendMessage(sender.tab.id, {
              type: 'STREAM_ERROR',
              payload: { error: errorData.error || 'Server error' }
            });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  chrome.tabs.sendMessage(sender.tab.id, { type: 'STREAM_END' });
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.error) {
                    chrome.tabs.sendMessage(sender.tab.id, {
                      type: 'STREAM_ERROR',
                      payload: { error: parsed.error }
                    });
                    return;
                  }
                  chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'STREAM_CHUNK',
                    payload: { text: parsed.text || '' }
                  });
                } catch {
                  chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'STREAM_CHUNK',
                    payload: { text: data }
                  });
                }
              }
            }
          }

          chrome.tabs.sendMessage(sender.tab.id, { type: 'STREAM_END' });
        } catch (error) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'STREAM_ERROR',
            payload: { error: error.message || 'Network error' }
          });
        }
      });
      return false;
    }

    default:
      return false;
  }
});