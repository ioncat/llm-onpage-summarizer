'use strict';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const MAX_TEXT_LENGTH = 12000;
const DEFAULT_MODEL = 'llama3.2';
const MAX_HISTORY = 8;
const MAX_SLOTS = 6;

// --- DOM refs ---

const modelSelect       = document.getElementById('model-select');
const urlInput          = document.getElementById('url-input');
const promptEditor      = document.getElementById('prompt-editor');
const slotNameInput     = document.getElementById('slot-name-input');
const btnDeleteSlot     = document.getElementById('btn-delete-slot');
const btnResetDefaults  = document.getElementById('btn-reset-defaults');
const maxLengthInput    = document.getElementById('max-length-input');
const btnRefreshModels  = document.getElementById('btn-refresh-models');
const btnManageModels   = document.getElementById('btn-manage-models');
const modelManager      = document.getElementById('model-manager');
const btnSummarize      = document.getElementById('btn-summarize');
const btnStop           = document.getElementById('btn-stop');
const btnCopy           = document.getElementById('btn-copy');
const btnExpand         = document.getElementById('btn-expand');
const btnViewerMode     = document.getElementById('btn-viewer-mode');
const viewerMenu        = document.getElementById('viewer-menu');
const viewerMenuItems   = viewerMenu.querySelectorAll('.viewer-menu__item[data-mode]');
const btnAutoOpen       = document.getElementById('btn-auto-open');
const btnClear          = document.getElementById('btn-clear');
const markdownToggle    = document.getElementById('markdown-toggle');
const btnTheme          = document.getElementById('btn-theme');
const btnSettings       = document.getElementById('btn-settings');
const btnHistory        = document.getElementById('btn-history');
const btnClearHist      = document.getElementById('btn-clear-history');
const settingsPanel     = document.getElementById('settings-panel');
const historyPanel      = document.getElementById('history-panel');
const historyList       = document.getElementById('history-list');
const modesContainer    = document.getElementById('modes-container');
const selectionBadge    = document.getElementById('selection-badge');
const selectionChars    = document.getElementById('selection-chars');
const btnClearSelection = document.getElementById('btn-clear-selection');
const statusEl          = document.getElementById('status');
const resultWrap        = document.getElementById('result-wrap');
const resultEl          = document.getElementById('result');
const charCountEl       = document.getElementById('char-count');
const errorEl           = document.getElementById('error');

let abortController = null;
let slots = [];
let activeSlotId = null;
let pendingSelectionText = null;
let modelList = [];
let modelMeta = {};
let currentResultText = '';
let currentChatMessages = [];
let viewerMode = 'popup';
let viewerAutoOpen = false;

// --- Selection from context menu ---

function showSelectionBadge(text) {
  pendingSelectionText = text;
  selectionChars.textContent = `${text.length} chars`;
  selectionBadge.hidden = false;
}

function clearSelection() {
  pendingSelectionText = null;
  selectionBadge.hidden = true;
  chrome.storage.session.remove('pendingSelection');
}

function loadPendingSelection() {
  chrome.storage.session.get('pendingSelection', ({ pendingSelection }) => {
    if (pendingSelection) showSelectionBadge(pendingSelection);
  });
}

btnClearSelection.addEventListener('click', clearSelection);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'selection-ready') loadPendingSelection();
});

// --- Language detection ---

const USER_LANG_CODE = (navigator.language || 'en').split('-')[0];
const USER_LANG = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(USER_LANG_CODE) || 'English';
  } catch {
    return 'English';
  }
})();

// --- Default slots ---

const DEFAULT_SLOTS = [
  { id: 'slot_1', name: 'Summarize', locked: true, model: '', maxLength: MAX_TEXT_LENGTH, markdown: false, prompt: `Summarize the following web page in 4–6 bullet points in ${USER_LANG}. Be specific.\n\n{{text}}` },
];

// --- System prompt ---

function getSystemPrompt() {
  const md = markdownToggle?.checked
    ? ' Format your response using Markdown (headers, bold, bullet lists where appropriate).'
    : '';
  return `You MUST always respond in ${USER_LANG}. Never use any other language in your response, regardless of the language of the input text.${md}`;
}

