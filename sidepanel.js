'use strict';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MAX_TEXT_LENGTH = 12000;
const DEFAULT_MODEL = 'llama3.2';

const modelInput   = document.getElementById('model-input');
const btnSummarize = document.getElementById('btn-summarize');
const btnStop      = document.getElementById('btn-stop');
const btnCopy      = document.getElementById('btn-copy');
const btnTheme     = document.getElementById('btn-theme');
const statusEl     = document.getElementById('status');
const resultWrap   = document.getElementById('result-wrap');
const resultEl     = document.getElementById('result');
const charCountEl  = document.getElementById('char-count');
const errorEl      = document.getElementById('error');

let abortController = null;

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  btnTheme.textContent = theme === 'dark' ? '☀' : '🌙';
  btnTheme.title = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

chrome.storage.local.get(['model', 'theme'], ({ model, theme }) => {
  modelInput.value = model || DEFAULT_MODEL;
  applyTheme(theme || getSystemTheme());
});

btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
});

// Follow system changes when no manual override is saved
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  chrome.storage.local.get('theme', ({ theme }) => {
    if (!theme) applyTheme(e.matches ? 'dark' : 'light');
  });
});

modelInput.addEventListener('change', () => {
  chrome.storage.local.set({ model: modelInput.value.trim() || DEFAULT_MODEL });
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

function showResult(text) {
  resultEl.textContent = text;
  charCountEl.textContent = `${text.length} chars`;
  resultWrap.hidden = false;
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

async function summarize() {
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

  const model = modelInput.value.trim() || DEFAULT_MODEL;
  const prompt =
    `Summarize the following web page content in 4–6 concise bullet points. ` +
    `Be specific, avoid filler phrases.\n\n${pageText}`;

  setStatus('Generating summary…');

  abortController = new AbortController();

  let fullText = '';

  try {
    const response = await fetch(OLLAMA_URL, {
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
    showResult('');

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

  } catch (err) {
    if (err.name === 'AbortError') {
      setStatus('Stopped.');
      setTimeout(() => setStatus(''), 1500);
    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      setError(
        'Cannot connect to Ollama.\n\n' +
        'Make sure Ollama is running:\n' +
        '  ollama serve\n\n' +
        `Then pull a model if needed:\n  ollama pull ${model}`
      );
    } else {
      setError(err.message);
    }
  } finally {
    abortController = null;
    setGenerating(false);
    if (!fullText) resultWrap.hidden = true;
  }
}

// --- Events ---

btnSummarize.addEventListener('click', summarize);

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
