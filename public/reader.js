const $ = selector => document.querySelector(selector);
const bookCache = new Map();
const yieldFrame = () => new Promise(requestAnimationFrame);

export class BookReader {
  constructor({getPosition, savePosition, onRead, toast, fetchText}) {
    Object.assign(this, {getPosition, savePosition, onRead, toast, fetchText});
    this.text = ''; this.start = 0; this.end = 0; this.stack = []; this.fontSize = 20; this.token = 0; this.cache = new Map();
    $('#close-reader').onclick = () => this.close();
    $('#reader').addEventListener('cancel', () => this.cleanup());
    $('#next-page').onclick = () => this.turn(1);
    $('#prev-page').onclick = () => this.turn(-1);
    $('#font-up').onclick = () => this.resizeFont(2);
    $('#font-down').onclick = () => this.resizeFont(-2);
    $('#reader-theme').onclick = () => {
      const active = $('#reader').classList.toggle('reader-dark');
      $('#reader-theme').setAttribute('aria-pressed', active);
    };
    $('#fullscreen').onclick = () => this.fullscreen();
    $('#bookmark').onclick = () => this.bookmark();
    $('#go-bookmark').onclick = () => this.jump(this.getPosition(this.book.id)?.bookmark || 0);
    $('#contents-button').onclick = () => this.contents($('#contents-panel').hidden);
    $('#close-contents').onclick = () => this.contents(false);
    $('#chapter-list').onclick = event => {
      const button = event.target.closest('[data-offset]');
      if (button) { this.jump(Number(button.dataset.offset)); this.contents(false); }
    };
    $('#progress').oninput = event => this.jump(Number(event.target.value) / 1000);
    document.addEventListener('keydown', event => {
      if (!$('#reader').open || event.target.matches('input, textarea, select, [contenteditable=true]')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); this.turn(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.turn(-1); }
    });
    let resizeFrame;
    this.observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { if ($('#reader').open && this.text) this.render(); });
    });
    this.observer.observe($('#open-book'));
    document.addEventListener('fullscreenchange', () => {
      $('#fullscreen').setAttribute('aria-pressed', !!document.fullscreenElement || $('#reader').classList.contains('reader-expanded'));
    });
  }

  async open(book) {
    const token = ++this.token;
    this.book = book; this.text = ''; this.stack = []; this.cache.clear(); this.start = 0;
    $('#reader-title').textContent = book.title;
    $('#reader-author').textContent = book.author;
    $('#left-page').textContent = ''; $('#right-page').textContent = '';
    $('#reader-status').textContent = 'Opening your book…';
    $('#reader').classList.add('loading');
    $('#reader').showModal(); document.body.style.overflow = 'hidden';
    $('#source-link').href = book.local ? `/books/${book.id}.txt` : `https://www.gutenberg.org/ebooks/${book.id}`;
    this.contents(false);
    try {
      let text = bookCache.get(String(book.id));
      if (!text) {
        text = await this.fetchText(book);
        const normalized = text.replace(/\r\n?/g, '\n');
        const marker = normalized.match(/\*\*\* START OF (?:THIS|THE) PROJECT GUTENBERG[^\n]*\n/i);
        text = (marker ? normalized.slice(marker.index + marker[0].length) : normalized)
          .replace(/\*\*\* END OF (?:THIS|THE) PROJECT GUTENBERG[\s\S]*$/i, '').trim()
          .split(/\n\s*\n/).map(p => p.trim().replace(/\n(?=\S)/g, ' ')).join('\n\n');
        if (bookCache.size >= 6) bookCache.delete(bookCache.keys().next().value);
        bookCache.set(String(book.id), text);
      }
      if (token !== this.token || !$('#reader').open) return;
      this.text = text;
      this.start = Math.floor((this.getPosition(book.id)?.ratio || 0) * Math.max(text.length - 1, 1));
      this.start = this.wordBoundary(this.start);
      $('#reader-status').textContent = ''; $('#reader').classList.remove('loading');
      await yieldFrame();
      if (token !== this.token) return;
      this.buildContents(); this.render(); this.onRead(book);
    } catch {
      if (token !== this.token) return;
      $('#reader').classList.remove('loading');
      $('#reader-status').textContent = 'This source could not be reached. Try another book, or open the original text using the link below.';
    }
  }

  wordBoundary(offset) {
    if (offset <= 0) return 0;
    if (/\s/.test(this.text[offset - 1])) return offset;
    const next = this.text.indexOf(' ', offset);
    const newline = this.text.indexOf('\n', offset);
    const boundary = Math.min(next < 0 ? Infinity : next, newline < 0 ? Infinity : newline);
    return Number.isFinite(boundary) && boundary - offset < 100 ? boundary + 1 : offset;
  }

  // Measure only the current page. Work is bounded by a few thousand characters,
  // regardless of the length of the book; changing fonts never paginates the novel.
  fitPage(element, start) {
    const available = Math.min(14000, this.text.length - start);
    if (available <= 0) { element.textContent = ''; return start; }
    let low = 0, high = available;
    while (low < high) {
      const size = Math.ceil((low + high) / 2);
      element.textContent = this.text.slice(start, start + size).trim();
      if (element.scrollHeight <= element.clientHeight + 1) low = size;
      else high = size - 1;
    }
    let end = start + Math.max(1, low);
    if (end < this.text.length) {
      const boundary = Math.max(this.text.lastIndexOf(' ', end), this.text.lastIndexOf('\n', end));
      if (boundary > start) end = boundary;
    }
    element.textContent = this.text.slice(start, end).trim();
    while (end < this.text.length && /\s/.test(this.text[end])) end++;
    return end;
  }

  render() {
    if (!this.text || !$('#reader').open) return;
    const left = $('#left-page'), right = $('#right-page');
    const two = getComputedStyle(right).display !== 'none';
    const key = `${left.clientWidth}:${left.clientHeight}:${this.fontSize}:${two}:${this.start}`;
    let spread = this.cache.get(key);
    if (!spread) {
      const middle = this.fitPage(left, this.start);
      const end = two ? this.fitPage(right, middle) : middle;
      spread = {left: left.textContent, right: two ? right.textContent : '', end};
      if (this.cache.size > 200) this.cache.clear();
      this.cache.set(key, spread);
    }
    left.textContent = spread.left;
    right.textContent = spread.right || (two && spread.end >= this.text.length ? 'The end.\n\nYour next story is waiting in the library.' : '');
    this.end = spread.end;
    const ratio = this.start / Math.max(1, this.text.length - 1);
    const percent = this.end >= this.text.length ? 100 : Math.round(ratio * 100);
    const minutes = Math.max(1, Math.round((this.text.length - this.start) / 1200));
    $('#page-count').textContent = `${percent}% read · ${minutes} min left`;
    $('#progress').value = Math.round(ratio * 1000);
    $('#prev-page').disabled = this.start === 0;
    $('#next-page').disabled = this.end >= this.text.length;
    const position = this.getPosition(this.book.id) || {};
    this.savePosition(this.book.id, {...position, ratio, updated: Date.now()});
    $('#bookmark').setAttribute('aria-pressed', position.bookmark != null && Math.abs(position.bookmark - ratio) < .001);
    $('#bookmark').textContent = position.bookmark != null ? '♥' : '♡';
    $('#go-bookmark').hidden = position.bookmark == null;
    $('#font-down').disabled = this.fontSize <= 14;
    $('#font-up').disabled = this.fontSize >= 30;
  }

  turn(direction) {
    if (!this.text) return;
    if (direction > 0 && this.end < this.text.length) {
      this.stack.push(this.start); this.start = this.end;
    } else if (direction < 0 && this.start > 0) {
      this.start = this.stack.length ? this.stack.pop() : this.wordBoundary(Math.max(0, this.start - Math.max(100, this.end - this.start)));
    } else return;
    this.render();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const page = getComputedStyle($('#right-page')).display !== 'none' ? $('#right-page') : $('#left-page');
      page.animate([{opacity:.6, transform:'translateX(4px)'}, {opacity:1, transform:'translateX(0)'}], {duration:160});
    }
  }

  resizeFont(delta) {
    if (!this.text) return;
    this.fontSize = Math.max(14, Math.min(30, this.fontSize + delta));
    $('#reader').style.setProperty('--reader-size', `${this.fontSize}px`);
    this.cache.clear(); this.stack = []; this.render();
  }

  jump(ratio) {
    if (!this.text) return;
    let offset = Math.round(Math.max(0, Math.min(1, ratio)) * Math.max(0, this.text.length - 1));
    if (ratio >= 1) offset = Math.max(0, this.text.length - Math.max(500, this.end - this.start));
    this.start = this.wordBoundary(offset);
    this.stack = []; this.render();
  }

  bookmark() {
    if (!this.text) return;
    const position = this.getPosition(this.book.id) || {};
    this.savePosition(this.book.id, {...position, bookmark: this.start / Math.max(1, this.text.length - 1)});
    this.render(); this.toast('Bookmark saved. Find it in Contents.');
  }

  contents(open) {
    $('#contents-panel').hidden = !open;
    $('#contents-button').setAttribute('aria-expanded', open);
  }

  buildContents() {
    const host = $('#chapter-list'); host.replaceChildren();
    const startButton = document.createElement('button'); startButton.textContent = 'Beginning of the book'; startButton.dataset.offset = '0'; host.append(startButton);
    const pattern = /^(?:chapter\s+(?:\d+|[ivxlcdm]+)\b[^\n]{0,100}|(?:prologue|epilogue|preface|introduction)\b[^\n]{0,80}|(?:book|part)\s+(?:\d+|[ivxlcdm]+|one|two|three)\b[^\n]{0,80})/gim;
    let match, count = 0;
    while ((match = pattern.exec(this.text)) && count < 200) {
      const button = document.createElement('button'); button.textContent = match[0]; button.dataset.offset = String(match.index / Math.max(1, this.text.length - 1)); host.append(button); count++;
    }
    if (!count) { const p = document.createElement('p'); p.textContent = 'This edition has no chapter markers. Use the reading-position slider to move through the book.'; host.append(p); }
  }

  async fullscreen() {
    const reader = $('#reader');
    if (document.fullscreenElement) { await document.exitFullscreen(); reader.classList.remove('reader-expanded'); }
    else if (reader.classList.contains('reader-expanded')) reader.classList.remove('reader-expanded');
    else {
      reader.classList.add('reader-expanded');
      try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch { this.toast('Expanded reading mode is on.'); }
    }
    $('#fullscreen').setAttribute('aria-pressed', !!document.fullscreenElement || reader.classList.contains('reader-expanded'));
    requestAnimationFrame(() => this.render());
  }

  cleanup() {
    this.token++; document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('#reader').classList.remove('reader-expanded');
    $('#fullscreen').setAttribute('aria-pressed', false);
  }
  close() { this.cleanup(); $('#reader').close(); }
}
