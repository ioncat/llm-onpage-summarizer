# llm-onpage-summarizer — Implementation Plan

## Goal
Chrome extension (Manifest V3) that summarizes the current web page using a locally running LLM (Ollama) and displays the result in a side panel. No cloud, no API keys, fully offline.

---

## Architecture

```
llm-onpage-summarizer/
├── manifest.json          # MV3: sidePanel, scripting, activeTab, storage
├── background.js          # Service worker: open side panel on icon click
├── sidepanel.html         # UI markup
├── sidepanel.css          # Styles
├── sidepanel.js           # Core logic: extract text → call Ollama → stream result
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

No content script needed — text extraction done via `chrome.scripting.executeScript` directly from the side panel.

---

## Components

### manifest.json
- `permissions`: `sidePanel`, `scripting`, `activeTab`, `storage`
- `host_permissions`: `http://localhost/*`, `http://127.0.0.1/*`
- `side_panel.default_path`: `sidepanel.html`
- `background.service_worker`: `background.js`

### background.js
- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- Opens side panel when user clicks the extension icon

### sidepanel.html / sidepanel.css
```
┌─────────────────────────────┐
│  🤖 LLM Summarizer          │
│─────────────────────────────│
│  Model: [llama3.2        ▼] │  ← editable input + saved to storage
│  [   Summarize Page    ]    │  ← main action button
│─────────────────────────────│
│  ● Summarizing...           │  ← status / loader
│                             │
│  Lorem ipsum dolor sit...   │  ← streamed result (markdown-ish)
│                             │
│  [      Copy result    ]    │  ← copy to clipboard
└─────────────────────────────┘
```

### sidepanel.js — Logic Flow
1. On load: restore saved model name from `chrome.storage.local`
2. User clicks **Summarize**:
   a. Get active tab ID
   b. `chrome.scripting.executeScript` → extract `document.body.innerText` (trimmed, max ~12 000 chars)
   c. Build prompt: `"Summarize the following web page content in 3-5 concise bullet points:\n\n{text}"`
   d. `fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model, prompt, stream: true }) })`
   e. Read `ReadableStream` line by line, parse NDJSON, append `response` tokens to result div
3. Save model name to storage on change
4. **Copy** button: `navigator.clipboard.writeText(resultText)`
5. Error handling: Ollama not running → show friendly message with hint to start Ollama

### Ollama API
- Endpoint: `POST http://localhost:11434/api/generate`
- Request: `{ model: string, prompt: string, stream: true }`
- Response: NDJSON stream, each line: `{ response: string, done: boolean }`

---

## Phases

### Phase 1 — MVP (core flow)
- [ ] `manifest.json`
- [ ] `background.js`
- [ ] `sidepanel.html` + `sidepanel.css` (basic layout)
- [ ] `sidepanel.js` (extract text + streaming call + display)
- [ ] Error state: Ollama not available

### Phase 2 — UX polish
- [ ] Model selector: save/restore from storage
- [ ] Character counter / truncation warning for long pages
- [ ] Copy to clipboard button
- [ ] Stop generation button (abort fetch)
- [ ] Icons (16/48/128)

### Phase 3 — Optional extras
- [ ] Custom prompt templates (summarize / key points / ELI5 / translate)
- [ ] Language selector for summary output
- [ ] Support for LM Studio (`http://localhost:1234/v1/chat/completions`)
- [ ] Configurable Ollama base URL (for remote instances)

---

## Tech Constraints
- Manifest V3 only (no V2 workarounds)
- No build step — plain HTML/CSS/JS, load unpacked in Chrome
- No external dependencies (no npm, no bundler)
- Text extraction: `document.body.innerText`, strip excess whitespace, cap at 12 000 chars to stay within LLM context limits
