# Claude Code Guidelines — LLM Onpage Summarizer

**Project:** Chrome Extension — LLM-powered page summarizer  
**Version:** 1.0 (2026-04-12)  
**Status:** Phase 3.9 complete (follow-up chat in Viewer)  
**Branch:** `master`

---

## Project Overview

**What:** A Chrome extension that summarizes web pages using an LLM via Ollama. Side panel UI with streaming results, custom prompt tabs, and a full-view Viewer with follow-up chat.

**Why:** Too much content, not enough clarity. Get the gist first, then decide if it's worth a deeper read — without copy-pasting or switching tabs.

**Key Principle:** No build step, no npm, no external dependencies. Plain HTML/CSS/JS running as a Manifest V3 Chrome extension.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│           Chrome Extension (MV3)             │
├──────────────────────────────────────────────┤
│                                              │
│  background.js (service worker)              │
│  ├─ Opens side panel on icon click           │
│  ├─ Context menu: "Analyze with LLM"         │
│  └─ Passes selection via chrome.storage      │
│                                              │
│  sidepanel.html/css/js (main UI)             │
│  ├─ Prompt tabs (add/rename/delete)          │
│  ├─ Settings (model, URL, max length)        │
│  ├─ Text extraction (3-level fallback)       │
│  ├─ Ollama streaming (NDJSON)                │
│  ├─ Result display + Copy/Clear/Expand       │
│  ├─ History (last 8 results)                 │
│  └─ Opens Viewer with full chat context      │
│                                              │
│  viewer.html/js (full-view reader + chat)    │
│  ├─ Shows summary in large window            │
│  ├─ Follow-up chat (multi-turn via Ollama)   │
│  ├─ Rerun button (↻)                         │
│  └─ ChatGPT-style input bar (fixed bottom)   │
│                                              │
│  lib/Readability.js (Mozilla, bundled)       │
│  rules.json (CORS header stripping)          │
│                                              │
└──────────────┬───────────────────────────────┘
               │ fetch (NDJSON stream)
               ▼
        Ollama /api/chat
        (localhost:11434)
```

### Component Interaction

| From | To | Mechanism |
|------|----|-----------|
| background.js → sidepanel | `chrome.storage.session` + `chrome.runtime.sendMessage` | Selection text |
| sidepanel → Ollama | `fetch()` with NDJSON streaming | Summarization |
| sidepanel → viewer | `chrome.storage.session.set({ viewerContent })` | Full context (text, messages, model, URL) |
| viewer → Ollama | `fetch()` with NDJSON streaming | Follow-up chat |

### Storage

| Storage | Purpose | Examples |
|---------|---------|---------|
| `chrome.storage.local` | Persistent config | slots, theme, ollamaUrl, modelMeta, history, viewerMode |
| `chrome.storage.session` | Transient data | viewerContent, pendingSelection |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Chrome Extension (Manifest V3) |
| **Language** | Plain JavaScript (ES2020+), no TypeScript |
| **Build** | None — no npm, no bundler, no transpilation |
| **UI** | HTML + CSS (custom properties for theming) |
| **Text extraction** | Mozilla Readability.js (bundled in `lib/`) |
| **LLM backend** | Ollama API (`/api/chat`, `/api/tags`) |
| **CORS** | Declarative Net Request rules (`rules.json`) |

---

## Project Structure

```
llm-onpage-summarizer/
├── manifest.json          # MV3 config, permissions, service worker
├── background.js          # Service worker: side panel + context menu
├── sidepanel.html         # Main UI markup
├── sidepanel.css          # Styles (tabs, settings, result, theme)
├── sidepanel.js           # Main orchestrator (~970 lines)
├── viewer.html            # Full-view reader + chat UI
├── viewer.js              # Viewer logic: display, chat, rerun (~350 lines)
├── rules.json             # CORS header stripping for localhost Ollama
├── lib/
│   └── Readability.js     # Mozilla article extraction
├── icons/
│   ├── icon16/48/128.png  # Extension icons
│   └── generate-icons.html
├── docs/
│   ├── backlog.md         # Phase breakdown, task tracking
│   ├── effort-log.md      # Session timing
│   └── Summarizer_1.gif   # Demo animation
├── README.md              # User-facing documentation
├── CLAUDE.md              # This file
└── plan.md                # Original implementation plan
```

---

## Core Concepts

### Text Extraction (3-level fallback)

```
Level 1: Mozilla Readability (primary)
  └─ textContent > 300 chars → use
Level 2: Custom DOM traversal (fallback)
  └─ Pick longest from: article, main, .post-content, #content, etc.
  └─ Strip junk: nav, footer, ads, cookies, comments
Level 3: Meta tags (last resort)
  └─ <title> + og:description + meta[name=description]
