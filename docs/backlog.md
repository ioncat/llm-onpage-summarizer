# Backlog — llm-onpage-summarizer

> Status: 🟡 In progress | ✅ Done | ⬜ Not started | ❌ Cancelled

---

## Phase 1 — MVP (core flow)
> Goal: minimal working extension — Summarize button + streaming into side panel

| # | Task | Status |
|---|------|--------|
| 1.1 | `manifest.json` — MV3, permissions, sidePanel | ✅ |
| 1.2 | `background.js` — service worker, open side panel | ✅ |
| 1.3 | `sidepanel.html` — basic markup | ✅ |
| 1.4 | `sidepanel.css` — basic styles | ✅ |
| 1.5 | `sidepanel.js` — extract page text | ✅ |
| 1.6 | `sidepanel.js` — POST request to Ollama + NDJSON streaming | ✅ |
| 1.7 | `sidepanel.js` — display result token by token | ✅ |
| 1.8 | Error state — Ollama unavailable, user-friendly hint | ✅ |

**Phase 1 total: ~1 h**

---

## Phase 2 — UX Polish
> Goal: usability improvements, saved settings, additional controls

| # | Task | Status |
|---|------|--------|
| 2.1 | Save selected model to `chrome.storage.local` | ✅ |
| 2.2 | Character counter / warning for long pages | ✅ |
| 2.3 | Copy button — copy result to clipboard | ✅ |
| 2.4 | Stop button — abort generation (AbortController) | ✅ |
| 2.5 | Extension icons (16/48/128 px) | ✅ |
| 2.6 | Loader / spinner during generation | ✅ |
| 2.7 | Dark/Light theme toggle + system preference | ✅ |

**Phase 2 total: ~1 h**

---

## Phase 3 — Extras
> Goal: advanced features

| # | Task | Status |
|---|------|--------|
| 3.1 | Prompt templates: Summarize / Key Points / ELI5 / Translate | ✅ |
| 3.2 | Editable prompt with `{{text}}` placeholder | ✅ |
| 3.3 | Model selector from dropdown (`/api/tags`) + refresh button | ✅ |
| 3.4 | Configurable Ollama base URL | ✅ |
| 3.5 | History of last 8 summaries (chrome.storage) | ✅ |
| 3.6 | Smart content extraction (article/main, strip nav/footer) | ✅ |
| 3.7 | Markdown rendering toggle | ✅ |
| 3.8 | Clear button to reset result | ✅ |
| 3.9 | Color-coded buttons: Clear (red) and Copy (purple) | ✅ |
| 3.10 | Dynamic prompt tabs — add, rename, delete | ✅ |
| 3.11 | Settings open by default on first run, state remembered | ✅ |

**Phase 3 total: ~2.5 h**

---

## Phase 3.5 — Settings & Prompt improvements
> Goal: finer control over model input and prompt behavior

| # | Task | Status |
|---|------|--------|
| 3.12 | Max text length setting in UI (1k–50k, default 12k) | ✅ |
| 3.13 | Lock default Summarize tab against rename and deletion | ✅ |
| 3.14 | Refactor system prompt: remove "helpful assistant", enforce browser language + Markdown instruction | ✅ |

**Phase 3.5 total: ~30 min**

---

## Phase 4 — Multi-provider support (planned)
> Goal: support cloud and alternative LLM providers alongside Ollama

| # | Idea | Priority |
|---|------|----------|
| 4.1 | **OpenAI API** (`/v1/chat/completions`) — GPT-4o, GPT-4-mini, etc. | high |
| 4.2 | **Anthropic Claude API** — claude-3-5-sonnet, claude-haiku, etc. | high |
| 4.3 | **Google Gemini API** — gemini-1.5-flash, gemini-pro | medium |
| 4.4 | **LM Studio** (`http://localhost:1234/v1/chat/completions`) | medium |
| 4.5 | Generic OpenAI-compatible endpoint (Together AI, Groq, Mistral AI, etc.) | medium |
| 4.6 | Store API keys in `chrome.storage.local` (never in code) | high |
| 4.7 | Provider selector in settings — Ollama / OpenAI / Custom | high |

> **Note:** when cloud providers are added, page content will be sent to external servers. The UI must show an explicit warning to the user.

---

## Phase 3.6 — Quality & reliability fixes
> Goal: address technical debt and correctness issues

| # | Task | Status |
|---|------|--------|
| 3.15 | Context menu: analyze selected text via right-click | ✅ |
| 3.16 | Per-tab settings (model, max chars, markdown, prompt) | ✅ |
| 3.17 | Model ratings (1–5 ★) and hide — Manage models UI | ✅ |
| 3.18 | Minimize manifest permissions — move `<all_urls>` to optional | ✅ |
| 3.19 | Fix NDJSON streaming: add accumulator buffer for partial chunks | ✅ |

**Phase 3.6 total: ~2 h**

---

## Other improvements (planned)

| # | Idea | Priority |
|---|------|----------|
| 5.3 | Editable system prompt in settings | medium |

---

## Project totals

| Phase | Status | Actual |
|-------|--------|--------|
| Phase 1 — MVP | ✅ | ~1 h |
| Phase 2 — UX Polish | ✅ | ~1 h |
| Phase 3 — Extras | ✅ | ~2.5 h |
| Phase 3.5 — Settings & Prompt | ✅ | ~30 min |
| Phase 3.6 — Quality & reliability | ✅ | ~2 h |
| **Total** | | **~7 h** |
