document.addEventListener('DOMContentLoaded', () => {
  const authContainer = document.getElementById('auth-container');
  const feedEl = document.getElementById('lili-feed');
  const addBtn = document.getElementById('lili-add-btn');
  const menu = document.getElementById('lili-menu');

  const textModal = document.getElementById('text-modal');
  const textTitle = document.getElementById('text-title');
  const textEditor = document.getElementById('text-editor');
  const textCancel = document.getElementById('text-cancel');
  const textUpload = document.getElementById('text-upload');

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
  const mediaPreview = document.getElementById('media-preview');
  const mediaFileInput = document.getElementById('media-file');
  const mediaError = document.getElementById('media-error');
  const mediaTitle = document.getElementById('media-title');
  const mediaDesc = document.getElementById('media-desc');
  const mediaCancel = document.getElementById('media-cancel');
  const mediaUpload = document.getElementById('media-upload');

  // ---- Auth header UI (copied from main.js, simplified) ----
  let currentUser = { id: null, name: 'Guest', profilePictureUrl: '/assets/default-avatar.svg' };

  async function setupAuthUI() {
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
    initFeed();
    // Backfill menus for any posts rendered by cache/preload
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
      const imgHtml = post.imageUrl ? `<img class="lili-post-img" src="${post.imageUrl}" alt="${escapeHtml(post.title || 'image')}" />` : '';
      const descHtml = post.description ? `<div class="lili-post-text">${escapeHtml(post.description)}</div>` : '';
      bodyHtml = imgHtml + descHtml;
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
        const imgEl = postEl.querySelector('.lili-post-img');
        const currentUrl = imgEl ? imgEl.getAttribute('src') : '';

        document.getElementById('media-modal-title').textContent = 'Edit My Post';
        _editingMedia = true;
        document.getElementById('media-title').value = title;
        document.getElementById('media-desc').value = desc;
        const preview = document.getElementById('media-preview');
        const drop = document.getElementById('media-drop');
        if (preview) { preview.src = currentUrl; preview.style.display = 'block'; }
        if (drop) { drop.style.display = 'none'; }

        const btnSave = document.getElementById('media-upload');
        const originalLabel = btnSave.textContent;
        btnSave.textContent = 'Save and Update';
        let replaceUrl = null; // if user picks a new one, upload will set this
        // Prevent default create handler from firing while editing
        btnSave.removeEventListener('click', handleCreateMedia);

        // Intercept pick to allow replacement via existing handlers (selectedFile set in module scope)
        const onSave = async () => {
          const t = localStorage.getItem('token');
          let imageUrl = currentUrl;
          try {
            // If user selected a new file, the create flow's selectedFile would be set
            if (typeof selectedFile === 'object' && selectedFile) {
              const fd = new FormData();
              fd.append('image', selectedFile, selectedFile.name);
              const upRes = await fetch('/api/uploads/lili-image', { method: 'POST', headers: { ...(t ? { 'x-auth-token': t } : {}) }, body: fd });
              if (!upRes.ok) {
                const err = await upRes.json().catch(() => ({}));
                throw new Error(err.msg || 'Upload failed');
              }
              const up = await upRes.json();
              imageUrl = up.url || imageUrl;
            }
            const payload = {
              title: document.getElementById('media-title').value.trim(),
              description: document.getElementById('media-desc').value.trim(),
              imageUrl
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
  if (addBtn && menu) {
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
  let selectedFile = null;

  function setMediaError(msg) {
    if (!mediaError) return;
    mediaError.textContent = msg || 'File must be an image under 5 MB.';
    mediaError.style.display = msg ? 'block' : 'none';
  }

  function showPreview(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (mediaPreview) {
      mediaPreview.src = url;
      mediaPreview.style.display = 'block';
    }
    if (mediaDrop) mediaDrop.style.display = 'none';
  }

  function clearPreview() {
    selectedFile = null;
    if (mediaPreview) {
      mediaPreview.removeAttribute('src');
      mediaPreview.style.display = 'none';
    }
    if (mediaDrop) mediaDrop.style.display = 'block';
  }

  function acceptFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMediaError('Please upload an image file.');
      return;
    }
    if (file.size > ONE_MB) {
      setMediaError('Image must be under 5 MB.');
      return;
    }
    setMediaError('');
    selectedFile = file;
    showPreview(file);
  }

  if (mediaDrop) {
    ;['dragenter', 'dragover'].forEach(evt => mediaDrop.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      mediaDrop.classList.add('dragover');
    }));
    ;['dragleave', 'drop'].forEach(evt => mediaDrop.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        acceptFile(e.dataTransfer.files[0]);
      }
      mediaDrop.classList.remove('dragover');
    }));
    mediaDrop.addEventListener('click', () => mediaFileInput && mediaFileInput.click());
  }

  if (mediaFileInput) {
    mediaFileInput.addEventListener('change', () => {
      const file = mediaFileInput.files && mediaFileInput.files[0];
      acceptFile(file);
    });
  }

  if (mediaPreview) {
    mediaPreview.addEventListener('click', () => mediaFileInput && mediaFileInput.click());
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
      if (!selectedFile) {
        alert('Please select an image under 5 MB.');
        return;
      }
      // 1) Upload image to S3 via backend
      const fd = new FormData();
      fd.append('image', selectedFile, selectedFile.name);
      const upRes = await fetch('/api/uploads/lili-image', {
        method: 'POST',
        headers: { ...(t ? { 'x-auth-token': t } : {}) },
        body: fd
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        throw new Error(err.msg || 'Upload failed');
      }
      const up = await upRes.json();
      const imageUrl = up && up.url;
      if (!imageUrl) throw new Error('No image URL returned');

      // 2) Create media post
      const payload = {
        type: 'media', title: mediaTitle.value.trim(), description: mediaDesc.value.trim(), imageUrl
      };
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
});
