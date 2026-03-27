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
const btnRefreshModels  = document.getElementById('btn-refresh-models');
const btnSummarize      = document.getElementById('btn-summarize');
const btnStop           = document.getElementById('btn-stop');
const btnCopy           = document.getElementById('btn-copy');
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
const statusEl          = document.getElementById('status');
const resultWrap        = document.getElementById('result-wrap');
const resultEl          = document.getElementById('result');
const charCountEl       = document.getElementById('char-count');
const errorEl           = document.getElementById('error');

let abortController = null;
let slots = [];
let activeSlotId = null;

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
  { id: 'slot_1', name: 'Summarize', prompt: `Summarize the following web page in 4–6 bullet points in ${USER_LANG}. Be specific.\n\n{{text}}` },
];

// --- System prompt ---

function getSystemPrompt() {
  const md = markdownToggle?.checked
    ? ' Format your response using Markdown (headers, bold, bullet lists where appropriate).'
    : '';
  return `You are a helpful assistant. You MUST always respond in ${USER_LANG}. Never use any other language in your response, regardless of the language of the input text.${md}`;
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
  btnDeleteSlot.disabled = slots.length <= 1;

  renderSlots();
  chrome.storage.local.set({ activeSlotId });
}

function saveSlots() {
  chrome.storage.local.set({ slots, activeSlotId });
}

function addSlot() {
  const n = slots.length + 1;
  const slot = { id: `slot_${Date.now()}`, name: `Custom ${n}`, prompt: `{{text}}` };
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
  if (slots.length <= 1) return;
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

  const lines = md.split('\n');
  let html = '', inUl = false, inOl = false;

  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };

  for (const raw of lines) {
    const line = inline(escape(raw));

    if (/^### /.test(line))       { closeLists(); html += `<h3>${line.slice(4)}</h3>`; continue; }
    if (/^## /.test(line))        { closeLists(); html += `<h2>${line.slice(3)}</h2>`; continue; }
    if (/^# /.test(line))         { closeLists(); html += `<h1>${line.slice(2)}</h1>`; continue; }
    if (/^---+$/.test(raw.trim())) { closeLists(); html += '<hr>'; continue; }

    if (/^[-*•] /.test(raw)) {
      if (!inUl) { closeLists(); html += '<ul>'; inUl = true; }
      html += `<li>${inline(escape(raw.replace(/^[-*•] /, '')))}</li>`;
      continue;
    }
    if (/^\d+\. /.test(raw)) {
      if (!inOl) { closeLists(); html += '<ol>'; inOl = true; }
      html += `<li>${inline(escape(raw.replace(/^\d+\. /, '')))}</li>`;
      continue;
    }

    closeLists();
    if (!raw.trim()) { html += '<br>'; continue; }
    html += `<p>${line}</p>`;
  }

  closeLists();
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
  btnTheme.textContent = theme === 'dark' ? '☀' : '🌙';
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
        charCountEl.textContent = `${item.text.length} chars`;
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
  if (!slot) return;
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
  chrome.storage.local.set({ markdown: markdownToggle.checked });
});

btnDeleteSlot.addEventListener('click', deleteActiveSlot);

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

    const savedModel = await new Promise(r => chrome.storage.local.get('model', ({ model }) => r(model)));

    modelSelect.innerHTML = '';
    if (!models.length) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      return;
    }

    models.forEach(({ name }) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === savedModel || (!savedModel && name.startsWith(DEFAULT_MODEL))) {
        opt.selected = true;
      }
      modelSelect.appendChild(opt);
    });

    if (!modelSelect.value && models.length) modelSelect.value = models[0].name;
    chrome.storage.local.set({ model: modelSelect.value });

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
  chrome.storage.local.set({ model: modelSelect.value });
});

// --- Load saved settings ---

chrome.storage.local.get(['theme', 'ollamaUrl', 'markdown', 'slots', 'activeSlotId', 'settingsOpen'], (data) => {
  markdownToggle.checked = !!data.markdown;

  const url = data.ollamaUrl || DEFAULT_OLLAMA_URL;
  urlInput.value = url;
  if (!data.ollamaUrl) chrome.storage.local.set({ ollamaUrl: DEFAULT_OLLAMA_URL });

  applyTheme(data.theme || getSystemTheme());

  slots = data.slots?.length ? data.slots : DEFAULT_SLOTS.map(s => ({ ...s }));
  activeSlotId = data.activeSlotId || slots[0]?.id;

  // Open settings by default on first run; remember state after that
  const showSettings = data.settingsOpen !== false;
  settingsPanel.hidden = !showSettings;
  btnSettings.style.color = showSettings ? 'var(--accent)' : '';

  renderSlots();
  setActiveSlot(activeSlotId);
  fetchModels();
});

urlInput.addEventListener('change', () => {
  chrome.storage.local.set({ ollamaUrl: urlInput.value.trim() || DEFAULT_OLLAMA_URL });
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

async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const candidates = [
        'article', 'main', '[role="main"]',
        '.post-content', '.article-content', '.entry-content',
        '.content', '.post', '.article',
        '#content', '#main', '#article',
      ];

      let el = null;
      for (const selector of candidates) {
        const found = document.querySelector(selector);
        if (found && found.innerText.trim().length > 200) { el = found; break; }
      }

      if (!el) {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('nav, header, footer, aside, script, style, noscript, [role="navigation"], [role="banner"], [role="complementary"]').forEach(n => n.remove());
        return clone.innerText.replace(/\s+/g, ' ').trim();
      }

      return el.innerText.replace(/\s+/g, ' ').trim();
    },
  });

  if (!result) throw new Error('Could not extract text from this page.');
  return result.slice(0, MAX_TEXT_LENGTH);
}

// --- Ollama streaming ---

async function run() {
  setError('');
  setStatus('');
  resultWrap.hidden = true;
  resultEl.textContent = '';
  setGenerating(true);

  let pageText;
  try {
    pageText = await getPageText();
  } catch (err) {
    setError(`Failed to read page: ${err.message}`);
    setGenerating(false);
    return;
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const token = json.message?.content ?? json.response ?? '';
          if (token) {
            fullText += token;
            renderResult(fullText);
            charCountEl.textContent = `${fullText.length} chars`;
            resultEl.scrollTop = resultEl.scrollHeight;
          }
        } catch {
          // skip malformed line
        }
      }
    }

    if (fullText) saveToHistory(fullText);

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

btnCopy.addEventListener('click', () => {
  const text = resultEl.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
  });
});
