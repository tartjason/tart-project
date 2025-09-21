document.addEventListener('DOMContentLoaded', () => {
  // Variant mode: when served at /livedlife, we hide auth/login and upload UI
  const isLivedLife = (window.location && window.location.pathname === '/livedlife');
  const authContainer = document.getElementById('auth-container');
  const feedEl = document.getElementById('lili-feed');
  const addBtn = document.getElementById('lili-add-btn');
  const menu = document.getElementById('lili-menu');
  const logoLink = document.getElementById('tart-logo-home');

  const textModal = document.getElementById('text-modal');
  const textTitle = document.getElementById('text-title');
  const textEditor = document.getElementById('text-editor');
  const textCancel = document.getElementById('text-cancel');
  const textUpload = document.getElementById('text-upload');

  // Disable logo navigation on Lili (including /livedlife variant)
  if (logoLink) {
    logoLink.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    // Remove href to avoid long-press open in new tab on mobile
    logoLink.removeAttribute('href');
    // Make it non-interactive visually and for a11y
    logoLink.setAttribute('aria-disabled', 'true');
    logoLink.style.pointerEvents = 'none';
    logoLink.style.cursor = 'default';
    logoLink.tabIndex = -1;
  }

  // ---- Theme (dark/light) ----
  const THEME_KEY = 'lili_theme';
  function getPreferredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
  }
  function ensureThemeToggle() {
    try {
      const header = document.querySelector('.lili-header');
      if (!header) return;
      let btn = document.getElementById('theme-toggle');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'theme-toggle';
        btn.className = 'theme-toggle';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle dark mode');
        const place = (authContainer && authContainer.style.display !== 'none') ? authContainer : header;
        if (place === authContainer) {
          authContainer.prepend(btn);
        } else {
          header.appendChild(btn);
        }
      }
      const setLabel = () => { btn.textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark'; };
      setLabel();
      btn.onclick = () => {
        const next = document.body.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
        setLabel();
      };
    } catch (_) {}
  }
  // Apply initial theme ASAP to avoid flash
  applyTheme(getPreferredTheme());

  // Authors strip DOM and state
  const authorsScroll = document.getElementById('lili-authors-scroll');
  const authorsSeen = new Set(); // store String(authorId)
  function addAuthorFromPost(post) {
    try {
      if (!post || !post.author) return;
      const a = post.author;
      const id = String(a.id || a._id || '');
      if (!id || authorsSeen.has(id)) return;
      authorsSeen.add(id);
      if (!authorsScroll) return;
      const item = document.createElement('div');
      item.className = 'lili-author-item';

      const img = document.createElement('img');
      img.className = 'lili-author-avatar';
      img.src = a.profilePictureUrl || '/assets/default-avatar.svg';
      img.alt = a.name ? `${a.name}` : 'Artist';
      img.title = a.name || 'Artist';
      img.setAttribute('loading', 'lazy');
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-pressed', 'false');
      img.dataset.authorId = id;

      const name = document.createElement('div');
      name.className = 'lili-author-name';
      name.textContent = a.name || 'Artist';

      item.appendChild(img);
      item.appendChild(name);
      authorsScroll.appendChild(item);
    } catch (_) {}
  }

  // Author filtering state (multi-select)
  const selectedAuthors = new Set();
  function applyAuthorFilter() {
    const posts = document.querySelectorAll('.lili-post');
    const hasFilter = selectedAuthors.size > 0;
    posts.forEach(el => {
      if (!hasFilter) {
        el.style.display = '';
        return;
      }
      const aid = String(el.dataset.authorId || '');
      if (aid && selectedAuthors.has(aid)) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
    // Mark the last visible post so we can hide its divider line
    let lastVisible = null;
    posts.forEach(el => {
      if (el.style.display !== 'none') lastVisible = el;
      el.classList.remove('is-last-visible');
    });
    if (lastVisible) lastVisible.classList.add('is-last-visible');
  }
  if (authorsScroll) {
    authorsScroll.addEventListener('click', (e) => {
      const container = e.target.closest('.lili-author-item');
      const img = container ? container.querySelector('img.lili-author-avatar') : e.target.closest('img.lili-author-avatar');
      if (!img) return;
      const id = String(img.dataset.authorId || '');
      if (!id) return;
      const isSelected = img.classList.toggle('selected');
      if (isSelected) {
        selectedAuthors.add(id);
        img.setAttribute('aria-pressed', 'true');
      } else {
        selectedAuthors.delete(id);
        img.setAttribute('aria-pressed', 'false');
      }
      applyAuthorFilter();
    });
    // Keyboard support: Enter/Space toggles selection
    authorsScroll.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const container = e.target.closest('.lili-author-item');
      const img = container ? container.querySelector('img.lili-author-avatar') : e.target.closest('img.lili-author-avatar');
      if (!img) return;
      e.preventDefault();
      img.click();
    });
  }

  const mediaModal = document.getElementById('media-modal');
  const mediaDrop = document.getElementById('media-drop');
  const mediaPreviews = document.getElementById('media-previews');
  const mediaFileInput = document.getElementById('media-file');
  const mediaError = document.getElementById('media-error');
  const mediaCount = document.getElementById('media-count');
  const mediaTitle = document.getElementById('media-title');
  const mediaDesc = document.getElementById('media-desc');
  const mediaCancel = document.getElementById('media-cancel');
  const mediaUpload = document.getElementById('media-upload');

  // ---- LivedLife landing countdown (until Sept 22, 8pm Beijing time) ----
  // Target time in UTC: Beijing is UTC+8, so 20:00 CST -> 12:00 UTC
  const livedLifeTargetUTC = Date.UTC(2025, 8, 22, 12, 0, 0); // months are 0-based (8 = September)
  let _landingActive = false;
  let _countdownTimer = null;
  let _feedInitialized = false;

  function msUntilTarget() {
    return Math.max(0, livedLifeTargetUTC - Date.now());
  }

  function formatDuration(ms) {
    let s = Math.floor(ms / 1000);
    const days = Math.floor(s / 86400); s -= days * 86400;
    const hours = Math.floor(s / 3600); s -= hours * 3600;
    const minutes = Math.floor(s / 60); s -= minutes * 60;
    const seconds = s;
    const pad = (n) => String(n).padStart(2, '0');
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  function showLivedLifeLanding(onFinish) {
    _landingActive = true;
    // Hide main content while landing is active
    const main = document.querySelector('main.lili-content');
    if (main) main.style.display = 'none';
    // Also ensure floating elements remain hidden (already handled above for livedlife)

    // Build overlay
    const overlay = document.createElement('div');
    overlay.id = 'livedlife-landing';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = '#FDF8F3';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.textAlign = 'center';
    overlay.style.zIndex = '1000';

    const logo = document.createElement('div');
    logo.style.fontSize = '48px';
    logo.style.fontWeight = '700';
    logo.style.letterSpacing = '0.5px';
    logo.style.color = '#111';

    const logoLead = document.createElement('span');
    logoLead.textContent = 'l';

    const logoAccent = document.createElement('span');
    logoAccent.textContent = 'i';
    logoAccent.style.color = '#A3C6A8';

    const logoTrail = document.createElement('span');
    logoTrail.textContent = 'li';

    logo.append(logoLead, logoAccent, logoTrail);

    const slogan = document.createElement('div');
    slogan.textContent = 'To live is the first art.'; // easily adjustable
    slogan.style.marginTop = '10px';
    slogan.style.marginBottom = '80px';
    slogan.style.fontSize = '18px';
    slogan.style.color = '#555';

    const countdown = document.createElement('div');
    countdown.id = 'livedlife-countdown';
    countdown.style.marginTop = '16px';
    countdown.style.fontSize = '20px';
    countdown.style.fontVariantNumeric = 'tabular-nums';
    countdown.style.color = '#333';

    overlay.appendChild(logo);
    overlay.appendChild(slogan);
    overlay.appendChild(countdown);
    document.body.appendChild(overlay);

    // Tick function
    const tick = () => {
      const ms = msUntilTarget();
      if (ms <= 0) {
        clearInterval(_countdownTimer);
        _countdownTimer = null;
        // Finish: remove overlay, show main, run callback
        overlay.remove();
        if (main) main.style.display = '';
        _landingActive = false;
        if (typeof onFinish === 'function') onFinish();
        return;
      }
      if (countdown) countdown.textContent = formatDuration(ms);
    };

    // Initial render and start interval
    tick();
    _countdownTimer = setInterval(tick, 1000);
  }

  // ---- Auth header UI (copied from main.js, simplified) ----
  let currentUser = { id: null, name: 'Guest', profilePictureUrl: '/assets/default-avatar.svg' };

  async function setupAuthUI() {
    // In livedlife mode we do not show auth UI (no login/avatar)
    if (isLivedLife) {
      if (authContainer) authContainer.style.display = 'none';
      return;
    }
    const t = localStorage.getItem('token');
    if (t) {
      const initialAvatarUrl = '/assets/default-avatar.svg';
      authContainer.innerHTML = `
        <div class="avatar-wrapper" id="header-avatar-wrapper">
          <img src="${initialAvatarUrl}" alt="Account" class="header-avatar" id="header-avatar" />
          <div class="avatar-dropdown" id="avatar-dropdown">
            <a href="/account.html" class="dropdown-item">My account</a>
            <button class="dropdown-item btn-link" id="header-logout">Log out</button>
          </div>
        </div>
      `;

      const logoutBtn = document.getElementById('header-logout');
      if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('token'); window.location.reload(); });
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
          if (me) {
            currentUser = {
              id: me._id || me.id || (me.artist && (me.artist._id || me.artist.id)) || null,
              name: me.name || me.displayName || (me.artist && me.artist.name) || 'Artist',
              profilePictureUrl: me.profilePictureUrl || '/assets/default-avatar.svg'
            };
          }
          if (me && me.profilePictureUrl) {
            const avatarImg2 = document.getElementById('header-avatar');
            if (avatarImg2) avatarImg2.src = me.profilePictureUrl;
          }
        }
      } catch (_) { /* ignore */ }
    } else {
      authContainer.innerHTML = `<button id=\"open-login\" class=\"pill-dark-btn\">Log in</button>`;
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
        } catch (_) {}
      };
      window.addEventListener('message', onMessage);
    }
  }

  function openLoginPopup(redirectUrl) {
    try { if (redirectUrl) sessionStorage.setItem('postLoginRedirect', redirectUrl); } catch (_) {}
    const w = 480; const h = 640;
    const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    const width = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const height = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = ((width - w) / 2) + (dualScreenLeft || 0);
    const top = ((height - h) / 2) + (dualScreenTop || 0);
    const features = `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`;
    const popup = window.open('/login.html', 'tartLogin', features);
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = '/login.html';
    }
  }

  // Initialize after auth resolves to avoid race (so ownership menus render)
  setupAuthUI().finally(() => {
    // Ensure theme toggle is visible once header/auth have been laid out
    ensureThemeToggle();
    // If livedlife and before target, show landing and delay feed init until countdown completes
    if (isLivedLife && msUntilTarget() > 0) {
      showLivedLifeLanding(() => {
        if (!_feedInitialized) {
          initFeed();
          _feedInitialized = true;
          ensureMenusForOwnedPosts();
        }
      });
      return;
    }
    // Else, initialize feed immediately
    initFeed();
    _feedInitialized = true;
    ensureMenusForOwnedPosts();
  });

  // ---- Feed loading (pagination) ----
  let _cursor = null;
  let _loading = false;
  let _done = false;
  let _io;

  function ensureMenusForOwnedPosts() {
    if (!currentUser || !currentUser.id) return;
    document.querySelectorAll('.lili-post').forEach(postEl => {
      if (postEl.querySelector('.post-menu-btn')) return; // already has
      const authorId = postEl.dataset.authorId;
      const nameMatch = (() => {
        const nameEl = postEl.querySelector('.lili-post-name');
        const n = nameEl ? nameEl.textContent.trim() : '';
        return !!(n && currentUser && currentUser.name && n === currentUser.name);
      })();
      if ((authorId && String(authorId) === String(currentUser.id)) || (!authorId && nameMatch)) {
        const header = postEl.querySelector('.lili-post-header');
        if (header) {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = `<button class=\"post-menu-btn\" aria-label=\"Post options\" data-action=\"open-menu\">⋯</button>
            <div class=\"post-menu\" role=\"menu\">
              <button data-action=\"edit-post\" role=\"menuitem\">Edit</button>
              <button data-action=\"delete-post\" role=\"menuitem\">Delete</button>
            </div>`;
          header.appendChild(wrapper.firstElementChild);
          header.appendChild(wrapper.lastElementChild);
        }
      } else {
        // Debug hint in console if ownership not detected
        console.debug('[Lili] No menu for post', { authorId, currentUserId: currentUser.id });
      }
    });
  }

  async function loadMorePosts(initial = false) {
    if (_loading || _done) return;
    _loading = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', initial ? '10' : '6');
      if (_cursor) params.set('cursor', _cursor);
      const res = await fetch(`/api/lili-posts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load posts');
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const frag = document.createDocumentFragment();
      items.forEach(p => {
        // collect unique authors for the strip
        addAuthorFromPost(p);
        frag.appendChild(createPostEl(p));
      });
      // Insert above sentinel
      const sentinel = document.getElementById('lili-feed-end');
      if (feedEl && sentinel) feedEl.insertBefore(frag, sentinel);
      // After render, attach menus for owned posts (in case auth arrived late)
      ensureMenusForOwnedPosts();
      // Re-apply any active author filters
      applyAuthorFilter();
      _cursor = data.nextCursor || null;
      if (!data.nextCursor || items.length === 0) _done = true;
    } catch (e) {
      console.error('Load posts error:', e);
    } finally {
      _loading = false;
    }
  }

  function initFeed() {
    const sentinel = document.getElementById('lili-feed-end');
    if (sentinel) {
      _io = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          loadMorePosts(false);
        }
      }, { root: null, threshold: 0.1 });
      _io.observe(sentinel);
      // initial load
      loadMorePosts(true);
    }
  }

  // ---- Utilities ----
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(ts) {
    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  function createPostEl(post) {
    const el = document.createElement('article');
    el.className = 'lili-post';
    el.dataset.postId = post.id || '';
    el.dataset.postType = post.type || '';
    el.dataset.authorId = post.author && (post.author.id || post.author._id || '');
    const author = post && post.author ? post.author : {};
    const avatarUrl = author.profilePictureUrl || author.avatar || '/assets/default-avatar.svg';
    const authorName = author.name || 'Artist';
    const created = post && post.createdAt ? post.createdAt : Date.now();
    const tsMs = typeof created === 'string' ? Date.parse(created) : (created instanceof Date ? created.getTime() : Number(created));
    const safeTs = isNaN(tsMs) ? Date.now() : tsMs;
    const isMine = !!(currentUser && currentUser.id && author && (String(author.id || author._id || '') === String(currentUser.id)));
    const headerHtml = `
      <div class="lili-post-header">
        <img class="lili-post-avatar" src="${avatarUrl}" alt="${authorName}" />
        <div class="lili-post-meta">
          <div class="lili-post-name">${authorName}</div>
          <div class="lili-post-time" title="${new Date(safeTs).toLocaleString()}">${timeAgo(safeTs)}</div>
        </div>
        ${isMine ? `<button class="post-menu-btn" aria-label="Post options" data-action="open-menu">⋯</button>
          <div class="post-menu" role="menu">
            <button data-action="edit-post" role="menuitem">Edit</button>
            <button data-action="delete-post" role="menuitem">Delete</button>
          </div>` : ''}
      </div>`;
    const titleHtml = post.title ? `<div class="lili-post-title">${escapeHtml(post.title)}</div>` : '';
    let bodyHtml = '';
    if (post.type === 'text') {
      bodyHtml = `<div class="lili-post-text">${escapeHtml(post.text)}</div>`;
    } else if (post.type === 'media') {
      const images = Array.isArray(post.images) && post.images.length ? post.images : (post.imageUrl ? [post.imageUrl] : []);
      let mediaHtml = '';
      if (images.length <= 1) {
        const src = images[0] || '';
        mediaHtml = src ? `<img class="lili-post-img" src="${src}" alt="${escapeHtml(post.title || 'image')}" />` : '';
      } else {
        const main = images[0];
        const dots = images.map((_, i) => `<div class="lili-media-dot${i===0?' active':''}" data-index="${i}"></div>`).join('');
        mediaHtml = `
          <div class="lili-media" data-images='${JSON.stringify(images)}' data-active-index="0">
            <div class="lili-media-main"><img class="lili-slide-img" src="${main}" alt="${escapeHtml(post.title || 'image')}" /></div>
            <div class="lili-media-nav">
              <button class="lili-media-btn" data-action="media-prev" aria-label="Previous">‹</button>
              <button class="lili-media-btn" data-action="media-next" aria-label="Next">›</button>
            </div>
            <div class="lili-media-dots">${dots}</div>
          </div>`;
      }
      const descHtml = post.description ? `<div class="lili-post-text">${escapeHtml(post.description)}</div>` : '';
      bodyHtml = mediaHtml + descHtml;
    }
    // Footer: like button (no login required, per-device single like)
    const likes = typeof post.likesCount === 'number' ? post.likesCount : 0;
    const likedKey = `lili_liked_${post.id || ''}`;
    const isLiked = (() => { try { return localStorage.getItem(likedKey) === '1'; } catch(_) { return false; } })();
    const likeBtnHtml = `
      <div class="lili-post-footer">
        <button class="lili-like-btn${isLiked ? ' liked' : ''}" data-action="like-post" aria-label="Like" title="Like">
          <svg class="heart-icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
            <path class="heart-shape" d="M12 21c-.3 0-.6-.1-.8-.3C6.1 16.2 3 13.4 3 9.9 3 7.3 5.1 5.2 7.7 5.2c1.7 0 3.2.9 4.3 2.3 1.1-1.5 2.6-2.3 4.3-2.3 2.6 0 4.7 2.1 4.7 4.7 0 3.5-3.1 6.3-8.2 10.8-.2.2-.5.3-.8.3z"/>
          </svg>
          <span class="lili-like-count">${likes}</span>
        </button>
      </div>`;

    el.innerHTML = headerHtml + titleHtml + bodyHtml + likeBtnHtml;
    // Initialize desktop nav visibility for multi-image posts
    if (post.type === 'media') {
      const media = el.querySelector('.lili-media');
      if (media) {
        try { updateNavVisibility(media); } catch (_) { /* function defined later; hoisted */ }
      }
    }
    return el;
  }

  // ---- Post menu interactions (event delegation) ----
  function closeAllPostMenus() {
    document.querySelectorAll('.post-menu.open').forEach(m => m.classList.remove('open'));
  }
  document.addEventListener('click', (e) => {
    // Close menus when clicking outside
    if (!e.target.closest('.post-menu') && !e.target.closest('.post-menu-btn')) {
      closeAllPostMenus();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllPostMenus(); });

  feedEl && feedEl.addEventListener('click', async (e) => {
    // Image click -> open lightbox with original src
    const imgClick = e.target.closest('img.lili-post-img');
    if (imgClick) {
      e.preventDefault();
      e.stopPropagation();
      const src = imgClick.getAttribute('src');
      openImageLightbox(src);
      return;
    }

    // Carousel main image click -> lightbox
    const mediaMainImg = e.target.closest('.lili-media .lili-media-main img');
    if (mediaMainImg) {
      e.preventDefault(); e.stopPropagation();
      openImageLightbox(mediaMainImg.getAttribute('src'));
      return;
    }

    // Carousel navigation
    const navBtn = e.target.closest('.lili-media-btn');
    if (navBtn) {
      const media = navBtn.closest('.lili-media');
      if (media) {
        const action = navBtn.getAttribute('data-action');
        updateCarousel(media, action === 'media-next' ? 1 : -1);
      }
      return;
    }

    // Carousel dot click
    const dot = e.target.closest('.lili-media-dot');
    if (dot) {
      const media = dot.closest('.lili-media');
      const idx = parseInt(dot.getAttribute('data-index') || '0', 10) || 0;
      setCarouselIndex(media, idx);
      return;
    }

    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const postEl = btn.closest('.lili-post');
    if (!action || !postEl) return;
    const postId = postEl.dataset.postId;
    const postType = postEl.dataset.postType;
    if (action === 'open-menu') {
      e.stopPropagation();
      const menu = postEl.querySelector('.post-menu');
      if (menu) {
        const isOpen = menu.classList.contains('open');
        closeAllPostMenus();
        if (!isOpen) menu.classList.add('open');
      }
      return;
    }
    if (action === 'like-post') {
      // Per-device single-like enforcement using localStorage
      const likedKey = `lili_liked_${postId}`;
      try {
        if (localStorage.getItem(likedKey) === '1') {
          return; // already liked on this device
        }
      } catch (_) { /* ignore storage errors */ }

      const countEl = btn.querySelector('.lili-like-count');
      const prev = parseInt((countEl && countEl.textContent) || '0', 10) || 0;
      // Optimistic UI update
      btn.classList.add('liked');
      if (countEl) countEl.textContent = String(prev + 1);
      try {
        const res = await fetch(`/api/lili-posts/${encodeURIComponent(postId)}/like`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to like');
        const data = await res.json().catch(() => ({}));
        if (typeof data.likesCount === 'number' && countEl) {
          countEl.textContent = String(data.likesCount);
        }
        try { localStorage.setItem(likedKey, '1'); } catch (_) { /* ignore */ }
      } catch (err) {
        // Revert UI on failure
        btn.classList.remove('liked');
        if (countEl) countEl.textContent = String(prev);
        console.error('Like error:', err);
      }
      return;
    }
    if (action === 'delete-post') {
      closeAllPostMenus();
      if (!confirm('Delete this post? This cannot be undone.')) return;
      try {
        const t = localStorage.getItem('token');
        const res = await fetch(`/api/lili-posts/${encodeURIComponent(postId)}`, {
          method: 'DELETE',
          headers: { ...(t ? { 'x-auth-token': t } : {}) }
        });
        if (!res.ok) throw new Error('Failed to delete');
        postEl.remove();
        applyAuthorFilter();
      } catch (err) {
        console.error('Delete error:', err);
        alert('Failed to delete.');
      }
      return;
    }
    if (action === 'edit-post') {
      closeAllPostMenus();
      // Prefill modal and switch to Save/Update
      if (postType === 'text') {
        // Read current values from DOM
        const title = postEl.querySelector('.lili-post-title')?.textContent || '';
        const text = postEl.querySelector('.lili-post-text')?.textContent || '';
        // Set modal UI
        document.getElementById('text-modal-title').textContent = 'Edit My Post';
        _editingText = true;
        document.getElementById('text-title').value = title;
        document.getElementById('text-editor').value = text;
        const btnSave = document.getElementById('text-upload');
        const originalLabel = btnSave.textContent;
        btnSave.textContent = 'Save and Update';
        // Prevent default create handler from firing while editing
        btnSave.removeEventListener('click', handleCreateText);
        // Temporary handler override for this one edit session
        const onSave = async () => {
          const payload = {
            title: document.getElementById('text-title').value.trim(),
            text: document.getElementById('text-editor').value.trim()
          };
          const t = localStorage.getItem('token');
          try {
            const res = await fetch(`/api/lili-posts/${encodeURIComponent(postId)}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-auth-token': t } : {}) }, body: JSON.stringify(payload)
            });
            if (res.status === 404) throw new Error('Post not found.');
            if (!res.ok) throw new Error('Failed to update');
            const data = await res.json();
            // Replace DOM node to ensure dataset ids are accurate
            const newEl = createPostEl(data.item);
            postEl.replaceWith(newEl);
            closeModal(textModal);
            applyAuthorFilter();
          } catch (err) {
            console.error('Update text error:', err);
            alert(err.message || 'Failed to update.');
          } finally {
            btnSave.textContent = originalLabel;
            btnSave.removeEventListener('click', onSave);
            // Re-attach create handler for future new posts
            btnSave.addEventListener('click', handleCreateText);
            document.getElementById('text-modal-title').textContent = 'New Text';
            document.getElementById('text-title').value = '';
            document.getElementById('text-editor').value = '';
            _editingText = false;
          }
        };
        btnSave.addEventListener('click', onSave, { once: true });
        openModal(textModal);
      } else if (postType === 'media') {
        // Read current values
        const title = postEl.querySelector('.lili-post-title')?.textContent || '';
        const descEl = postEl.querySelector('.lili-post-text');
        const desc = descEl ? descEl.textContent : '';
        // Determine existing images from DOM
        let existingImages = [];
        const carousel = postEl.querySelector('.lili-media');
        if (carousel && carousel.getAttribute('data-images')) {
          try { existingImages = JSON.parse(carousel.getAttribute('data-images')) || []; } catch (_) { existingImages = []; }
        } else {
          const imgEl = postEl.querySelector('.lili-post-img');
          const currentUrl = imgEl ? imgEl.getAttribute('src') : '';
          if (currentUrl) existingImages = [currentUrl];
        }

        document.getElementById('media-modal-title').textContent = 'Edit My Post';
        _editingMedia = true;
        document.getElementById('media-title').value = title;
        document.getElementById('media-desc').value = desc;
        clearPreview(); // start with empty selection; user can add up to 4 new images to replace

        const btnSave = document.getElementById('media-upload');
        const originalLabel = btnSave.textContent;
        btnSave.textContent = 'Save and Update';
        // Prevent default create handler from firing while editing
        btnSave.removeEventListener('click', handleCreateMedia);

        // On save: if user selected new files, upload and replace images; otherwise keep existingImages
        const onSave = async () => {
          const t = localStorage.getItem('token');
          try {
            let imagesToUse = existingImages;
            if (selectedFiles && selectedFiles.length) {
              const uploaded = [];
              for (const file of selectedFiles) {
                const fd = new FormData();
                fd.append('image', file, file.name);
                const upRes = await fetch('/api/uploads/lili-image', { method: 'POST', headers: { ...(t ? { 'x-auth-token': t } : {}) }, body: fd });
                if (!upRes.ok) {
                  const err = await upRes.json().catch(() => ({}));
                  throw new Error(err.msg || 'Upload failed');
                }
                const up = await upRes.json();
                if (up && up.url) uploaded.push(up.url);
              }
              if (uploaded.length) imagesToUse = uploaded.slice(0, 4);
            }
            const payload = {
              title: document.getElementById('media-title').value.trim(),
              description: document.getElementById('media-desc').value.trim(),
              images: imagesToUse
            };
            const res = await fetch(`/api/lili-posts/${encodeURIComponent(postId)}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-auth-token': t } : {}) }, body: JSON.stringify(payload)
            });
            if (res.status === 404) throw new Error('Post not found.');
            if (!res.ok) throw new Error('Failed to update');
            const data = await res.json();
            // Replace DOM node to ensure dataset ids are accurate
            const newEl = createPostEl(data.item);
            postEl.replaceWith(newEl);
            closeModal(mediaModal);
            applyAuthorFilter();
          } catch (err) {
            console.error('Update media error:', err);
            alert(err.message || 'Failed to update.');
          } finally {
            btnSave.textContent = originalLabel;
            btnSave.removeEventListener('click', onSave);
            document.getElementById('media-modal-title').textContent = 'New Media';
            clearPreview();
            document.getElementById('media-title').value = '';
            document.getElementById('media-desc').value = '';
            // Re-attach create handler for future new posts
            btnSave.addEventListener('click', handleCreateMedia);
            _editingMedia = false;
          }
        };
        btnSave.addEventListener('click', onSave, { once: true });
        openModal(mediaModal);
      }
    }
  });

  // ---- Floating add menu ----
  // In livedlife mode, hide the floating add button and menu entirely
  if (isLivedLife) {
    if (addBtn) addBtn.style.display = 'none';
    if (menu) menu.style.display = 'none';
  }

  if (addBtn && menu && !isLivedLife) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
      menu.setAttribute('aria-hidden', menu.classList.contains('open') ? 'false' : 'true');
    });
    document.addEventListener('click', () => {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
    });
    menu.addEventListener('click', (e) => e.stopPropagation());

    const menuText = document.getElementById('menu-text');
    const menuMedia = document.getElementById('menu-media');
    if (menuText) menuText.addEventListener('click', () => { openModal(textModal); });
    if (menuMedia) menuMedia.addEventListener('click', () => { openModal(mediaModal); });
  }

  // ---- Modal helpers ----
  function openModal(overlayEl) {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('open'));
    overlayEl && overlayEl.classList.add('open');
    // Close menu when opening a modal
    if (menu) { menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); }
  }
  function closeModal(overlayEl) { overlayEl && overlayEl.classList.remove('open'); }

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('open'));
      if (menu) menu.classList.remove('open');
    }
  });

  // ---- Image lightbox for post images ----
  let _lightboxEl = null;
  let _lightboxKeyHandler = null;
  function openImageLightbox(src) {
    if (!src) return;
    if (_lightboxEl) {
      // If already open, just update src
      const img = _lightboxEl.querySelector('img');
      if (img) img.src = src;
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'lili-image-lightbox';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '1001';
    overlay.style.cursor = 'zoom-out';

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.style.maxWidth = '95vw';
    img.style.maxHeight = '95vh';
    img.style.objectFit = 'contain';
    img.style.boxShadow = '0 10px 40px rgba(0,0,0,0.6)';
    img.style.borderRadius = '8px';

    overlay.appendChild(img);
    document.body.appendChild(overlay);
    _lightboxEl = overlay;

    const close = () => closeImageLightbox();
    overlay.addEventListener('click', close);
    _lightboxKeyHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', _lightboxKeyHandler);
  }

  function closeImageLightbox() {
    if (_lightboxEl) {
      _lightboxEl.remove();
      _lightboxEl = null;
    }
    if (_lightboxKeyHandler) {
      document.removeEventListener('keydown', _lightboxKeyHandler);
      _lightboxKeyHandler = null;
    }
  }

  // ---- Text modal events ----
  let _editingText = false;
  let _editingMedia = false;
  if (textCancel) textCancel.addEventListener('click', () => { closeModal(textModal); _editingText = false; });
  function handleCreateText() {
    if (_editingText) return; // guard: do not create while editing
    const payload = {
      type: 'text',
      title: textTitle.value.trim(),
      text: textEditor.value.trim()
    };
    const t = localStorage.getItem('token');
    fetch('/api/lili-posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { 'x-auth-token': t } : {})
      },
      body: JSON.stringify(payload)
    }).then(async (res) => {
      if (!res.ok) throw new Error('Failed to create post');
      const data = await res.json();
      if (feedEl && data && data.item) {
        // Prepend new post above the first child
        const el = createPostEl(data.item);
        const first = feedEl.firstElementChild;
        feedEl.insertBefore(el, first);
        // Add author avatar if new
        addAuthorFromPost(data.item);
        // Respect current filter selection
        applyAuthorFilter();
      }
    }).catch(err => {
      console.error('Create text post error:', err);
      alert('Failed to post. Please try again.');
    }).finally(() => {
      closeModal(textModal);
      textTitle.value = '';
      textEditor.value = '';
    });
  }
  if (textUpload) textUpload.addEventListener('click', handleCreateText);

  // ---- Media modal: drag/drop and file selection ----
  const ONE_MB = 5 * 1024 * 1024; // increased to 5MB
  let selectedFiles = [];

  function setMediaError(msg) {
    if (!mediaError) return;
    mediaError.textContent = msg || 'File must be an image under 5 MB.';
    mediaError.style.display = msg ? 'block' : 'none';
  }

  function renderPreviews() {
    if (!mediaPreviews) return;
    mediaPreviews.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      const wrap = document.createElement('div');
      wrap.className = 'preview-thumb';
      wrap.innerHTML = `<img src="${url}" alt="preview ${idx+1}"/><button class="remove" data-index="${idx}" aria-label="Remove">×</button>`;
      mediaPreviews.appendChild(wrap);
    });
    // Add plus tile if fewer than 4 selected
    if (selectedFiles.length < 4) {
      const add = document.createElement('div');
      add.className = 'preview-thumb preview-add';
      add.style.display = 'grid';
      add.style.placeItems = 'center';
      add.style.border = '2px dashed #bbb';
      add.style.color = '#666';
      add.style.fontSize = '28px';
      add.style.cursor = 'pointer';
      add.setAttribute('role', 'button');
      add.setAttribute('tabindex', '0');
      add.innerHTML = '<span aria-hidden="true">+</span>';
      add.addEventListener('click', () => mediaFileInput && mediaFileInput.click());
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mediaFileInput && mediaFileInput.click(); } });
      mediaPreviews.appendChild(add);
    }
    if (selectedFiles.length) {
      mediaPreviews.classList.add('show');
      if (mediaDrop) mediaDrop.style.display = 'none';
    } else {
      mediaPreviews.classList.remove('show');
      if (mediaDrop) mediaDrop.style.display = 'block';
    }
    if (mediaCount) mediaCount.textContent = `${selectedFiles.length} / 4 images`;
  }

  function clearPreview() {
    selectedFiles = [];
    if (mediaPreviews) {
      mediaPreviews.innerHTML = '';
      mediaPreviews.classList.remove('show');
    }
    if (mediaDrop) mediaDrop.style.display = 'block';
    if (mediaCount) mediaCount.textContent = '';
  }

  function acceptFiles(files) {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const next = [];
    const remaining = Math.max(0, 4 - selectedFiles.length);
    for (const f of arr) {
      if (!f.type.startsWith('image/')) { setMediaError('Please upload image files only.'); continue; }
      if (f.size > ONE_MB) { setMediaError('Each image must be under 5 MB.'); continue; }
      if (next.length < remaining) next.push(f);
    }
    const combined = [...selectedFiles, ...next].slice(0, 4);
    selectedFiles = combined;
    setMediaError('');
    renderPreviews();
  }

  if (mediaDrop) {
    ;['dragenter', 'dragover'].forEach(evt => mediaDrop.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      mediaDrop.classList.add('dragover');
    }));
    ;['dragleave', 'drop'].forEach(evt => mediaDrop.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        acceptFiles(e.dataTransfer.files);
      }
      mediaDrop.classList.remove('dragover');
    }));
    mediaDrop.addEventListener('click', () => mediaFileInput && mediaFileInput.click());
  }

  if (mediaFileInput) {
    mediaFileInput.addEventListener('change', () => {
      const files = mediaFileInput.files;
      acceptFiles(files);
    });
  }

  if (mediaPreviews) {
    mediaPreviews.addEventListener('click', (e) => {
      const btn = e.target.closest('button.remove');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-index') || '0', 10) || 0;
      selectedFiles.splice(idx, 1);
      renderPreviews();
    });
  }

  if (mediaCancel) mediaCancel.addEventListener('click', () => {
    closeModal(mediaModal);
    clearPreview();
    mediaTitle.value = '';
    mediaDesc.value = '';
    _editingMedia = false;
  });
  async function handleCreateMedia() {
    if (_editingMedia) return; // guard: do not create while editing
    try {
      const t = localStorage.getItem('token');
      if (!selectedFiles || selectedFiles.length === 0) {
        alert('Please select up to 4 images (under 5 MB each).');
        return;
      }
      // 1) Upload images to S3 via backend
      const uploaded = [];
      for (const file of selectedFiles) {
        const fd = new FormData();
        fd.append('image', file, file.name);
        const upRes = await fetch('/api/uploads/lili-image', { method: 'POST', headers: { ...(t ? { 'x-auth-token': t } : {}) }, body: fd });
        if (!upRes.ok) {
          const err = await upRes.json().catch(() => ({}));
          throw new Error(err.msg || 'Upload failed');
        }
        const up = await upRes.json();
        if (up && up.url) uploaded.push(up.url);
      }
      if (!uploaded.length) throw new Error('No image URL returned');

      // 2) Create media post with images array
      const payload = { type: 'media', title: mediaTitle.value.trim(), description: mediaDesc.value.trim(), images: uploaded };
      const postRes = await fetch('/api/lili-posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-auth-token': t } : {}) }, body: JSON.stringify(payload)
      });
      if (!postRes.ok) throw new Error('Failed to create media post');
      const data = await postRes.json();
      if (feedEl && data && data.item) {
        const el = createPostEl(data.item);
        const first = feedEl.firstElementChild;
        feedEl.insertBefore(el, first);
        // Add author avatar if new
        addAuthorFromPost(data.item);
      }
    } catch (err) {
      console.error('Create media post error:', err);
      alert(err.message || 'Failed to post. Please try again.');
    } finally {
      closeModal(mediaModal);
      clearPreview();
      mediaTitle.value = '';
      mediaDesc.value = '';
    }
  }
  if (mediaUpload) mediaUpload.addEventListener('click', handleCreateMedia);

  function updateCarousel(mediaEl, delta) {
    if (!mediaEl) return;
    const images = JSON.parse(mediaEl.getAttribute('data-images') || '[]');
    if (!images.length) return;
    const total = images.length;
    let idx = parseInt(mediaEl.getAttribute('data-active-index') || '0', 10) || 0;
    // Non-circular: clamp at bounds
    const next = Math.max(0, Math.min(idx + delta, total - 1));
    if (next === idx) return; // already at the edge; no wrap
    setCarouselIndex(mediaEl, next);
  }

  function setCarouselIndex(mediaEl, idx) {
    if (!mediaEl) return;
    const images = JSON.parse(mediaEl.getAttribute('data-images') || '[]');
    if (!images.length) return;
    const current = parseInt(mediaEl.getAttribute('data-active-index') || '0', 10) || 0;
    const clamped = Math.max(0, Math.min(idx, images.length - 1));
    if (clamped === current) return;
    const dir = clamped > current ? 1 : -1;
    animateCarousel(mediaEl, clamped, dir);
  }

  function animateCarousel(mediaEl, newIdx, dir) {
    if (!mediaEl) return;
    if (mediaEl.dataset.animating === '1') return;
    const images = JSON.parse(mediaEl.getAttribute('data-images') || '[]');
    const main = mediaEl.querySelector('.lili-media-main');
    if (!main || !images.length) return;
    const fromImg = main.querySelector('.lili-slide-img');
    const toImg = document.createElement('img');
    toImg.className = 'lili-slide-img';
    toImg.alt = fromImg ? fromImg.alt : '';
    toImg.src = images[newIdx];
    // place offscreen based on direction
    toImg.style.transform = `translateX(${dir > 0 ? '100%' : '-100%'})`;
    main.appendChild(toImg);
    // force reflow
    void toImg.offsetWidth;
    // animate
    mediaEl.dataset.animating = '1';
    toImg.style.transform = 'translateX(0)';
    if (fromImg) fromImg.style.transform = `translateX(${dir > 0 ? '-100%' : '100%'})`;
    const onDone = () => {
      toImg.removeEventListener('transitionend', onDone);
      // cleanup old image
      if (fromImg && fromImg.parentNode === main) main.removeChild(fromImg);
      mediaEl.setAttribute('data-active-index', String(newIdx));
      // update dots
      mediaEl.querySelectorAll('.lili-media-dot').forEach((d, i) => {
        if (i === newIdx) d.classList.add('active'); else d.classList.remove('active');
      });
      updateNavVisibility(mediaEl);
      mediaEl.dataset.animating = '0';
    };
    toImg.addEventListener('transitionend', onDone);
  }

  function updateNavVisibility(mediaEl) {
    if (!mediaEl) return;
    const images = JSON.parse(mediaEl.getAttribute('data-images') || '[]');
    const total = images.length;
    const idx = parseInt(mediaEl.getAttribute('data-active-index') || '0', 10) || 0;
    const nav = mediaEl.querySelector('.lili-media-nav');
    if (!nav) return;
    const [btnPrev, btnNext] = nav.querySelectorAll('.lili-media-btn');
    if (btnPrev) btnPrev.style.display = (idx <= 0 ? 'none' : 'grid');
    if (btnNext) btnNext.style.display = (idx >= total - 1 ? 'none' : 'grid');
    // Align container depending on which button is visible
    nav.classList.remove('only-prev', 'only-next', 'both');
    const prevVisible = btnPrev && btnPrev.style.display !== 'none';
    const nextVisible = btnNext && btnNext.style.display !== 'none';
    if (prevVisible && nextVisible) {
      nav.classList.add('both');
    } else if (prevVisible) {
      nav.classList.add('only-prev');
    } else if (nextVisible) {
      nav.classList.add('only-next');
    }
  }

  // Touch swipe navigation for mobile
  let _touchX = null, _touchY = null, _touchingMedia = null, _swiping = false;
  const SWIPE_THRESHOLD = 50;
  const SWIPE_LOCK = 10; // require horizontal dominance over vertical

  if (feedEl) {
    feedEl.addEventListener('touchstart', (e) => {
      const media = e.target.closest('.lili-media');
      if (!media) { _touchingMedia = null; return; }
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      _touchingMedia = media;
      _touchX = t.clientX;
      _touchY = t.clientY;
      _swiping = false;
    }, { passive: true });

    feedEl.addEventListener('touchmove', (e) => {
      if (!_touchingMedia) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - _touchX;
      const dy = t.clientY - _touchY;
      if (Math.abs(dx) > Math.abs(dy) + SWIPE_LOCK) {
        // horizontal swipe, prevent vertical scroll interference
        e.preventDefault();
        _swiping = true;
      }
    }, { passive: false });

    feedEl.addEventListener('touchend', (e) => {
      if (!_touchingMedia) return;
      const media = _touchingMedia;
      const t = e.changedTouches && e.changedTouches[0];
      _touchingMedia = null;
      if (!t || !_swiping) return;
      const dx = t.clientX - _touchX;
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        updateCarousel(media, dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }
});