// --- Slot management ---

function renderSlots() {
  modesContainer.innerHTML = '';

  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (slot.id === activeSlotId ? ' active' : '');
    btn.textContent = slot.name;
    btn.addEventListener('click', () => setActiveSlot(slot.id));
    modesContainer.appendChild(btn);
  });

  if (slots.length < MAX_SLOTS) {
    const addBtn = document.createElement('button');
    addBtn.className = 'mode-btn mode-btn--add';
    addBtn.textContent = '+';
    addBtn.title = 'Add prompt tab';
    addBtn.addEventListener('click', addSlot);
    modesContainer.appendChild(addBtn);
  }
}

function setActiveSlot(id) {
  activeSlotId = id;
  const slot = slots.find(s => s.id === id);
  if (!slot) return;

  promptEditor.value = slot.prompt;
  slotNameInput.value = slot.name;
  slotNameInput.disabled = !!slot.locked;
  btnDeleteSlot.hidden = !!slot.locked;
  btnDeleteSlot.disabled = slots.length <= 1;

  if (slot.model) modelSelect.value = slot.model;
  maxLengthInput.value = slot.maxLength ?? MAX_TEXT_LENGTH;
  markdownToggle.checked = !!slot.markdown;

  renderSlots();
  chrome.storage.local.set({ activeSlotId });
}

function saveSlots() {
  chrome.storage.local.set({ slots, activeSlotId });
}

function addSlot() {
  const n = slots.length + 1;
  const current = slots.find(s => s.id === activeSlotId);
  const slot = {
    id: `slot_${Date.now()}`,
    name: `Custom ${n}`,
    prompt: `{{text}}`,
    model: current?.model || modelSelect.value,
    maxLength: current?.maxLength ?? MAX_TEXT_LENGTH,
    markdown: current?.markdown ?? false,
  };
  slots.push(slot);
  setActiveSlot(slot.id);
  saveSlots();
  // Open settings so user can immediately name + write the prompt
  settingsPanel.hidden = false;
  historyPanel.hidden = true;
  btnSettings.style.color = 'var(--accent)';
  btnHistory.style.color = '';
  slotNameInput.focus();
  slotNameInput.select();
}

function deleteActiveSlot() {
  const current = slots.find(s => s.id === activeSlotId);
  if (slots.length <= 1 || current?.locked) return;
  const idx = slots.findIndex(s => s.id === activeSlotId);
  slots.splice(idx, 1);
  const next = slots[Math.min(idx, slots.length - 1)];
  setActiveSlot(next.id);
  saveSlots();
}

// --- Prompt helpers ---

function buildPrompt(pageText) {
  const slot = slots.find(s => s.id === activeSlotId);
  const template = slot?.prompt || '{{text}}';
  return template.replace('{{text}}', pageText);
}

// --- Markdown parser ---

