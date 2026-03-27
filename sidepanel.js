'use strict';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const MAX_TEXT_LENGTH = 12000;
const DEFAULT_MODEL = 'llama3.2';
const MAX_HISTORY = 8;

const modelSelect        = document.getElementById('model-select');
const urlInput           = document.getElementById('url-input');
const btnRefreshModels   = document.getElementById('btn-refresh-models');
const btnSummarize  = document.getElementById('btn-summarize');
const btnStop       = document.getElementById('btn-stop');
const btnCopy       = document.getElementById('btn-copy');
const btnTheme      = document.getElementById('btn-theme');
const btnSettings   = document.getElementById('btn-settings');
const btnHistory    = document.getElementById('btn-history');
const btnClearHist  = document.getElementById('btn-clear-history');
const settingsPanel = document.getElementById('settings-panel');
const historyPanel  = document.getElementById('history-panel');
const historyList   = document.getElementById('history-list');
const statusEl      = document.getElementById('status');
const resultWrap    = document.getElementById('result-wrap');
const resultEl      = document.getElementById('result');
const charCountEl   = document.getElementById('char-count');
const errorEl       = document.getElementById('error');

let abortController = null;
let activeMode = 'summarize';

// --- Prompt templates ---

const PROMPTS = {
  summarize: (text) =>
    `Summarize the following web page content in 4–6 concise bullet points. Be specific, avoid filler phrases.\n\n${text}`,
  keypoints: (text) =>
    `Extract the 5–8 most important key points from the following web page content. Format as a numbered list.\n\n${text}`,
  eli5: (text) =>
    `Explain the following web page content as if I'm 5 years old. Use simple words and short sentences.\n\n${text}`,
  translate: (text) =>
    `Translate the following web page content to English. Preserve the original structure.\n\n${text}`,
};

const MODE_LABELS = {
  summarize: 'Summarizing…',
  keypoints: 'Extracting key points…',
  eli5: 'Simplifying…',
  translate: 'Translating…',
};

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
});

// --- History panel toggle ---

btnHistory.addEventListener('click', () => {
  const open = !historyPanel.hidden;
  historyPanel.hidden = open;
  if (!open) settingsPanel.hidden = true;
  btnHistory.style.color = open ? '' : 'var(--accent)';
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
    history.forEach((item, i) => {
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
  chrome.storage.local.get('history', ({ history = [] }) => {
    const entry = {
      text,
      mode: activeMode,
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

// --- Mode selector ---

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMode = btn.dataset.mode;
    chrome.storage.local.set({ mode: activeMode });
  });
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

    // fallback — select first if nothing matched
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

chrome.storage.local.get(['theme', 'mode', 'ollamaUrl'], ({ theme, mode, ollamaUrl }) => {
  const url = ollamaUrl || DEFAULT_OLLAMA_URL;
  urlInput.value = url;
  if (!ollamaUrl) chrome.storage.local.set({ ollamaUrl: DEFAULT_OLLAMA_URL });

  applyTheme(theme || getSystemTheme());
  if (mode) {
    activeMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }
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
  btnSummarize.disabled = active;
  btnStop.hidden = !active;
}

// --- Extract page text ---

async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const text = document.body?.innerText || '';
      return text.replace(/\s+/g, ' ').trim();
    },
  });

  if (!result) throw new Error('Could not extract text from this page.');
  return result.slice(0, MAX_TEXT_LENGTH);
}

// --- Ollama streaming ---

async function run() {
  setError('');
  setStatus('Extracting page text…');
  resultWrap.hidden = true;
  resultEl.textContent = '';
  setGenerating(true);

  let pageText;
  try {
    pageText = await getPageText();
  } catch (err) {
    setStatus('');
    setError(`Failed to read page: ${err.message}`);
    setGenerating(false);
    return;
  }

  const model = modelSelect.value || DEFAULT_MODEL;
  const baseUrl = urlInput.value.trim() || DEFAULT_OLLAMA_URL;
  const ollamaUrl = `${baseUrl}/api/generate`;
  const prompt = PROMPTS[activeMode](pageText);

  setStatus(MODE_LABELS[activeMode]);
  abortController = new AbortController();
  let fullText = '';

  try {
    const response = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true }),
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
          if (json.response) {
            fullText += json.response;
            resultEl.textContent = fullText;
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

btnCopy.addEventListener('click', () => {
  const text = resultEl.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
  });
});
