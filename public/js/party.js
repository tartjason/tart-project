document.addEventListener('DOMContentLoaded', () => {
  const authContainer = document.getElementById('auth-container');
  const appRoot = document.querySelector('.app');
  const sidebarToggleBtn = document.getElementById('sidebar-toggle');
  const partyContent = document.getElementById('party-content');
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');

  const setSidebarState = (open) => {
    if (!appRoot) return;
    appRoot.classList.toggle('sidebar-open', !!open);
    appRoot.classList.toggle('sidebar-closed', !open);
    if (sidebarToggleBtn) sidebarToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  // --- Client-side image compression to avoid 413 payload too large ---
  async function compressImageFile(file, { maxDim = 1600, quality = 0.85 } = {}) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            let { width, height } = img;
            if (width <= 0 || height <= 0) { resolve(null); return; }
            // Scale within maxDim box while preserving aspect ratio
            const scale = Math.min(1, maxDim / Math.max(width, height));
            const w = Math.max(1, Math.round(width * scale));
            const h = Math.max(1, Math.round(height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/jpeg', quality);
            resolve(out);
          } catch(_) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target && e.target.result ? String(e.target.result) : ''; };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch(_) { resolve(null); }
    });
  }

  // --- Equal height without padding: reveal more/less content ---
  let _eqResizeHandlerBound = false;
  function debounce(fn, wait = 120) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); }; }

  function clearEqualizeVars(card) {
    card.style.removeProperty('--media-h');
    card.style.removeProperty('--poetry-max-h');
  }

  function groupCardsByRow(cards) {
    const rows = [];
    const byTop = new Map();
    cards.forEach((c) => {
      const top = c.offsetTop;
      // normalize by rounding to avoid sub-pixel grouping issues
      const key = Math.round(top / 2) * 2;
      if (!byTop.has(key)) byTop.set(key, []);
      byTop.get(key).push(c);
    });
    // sort by visual order
    Array.from(byTop.keys()).sort((a,b)=>a-b).forEach(k => rows.push(byTop.get(k)));
    return rows;
  }

  function equalizeRow(row) {
    if (!row || !row.length) return;
    // reset first to measure natural collapsed heights
    row.forEach(clearEqualizeVars);
    const target = Math.max(...row.map(c => c.offsetHeight));
    row.forEach((card) => {
      const cur = card.offsetHeight;
      const need = target - cur;
      if (need <= 0) return;
      // Prefer to reveal in media/poetry preview blocks
      const img = card.querySelector('.media');
      const poem = card.querySelector('.poetry-preview-mini');
      if (img && !card.classList.contains('expanded')) {
        const baseH = img.clientHeight || 0;
        const newH = Math.max(120, baseH + need);
        card.style.setProperty('--media-h', newH + 'px');
      } else if (poem && !card.classList.contains('expanded')) {
        const visible = poem.clientHeight || 0;
        const total = poem.scrollHeight || visible + need;
        const newMax = Math.min(total, visible + need);
        card.style.setProperty('--poetry-max-h', newMax + 'px');
      }
    });
  }

  function equalizeStudioRows() {
    if (!studioGrid) return;
    const expanded = studioGrid.querySelector('.studio-card.expanded');
    // Skip equalization when a card is expanded to avoid fighting layout
    if (expanded) return;
    const cards = Array.from(studioGrid.querySelectorAll('.studio-card'));
    if (!cards.length) return;
    const rows = groupCardsByRow(cards);
    rows.forEach(equalizeRow);
  }

  function setupEqualizeObservers() {
    if (!studioGrid) return;
    // Re-equalize when any media finishes loading
    const imgs = studioGrid.querySelectorAll('.studio-card .media');
    imgs.forEach((img) => {
      if (img.complete) return; // will be accounted for in initial pass
      img.addEventListener('load', () => equalizeStudioRows(), { once: true });
      img.addEventListener('error', () => equalizeStudioRows(), { once: true });
    });
    // Single resize handler
    if (!_eqResizeHandlerBound) {
      _eqResizeHandlerBound = true;
      window.addEventListener('resize', debounce(equalizeStudioRows, 120));
      window.addEventListener('load', () => {
        equalizeStudioRows();
        setTimeout(equalizeStudioRows, 150);
      });
    }
    // Observe card size changes (e.g., fonts, async content)
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(debounce(() => equalizeStudioRows(), 60));
      studioGrid.querySelectorAll('.studio-card').forEach((c) => ro.observe(c));
      // Keep a ref to avoid GC while in scope
      studioGrid._eqRO = ro;
    }
  }

  // Lazily load comments for cards that become visible
  function setupCommentsLazyLoading() {
    if (!studioGrid) return;
    // Disconnect any previous observer
    if (studioGrid._commentsIO && typeof studioGrid._commentsIO.disconnect === 'function') {
      try { studioGrid._commentsIO.disconnect(); } catch (_) {}
    }
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const card = entry.target;
            io.unobserve(card);
            loadCommentsForCard(card, true);
          }
        });
      }, { root: null, rootMargin: '200px 0px', threshold: 0.01 });
      studioGrid.querySelectorAll('.studio-card').forEach((c) => io.observe(c));
      studioGrid._commentsIO = io;
    } else {
      // Fallback: load a few initial cards
      const first = Array.from(studioGrid.querySelectorAll('.studio-card')).slice(0, 3);
      first.forEach((c) => loadCommentsForCard(c, true));
    }
  }

  function estimateDataUrlBytes(dataUrl) {
    try {
      if (!dataUrl || typeof dataUrl !== 'string') return 0;
      const idx = dataUrl.indexOf(',');
      const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
      // Base64 encoded length -> bytes approximation
      return Math.floor((b64.length * 3) / 4);
    } catch(_) { return 0; }
  }

  // Initialize sidebar default state: open on desktop, closed on small screens
  if (window.innerWidth <= 680) {
    setSidebarState(false);
  } else {
    setSidebarState(true);
  }

  // --- Background Fireflies ---
  function createFireflies() {
    try {
      // Avoid duplicating layer if hot reloaded
      if (document.querySelector('.party-fireflies')) return;
      const layer = document.createElement('div');
      layer.className = 'party-fireflies';
      document.body.appendChild(layer);
      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const count = prefersReduced ? 10 : Math.min(28, Math.max(14, Math.round(window.innerWidth / 48)));
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        // Randomize path variant and direction
        const useV2 = Math.random() < 0.5;
        const reverse = Math.random() < 0.5;
        el.className = 'party-firefly' + (useV2 ? ' v2' : '') + (reverse ? ' rev' : '');
        // Randomize variables for flight path and look
        const size = (Math.random() * 2.2 + 1.8).toFixed(2) + 'px';
        const y0 = (Math.random() * 90).toFixed(1) + 'vh';
        const amp = (Math.random() * 24 - 12).toFixed(1) + 'vh';
        const dur = (Math.random() * 18 + 16).toFixed(1) + 's';
        const delay = (Math.random() * 8).toFixed(2) + 's';
        const blink = Math.round(Math.random() * 1600 + 1400) + 'ms';
        el.style.setProperty('--sz', size);
        el.style.setProperty('--y0', y0);
        el.style.setProperty('--amp', amp);
        el.style.setProperty('--dur', dur);
        el.style.setProperty('--delay', delay);
        el.style.setProperty('--blink', blink);
        // Random initial position within viewport to avoid all starting off-screen
        const left = Math.round(Math.random() * 100);
        const top = Math.round(Math.random() * 100);
        el.style.left = left + 'vw';
        el.style.top = top + 'vh';
        layer.appendChild(el);
      }
    } catch(_) { /* ignore */ }
  }
  createFireflies();

  // --- Bottom Cloud Footer (replaces grass strip) ---
  function ensureCloudFooter() {
    try {
      let el = document.querySelector('.party-cloud');
      if (!el) {
        el = document.createElement('div');
        el.className = 'party-cloud';
        document.body.appendChild(el);
      }
      // Keep breathing space roughly equal to cloud height so content doesn't collide
      if (appRoot) {
        const desktop = window.innerWidth > 680;
        appRoot.style.setProperty('--breathing-extra', desktop ? '200px' : '160px');
      }
    } catch(_) { /* ignore */ }
  }
  ensureCloudFooter();
  window.addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => ensureCloudFooter(), 120); }; })());

  // --- Studio FAB + Modal Logic ---
  const $ = (sel) => document.querySelector(sel);
  const studioGrid = $('#studio-grid');
  const fab = $('#studio-add-btn');
  const modal = $('#studio-modal');
  const modalBackdrop = modal ? modal.querySelector('.studio-modal-backdrop') : null;
  const closeBtn = $('#studio-close');
  const cancelBtn = $('#studio-cancel');
  const saveBtn = $('#studio-save');
  const mediumSelect = $('#studio-medium');
  const drop = $('#studio-drop');
  const fileInput = $('#studio-file');
  const preview = $('#studio-preview');
  const previewImg = $('#studio-preview-img');
  const changeFileBtn = $('#studio-change-file');
  const titleInput = $('#studio-title');
  const descInput = $('#studio-desc');
  const statusSelect = $('#studio-status');
  const uploadWrap = $('#studio-upload-wrap');
  const poetryWrap = $('#studio-poetry-wrap');
  const poemMount = $('#studio-poem-editor');
  let pendingFile = null; // { type, dataUrl }
  let poemEditor = null;
  let currentUserId = null;
  let currentUserAvatarUrl = null;

  // --- Server-backed Studio Posts ---
  async function studioFetchPosts({ cursor, limit = 20 } = {}) {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', String(cursor));
    const url = '/api/studio-posts' + (qs.toString() ? `?${qs.toString()}` : '');
    const res = await fetch(url, { headers: {} });
    if (!res.ok) return { items: [], nextCursor: null };
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
    return { items, nextCursor: data.nextCursor || null };
  }
  async function studioCreatePost(payload) {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/studio-posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': t }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create');
    return res.json();
  }
  async function studioDeletePost(id) {
    const t = localStorage.getItem('token');
    const res = await fetch(`/api/studio-posts/${encodeURIComponent(String(id))}`, { method: 'DELETE', headers: { 'x-auth-token': t } });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
  }
  let _feed = { items: [], cursor: null, loading: false };
  async function renderStudioGrid(initial = false) {
    if (!studioGrid) return;
    if (initial) { _feed = { items: [], cursor: null, loading: false }; studioGrid.innerHTML = ''; }
    if (_feed.loading) return; _feed.loading = true;
    const { items, nextCursor } = await studioFetchPosts({ cursor: _feed.cursor, limit: 20 });
    // Merge results without duplicates (normalize by _id or id)
    const normalizeId = (p) => {
      const id = p && (p._id || p.id);
      return id != null ? String(id) : '';
    };
    const existing = new Set(_feed.items.map(normalizeId).filter(Boolean));
    const toAdd = Array.isArray(items) ? items.filter((p) => {
      const id = normalizeId(p);
      return id && !existing.has(id);
    }) : [];
    _feed.items.push(...toAdd);
    // Extra safety: ensure uniqueness if upstream returned duplicates
    const uniq = new Map();
    _feed.items.forEach((p) => {
      const id = normalizeId(p);
      if (id && !uniq.has(id)) uniq.set(id, p);
    });
    _feed.items = Array.from(uniq.values());
    _feed.cursor = nextCursor;
    if (_feed.items.length === 0) {
      studioGrid.innerHTML = '<div style="color:#94a3b8;">No studio posts yet. Click the + to add your first.</div>';
      _feed.loading = false; return;
    }
    studioGrid.innerHTML = _feed.items.map(p => renderStudioCard(p)).join('');
    // Hydrate cards: set artist id for permission checks
    _feed.items.forEach((p) => {
      const pid = p && (p._id || p.id);
      const card = studioGrid.querySelector(`.studio-card[data-id="${CSS.escape(String(pid))}"]`);
      if (card) {
        card._postArtistId = p.artist && p.artist._id ? String(p.artist._id) : '';
      }
    });
    // Rebind image load listeners for equalization and run once
    setupEqualizeObservers();
    // Lazily fetch comments for cards as they enter viewport
    setupCommentsLazyLoading();
    // Hydrate quick reactions UI on freshly rendered cards
    hydrateQuickReactionsUI();
    equalizeStudioRows();
    _feed.loading = false;
  }
  const renderStudioCard = (p) => {
    const isOwner = currentUserId && p.artist && p.artist._id && String(p.artist._id) === String(currentUserId);
    const avatar = (p.artist && p.artist.profilePictureUrl) || '/assets/default-avatar.svg';
    const artistId = p.artist && (p.artist._id || p.artist.id) ? String(p.artist._id || p.artist.id) : '';
    const artistName = (p.artist && (p.artist.name || p.artist.username)) || 'Artist';
    const profileHref = artistId ? `/account.html?artistId=${encodeURIComponent(artistId)}` : '#';
    if (p.kind === 'poetry') {
      const lines = Array.isArray(p.poem && p.poem.lines) ? p.poem.lines : [];
      const snippet = lines.slice(0, 10).map(l => `<div class="po-line">${(l.html||'').trim() || escapeHtml(l.text||'')}</div>`).join('');
      const fullPoem = lines.map(l => `<div class=\"po-line\">${(l.html||'').trim() || escapeHtml(l.text||'')}</div>`).join('');
      return `
        <article class="studio-card poetry" data-id="${p._id || p.id}">
          <div class="info">
            <div class="card-title-wrap">
              <a class="uploader-link" href="${profileHref}" title="View profile"><img class="uploader-avatar" src="${avatar}" alt="Uploader"/></a>
              <div class="title-block">
                <a class="uploader-name" href="${profileHref}">${escapeHtml(artistName)}</a>
                <h4>${p.title ? escapeHtml(p.title) : 'Untitled Poem'}</h4>
              </div>
            </div>
            ${p.desc ? `<p>${escapeHtml(p.desc)}</p>` : ''}
            <button type="button" class="enlarge-btn" data-action="enlarge" aria-label="Enlarge">⤢</button>
            ${renderStatusChip(p.status)}
            ${isOwner ? renderCardMenuButton() : ''}
          </div>
          <div class="poetry-preview-mini">${snippet || '<div class="po-line">(empty)</div>'}</div>
          <div class="poetry-full" hidden>
            <div class="viewer-poem">${fullPoem || '<div class=\"po-line\">(empty)</div>'}</div>
          </div>
          ${renderCommentsSection(String(p._id || p.id))}
        </article>
      `;
    }
    const isVideo = p.media && p.media.type && p.media.type.startsWith('video/');
    const src = p.media && p.media.src ? p.media.src : '';
    const mediaEl = isVideo
      ? `<video class="media" src="${src}" muted playsinline></video>`
      : `<img class="media" src="${src}" alt="${(p.title||'').replace(/\"/g,'&quot;')}"/>`;
    const mediaFull = isVideo
      ? `<video class=\"media-full viewer-media\" src=\"${src}\" controls playsinline></video>`
      : `<img class=\"media-full viewer-media\" src=\"${src}\" alt=\"${(p.title||'').replace(/\"/g,'&quot;')}\"/>`;
    return `
      <article class="studio-card" data-id="${p._id || p.id}">
        <div class="info">
          <div class="card-title-wrap">
            <a class="uploader-link" href="${profileHref}" title="View profile"><img class="uploader-avatar" src="${avatar}" alt="Uploader"/></a>
            <div class="title-block">
              <a class="uploader-name" href="${profileHref}">${escapeHtml(artistName)}</a>
              <h4>${p.title ? escapeHtml(p.title) : 'Untitled'}</h4>
            </div>
          </div>
          ${p.desc ? `<p>${escapeHtml(p.desc)}</p>` : ''}
          <button type="button" class="enlarge-btn" data-action="enlarge" aria-label="Enlarge">⤢</button>
          ${renderStatusChip(p.status)}
          ${isOwner ? renderCardMenuButton() : ''}
        </div>
        ${mediaEl}
        <div class="media-full-wrap" hidden>
          ${mediaFull}
        </div>
        ${renderCommentsSection(String(p._id || p.id))}
      </article>
    `;
  };
  function renderCardMenuButton() {
    return `
      <div class=\"card-menu-wrap\">
        <button type=\"button\" class=\"card-menu-btn\" aria-haspopup=\"true\" aria-expanded=\"false\" title=\"More\">⋯</button>
        <div class=\"card-menu\" role=\"menu\" hidden>
          <button type=\"button\" class=\"menu-item delete-post\" role=\"menuitem\">Delete</button>
        </div>
      </div>
    `;
  }
  function renderStatusChip(status) {
    const s = (status || 'in-progress');
    const label = s === 'finished' ? 'Finished' : 'In progress';
    const icon = s === 'finished' ? '✓' : '⏳';
    return `<span class=\"status-chip ${s}\" title=\"${label}\" aria-label=\"${label}\" role=\"img\">${icon}</span>`;
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

  const openStudioModal = () => {
    if (!modal) return;
    // reset state
    pendingFile = null;
    if (preview) { preview.hidden = true; }
    if (drop) { drop.style.display = 'flex'; }
    if (fileInput) fileInput.value = '';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (statusSelect) statusSelect.value = 'in-progress';
    // default medium to poetry
    if (mediumSelect) mediumSelect.value = 'poetry';
    toggleMediumUI('poetry');
    // init poem editor lazily
    if (poemMount && !poemEditor && window.PoemEditor) {
      poemEditor = new window.PoemEditor(poemMount, { useFloatingToolbar: true });
    }
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  };
  const closeStudioModal = () => {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    // Reset upload UI so no stale preview persists on next open
    pendingFile = null;
    try {
      if (fileInput) fileInput.value = '';
      if (previewImg) previewImg.src = '';
      if (preview) preview.hidden = true;
      if (drop) drop.style.display = 'flex';
    } catch (_) { /* ignore */ }
  };

  const handleFiles = async (files) => {
    if (!files || !files.length) return;
    const f = files[0];
    // Images: compress before preview/save to avoid exceeding server payload limits
    if ((f.type || '').startsWith('image/')) {
      let dataUrl = await compressImageFile(f, { maxDim: 1600, quality: 0.85 });
      // Fallback to original if compression failed
      if (!dataUrl) {
        dataUrl = await new Promise((resolve) => {
          const r = new FileReader(); r.onload = (e) => resolve(e.target && e.target.result ? String(e.target.result) : ''); r.readAsDataURL(f);
        });
      }
      // If still too large (>6MB), compress more aggressively
      if (estimateDataUrlBytes(dataUrl) > 6 * 1024 * 1024) {
        const trySecond = await compressImageFile(f, { maxDim: 1280, quality: 0.76 });
        if (trySecond) dataUrl = trySecond;
      }
      pendingFile = { type: 'image/jpeg', dataUrl };
      if (previewImg) previewImg.src = dataUrl;
      if (preview) preview.hidden = false;
      if (drop) drop.style.display = 'none';
      return;
    }
    // Non-images: preview as-is (videos)
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target && e.target.result;
      pendingFile = { type: f.type || '', dataUrl };
      if (previewImg) previewImg.src = dataUrl;
      if (preview) preview.hidden = false;
      if (drop) drop.style.display = 'none';
    };
    reader.readAsDataURL(f);
  };

  if (fab) fab.addEventListener('click', openStudioModal);
  if (closeBtn) closeBtn.addEventListener('click', closeStudioModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeStudioModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeStudioModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStudioModal(); });

  if (drop) {
    drop.addEventListener('click', () => fileInput && fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput && fileInput.click(); } });
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.style.background = 'rgba(255,255,255,0.07)'; }));
    ;['dragleave','drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.style.background = 'rgba(255,255,255,0.04)'; }));
    drop.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files) handleFiles(dt.files);
    });
  }

  // --- Comments API (server-backed) ---
  async function studioFetchComments(postId, cursor, limit = 10) {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', String(cursor));
    if (limit) qs.set('limit', String(limit));
    const url = `/api/studio/posts/${encodeURIComponent(String(postId))}/comments` + (qs.toString() ? `?${qs.toString()}` : '');
    const res = await fetch(url, { headers: {} });
    if (!res.ok) return { comments: [], nextCursor: null };
    return res.json();
  }
  async function studioPostComment(postId, text) {
    const t = localStorage.getItem('token');
    const res = await fetch(`/api/studio/posts/${encodeURIComponent(String(postId))}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': t }, body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error('Failed to post');
    return res.json();
  }
  async function studioPostReply(commentId, text) {
    const t = localStorage.getItem('token');
    const res = await fetch(`/api/studio/comments/${encodeURIComponent(String(commentId))}/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': t }, body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error('Failed to reply');
    return res.json();
  }
  async function studioToggleLike(commentOrReplyId, like) {
    const t = localStorage.getItem('token');
    const res = await fetch(`/api/studio/comments/${encodeURIComponent(String(commentOrReplyId))}/like`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-auth-token': t }, body: JSON.stringify({ like: !!like })
    });
    if (!res.ok) throw new Error('Failed to like');
    return res.json();
  }
  async function studioDeleteCommentOrReply(id) {
    const t = localStorage.getItem('token');
    const res = await fetch(`/api/studio/comments/${encodeURIComponent(String(id))}`, { method: 'DELETE', headers: { 'x-auth-token': t } });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
  }

  // --- Quick Reactions (client-side, local persistence) ---
  const QR_STORAGE_KEY = 'partyQuickReactions:v1';
  function readQRStore() {
    try { return JSON.parse(localStorage.getItem(QR_STORAGE_KEY) || '{}') || {}; } catch(_) { return {}; }
  }
  function writeQRStore(store) {
    try { localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(store || {})); } catch(_) {}
  }
  function getPostReactions(postId) {
    const s = readQRStore();
    const arr = Array.isArray(s[postId]) ? s[postId] : [];
    // de-dup by userId keeping last
    const byU = new Map();
    arr.forEach(it => { if (it && it.userId) byU.set(String(it.userId), it); });
    return Array.from(byU.values());
  }
  function setUserReaction(postId, user) {
    // user = { userId, avatarUrl, emoji }
    const s = readQRStore();
    const arr = Array.isArray(s[postId]) ? s[postId] : [];
    const idx = arr.findIndex(it => String(it.userId) === String(user.userId));
    if (idx >= 0) arr[idx] = user; else arr.push(user);
    s[postId] = arr;
    writeQRStore(s);
  }
  function clearUserReaction(postId, userId) {
    const s = readQRStore();
    const arr = Array.isArray(s[postId]) ? s[postId] : [];
    s[postId] = arr.filter(it => String(it.userId) !== String(userId));
    writeQRStore(s);
  }

  function renderQRMin(container, reactions) {
    if (!container) return;
    const avatars = container.querySelector('.qr-avatars');
    if (!avatars) return;
    const maxCircles = 3;
    const extra = Math.max(0, reactions.length - maxCircles);
    const show = extra > 0 ? reactions.slice(0, maxCircles - 1) : reactions.slice(0, maxCircles);
    let html = '';
    if (reactions.length === 1) {
      const r = reactions[0];
      html = `
        <span class="qr-avatar" style="z-index:30" title="${r.emoji || ''}">
          <img src="${r.avatarUrl || '/assets/default-avatar.svg'}" alt=""/>
          ${r.emoji ? `<span class="qr-badge-emoji">${r.emoji}</span>` : ''}
        </span>
      `;
    } else {
      html = show.map((r, i) => `
        <span class="qr-avatar" style="z-index:${30 - i}" title="${r.emoji || ''}">
          <img src="${r.avatarUrl || '/assets/default-avatar.svg'}" alt=""/>
        </span>
      `).join('');
    }
    if (extra > 0) {
      const i = show.length; // third circle
      html += `<span class="qr-avatar more" style="z-index:${30 - i}">${extra}+</span>`;
    }
    avatars.innerHTML = html;
    container.hidden = reactions.length === 0;
  }
  function renderQRExpanded(container, reactions) {
    if (!container) return;
    const row = container.querySelector('.qr-row');
    if (!row) return;
    row.innerHTML = reactions.map((r) => `
      <span class="qr-badge" role="listitem" title="${r.emoji || ''}">
        <img class="qr-badge-avatar" src="${r.avatarUrl || '/assets/default-avatar.svg'}" alt=""/>
        <span class="qr-badge-emoji">${r.emoji || ''}</span>
      </span>
    `).join('');
  }
  function updateQuickReactionUIForCard(card) {
    const postId = card?.dataset?.id;
    if (!postId) return;
    const reactions = getPostReactions(postId);
    renderQRMin(card.querySelector('.quick-reaction-min'), reactions);
    const expanded = card.querySelector('.quick-reaction-expanded');
    if (expanded && !expanded.hidden) renderQRExpanded(expanded, reactions);
  }
  function hydrateQuickReactionsUI() {
    if (!studioGrid) return;
    studioGrid.querySelectorAll('.studio-card').forEach((card) => updateQuickReactionUIForCard(card));
  }
  function renderCommentsSection(postId) {
    // Artwork-like shell
    return `
      <div class="comments-shell">
        <div class="comment-hint-smiley" role="button" tabindex="0" aria-label="Send a quick reaction" title="Send a quick reaction">
          <svg class="smiley" width="52" height="52" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
            <circle cx="30" cy="30" r="22" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.22" />
            <circle cx="23" cy="26" r="2.2" fill="#9ca3af" fill-opacity="0.7" />
            <circle cx="37" cy="26" r="2.2" fill="#9ca3af" fill-opacity="0.7" />
            <path d="M21 36c3 4 15 4 18 0" fill="none" stroke="#9ca3af" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.7" />
          </svg>
        </div>
        <!-- Quick Reactions UI -->
        <div class="quick-reaction-min" data-post-id="${postId}" hidden>
          <div class="qr-avatars" aria-label="People who reacted"></div>
        </div>
        <div class="quick-reaction-picker" data-post-id="${postId}" hidden>
          <div class="qr-grid">
            <button type="button" class="qr-emoji" data-emoji="😆">😆</button>
            <button type="button" class="qr-emoji" data-emoji="🥹">🥹</button>
            <button type="button" class="qr-emoji" data-emoji="😭">😭</button>
            <button type="button" class="qr-emoji" data-emoji="🤔">🤔</button>
            <button type="button" class="qr-emoji" data-emoji="🥳">🥳</button>
            <button type="button" class="qr-emoji" data-emoji="❤️">❤️</button>
          </div>
        </div>
        <div class="quick-reaction-expanded" data-post-id="${postId}" hidden>
          <div class="qr-row" role="list"></div>
        </div>
        <div class="comments-section studio-comments" data-post-id="${postId}">
          <ul class="comments-list"></ul>
          <div id="comments-load-more-${postId}" class="comments-load-more"></div>
          <form class="comment-form" autocomplete="off">
            <div class="form-group">
              <textarea class="form-textarea" name="comment" placeholder="Add a comment"></textarea>
              <button type="submit" class="submit-btn" aria-label="Post comment">
                <svg width="36" height="36" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <!-- Translucent circle -->
                  <circle cx="30" cy="30" r="20" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-opacity="0.32" />
                  <!-- Light grey arrow -->
                  <path d="M30 20 L30 40 M22 28 L30 20 L38 28" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
  function renderCommentItemHTML(c, ctx) {
    const name = (c.author && (c.author.name || c.author.username)) || 'Unknown';
    const av = (c.author && c.author.profilePictureUrl) || '/assets/default-avatar.svg';
    const canDelete = String(ctx.currentUserId) === String(c.author?._id) || String(ctx.currentUserId) === String(ctx.postArtistId);
    const likeCount = Number.isFinite(c.likesCount) ? c.likesCount : 0;
    const liked = !!c.likedByMe;
    const replies = Array.isArray(c.replies) ? c.replies : [];
    const repliesHTML = replies.map(r => renderReplyHTML(r, ctx)).join('');
    return `
      <li class="comment-item" data-id="${c._id}">
        <div class="comment-header">
          <div class="comment-avatar" style="background-image:url('${av}')"></div>
          <div class="comment-info">
            <div class="comment-author">${escapeHtml(name)}</div>
            <div class="comment-date"></div>
          </div>
          <button class="comment-heart ${liked ? 'liked' : ''}" data-action="like">
            <span class="heart-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path class="heart-shape" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.78 0 3.4.81 4.5 2.09C12.1 4.81 13.72 4 15.5 4 18 4 20 6 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </span>
            <span class="heart-count">${likeCount}</span>
          </button>
        </div>
        <div class="comment-content">${escapeHtml(c.text || '')}</div>
        <div class="comment-actions">
          <button class="comment-action" data-action="reply">Reply</button>
          ${canDelete ? '<button class="comment-action" data-action="delete">Delete</button>' : ''}
        </div>
        <div class="replies-container">${repliesHTML}</div>
        <div class="reply-form"><div class="form-group"><textarea class="form-textarea" placeholder="Write a reply…"></textarea></div><button type="button" class="submit-btn" data-action="submit-reply">Reply</button></div>
      </li>`;
  }
  function renderReplyHTML(r, ctx) {
    const name = (r.author && (r.author.name || r.author.username)) || 'Unknown';
    const av = (r.author && r.author.profilePictureUrl) || '/assets/default-avatar.svg';
    const likeCount = Number.isFinite(r.likesCount) ? r.likesCount : 0;
    const liked = !!r.likedByMe;
    const canDelete = String(ctx.currentUserId) === String(r.author?._id) || String(ctx.currentUserId) === String(ctx.postArtistId);
    return `
      <div class="reply-comment" data-id="${r._id}">
        <div class="comment-header">
          <div class="comment-avatar" style="background-image:url('${av}')"></div>
          <div class="comment-info">
            <div class="comment-author">${escapeHtml(name)}</div>
            <div class="comment-date"></div>
          </div>
          <button class="comment-heart ${liked ? 'liked' : ''}" data-action="like">
          <span class="heart-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path class="heart-shape" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.78 0 3.4.81 4.5 2.09C12.1 4.81 13.72 4 15.5 4 18 4 20 6 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </span>
          <span class="heart-count">${likeCount}</span>
        </button>
        </div>
        <div class="comment-content">${escapeHtml(r.text || '')}</div>
        <div class="comment-actions">
          <button class="comment-action" data-action="reply">Reply</button>
          ${canDelete ? '<button class="comment-action" data-action="delete">Delete</button>' : ''}
        </div>
        <div class="reply-form"><div class="form-group"><textarea class="form-textarea" placeholder="Write a reply…"></textarea></div><button type="button" class="submit-btn" data-action="submit-reply">Reply</button></div>
      </div>`;
  }
  async function loadCommentsForCard(cardEl, initial = true) {
    const postId = cardEl.dataset.id;
    if (!postId) return;
    const list = cardEl.querySelector('.studio-comments .comments-list');
    const loadMore = cardEl.querySelector(`#comments-load-more-${postId}`);
    cardEl._comments = cardEl._comments || { cursor: null, hasMore: true };
    const res = await studioFetchComments(postId, cardEl._comments.cursor, 10);
    const comments = Array.isArray(res.comments) ? res.comments : [];
    const nextCursor = res.nextCursor || null;
    const ctx = { currentUserId, postArtistId: (cardEl._postArtistId || '') };
    const isExpanded = cardEl.classList.contains('expanded');
    if (initial) list.innerHTML = '';
    const toRender = isExpanded ? comments : comments.slice(0, 2);
    list.insertAdjacentHTML('beforeend', toRender.map(c => renderCommentItemHTML(c, ctx)).join(''));
    cardEl._comments.cursor = nextCursor;
    cardEl._comments.hasMore = !!nextCursor && comments.length > 0;
    // render/clear load more
    if (loadMore) loadMore.innerHTML = '';
    // When not expanded, show a simple View all button instead of pagination
    if (!isExpanded) {
      const shouldShowViewAll = (comments.length > 2) || !!nextCursor;
      if (shouldShowViewAll && loadMore) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'load-more-btn'; btn.textContent = 'View all comments';
        btn.addEventListener('click', () => { const card = btn.closest('.studio-card'); if (!card) return; expandCard(card); loadCommentsForCard(card, true); });
        loadMore.appendChild(btn);
      }
      return;
    }
    if (cardEl._comments.hasMore) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'load-more-btn'; btn.textContent = 'Load more comments';
      btn.addEventListener('click', () => loadCommentsForCard(cardEl, false));
      if (loadMore) loadMore.appendChild(btn);
    }
    // Adjust heights after comments render for compact cards
    equalizeStudioRows();
  }

  // Delegate comment + reply actions
  if (studioGrid) {
    studioGrid.addEventListener('submit', async (e) => {
      // removed stray placeholder
      const form = e.target.closest('form.comment-form');
      if (!form) return;
      e.preventDefault();
      const wrap = form.closest('.studio-comments');
      const postId = wrap && wrap.dataset.postId;
      const input = form.querySelector('.form-textarea');
      const text = input && input.value ? input.value.trim() : '';
      if (!text) return;
      try { await studioPostComment(postId, text); input.value = ''; await loadCommentsForCard(form.closest('.studio-card'), true); } catch (err) { alert(err.message || 'Failed'); }
    });
    studioGrid.addEventListener('click', async (e) => {
      // like
      const likeBtn = e.target.closest('.comment-heart');
      if (likeBtn) {
        const item = likeBtn.closest('.comment-item, .reply-comment');
        if (!item) return;
        const id = item.dataset.id; const liked = likeBtn.classList.contains('liked');
        try {
          const r = await studioToggleLike(id, !liked);
          likeBtn.classList.toggle('liked', !liked);
          const countEl = likeBtn.querySelector('.heart-count');
          if (countEl) countEl.textContent = String(r.likesCount || 0);
        } catch (_) {}
        return;
      }
      // delete
      const del = e.target.closest('[data-action="delete"]');
      if (del) {
        const item = del.closest('.comment-item, .reply-comment'); if (!item) return; const id = item.dataset.id;
        if (!confirm('Delete this comment?')) return;
        try { await studioDeleteCommentOrReply(id); await loadCommentsForCard(del.closest('.studio-card'), true); } catch (_) {}
        return;
      }
      // reply (inline form like artwork)
      const reply = e.target.closest('[data-action="reply"]');
      if (reply) {
        const container = reply.closest('.comment-item, .reply-comment');
        if (!container) return;
        const form = container.querySelector('.reply-form');
        if (form) form.classList.toggle('active');
        return;
      }
      // submit inline reply
      const submitReply = e.target.closest('[data-action="submit-reply"]');
      if (submitReply) {
        const container = submitReply.closest('.comment-item, .reply-comment');
        if (!container) return;
        const textarea = container.querySelector('.reply-form .form-textarea');
        const text = textarea && textarea.value ? textarea.value.trim() : '';
        if (!text) return;
        // Always reply to the top-level comment id
        const parentCommentEl = container.closest('.comment-item');
        const commentId = parentCommentEl ? parentCommentEl.dataset.id : container.dataset.id;
        try { await studioPostReply(commentId, text); await loadCommentsForCard(submitReply.closest('.studio-card'), true); } catch (_) {}
        return;
      }
      // quick reactions: open picker via smiley
      const smiley = e.target.closest('.comment-hint-smiley');
      if (smiley) {
        const shell = smiley.closest('.comments-shell');
        if (!shell) return;
        // close other pickers
        document.querySelectorAll('.quick-reaction-picker').forEach(p => p.hidden = true);
        const picker = shell.querySelector('.quick-reaction-picker');
        if (picker) picker.hidden = !picker.hidden;
        return;
      }
      // quick reactions: emoji pick
      const emojiBtn = e.target.closest('.qr-emoji');
      if (emojiBtn) {
        const picker = emojiBtn.closest('.quick-reaction-picker');
        const postId = picker?.dataset?.postId;
        const card = emojiBtn.closest('.studio-card');
        const emoji = emojiBtn.getAttribute('data-emoji');
        if (!postId || !card || !emoji) return;
        if (!currentUserId) { openLoginPopup(); return; }
        setUserReaction(postId, { userId: String(currentUserId), avatarUrl: currentUserAvatarUrl || '/assets/default-avatar.svg', emoji });
        updateQuickReactionUIForCard(card);
        picker.hidden = true;
        return;
      }
      // quick reactions: toggle expanded from minimized avatars
      const minWrap = e.target.closest('.quick-reaction-min');
      if (minWrap) {
        const shell = minWrap.closest('.comments-shell');
        const card = minWrap.closest('.studio-card');
        const expanded = shell?.querySelector('.quick-reaction-expanded');
        if (!expanded || !card) return;
        const count = getPostReactions(card.dataset.id).length;
        if (count <= 1) { return; }
        if (expanded.hidden) {
          renderQRExpanded(expanded, getPostReactions(card.dataset.id));
          expanded.hidden = false;
          minWrap.hidden = true; // turn the stack into a row in-place
        } else {
          expanded.hidden = true;
          minWrap.hidden = false;
        }
        setTimeout(() => equalizeStudioRows(), 60);
        return;
      }
      // quick reactions: clicking expanded row collapses back to stack
      const expandedWrap = e.target.closest('.quick-reaction-expanded');
      if (expandedWrap) {
        const shell = expandedWrap.closest('.comments-shell');
        const minAgain = shell && shell.querySelector('.quick-reaction-min');
        expandedWrap.hidden = true;
        if (minAgain) minAgain.hidden = false;
        setTimeout(() => equalizeStudioRows(), 60);
        return;
      }
    });
  }

  if (fileInput) fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  // Allow clicking preview image to change file
  if (previewImg) previewImg.addEventListener('click', () => { if (fileInput) fileInput.click(); });

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const medium = mediumSelect ? mediumSelect.value : 'poetry';
      const title = (titleInput && titleInput.value) || '';
      const desc = (descInput && descInput.value) || '';
      const posts = _feed.items.slice();
      if (medium === 'poetry') {
        if (!poemEditor) {
          alert('Poem editor not ready.');
          return;
        }
        const poem = { lines: poemEditor.getLines() };
        const created = await studioCreatePost({ kind: 'poetry', poem, title, description: desc, status: (statusSelect && statusSelect.value) || 'in-progress' });
        posts.unshift(created);
      } else {
        if (!pendingFile || !pendingFile.dataUrl) {
          alert('Please select a file first.');
          return;
        }
        const created = await studioCreatePost({ kind: 'media', media: { type: pendingFile.type, src: pendingFile.dataUrl }, title, description: desc, status: (statusSelect && statusSelect.value) || 'in-progress' });
        posts.unshift(created);
      }
      closeStudioModal();
      _feed.items = posts; await renderStudioGrid(true);
    });
  }

  // initial render is triggered from setupAuthUI() to avoid double rendering

  // Medium UI toggle
  function toggleMediumUI(med) {
    const isPoetry = med === 'poetry';
    if (uploadWrap) uploadWrap.style.display = isPoetry ? 'none' : '';
    if (poetryWrap) poetryWrap.hidden = !isPoetry ? true : false;
  }
  if (mediumSelect) {
    mediumSelect.addEventListener('change', () => {
      const med = mediumSelect.value;
      toggleMediumUI(med);
    });
  }

  // In-place expand/collapse via delegation
  if (studioGrid) {
    studioGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('button.enlarge-btn');
      if (btn) {
        const card = btn.closest('.studio-card');
        if (!card) return;
        const alreadyExpanded = card.classList.contains('expanded');
        const open = studioGrid.querySelector('.studio-card.expanded');
        if (open && open !== card) collapseCard(open);
        if (alreadyExpanded) { collapseCard(card); } else { expandCard(card); loadCommentsForCard(card, true); }
        return;
      }
      const menuBtn = e.target.closest('button.card-menu-btn');
      if (menuBtn) {
        const wrap = menuBtn.closest('.card-menu-wrap');
        const menu = wrap && wrap.querySelector('.card-menu');
        if (menu) {
          const isHidden = menu.hasAttribute('hidden');
          menuBtn.setAttribute('aria-expanded', String(isHidden));
          if (isHidden) menu.removeAttribute('hidden'); else menu.setAttribute('hidden','');
        }
        e.stopPropagation();
        return;
      }
      const delBtn = e.target.closest('.menu-item.delete-post');
      if (delBtn) {
        const card = delBtn.closest('.studio-card');
        const id = card && card.dataset.id;
        if (!id) return;
        try { await studioDeletePost(id); } catch(_) {}
        await renderStudioGrid(true);
        return;
      }
    });
  }

  // Close any open card menus when clicking outside
  document.addEventListener('click', (e) => {
    const openMenus = document.querySelectorAll('.card-menu:not([hidden])');
    openMenus.forEach(m => {
      if (!m.contains(e.target)) {
        m.setAttribute('hidden','');
        const btn = m.closest('.card-menu-wrap')?.querySelector('.card-menu-btn');
        if (btn) btn.setAttribute('aria-expanded','false');
      }
    });
    // Close any open QR pickers/expanded when clicking outside their shell
    document.querySelectorAll('.quick-reaction-picker').forEach(p => {
      if (!p.hidden) {
        const shell = p.closest('.comments-shell');
        if (shell && !shell.contains(e.target)) p.hidden = true;
      }
    });
    document.querySelectorAll('.quick-reaction-expanded').forEach(x => {
      if (!x.hidden) {
        const shell = x.closest('.comments-shell');
        if (shell && !shell.contains(e.target)) {
          x.hidden = true;
          const minWrap = shell.querySelector('.quick-reaction-min');
          if (minWrap) minWrap.hidden = false;
        }
      }
    });
  });
  // Escape closes open QR panels
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.quick-reaction-picker').forEach(el => { el.hidden = true; });
      document.querySelectorAll('.quick-reaction-expanded').forEach(el => { 
        if (!el.hidden) {
          el.hidden = true; 
          const shell = el.closest('.comments-shell');
          const minWrap = shell && shell.querySelector('.quick-reaction-min');
          if (minWrap) minWrap.hidden = false;
        }
      });
    }
  });

  function expandCard(card) {
    card.classList.add('expanded');
    clearEqualizeVars(card);
    const sections = [
      card.querySelector('.poetry-full'),
      card.querySelector('.media-full-wrap'),
    ].filter(Boolean);
    // Next frame set maxHeight to enable slide-down
    requestAnimationFrame(() => {
      sections.forEach((el) => {
        // Set to auto size via scrollHeight
        el.style.maxHeight = el.scrollHeight + 'px';
        el.style.opacity = '1';
        // After transition, remove maxHeight cap for natural growth
        const onEnd = (e) => {
          if (e.propertyName === 'max-height') {
            el.style.maxHeight = 'none';
            el.removeEventListener('transitionend', onEnd);
          }
        };
        el.addEventListener('transitionend', onEnd);
      });
    });
    const btn = card.querySelector('.enlarge-btn');
    if (btn) btn.textContent = '⤡'; // indicate collapse
    // Close any open QR panels on expand
    const picker = card.querySelector('.quick-reaction-picker'); if (picker) picker.hidden = true;
    const expandedQR = card.querySelector('.quick-reaction-expanded'); if (expandedQR) expandedQR.hidden = true;
    const minWrap = card.querySelector('.quick-reaction-min'); if (minWrap) minWrap.hidden = false;
    // After expand animation, re-equalize surrounding rows
    setTimeout(() => equalizeStudioRows(), 320);
  }
  function collapseCard(card) {
    const sections = [
      card.querySelector('.poetry-full'),
      card.querySelector('.media-full-wrap'),
    ].filter(Boolean);
    // Fix current height, then animate to 0
    sections.forEach((el) => {
      // If previously set to none, set to current height first
      if (getComputedStyle(el).maxHeight === 'none') {
        el.style.maxHeight = el.scrollHeight + 'px';
      }
      // Force reflow then animate
      void el.offsetHeight;
      el.style.maxHeight = '0px';
      el.style.opacity = '0';
    });
    // After transition completes on last section, remove expanded class
    const last = sections[sections.length - 1];
    if (last) {
      const onEnd = (e) => {
        if (e.propertyName === 'max-height') {
          card.classList.remove('expanded');
          last.removeEventListener('transitionend', onEnd);
        }
      };
      last.addEventListener('transitionend', onEnd);
    } else {
      card.classList.remove('expanded');
    }
    const btn = card.querySelector('.enlarge-btn');
    if (btn) btn.textContent = '⤢';
    // Close any open QR panels on collapse
    const picker = card.querySelector('.quick-reaction-picker'); if (picker) picker.hidden = true;
    const expandedQR = card.querySelector('.quick-reaction-expanded'); if (expandedQR) expandedQR.hidden = true;
    // After collapse animation, re-equalize rows
    setTimeout(() => equalizeStudioRows(), 320);
  }

  // Toggle button behavior
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = appRoot && appRoot.classList.contains('sidebar-open');
      setSidebarState(!isOpen);
    });
    // Keyboard: Escape closes when open
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && appRoot && appRoot.classList.contains('sidebar-open')) {
        setSidebarState(false);
      }
    });
  }

  // Simple nav handling (only Studio for now)
  if (navItems && navItems.length) {
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        btn.classList.add('active');
        const page = btn.getAttribute('data-page');
        if (partyContent) {
          if (page === 'studio') {
            partyContent.innerHTML = `
              <div class="party-studio">
                <h2 style="margin-top:0;">Studio</h2>
                <p style="color:#9ca3af;">Welcome to Tart Studio. More coming soon.</p>
              </div>
            `;
          }
          // After navigation, hide sidebar on small screens to focus content
          if (window.innerWidth <= 680) setSidebarState(false);
        }
      });
    });
  }

  const openLoginPopup = () => {
    const w = 540, h = 640;
    const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    const width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    const height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;
    const left = ((width - w) / 2) + (dualScreenLeft || 0);
    const top = ((height - h) / 2) + (dualScreenTop || 0);
    const features = `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`;
    const popup = window.open('/login.html', 'tartLogin', features);
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = '/login.html';
    }
  };

  const setupAuthUI = async () => {
    const t = localStorage.getItem('token');
    if (t) {
      authContainer.innerHTML = `
        <div class="avatar-wrapper" id="header-avatar-wrapper">
          <img src="/assets/default-avatar.svg" alt="Account" class="header-avatar" id="header-avatar" />
          <div class="avatar-dropdown" id="avatar-dropdown">
            <a href="/account.html" class="dropdown-item">My account</a>
            <a href="/upload.html" class="dropdown-item">Upload</a>
            <button class="dropdown-item btn-link" id="header-logout">Log out</button>
          </div>
        </div>
      `;

      // Listeners
      const logoutBtn = document.getElementById('header-logout');
      if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); localStorage.removeItem('token'); window.location.reload(); });
      const wrapper = document.getElementById('header-avatar-wrapper');
      const avatarImg = document.getElementById('header-avatar');
      if (wrapper && avatarImg) {
        avatarImg.addEventListener('click', (e) => { e.stopPropagation(); wrapper.classList.toggle('open'); });
        document.addEventListener('click', () => wrapper.classList.remove('open'));
        const dropdown = document.getElementById('avatar-dropdown');
        if (dropdown) dropdown.addEventListener('click', (e) => e.stopPropagation());
      }

      try {
        const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': t } });
        if (res.ok) {
          const me = await res.json();
          // Save current user id for ownership checks in Studio
          if (me && (me._id || me.id)) {
            currentUserId = me._id || me.id;
            // Re-render grid so owner menus appear on owned posts
            renderStudioGrid(true);
          }
          if (me && me.profilePictureUrl) {
            currentUserAvatarUrl = me.profilePictureUrl;
            const avatarImg = document.getElementById('header-avatar');
            if (avatarImg) avatarImg.src = me.profilePictureUrl;
          }
        }
      } catch (_) { /* ignore */ }
    } else {
      authContainer.innerHTML = `<button id="open-login" class="pill-dark-btn">Log in</button>`;
      const btn = document.getElementById('open-login');
      if (btn) btn.addEventListener('click', () => openLoginPopup());

      const onMessage = (event) => {
        try {
          if (!event || event.origin !== window.location.origin) return;
          const data = event && event.data;
          if (data && data.type === 'oauthSuccess' && data.token) {
            localStorage.setItem('token', data.token);
            window.removeEventListener('message', onMessage);
            window.location.reload();
          }
        } catch (_) { /* ignore */ }
      };
      window.addEventListener('message', onMessage);
    // Visitor mode: render grid once here
    renderStudioGrid(true);
    }
  };

  setupAuthUI();
});