function parseMarkdown(md) {
  const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  const isSepRow = row => row.split('|').slice(1,-1).every(c => /^[\s\-:]+$/.test(c));
  const parseRow = row => row.split('|').slice(1,-1).map(c => inline(escape(c.trim())));

  const flushTable = rows => {
    if (!rows.length) return '';
    let out = '<table>', headerDone = false;
    for (const row of rows) {
      if (isSepRow(row)) { out += '</thead><tbody>'; headerDone = true; continue; }
      const tag = headerDone ? 'td' : 'th';
      const cells = parseRow(row).map(c => `<${tag}>${c}</${tag}>`).join('');
      if (!headerDone) out += `<thead><tr>${cells}</tr>`;
      else out += `<tr>${cells}</tr>`;
    }
    if (!headerDone) out += '</thead><tbody>';
    return out + '</tbody></table>';
  };

  const lines = md.split('\n');
  let html = '', inUl = false, inOl = false, tableRows = [];

  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  const closeTable = () => {
    if (tableRows.length) { html += flushTable(tableRows); tableRows = []; }
  };
  const closeAll = () => { closeLists(); closeTable(); };

  for (const raw of lines) {
    if (/^\|/.test(raw)) { closeLists(); tableRows.push(raw); continue; }
    closeTable();

    const line = inline(escape(raw));

    if (/^### /.test(raw))        { closeAll(); html += `<h3>${inline(escape(raw.slice(4)))}</h3>`; continue; }
    if (/^## /.test(raw))         { closeAll(); html += `<h2>${inline(escape(raw.slice(3)))}</h2>`; continue; }
    if (/^# /.test(raw))          { closeAll(); html += `<h1>${inline(escape(raw.slice(2)))}</h1>`; continue; }
    if (/^---+$/.test(raw.trim())) { closeAll(); html += '<hr>'; continue; }

    if (/^[-*•] /.test(raw)) {
      closeTable();
      if (!inUl) { closeLists(); html += '<ul>'; inUl = true; }
      html += `<li>${inline(escape(raw.replace(/^[-*•] /, '')))}</li>`;
      continue;
    }
    if (/^\d+\. /.test(raw)) {
      closeTable();
      if (!inOl) { closeLists(); html += '<ol>'; inOl = true; }
      html += `<li>${inline(escape(raw.replace(/^\d+\. /, '')))}</li>`;
      continue;
    }

    closeLists();
    if (!raw.trim()) { html += '<br>'; continue; }
    html += `<p>${line}</p>`;
  }

  closeAll();
  return html;
}

function renderResult(text) {
  if (markdownToggle.checked) {
    resultEl.innerHTML = parseMarkdown(text);
  } else {
    resultEl.textContent = text;
  }
}

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  btnTheme.title = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  chrome.storage.local.get('theme', ({ theme }) => {
    if (!theme) applyTheme(e.matches ? 'dark' : 'light');
  });
});

// --- Settings panel toggle ---

btnSettings.addEventListener('click', () => {
  const open = !settingsPanel.hidden;
  settingsPanel.hidden = open;
  if (!open) historyPanel.hidden = true;
  btnSettings.style.color = open ? '' : 'var(--accent)';
  btnHistory.style.color = '';
  chrome.storage.local.set({ settingsOpen: !open });
});

// --- History panel toggle ---

btnHistory.addEventListener('click', () => {
  const open = !historyPanel.hidden;
  historyPanel.hidden = open;
  if (!open) settingsPanel.hidden = true;
  btnHistory.style.color = open ? '' : 'var(--accent)';
  btnSettings.style.color = '';
  if (!open) renderHistory();
});

// --- History ---

function renderHistory() {
  chrome.storage.local.get('history', ({ history = [] }) => {
    if (!history.length) {
      historyList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;">No history yet.</div>';
      return;
    }
    historyList.innerHTML = '';
    history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="history-item__meta">${item.mode} · ${item.date}</div>
        <div class="history-item__preview">${item.text}</div>
      `;
      el.addEventListener('click', () => {
        resultEl.textContent = item.text;
        charCountEl.textContent = `${item.text.length} chars · ${item.text.trim().split(/\s+/).filter(Boolean).length} words`;
        resultWrap.hidden = false;
        historyPanel.hidden = true;
        btnHistory.style.color = '';
      });
      historyList.appendChild(el);
    });
  });
}

function saveToHistory(text) {
  const slotName = slots.find(s => s.id === activeSlotId)?.name || 'Custom';
  chrome.storage.local.get('history', ({ history = [] }) => {
    const entry = {
      text,
      mode: slotName,
      date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    const updated = [entry, ...history].slice(0, MAX_HISTORY);
    chrome.storage.local.set({ history: updated });
  });
}

btnClearHist.addEventListener('click', () => {
  chrome.storage.local.set({ history: [] });
  renderHistory();
});

// --- Slot name + prompt editing ---

slotNameInput.addEventListener('input', () => {
  const slot = slots.find(s => s.id === activeSlotId);
  if (!slot || slot.locked) return;
  slot.name = slotNameInput.value.trim() || 'Custom';
  renderSlots();
  saveSlots();
});

promptEditor.addEventListener('change', () => {
  const slot = slots.find(s => s.id === activeSlotId);
  if (!slot) return;
  slot.prompt = promptEditor.value;
  saveSlots();
});

markdownToggle.addEventListener('change', () => {
  const slot = slots.find(s => s.id === activeSlotId);
  if (slot) { slot.markdown = markdownToggle.checked; saveSlots(); }
});

btnDeleteSlot.addEventListener('click', deleteActiveSlot);

btnResetDefaults.addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults? This will remove custom tabs and restore the original prompt. Model ratings are kept.')) return;

  slots = DEFAULT_SLOTS.map(s => ({ ...s }));
  activeSlotId = slots[0].id;

  chrome.storage.local.set({
    slots,
    activeSlotId,
    ollamaUrl: DEFAULT_OLLAMA_URL,
    settingsOpen: true,
  });

  urlInput.value = DEFAULT_OLLAMA_URL;
  markdownToggle.checked = false;
  maxLengthInput.value = MAX_TEXT_LENGTH;

  renderSlots();
  setActiveSlot(activeSlotId);
  renderModelSelect();
  renderModelManager();
});

// --- Model meta (ratings + hidden) ---

function saveModelMeta() {
  chrome.storage.local.set({ modelMeta });
}

function getMeta(name) {
  if (!modelMeta[name]) modelMeta[name] = { rating: 0, hidden: false };
  return modelMeta[name];
}

function renderModelSelect() {
  const activeSlot = slots.find(s => s.id === activeSlotId);
  const savedModel = activeSlot?.model || '';

  const visible = modelList
    .filter(n => !getMeta(n).hidden)
    .sort((a, b) => getMeta(b).rating - getMeta(a).rating);

  modelSelect.innerHTML = '';
  if (!visible.length) {
    modelSelect.innerHTML = '<option value="">No models available</option>';
    return;
  }

  visible.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === savedModel) opt.selected = true;
    modelSelect.appendChild(opt);
  });

  if (!modelSelect.value) modelSelect.value = visible[0];
  if (activeSlot && activeSlot.model !== modelSelect.value) {
    activeSlot.model = modelSelect.value;
    saveSlots();
  }
}

function renderModelManager() {
  modelManager.innerHTML = '';

  const visible = modelList.filter(n => !getMeta(n).hidden);
  const hidden  = modelList.filter(n =>  getMeta(n).hidden);

  const makeRow = (name, isHidden) => {
    const meta = getMeta(name);
    const row = document.createElement('div');
    row.className = 'model-manager__item' + (isHidden ? ' model-manager__item--hidden' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'model-manager__name';
    nameEl.textContent = name;
    nameEl.title = name;

    const stars = document.createElement('div');
    stars.className = 'model-manager__stars';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'star-btn' + (i <= meta.rating ? ' filled' : '');
      btn.textContent = '★';
      btn.title = `Rate ${i}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        getMeta(name).rating = getMeta(name).rating === i ? 0 : i;
        saveModelMeta();
        renderModelSelect();
        renderModelManager();
      });
      stars.appendChild(btn);
    }

    const action = document.createElement('button');
    action.className = 'model-manager__action';
    if (isHidden) {
      action.textContent = 'Show';
      action.addEventListener('click', (e) => {
        e.stopPropagation();
        getMeta(name).hidden = false;
        saveModelMeta();
        renderModelSelect();
        renderModelManager();
      });
    } else {
      action.textContent = 'Hide';
      action.addEventListener('click', (e) => {
        e.stopPropagation();
        getMeta(name).hidden = true;
        saveModelMeta();
        // If hidden model was selected — switch to first visible
        if (modelSelect.value === name) {
          const first = modelList.find(n => !getMeta(n).hidden && n !== name);
          if (first) { modelSelect.value = first; modelSelect.dispatchEvent(new Event('change')); }
        }
        renderModelSelect();
        renderModelManager();
      });
    }

    row.append(nameEl, stars, action);
    return row;
  };

  visible.forEach(n => modelManager.appendChild(makeRow(n, false)));

  if (hidden.length) {
    const div = document.createElement('div');
    div.className = 'model-manager__divider';
    div.textContent = `Hidden (${hidden.length})`;
    modelManager.appendChild(div);
    hidden.forEach(n => modelManager.appendChild(makeRow(n, true)));
  }
}

