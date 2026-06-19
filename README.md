<div align="center">

# Gemini Agent

**AI-powered browser extension** that brings Google Gemini directly into any web page.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](./LICENSE)

</div>

---

A sidebar AI assistant for Chromium-based browsers (Yandex Browser, Chrome, Edge) that analyzes web pages, answers questions, and renders Markdown with math formulas -- all powered by Google Gemini API.

## Features

- **Sidebar Widget** -- AI assistant opens on any page via `Alt+G` hotkey
- **Page Analysis** -- extracts headings, text, code blocks, links, and sends as context
- **Real-time Streaming** -- responses stream in live with thinking animations
- **Model Selector** -- choose between Gemini models based on your subscription tier
- **Tiered Access** -- Free / Pro / Ultra plans with different context limits and models
- **Markdown Rendering** -- full support for bold, code blocks, lists, blockquotes, math formulas
- **Stop Button** -- cancel streaming mid-generation
- **Clear Chat** -- type `cls` to clear history without server roundtrip
- **Proxy Auto-detect** -- automatically finds Windows system proxy or local proxies (Hiddify, Happ)

## Architecture

```
 User Page         Content Script       Background SW        Proxy Server         Gemini API
 +---------+       +-------------+      +-------------+      +-------------+      +---------+
 |  iframe  | <---> |   Bridge    | <---> |   Fetch +   | <---> |  Express +  | <---> |  REST   |
 | (UI/UX)  |       | (CS <-> BG) |      |   SSE       |      |  JWT Auth   |      |  Stream |
 +---------+       +-------------+      +-------------+      +-------------+      +---------+
```

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| **UI** | iframe (blob URL) | Isolated interface, markdown rendering, streaming display |
| **Content Script** | Vanilla JS | Page context extraction, message bridge to background |
| **Background SW** | Service Worker | Auth token storage, SSE parsing, abort controller |
| **Proxy Server** | Node.js + Express | JWT validation, tier enforcement, Gemini API calls |

## Quick Start

### Prerequisites

- Node.js 18+
- A Google Gemini API key ([get one here](https://aistudio.google.com/apikey))

### 1. Install dependencies

```bash
npm install
cd server && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
GEMINI_API_KEY=your_api_key_here
JWT_SECRET=your_jwt_secret_here
PORT=3000
```

### 3. Start the proxy server

```bash
npm start
```

The server starts on `http://localhost:3000`.

### 4. Load the extension

1. Open `chrome://extensions` (or `browser://extensions` in Yandex Browser)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root folder

### 5. Use it

1. Open any web page
2. Press `Alt+G` -- a blue trigger button appears on the right edge
3. Click the button -- the Gemini Agent panel slides open
4. Type your question and press `Enter`

## Subscription Tiers

| Tier | Models | Context | Capabilities |
|------|--------|---------|-------------|
| **Free** | Gemini 3.5 Flash, 2.5 Flash | 1M tokens | Page titles, headings, text content |
| **Pro** | + Gemini 2.5 Pro | 1M tokens | + code blocks from the page |
| **Ultra** | + Gemini 1.5 Pro | 1M+ tokens | + links, image alt texts |

## Hotkeys

| Key | Action |
|-----|--------|
| `Alt+G` | Toggle the trigger button visibility |
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `cls` | Clear chat history (local only) |

## Project Structure

```
.
├── manifest.json                 # Extension manifest (Manifest V3)
├── package.json                  # Root scripts (start, dev)
├── .env.example                  # Environment template
│
├── src/
│   ├── background/
│   │   └── background.js         # Service Worker: auth, proxy, SSE handling
│   ├── content/
│   │   ├── content-script.js     # Page injection: iframe, context extraction, bridge
│   │   └── styles.css            # (Reserved for shadow DOM styles)
│   └── ui/
│       ├── widget.html           # HTML template for shadow DOM fallback
│       └── widget.js             # Widget logic (shadow DOM mode)
│
├── server/
│   ├── index.js                  # Express server entry point
│   ├── proxy.js                  # Proxy auto-detection (Windows/ENV/local)
│   ├── package.json              # Backend dependencies
│   ├── middleware/
│   │   └── auth.js               # JWT authorization middleware
│   └── routes/
│       └── chat.js               # POST /api/v1/chat -- SSE streaming endpoint
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## API

The extension communicates with a local proxy server:

```
POST /api/v1/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "What is this page about?",
  "context": "[Title] ...\n[Content] ...",
  "model": "gemini-3.5-flash"
}
```

**Response:** Server-Sent Events (SSE) stream

```
data: {"text":"This page is about..."}
data: {"text":" machine learning..."}
data: [DONE]
```

## Tech Stack

- **Frontend:** ES6+ JavaScript, Manifest V3, iframe blob isolation, Custom Events
- **Backend:** Node.js, Express, SSE streaming, JWT (jsonwebtoken)
- **API:** Google Gemini via `@google/genai`
- **Proxy:** undici ProxyAgent with Windows registry + local port auto-detection

## Security

- API key is **never** sent to the client -- it stays on the proxy server only
- `.env` is gitignored and never committed
- JWT tokens are decoded without verification on the client (dev mode)
- All UI is isolated via iframe blob URLs to prevent style/script leakage

## License

[MIT](./LICENSE)
