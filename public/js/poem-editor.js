/*
 Poem Editor - lightweight line-based poetry editor
 - Auto line creation on Enter
 - Backspace at start merges with previous line
 - Tab / Shift+Tab adjusts indent
 - Per-line color and spacing via a floating toolbar
 - Paste plain text -> split into multiple lines

 No dependencies. Works inside public/poetry.html
*/

(function () {
  const uid = () => Math.random().toString(36).slice(2, 9);

  // Inject minimal CSS for selection toolbar once
  function injectSelectionBarStyles() {
    if (document.getElementById('poem-selection-style')) return;
    const css = `
      #selection-toolbar { position: absolute; z-index: 1000; background: #0d101a; color: #e6e7eb; border: 1px solid #23283a; border-radius: 8px; padding: 6px; box-shadow: 0 6px 24px rgba(0,0,0,0.35); display: flex; gap: 6px; align-items: center; }
      #selection-toolbar.hidden { display: none; }
      #selection-toolbar button { background: transparent; color: inherit; border: 1px solid transparent; border-radius: 6px; padding: 4px 6px; cursor: pointer; font-weight: 600; }
      #selection-toolbar button:hover { border-color: #2b3250; }
      #selection-toolbar .sep { width: 1px; height: 18px; background: #2a3147; }
      #selection-toolbar input[type="color"] { width: 24px; height: 24px; border: none; background: transparent; padding: 0; }
      #selection-toolbar .recent-chips { display: inline-flex; gap: 4px; align-items: center; }
      #selection-toolbar .chip { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #2a3147; padding: 0; background: transparent; }
      #selection-toolbar .chip:hover { border-color: #7aa2f7; }
    `;
    const style = document.createElement('style');
    style.id = 'poem-selection-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // (Selection toolbar defined below; PoemEditor class is defined later)
  // --- Selection-based formatting toolbar (Bold, Italic, Underline, Strike, Color) ---
  class SelectionToolbar {
    constructor(editor) {
      this.editor = editor;
      this.el = document.createElement('div');
      this.el.id = 'selection-toolbar';
      this.el.className = 'hidden';
      this.isMouseSelecting = false; // track drag selecting to show only on mouseup
      this.recentColors = [];
      this.el.innerHTML = `
        <button type="button" data-cmd="bold" title="Bold">B</button>
        <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
        <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
        <button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
        <div class="sep"></div>
        <input type="color" aria-label="Text color" />
        <div class="recent-chips" aria-label="Recent colors"></div>
      `;
      document.body.appendChild(this.el);
      // initial render of recent chips (empty)
      this._renderRecentColors();
      this._bind();
    }

    _bind() {
      // Prevent toolbar from stealing focus via pointer or mouse
      this.el.addEventListener('pointerdown', (e) => { e.preventDefault(); });
      this.el.addEventListener('mousedown', (e) => { e.preventDefault(); });
      // Make controls unfocusable and prevent focus on interaction
      this.el.querySelectorAll('button, input, .chip').forEach((n) => {
        n.tabIndex = -1;
        n.addEventListener('pointerdown', (e) => e.preventDefault());
        n.addEventListener('mousedown', (e) => e.preventDefault());
      });
      // Detect selection drag start within the editor and hide toolbar until mouseup
      this.editor.rootEl.addEventListener('mousedown', () => {
        this.isMouseSelecting = true;
        this.hide();
      });
      // When mouse is released, evaluate selection and possibly show toolbar
      document.addEventListener('mouseup', () => {
        if (!this.isMouseSelecting) return;
        this.isMouseSelecting = false;
        this._onSelectionChange();
      });
      this.el.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-cmd]');
        if (btn) {
          const cmd = btn.dataset.cmd;
          document.execCommand(cmd, false, null);
          this._persistActiveLine();
          // Return focus to editor so no control keeps focus
          this.editor.rootEl.focus();
          return;
        }
        const chip = e.target.closest('.chip');
        if (chip) {
          const color = chip.dataset.color;
          if (color) {
            document.execCommand('foreColor', false, color);
            this._addRecentColor(color);
            this._renderRecentColors();
            this._persistActiveLine();
          }
          this.editor.rootEl.focus();
          return;
        }
      });
      const colorInput = this.el.querySelector('input[type=color]');
      colorInput.addEventListener('input', () => {
        document.execCommand('foreColor', false, colorInput.value);
        this._persistActiveLine();
        this.editor.rootEl.focus();
      });
      colorInput.addEventListener('change', () => {
        this._addRecentColor(colorInput.value);
        this._renderRecentColors();
        this.editor.rootEl.focus();
      });
      colorInput.addEventListener('focus', () => { colorInput.blur(); });
      document.addEventListener('selectionchange', () => this._onSelectionChange());
      document.addEventListener('scroll', () => this.hide(), true);
      window.addEventListener('resize', () => this.hide());
    }

    _persistActiveLine() {
      // Persist current DOM back to the model. This covers selections
      // spanning multiple lines as well as single-line edits.
      if (this.editor && typeof this.editor._syncLinesFromDOM === 'function') {
        this.editor._syncLinesFromDOM();
      }
    }

    _onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return this.hide();
      const range = sel.getRangeAt(0);
      if (sel.isCollapsed) return this.hide();
      // Only show if selection is inside this editor
      if (!this.editor.rootEl.contains(range.commonAncestorContainer)) return this.hide();
      // If user is actively dragging selection, defer showing
      if (this.isMouseSelecting) return;
      // Use top-most client rect of the selection (handles multi-line selection)
      const rectList = typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : [];
      const anchor = rectList.length
        ? rectList.reduce((min, r) => (r.top < min.top || (r.top === min.top && r.left < min.left)) ? r : min, rectList[0])
        : range.getBoundingClientRect();
      if (!anchor || (anchor.width === 0 && anchor.height === 0)) return this.hide();
      // Measure toolbar even if hidden to correctly position ABOVE the selection
      const wasHidden = this.el.classList.contains('hidden');
      if (wasHidden) {
        this.el.style.visibility = 'hidden';
        this.el.classList.remove('hidden');
      }
      const tbRect = this.el.getBoundingClientRect();
      const tbH = tbRect.height || 0;
      const tbW = tbRect.width || 0;
      // Position above the TOP line of the selection; align to left edge of that line and clamp
      let top = window.scrollY + anchor.top - tbH - 8;
      const viewL = window.scrollX;
      const viewR = viewL + window.innerWidth;
      let left = window.scrollX + anchor.left; // align to left of top-most rect
      left = Math.max(viewL + 8, Math.min(viewR - tbW - 8, left));
      // If not enough space above, place below the first line
      const minTop = window.scrollY + 8;
      if (top < minTop) top = window.scrollY + anchor.bottom + 8;
      this.el.style.top = `${top}px`;
      this.el.style.left = `${left}px`;
      if (wasHidden) this.el.style.visibility = '';
      // Finally show
      this.el.classList.remove('hidden');
    }

    hide() { this.el.classList.add('hidden'); }

    _addRecentColor(hex) {
      if (!hex || typeof hex !== 'string') return;
      const v = hex.toLowerCase();
      // keep unique and most recent first
      this.recentColors = [v, ...this.recentColors.filter((c) => c !== v)].slice(0, 3);
    }

    _renderRecentColors() {
      const wrap = this.el.querySelector('.recent-chips');
      if (!wrap) return;
      wrap.innerHTML = '';
      this.recentColors.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.title = `Apply ${c}`;
        b.dataset.color = c;
        b.style.backgroundColor = c;
        b.tabIndex = -1;
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('mousedown', (e) => e.preventDefault());
        wrap.appendChild(b);
      });
    }
  }

  class PoemEditor {
    constructor(rootEl, opts = {}) {
      this.rootEl = rootEl;
      this.opts = opts || {};
      this.lines = [this._makeLine("")];
      this.activeLineId = this.lines[0].id;
      // Make the container the single editable root to allow cross-line selection
      this.rootEl.setAttribute('contenteditable', 'true');
      // Remove browser focus ring without relying on external CSS
      this.rootEl.style.outline = 'none';
      this.rootEl.spellcheck = false;
      this.toolbar = (this.opts.useFloatingToolbar !== false && document.getElementById("line-toolbar")) ? new LineToolbar(this) : null;
      injectSelectionBarStyles();
      this.selectionToolbar = new SelectionToolbar(this);
      this._render();
      this._normalizeDOM();
      this._syncLinesFromDOM();
      this._bindGlobal();
      // Root-level event delegation
      this.rootEl.addEventListener('input', (e) => this._onInput(e));
      this.rootEl.addEventListener('keydown', (e) => this._onKeyDown(e));
      this.rootEl.addEventListener('paste', (e) => this._onPaste(e));
      this.rootEl.addEventListener('focusin', () => this._updateActiveFromSelection());
      this.rootEl.addEventListener('click', () => this._updateActiveFromSelection());
    }

    _makeLine(text, opts = {}) {
      return {
        id: uid(),
        text: text || "",
        html: opts.html || "",
        color: opts.color || "",
        indent: typeof opts.indent === "number" ? opts.indent : 0,
        gap: typeof opts.gap === "number" ? opts.gap : 0, // additional top gap (in rem-multipliers)
      };
    }

    // --- Rendering ---
    _render() {
      this.rootEl.innerHTML = "";
      this.lines.forEach((line) => {
        const el = document.createElement("div");
        el.className = "poem-line";
        el.dataset.id = line.id;
        el.style.setProperty("--line-color", line.color || "inherit");
        el.style.setProperty("--indent", String(line.indent || 0));
        el.style.setProperty("--line-gap", String(line.gap || 0));
        if (line.html && line.html.length > 0) {
          el.innerHTML = line.html;
        } else if (line.text && line.text.length > 0) {
          el.textContent = line.text;
        } else {
          el.innerHTML = '<br>';
        }
        this.rootEl.appendChild(el);
      });
      // focus caret to end of active line if present
      const activeEl = this._elById(this.activeLineId) || this.rootEl.lastElementChild;
      if (activeEl) this._moveCaretToEnd(activeEl);
    }

    _bindGlobal() {
      // Hide toolbar when clicking outside
      if (this.toolbar) {
        document.addEventListener("click", (e) => {
          if (!this.toolbar.el.contains(e.target) && !this.rootEl.contains(e.target)) {
            this.toolbar.hide();
          }
        });
      }
    }

    // --- Root-level editing helpers (single contenteditable) ---
    _getLineEls() {
      return Array.from(this.rootEl.querySelectorAll(':scope > .poem-line'));
    }

    _normalizeDOM() {
      // Ensure all direct children are .poem-line wrappers
      const children = Array.from(this.rootEl.childNodes);
      for (const node of children) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('poem-line')) continue;
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '') {
          this.rootEl.removeChild(node);
          continue;
        }
        const wrap = document.createElement('div');
        wrap.className = 'poem-line';
        wrap.dataset.id = uid();
        if (node.nodeType === Node.ELEMENT_NODE) {
          // move element inside
          this.rootEl.insertBefore(wrap, node);
          wrap.appendChild(node);
        } else {
          // text node
          this.rootEl.insertBefore(wrap, node);
          wrap.appendChild(node);
        }
      }
      // Ensure at least one line exists
      if (this._getLineEls().length === 0) {
        const el = document.createElement('div');
        el.className = 'poem-line';
        el.dataset.id = this.activeLineId || uid();
        el.innerHTML = '<br>';
        this.rootEl.appendChild(el);
      }
      // Ensure every line has an id
      this._getLineEls().forEach((el) => {
        if (!el.dataset.id) el.dataset.id = uid();
      });
    }

    _syncLinesFromDOM() {
      const els = this._getLineEls();
      const newLines = [];
      for (const el of els) {
        const id = el.dataset.id || uid();
        el.dataset.id = id;
        const existing = this._lineById(id);
        // read CSS vars from inline style if present
        const indentVar = el.style.getPropertyValue('--indent');
        const gapVar = el.style.getPropertyValue('--line-gap');
        const colorVar = el.style.getPropertyValue('--line-color');
        const line = this._makeLine('', existing || {});
        line.id = id;
        line.html = el.innerHTML;
        line.text = el.textContent;
        if (indentVar) line.indent = parseInt(indentVar, 10) || 0;
        if (gapVar) line.gap = parseFloat(gapVar) || 0;
        if (colorVar) line.color = colorVar;
        // reflect vars onto element to keep CSS in sync
        el.style.setProperty('--indent', String(line.indent || 0));
        el.style.setProperty('--line-gap', String(line.gap || 0));
        el.style.setProperty('--line-color', line.color || 'inherit');
        newLines.push(line);
      }
      this.lines = newLines.length ? newLines : [this._makeLine("")];
      // fix active id if needed
      if (!this.lines.find(l => l.id === this.activeLineId)) {
        this.activeLineId = this.lines[0].id;
      }
      return this.lines;
    }

    _getCurrentLineEl() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const container = sel.getRangeAt(0).startContainer;
      if (!(container instanceof Node)) return null;
      if (container.nodeType === Node.ELEMENT_NODE && container.classList && container.classList.contains('poem-line')) return container;
      return container.parentElement ? container.parentElement.closest('.poem-line') : null;
    }

    _updateActiveFromSelection() {
      const lineEl = this._getCurrentLineEl();
      if (!lineEl) return;
      const id = lineEl.dataset.id;
      if (!id) return;
      this.activeLineId = id;
      if (this.toolbar) this.toolbar.showForLine(id, lineEl, this._lineById(id), { repositionOnly: true });
      this._emitActiveChange();
    }

    _onInput() {
      this._normalizeDOM();
      this._syncLinesFromDOM();
      // keep toolbar positioned
      const lineEl = this._getCurrentLineEl();
      if (lineEl && this.toolbar) this.toolbar.showForLine(lineEl.dataset.id, lineEl, this._lineById(lineEl.dataset.id), { repositionOnly: true });
    }

    _onKeyDown(e) {
      const el = this._getCurrentLineEl();
      if (!el) return;
      const id = el.dataset.id;
      const idx = this._indexById(id);
      const line = this.lines[idx];
      const caret = this._caretOffset(el);

      // Shift+Enter -> soft break in the same line
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        this._updateLineFromEl(el, line);
        return;
      }

      // Enter -> split into new visual line wrapper
      if (e.key === 'Enter') {
        e.preventDefault();
        const { newEl } = this._splitCurrentLineAtCaret(el, idx);
        if (newEl) this._setCaretOffset(newEl, 0);
        return;
      }

      // Backspace at start -> merge with previous line
      if (e.key === 'Backspace' && caret === 0 && idx > 0) {
        e.preventDefault();
        const prev = this.lines[idx - 1];
        const prevEl = this._elById(prev.id);
        const prevLen = (prevEl ? prevEl.textContent : prev.text).length;
        const curHtml = el.innerHTML;
        const prevHtml = prevEl ? prevEl.innerHTML : (prev.html || (prev.text || ""));
        const mergedHtml = (prevHtml || "") + (curHtml || "");
        prev.html = mergedHtml;
        prev.text = (prevEl ? (prevEl.textContent + el.textContent) : (prev.text + line.text));
        if (prevEl) prevEl.innerHTML = mergedHtml;
        // remove current line element and model
        this.lines.splice(idx, 1);
        this.activeLineId = prev.id;
        this._render();
        const newPrevEl = this._elById(prev.id) || prevEl;
        if (newPrevEl) this._setCaretOffset(newPrevEl, prevLen);
        return;
      }

      // Tab / Shift+Tab -> indent +/-
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          line.indent = Math.max(0, (line.indent || 0) - 1);
        } else {
          line.indent = Math.min(24, (line.indent || 0) + 1);
        }
        el.style.setProperty('--indent', String(line.indent));
        return;
      }

      // Cmd/Ctrl + Up/Down -> move line
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const swapWith = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= this.lines.length) return;
        const tmp = this.lines[swapWith];
        this.lines[swapWith] = this.lines[idx];
        this.lines[idx] = tmp;
        this.activeLineId = this.lines[swapWith].id;
        this._render();
      }
    }

    _onPaste(e) {
      e.preventDefault();
      let el = this._getCurrentLineEl();
      if (!el) return;
      const id = el.dataset.id;
      const idx = this._indexById(id);
      const pasteText = (e.clipboardData || window.clipboardData).getData('text');
      const parts = pasteText.split(/\r?\n/);
      // Insert first part at current caret to preserve inline styles around caret
      document.execCommand('insertText', false, parts[0]);
      // Persist to model
      this._updateLineFromEl(el, this.lines[idx]);
      // For subsequent parts, split and insert
      for (let i = 1; i < parts.length; i++) {
        const { newLine, newEl } = this._splitCurrentLineAtCaret(el, idx);
        if (newEl) {
          newEl.focus();
          document.execCommand('insertText', false, parts[i]);
          this._updateLineFromEl(newEl, newLine);
          // advance
          el = newEl;
        }
      }
    }

    // --- Helpers ---
    _indexById(id) {
      return this.lines.findIndex((l) => l.id === id);
    }
    _lineById(id) {
      return this.lines[this._indexById(id)];
    }
    _elById(id) {
      return this.rootEl.querySelector(`.poem-line[data-id="${id}"]`);
    }
    getActiveLine() {
      const id = this.activeLineId;
      return { id, line: this._lineById(id) };
    }
    _caretOffset(el) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return 0;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.startContainer)) return 0;
      // Flatten to text content offset
      const preRange = range.cloneRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.startContainer, range.startOffset);
      return preRange.toString().length;
    }
    _setCaretOffset(el, offset) {
      el.focus();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      let count = 0;
      while (node) {
        const nextCount = count + node.nodeValue.length;
        if (offset <= nextCount) {
          const range = document.createRange();
          range.setStart(node, Math.max(0, offset - count));
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
        count = nextCount;
        node = walker.nextNode();
      }
      // fallback to end
      this._moveCaretToEnd(el);
    }
    _moveCaretToEnd(el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // HTML-preserving helpers
    _updateLineFromEl(el, line) {
      if (!line) return;
      line.html = el.innerHTML;
      line.text = el.textContent;
    }
    _fragmentToHTML(frag) {
      const tmp = document.createElement('div');
      tmp.appendChild(frag);
      return tmp.innerHTML;
    }
    _splitCurrentLineAtCaret(el, idxOrLineIdx) {
      const idx = typeof idxOrLineIdx === 'number' ? idxOrLineIdx : this._indexById(el.dataset.id);
      const line = this.lines[idx];
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { newLine: null, newEl: null };
      // Delete selection content first to make caret collapsed
      if (!sel.isCollapsed) document.execCommand('delete');
      const range = sel.getRangeAt(0);
      // Build left and right fragments
      const full = document.createRange();
      full.selectNodeContents(el);
      const left = full.cloneRange();
      left.setEnd(range.startContainer, range.startOffset);
      const right = full.cloneRange();
      right.setStart(range.endContainer, range.endOffset);
      const leftHTML = this._fragmentToHTML(left.cloneContents());
      const rightHTML = this._fragmentToHTML(right.cloneContents());
      // Update current line
      el.innerHTML = leftHTML || '<br>';
      this._updateLineFromEl(el, line);
      // Create new line after current
      const newLine = this._makeLine('', line);
      newLine.html = rightHTML;
      // text will be filled after render via DOM
      this.lines.splice(idx + 1, 0, newLine);
      this.activeLineId = newLine.id;
      this._render();
      const newEl = this._elById(newLine.id);
      if (newEl) this._updateLineFromEl(newEl, newLine);
      return { newLine, newEl };
    }

    // --- Event handlers ---
    _onFocusLine(e) {
      const el = e.currentTarget;
      const id = el.dataset.id;
      this.activeLineId = id;
      if (this.toolbar) this.toolbar.showForLine(id, el, this._lineById(id));
      this._emitActiveChange();
    }

    _onInputLine(e) {
      const el = e.currentTarget;
      const id = el.dataset.id;
      const line = this._lineById(id);
      if (!line) return;
      // Persist both html and plain text
      line.html = el.innerHTML;
      line.text = el.textContent;
      if (!line.text || line.text.length === 0) {
        // keep an editable cursor target for empty lines
        el.innerHTML = '<br>';
      }
      // keep toolbar in sync
      if (this.toolbar) this.toolbar.showForLine(id, el, line, { repositionOnly: true });
    }

    _emitActiveChange() {
      try {
        const detail = this.getActiveLine();
        this.rootEl.dispatchEvent(new CustomEvent('poem:active-change', { detail }));
      } catch (e) { /* no-op if CustomEvent unavailable */ }
    }

    _onPasteLine(e) {
      e.preventDefault();
      const el = e.currentTarget;
      const id = el.dataset.id;
      const lineIdx = this._indexById(id);
      const pasteText = (e.clipboardData || window.clipboardData).getData("text");
      const parts = pasteText.split(/\r?\n/);
      // Insert first part at current caret to preserve inline styles around caret
      document.execCommand('insertText', false, parts[0]);
      // Persist to model
      this._updateLineFromEl(el, this.lines[lineIdx]);
      // For subsequent parts, split and insert
      for (let i = 1; i < parts.length; i++) {
        const { newLine, newEl } = this._splitCurrentLineAtCaret(el, lineIdx);
        if (newEl) {
          newEl.focus();
          document.execCommand('insertText', false, parts[i]);
          this._updateLineFromEl(newEl, newLine);
          el = newEl; // advance
        }
      }
    }

    _onKeyDownLine(e) {
      const el = e.currentTarget;
      const id = el.dataset.id;
      const idx = this._indexById(id);
      const line = this.lines[idx];
      const caret = this._caretOffset(el);

      // Shift+Enter -> soft break within the same line (insert "\n")
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        this._updateLineFromEl(el, line);
        return;
      }

      // Enter -> split line
      if (e.key === "Enter") {
        e.preventDefault();
        const { newLine, newEl } = this._splitCurrentLineAtCaret(el, idx);
        if (newEl) this._setCaretOffset(newEl, 0);
        return;
      }

      // Backspace at start -> merge with previous
      if (e.key === "Backspace" && caret === 0 && idx > 0) {
        e.preventDefault();
        const prev = this.lines[idx - 1];
        const prevEl = this._elById(prev.id);
        const prevLen = (prevEl ? prevEl.textContent : prev.text).length;
        // Merge HTML contents
        const curHtml = el.innerHTML;
        const prevHtml = prevEl ? prevEl.innerHTML : (prev.html || (prev.text || ""));
        const mergedHtml = (prevHtml || "") + (curHtml || "");
        prev.html = mergedHtml;
        prev.text = (prevEl ? (prevEl.textContent + el.textContent) : (prev.text + line.text));
        if (prevEl) prevEl.innerHTML = mergedHtml;
        // drop current line
        this.lines.splice(idx, 1);
        this.activeLineId = prev.id;
        this._render();
        const newPrevEl = this._elById(prev.id) || prevEl;
        if (newPrevEl) this._setCaretOffset(newPrevEl, prevLen);
        return;
      }

      // Tab / Shift+Tab -> indent +/-
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          line.indent = Math.max(0, (line.indent || 0) - 1);
        } else {
          line.indent = Math.min(24, (line.indent || 0) + 1);
        }
        el.style.setProperty("--indent", String(line.indent));
        return;
      }

      // Cmd/Ctrl + Up/Down -> move line
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const swapWith = e.key === "ArrowUp" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= this.lines.length) return;
        const tmp = this.lines[swapWith];
        this.lines[swapWith] = this.lines[idx];
        this.lines[idx] = tmp;
        this.activeLineId = this.lines[swapWith].id;
        this._render();
      }
    }

    // --- Toolbar integration ---
    applyLineStyle(id, { color, indent, gap }) {
      const line = this._lineById(id);
      if (!line) return;
      const el = this._elById(id);
      if (typeof color !== "undefined") {
        line.color = color;
        if (el) el.style.setProperty("--line-color", color || "inherit");
      }
      if (typeof indent === "number") {
        line.indent = Math.max(0, Math.min(24, indent));
        if (el) el.style.setProperty("--indent", String(line.indent));
      }
      if (typeof gap === "number") {
        line.gap = Math.max(0, Math.min(4, gap));
        if (el) el.style.setProperty("--line-gap", String(line.gap));
      }
    }

    // Export helpers
    toJSON() {
      return {
        title: "",
        lines: this.lines.map((l) => ({ id: l.id, text: l.text, html: l.html || "", color: l.color, indent: l.indent, spacing: l.gap })),
      };
    }

    loadFromText(text) {
      const arr = text.split(/\r?\n/).map((t) => this._makeLine(t));
      this.lines = arr.length ? arr : [this._makeLine("")];
      this.activeLineId = this.lines[0].id;
      this._render();
    }
  }

  class LineToolbar {
    constructor(editor) {
      this.editor = editor;
      this.el = document.getElementById("line-toolbar");
      this.colorInput = this.el.querySelector("input[type=color]");
      this.indentMinus = this.el.querySelector('[data-action="indent-"]');
      this.indentPlus = this.el.querySelector('[data-action="indent+"]');
      this.spacing = this.el.querySelector("input[type=range]");
      this.palette = this.el.querySelector(".palette");

      this.currentLineId = null;
      this.anchorEl = null;

      this._bind();
    }

    _bind() {
      if (this.colorInput) {
        this.colorInput.addEventListener("input", () => {
          this.editor.applyLineStyle(this.currentLineId, { color: this.colorInput.value });
        });
      }
      if (this.indentMinus) {
        this.indentMinus.addEventListener("click", () => {
          const line = this.editor._lineById(this.currentLineId);
          if (!line) return;
          this.editor.applyLineStyle(this.currentLineId, { indent: Math.max(0, (line.indent || 0) - 1) });
        });
      }
      if (this.indentPlus) {
        this.indentPlus.addEventListener("click", () => {
          const line = this.editor._lineById(this.currentLineId);
          if (!line) return;
          this.editor.applyLineStyle(this.currentLineId, { indent: Math.min(24, (line.indent || 0) + 1) });
        });
      }
      if (this.spacing) {
        this.spacing.addEventListener("input", () => {
          const v = parseFloat(this.spacing.value);
          this.editor.applyLineStyle(this.currentLineId, { gap: isNaN(v) ? 0 : v });
        });
      }
      // Palette chip clicks
      this.palette.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        const color = chip.dataset.color || window.getComputedStyle(chip).backgroundColor;
        if (this.colorInput) this.colorInput.value = this._rgbToHex(color);
        this.editor.applyLineStyle(this.currentLineId, { color: this._rgbToHex(color) });
      });
    }

    showForLine(lineId, anchorEl, line, opts = {}) {
      this.currentLineId = lineId;
      this.anchorEl = anchorEl;

      // Sync controls
      if (!opts.repositionOnly) {
        if (this.colorInput) {
          if (line.color) this.colorInput.value = this._normalizeColorValue(line.color);
          else this.colorInput.value = "#333333";
        }
        if (this.spacing) this.spacing.value = String(line.gap || 0);
      }

      const rect = anchorEl.getBoundingClientRect();
      this.el.style.top = window.scrollY + rect.top - this.el.offsetHeight - 8 + "px";
      this.el.style.left = window.scrollX + rect.left + "px";
      this.el.classList.remove("hidden");
    }

    hide() {
      this.el.classList.add("hidden");
    }

    _rgbToHex(rgb) {
      // Support rgb(a) or hex
      if (rgb.startsWith("#")) return rgb;
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return "#000000";
      const r = (+m[1]).toString(16).padStart(2, "0");
      const g = (+m[2]).toString(16).padStart(2, "0");
      const b = (+m[3]).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }

    _normalizeColorValue(val) {
      if (!val) return "#333333";
      if (val.startsWith("#")) return val;
      return this._rgbToHex(val);
    }
  }

  // Mount
  window.PoemEditor = PoemEditor;
})();