const modelManagerHint = document.getElementById('model-manager-hint');

btnManageModels.addEventListener('click', () => {
  const open = !modelManager.hidden;
  modelManager.hidden = open;
  modelManagerHint.hidden = open;
  btnManageModels.textContent = open ? 'Manage models ▾' : 'Manage models ▴';
});

// --- Fetch models from Ollama ---

async function fetchModels() {
  const baseUrl = urlInput.value.trim() || DEFAULT_OLLAMA_URL;
  modelSelect.disabled = true;
  btnRefreshModels.disabled = true;
  btnRefreshModels.textContent = '…';

  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { models = [] } = await res.json();

    if (!models.length) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      return;
    }

    modelList = models.map(m => m.name);
    renderModelSelect();
    renderModelManager();

  } catch {
    modelSelect.innerHTML = `<option value="">Cannot reach Ollama</option>`;
  } finally {
    modelSelect.disabled = false;
    btnRefreshModels.disabled = false;
    btnRefreshModels.textContent = '↻';
  }
}

btnRefreshModels.addEventListener('click', fetchModels);
modelSelect.addEventListener('change', () => {
  const slot = slots.find(s => s.id === activeSlotId);
  if (slot) { slot.model = modelSelect.value; saveSlots(); }
});

// --- Load saved settings ---

