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

  if (!viewerContent?.text) {
    contentEl.innerHTML = '<div class="empty">No content to display.</div>';
    return;
  }

  const { text, markdown, title } = viewerContent;

  titleEl.textContent = title || 'Result';
  document.title = `${title || 'Result'} — LLM Summarizer`;
  charCountEl.textContent = `${text.length} chars`;

  if (markdown) {
    contentEl.innerHTML = parseMarkdown(text);
    contentEl.style.whiteSpace = 'normal';
  } else {
    contentEl.textContent = text;
  }

  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => {
      btnCopy.textContent = 'Copied!';
      setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
    });
  });
});
