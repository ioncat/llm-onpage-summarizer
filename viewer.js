function parseMarkdown(md) {
  const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

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
  let html = '';
  let inUl = false, inOl = false, inPre = false, inBlockquote = false, tableRows = [];

  const closeAll = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
    if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
    if (tableRows.length) { html += flushTable(tableRows); tableRows = []; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (inPre) {
      if (line.startsWith('```')) { html += '</code></pre>'; inPre = false; }
      else html += escape(raw) + '\n';
      continue;
    }
    if (/^\|/.test(line)) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
      tableRows.push(raw); continue;
    }
    if (tableRows.length) { html += flushTable(tableRows); tableRows = []; }
    if (line.startsWith('```')) {
      closeAll();
      const lang = line.slice(3).trim();
      html += `<pre><code${lang ? ` class="language-${escape(lang)}"` : ''}>`;
      inPre = true; continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      closeAll();
      const level = line.match(/^(#{1,3})/)[1].length;
      html += `<h${level}>${inline(escape(line.replace(/^#{1,3}\s/, '')))}</h${level}>`;
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      if (!inUl) { closeAll(); html += '<ul>'; inUl = true; }
      html += `<li>${inline(escape(line.replace(/^[-*]\s/, '')))}</li>`;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (!inOl) { closeAll(); html += '<ol>'; inOl = true; }
      html += `<li>${inline(escape(line.replace(/^\d+\.\s/, '')))}</li>`;
      continue;
    }
    if (line.startsWith('> ')) {
      if (!inBlockquote) { closeAll(); html += '<blockquote>'; inBlockquote = true; }
      html += `<p>${inline(escape(line.slice(2)))}</p>`;
      continue;
    }
    if (/^---+$/.test(line)) { closeAll(); html += '<hr>'; continue; }
    if (line === '') { closeAll(); continue; }
    closeAll();
    html += `<p>${inline(escape(line))}</p>`;
  }
  closeAll();
  if (inPre) html += '</code></pre>';
  return html;
}

chrome.storage.local.get('theme', ({ theme }) => {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
});

chrome.storage.session.get('viewerContent', ({ viewerContent }) => {
  const titleEl = document.getElementById('title');
  const contentEl = document.getElementById('content');
  const charCountEl = document.getElementById('char-count');
  const btnCopy = document.getElementById('btn-copy');
  const chatThread = document.getElementById('chat-thread');
  const chatInputBar = document.getElementById('chat-input-bar');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  const chatHint = document.getElementById('chat-hint');

  if (!viewerContent?.text) {
    contentEl.innerHTML = '<div class="empty">No content to display.</div>';
    return;
  }

  const btnRerun = document.getElementById('btn-rerun');

  const { text, markdown, title, url, chatMessages, model, ollamaUrl } = viewerContent;
  let messages = chatMessages?.length ? [...chatMessages] : [];
  let isGenerating = false;
  let lastResponseEl = null;

  titleEl.textContent = title || 'Result';
  document.title = `${title || 'Result'} — LLM Summarizer`;
  charCountEl.textContent = `${text.length} chars · ${text.trim().split(/\s+/).filter(Boolean).length} words`;

  // Render initial summary
  if (markdown) {
    contentEl.innerHTML = parseMarkdown(text);
    contentEl.style.whiteSpace = 'normal';
  } else {
    contentEl.textContent = text;
  }
  lastResponseEl = contentEl;

  // Show chat input if we have context for follow-ups
  if (messages.length && model && ollamaUrl) {
    chatInputBar.hidden = false;
  }

  // Copy — only initial summary + source
  btnCopy.addEventListener('click', () => {
    const source = url ? `\n\nSource: ${url}` : '';
    navigator.clipboard.writeText(text + source).then(() => {
      btnCopy.textContent = 'Copied!';
      setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
    });
  });

  // --- Chat logic ---

  function renderMarkdownOrText(container, content) {
    if (markdown) {
      container.innerHTML = parseMarkdown(content);
      container.style.whiteSpace = 'normal';
    } else {
      container.textContent = content;
    }
  }

  function appendUserMessage(text) {
    const divider = document.createElement('hr');
    divider.className = 'chat-divider';
    chatThread.appendChild(divider);

    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg--user';
    msg.textContent = text;
    chatThread.appendChild(msg);
  }

  function appendAssistantMessage() {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg chat-msg--assistant';
    const inner = document.createElement('div');
    inner.className = 'content';
    wrapper.appendChild(inner);
    chatThread.appendChild(wrapper);
    return inner;
  }

  function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  }

  chatInput.addEventListener('input', autoResize);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFollowUp();
    }
  });

  btnSend.addEventListener('click', sendFollowUp);

  async function sendFollowUp() {
    const question = chatInput.value.trim();
    if (!question || isGenerating) return;

    isGenerating = true;
    btnSend.disabled = true;
    chatInput.value = '';
    autoResize();

    // Hide hint after first message
    if (chatHint) chatHint.hidden = true;

    // Add user message to UI and messages array
    appendUserMessage(question);
    messages.push({ role: 'user', content: question });
    scrollToBottom();

    // Create assistant response container
    const responseEl = appendAssistantMessage();
    let fullResponse = '';

    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: true, messages }),
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => response.statusText);
        throw new Error(`Ollama error ${response.status}: ${msg}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line) => {
        if (!line.trim()) return;
        try {
          const json = JSON.parse(line);
          const token = json.message?.content ?? json.response ?? '';
          if (token) {
            fullResponse += token;
            renderMarkdownOrText(responseEl, fullResponse);
            scrollToBottom();
          }
        } catch {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) processLine(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(processLine);
      }

      if (fullResponse) {
        messages.push({ role: 'assistant', content: fullResponse });
        lastResponseEl = responseEl;
      }

    } catch (err) {
      responseEl.textContent = `Error: ${err.message}`;
      responseEl.style.color = 'var(--text-muted)';
    } finally {
      isGenerating = false;
      btnSend.disabled = false;
      btnRerun.disabled = false;
      chatInput.focus();
    }
  }

  // --- Rerun logic ---

  async function rerunLast() {
    if (isGenerating || !messages.length || !model || !ollamaUrl) return;

    // Remove last assistant message to regenerate it
    if (messages[messages.length - 1]?.role === 'assistant') {
      messages.pop();
    }
    if (!messages.length) return;

    isGenerating = true;
    btnSend.disabled = true;
    btnRerun.disabled = true;

    // Clear the last response element and re-stream into it
    lastResponseEl.innerHTML = '';
    lastResponseEl.style.color = '';
    let fullResponse = '';

    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: true, messages }),
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => response.statusText);
        throw new Error(`Ollama error ${response.status}: ${msg}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line) => {
        if (!line.trim()) return;
        try {
          const json = JSON.parse(line);
          const token = json.message?.content ?? json.response ?? '';
          if (token) {
            fullResponse += token;
            renderMarkdownOrText(lastResponseEl, fullResponse);
            scrollToBottom();
          }
        } catch {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) processLine(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(processLine);
      }

      if (fullResponse) {
        messages.push({ role: 'assistant', content: fullResponse });
      }

    } catch (err) {
      lastResponseEl.textContent = `Error: ${err.message}`;
      lastResponseEl.style.color = 'var(--text-muted)';
    } finally {
      isGenerating = false;
      btnSend.disabled = false;
      btnRerun.disabled = false;
    }
  }

  btnRerun.addEventListener('click', rerunLast);
});