chrome.storage.local.get(['theme', 'ollamaUrl', 'slots', 'activeSlotId', 'settingsOpen', 'model', 'maxLength', 'markdown', 'modelMeta', 'viewerMode', 'viewerAutoOpen'], (data) => {
  if (data.viewerMode) viewerMode = data.viewerMode;
  if (data.viewerAutoOpen) viewerAutoOpen = data.viewerAutoOpen;
  modelMeta = data.modelMeta || {};
  const url = data.ollamaUrl || DEFAULT_OLLAMA_URL;
  urlInput.value = url;
  if (!data.ollamaUrl) chrome.storage.local.set({ ollamaUrl: DEFAULT_OLLAMA_URL });

  applyTheme(data.theme || getSystemTheme());

  slots = data.slots?.length ? data.slots : DEFAULT_SLOTS.map(s => ({ ...s }));

  // Ensure slot_1 is locked; migrate old global settings into slots that lack per-tab values
  slots.forEach(slot => {
    if (slot.id === 'slot_1') slot.locked = true;
    if (!slot.model && data.model) slot.model = data.model;
    if (slot.maxLength == null && data.maxLength) slot.maxLength = data.maxLength;
    if (slot.markdown == null && data.markdown != null) slot.markdown = data.markdown;
  });

  activeSlotId = data.activeSlotId || slots[0]?.id;

  // Open settings by default on first run; remember state after that
  const showSettings = data.settingsOpen !== false;
  settingsPanel.hidden = !showSettings;
  btnSettings.style.color = showSettings ? 'var(--accent)' : '';

  renderSlots();
  setActiveSlot(activeSlotId);
  fetchModels();
  loadPendingSelection();
});

urlInput.addEventListener('change', () => {
  chrome.storage.local.set({ ollamaUrl: urlInput.value.trim() || DEFAULT_OLLAMA_URL });
});

maxLengthInput.addEventListener('change', () => {
  const val = Math.min(50000, Math.max(1000, parseInt(maxLengthInput.value, 10) || MAX_TEXT_LENGTH));
  maxLengthInput.value = val;
  const slot = slots.find(s => s.id === activeSlotId);
  if (slot) { slot.maxLength = val; saveSlots(); }
});

// --- Helpers ---

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

function setError(text) {
  errorEl.textContent = text;
  errorEl.hidden = !text;
}

function setGenerating(active) {
  btnStop.hidden = !active;
  if (active) {
    const slotName = slots.find(s => s.id === activeSlotId)?.name || 'Running';
    btnSummarize.disabled = true;
    btnSummarize.innerHTML = `<span class="btn-spinner"></span>${slotName}…`;
  } else {
    btnSummarize.disabled = false;
    btnSummarize.textContent = 'Run';
  }
}

// --- Extract page text ---