```

### Prompt System

- **Slots** — prompt tabs (Summarize default + custom)
- **`{{text}}`** — placeholder replaced with extracted page text
- **System prompt** — enforces response language (browser locale) + optional Markdown formatting
- **Per-tab settings** — each tab has its own model, max length, markdown toggle, prompt

### Streaming

- All Ollama requests use `stream: true` (NDJSON)
- Accumulator buffer handles partial chunks
- Token-by-token DOM updates for perceived responsiveness
- Same pattern in sidepanel.js and viewer.js

### Viewer + Follow-up Chat

- Viewer opens as popup (`chrome.windows.create`) or new tab (`chrome.tabs.create`)
- Receives full context: text, chatMessages, model, ollamaUrl
- Multi-turn conversation: messages array accumulates history
- Rerun: removes last assistant message, re-streams response
- Copy: only initial summary + Source URL (not full chat thread)

---

## Interaction Rules

### 1. Wait for Confirmation

For non-trivial features (new files, significant functionality), propose the approach and wait for explicit confirmation ("да", "++", "делаем") before writing code. Do not rush to implement.

**Why:** User explicitly requested this after a full feature was implemented without waiting for approval.

**How to apply:** Describe the plan → stop → wait for confirmation → then code.

### 2. Backlog First

Before implementing, record the plan in `docs/backlog.md`. The backlog is the source of truth for project state.

**How to apply:** New features or refactors → add to backlog → get confirmation → implement → mark as done.

### 3. Documentation Strategy

- Make definitive statements about what we control
- Use relative language for third-party tools: "tends to", "may", "worth trying"
- Never mention specific model names in user-facing documentation (README)
- Specific model names are OK in internal docs (backlog, CLAUDE.md)

---

## Chrome APIs Used

| API | Purpose |
|-----|---------|
| `chrome.sidePanel` | Side panel lifecycle |
| `chrome.scripting.executeScript` | Page text extraction |
| `chrome.tabs` | Tab queries, create viewer tab |
| `chrome.windows` | Create viewer popup |
| `chrome.storage.local` | Persistent settings |
| `chrome.storage.session` | Transient viewer/selection data |
| `chrome.contextMenus` | Right-click "Analyze with LLM" |
| `chrome.runtime` | Message passing (selection-ready) |
| `chrome.permissions` | Dynamic `<all_urls>` request |

---

## Common Tasks

### When adding a UI feature
1. Propose in chat, wait for confirmation
2. Add task to `docs/backlog.md`
3. Edit existing files (sidepanel or viewer) — avoid creating new files
4. Test manually in Chrome (`chrome://extensions` → reload)
5. Mark task as done in backlog

### When modifying the streaming logic
1. Check both `sidepanel.js` and `viewer.js` — streaming is duplicated
2. NDJSON parsing: line-by-line, accumulator buffer for partial chunks
3. Token extraction: `json.message?.content ?? json.response ?? ''`

### When updating documentation
1. README.md — user-facing, no specific model names
2. docs/backlog.md — internal, update phase totals
3. CLAUDE.md — update if architecture or rules change

### When working with the Viewer
1. Context passed via `chrome.storage.session` (viewerContent)
2. Viewer has its own Ollama fetch — independent of sidepanel
3. `parseMarkdown()` exists in both files (duplicated)
4. Theme inherited from `chrome.storage.local`

---

## Known Technical Debt

| Item | Notes |
|------|-------|
| Duplicated `parseMarkdown()` | Same function in sidepanel.js and viewer.js — could extract to shared lib |
| No tests | Plain JS, no test framework — consider adding if project grows |
| Default model constant | `DEFAULT_MODEL = 'llama3.2'` hardcoded in sidepanel.js |

---

## Project Memory

**Auto-memory location:** `C:\Users\user\.claude\projects\E--My-files-0-My-Dev-llm-onpage-summarizer\memory\`

**Current memories:**
- `project_state.md` — Current phase, completed work, next priorities
- `feedback_style.md` — Wait for confirmation, backlog first
- `linkedin_session.md` — LinkedIn content strategy (post finalized)

**When to save new memories:**
- Non-obvious technical decisions
- User preferences about approach or style
- External references (links, tools, contacts)
- Project context not derivable from code

---

## Completed Phases

| Phase | Description | Time |
|-------|-------------|------|
| 1 | MVP: side panel, Ollama streaming, basic UI | ~1 h |
| 2 | UX: settings, copy, stop, theme, icons | ~1 h |
| 3 | Prompt tabs, model selector, history, markdown | ~2.5 h |
| 3.5 | Per-tab settings, max length, lock default tab | ~30 min |
| 3.6 | Context menu, model ratings, permissions, NDJSON fix | ~2 h |
| 3.7 | Browser-style tabs, viewer, auto-open, table markdown | ~3 h |
| 3.8 | Copy + Source URL, word count in viewer, README cleanup | ~30 min |
| 3.9 | Follow-up chat in Viewer, rerun, ChatGPT-style input | ~1 h |
| **Total** | | **~11 h** |

## Next Up (undecided)

- Phase 4: multi-provider support (LM Studio / OpenAI-compatible)
- Phase 5.7: smoke-test extraction on edge cases
- Other: editable system prompt in settings