async function executeExtraction(tabId) {
  // Inject Readability into the page's isolated world (Level 1)
  await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/Readability.js'] });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // ── Level 1: Mozilla Readability ─────────────────────────────
      try {
        const clone = document.cloneNode(true);
        // eslint-disable-next-line no-undef
        const article = new Readability(clone).parse();
        if (article?.textContent?.trim().length > 300) {
          return article.textContent.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        }
      } catch (_) {}

      // ── Level 2: improved custom logic ───────────────────────────
      const CANDIDATES = [
        'article', 'main', '[role="main"]',
        '.post-content', '.article-content', '.entry-content',
        '.content', '.post', '.article',
        '#content', '#main', '#article',
      ];
      const JUNK = [
        'nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript',
        '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
        '.ad', '.ads', '.advertisement', '.cookie-banner', '.cookie-notice',
        '.popup', '.modal', '.social-share', '.share-buttons',
        '.related-posts', '.recommended', '.sidebar', '.widget', '.comments',
        '[aria-hidden="true"]',
      ].join(',');
      const BLOCK_TAGS = new Set([
        'P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'LI', 'TR', 'TH', 'TD', 'BR', 'HR',
      ]);

      function serialize(el) {
        let out = '';
        function walk(node) {
          if (node.nodeType === 3) { out += node.textContent; return; }
          if (node.nodeType !== 1) return;
          const tag = node.tagName;
          if (BLOCK_TAGS.has(tag) && out.length && !out.endsWith('\n')) out += '\n';
          if (/^H[1-6]$/.test(tag)) out += '\n';
          if (tag === 'LI') out += '- ';
          for (const child of node.childNodes) walk(child);
          if (BLOCK_TAGS.has(tag) && !out.endsWith('\n')) out += '\n';
        }
        walk(el);
        return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      }

      // pick the longest candidate, not the first
      let best = null;
      let bestLen = 200;
      for (const sel of CANDIDATES) {
        for (const el of document.querySelectorAll(sel)) {
          const len = el.innerText?.trim().length ?? 0;
          if (len > bestLen) { best = el; bestLen = len; }
        }
      }

      if (best) {
        const clone = best.cloneNode(true);
        clone.querySelectorAll(JUNK).forEach(n => n.remove());
        return serialize(clone);
      }

      // full-body fallback
      const bodyClone = document.body.cloneNode(true);
      bodyClone.querySelectorAll(JUNK).forEach(n => n.remove());
      const bodyText = serialize(bodyClone);
      if (bodyText.length > 200) return bodyText;

      // ── Level 3: meta tags ────────────────────────────────────────
      const title = document.title?.trim() ?? '';
      const desc =
        document.querySelector('meta[name="description"]')?.content?.trim() ||
        document.querySelector('meta[property="og:description"]')?.content?.trim() || '';
      return [title, desc].filter(Boolean).join('\n\n');
    },
  });
  return result;
}

async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  let result;
  try {
    result = await executeExtraction(tab.id);
  } catch (err) {
    if (err.message?.includes('Cannot access') || err.message?.includes('permission')) {
      const granted = await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
      if (!granted) throw new Error('Page access permission is required. Please grant it when prompted.');
      result = await executeExtraction(tab.id);
    } else {
      throw err;
    }
  }

  if (!result) throw new Error('Could not extract text from this page.');
  const maxLen = parseInt(maxLengthInput.value, 10) || MAX_TEXT_LENGTH;
  return result.slice(0, maxLen);
}

// --- Ollama streaming ---

async function run() {
  setError('');
  setStatus('');
  resultWrap.hidden = true;
  resultEl.textContent = '';
  setGenerating(true);

  let pageText;
  let textSource = 'page';
  if (pendingSelectionText) {
    pageText = pendingSelectionText;
    textSource = 'selection';
    clearSelection();
  } else {
    try {
      pageText = await getPageText();
    } catch (err) {
      setError(`Failed to read page: ${err.message}`);
      setGenerating(false);
      return;
    }
  }

  const model = modelSelect.value || DEFAULT_MODEL;
  const baseUrl = urlInput.value.trim() || DEFAULT_OLLAMA_URL;
  const prompt = buildPrompt(pageText);
  abortController = new AbortController();
  let fullText = '';

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user',   content: prompt },
        ],
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama error ${response.status}: ${msg}`);
    }

    setStatus('');
    resultWrap.hidden = false;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processLine = (line) => {
      if (!line.trim()) return;
      try {
        const json = JSON.parse(line);
        const token = json.message?.content ?? json.response ?? '';
        if (token) {
          fullText += token;
          currentResultText = fullText;
          renderResult(fullText);
          charCountEl.textContent = `${fullText.length} chars · ${fullText.trim().split(/\s+/).filter(Boolean).length} words`;
          resultEl.scrollTop = resultEl.scrollHeight;
        }
      } catch {
        // skip malformed line
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) processLine(buffer);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete trailing line for next chunk
      lines.forEach(processLine);
    }

    if (fullText) {
      currentChatMessages = [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user',   content: prompt },
        { role: 'assistant', content: fullText },
      ];
      saveToHistory(fullText);
      if (viewerAutoOpen) openViewer();
    }

  } catch (err) {
    setStatus('');
    if (err.name === 'AbortError') {
      if (fullText) {
        setStatus('Stopped.');
        setTimeout(() => setStatus(''), 1500);
        saveToHistory(fullText);
      }
    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      setError(
        'Cannot connect to Ollama.\n\n' +
        'Make sure Ollama is running:\n' +
        '  ollama serve\n\n' +
        `Then pull a model if needed:\n  ollama pull ${model}`
      );
    } else {
      setError(`Ollama error: ${err.message}`);
    }
  } finally {
    abortController = null;
    setGenerating(false);
    if (!fullText) resultWrap.hidden = true;
  }
}

// --- Events ---

btnSummarize.addEventListener('click', run);

btnStop.addEventListener('click', () => {
  abortController?.abort();
});

btnClear.addEventListener('click', () => {
  resultEl.textContent = '';
  charCountEl.textContent = '';
  resultWrap.hidden = true;
  errorEl.hidden = true;
});

function openViewer() {
  if (!currentResultText) return;
  const slot = slots.find(s => s.id === activeSlotId);
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.storage.session.set({
      viewerContent: {
        text: currentResultText,
        markdown: markdownToggle.checked,
        title: slot?.name || 'Result',
        url: tab?.url || '',
        chatMessages: currentChatMessages,
        model: modelSelect.value || DEFAULT_MODEL,
        ollamaUrl: urlInput.value.trim() || DEFAULT_OLLAMA_URL,
      }
    }, () => {
      if (viewerMode === 'popup') {
        chrome.windows.create({
          url: chrome.runtime.getURL('viewer.html'),
          type: 'popup',
          width: 820,
          height: 680,
          left: Math.round(screen.width * 0.75 - 820 / 2),
          top: Math.round((screen.height - 680) / 2)
        });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
      }
    });
  });
}

function updateViewerMenuActive() {
  viewerMenuItems.forEach(item => {
    item.classList.toggle('active', item.dataset.mode === viewerMode);
  });
  btnAutoOpen.classList.toggle('active', viewerAutoOpen);
}

btnExpand.addEventListener('click', openViewer);

btnViewerMode.addEventListener('click', (e) => {
  e.stopPropagation();
  viewerMenu.hidden = !viewerMenu.hidden;
  updateViewerMenuActive();
});

viewerMenuItems.forEach(item => {
  item.addEventListener('click', () => {
    viewerMode = item.dataset.mode;
    chrome.storage.local.set({ viewerMode });
    updateViewerMenuActive();
    viewerMenu.hidden = true;
  });
});

btnAutoOpen.addEventListener('click', () => {
  viewerAutoOpen = !viewerAutoOpen;
  chrome.storage.local.set({ viewerAutoOpen });
  updateViewerMenuActive();
  viewerMenu.hidden = true;
});

document.addEventListener('click', () => { viewerMenu.hidden = true; });

btnCopy.addEventListener('click', () => {
  const text = resultEl.textContent;
  if (!text) return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const source = tab?.url ? `\n\nSource: ${tab.url}` : '';
    navigator.clipboard.writeText(text + source).then(() => {
      btnCopy.textContent = 'Copied!';
      setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
    });
  });
});
