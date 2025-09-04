document.addEventListener('DOMContentLoaded', () => {
    const artworksContainer = document.getElementById('artworks-container');
    const stickyHero = document.getElementById('sticky-hero');
    const stickyGrid = document.getElementById('sticky-grid');
    const authContainer = document.getElementById('auth-container');
    const appEl = document.getElementById('app');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const pageContent = document.getElementById('page-content');
    const logoToggleContainer = document.querySelector('.logo-toggle');
    const headerEl = document.querySelector('header');
    const navTart = document.getElementById('nav-tart');
    const navAbout = document.getElementById('nav-about');
    const navHome = document.getElementById('nav-home');
    const token = localStorage.getItem('token');

    // ---- Home filter state (AREA17) ----
    const filterTrigger = document.getElementById('filter-trigger');
    const filterPanel = document.getElementById('filter-panel');
    const applyBtn = document.getElementById('apply-filters');
    const clearBtn = document.getElementById('clear-filters');
    const filterCountEl = document.getElementById('filter-count');
    const homeFilterContainer = document.querySelector('.home-filter-container');
    let _allArtworks = [];
    let _rankedArtworks = [];
    let _selectedMediums = new Set();
    let _sortMode = 'default'; // 'default' | 'popularity' | 'latest'

    const setupAuthUI = async () => {
        const t = localStorage.getItem('token');
        if (t) {
            // Render immediately to reserve space and prevent layout shift
            const initialAvatarUrl = '/assets/default-avatar.svg';
            authContainer.innerHTML = `
                <div class="avatar-wrapper" id="header-avatar-wrapper">
                    <img src="${initialAvatarUrl}" alt="Account" class="header-avatar" id="header-avatar" />
                    <div class="avatar-dropdown" id="avatar-dropdown">
                        <a href="/account.html" class="dropdown-item">My account</a>
                        <a href="/upload.html" class="dropdown-item">Upload</a>
                        <button class="dropdown-item btn-link" id="header-logout">Log out</button>
                    </div>
                </div>
            `;

            // Attach listeners once
            const attachHeaderAuthListeners = () => {
                const logoutBtn = document.getElementById('header-logout');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        localStorage.removeItem('token');
                        window.location.reload();
                    });
                }

                const wrapper = document.getElementById('header-avatar-wrapper');
                const avatarImg = document.getElementById('header-avatar');
                if (wrapper && avatarImg) {
                    avatarImg.addEventListener('click', (e) => {
                        e.stopPropagation();
                        wrapper.classList.toggle('open');
                    });
                    document.addEventListener('click', () => {
                        wrapper.classList.remove('open');
                    });
                    const dropdown = document.getElementById('avatar-dropdown');
                    if (dropdown) dropdown.addEventListener('click', (e) => e.stopPropagation());
                }
            };
            attachHeaderAuthListeners();

            // Fetch current user to update avatar URL without reflowing layout
            try {
                const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': t } });
                if (res.ok) {
                    const me = await res.json();
                    if (me && me.profilePictureUrl) {
                        const avatarImg = document.getElementById('header-avatar');
                        if (avatarImg) avatarImg.src = me.profilePictureUrl;
                    }
                }
            } catch (e) {
                // ignore and keep default avatar
            }
        } else {
            // Simple pill button to open login popup
            authContainer.innerHTML = `<button id="open-login" class="pill-dark-btn">Log in</button>`;
            const btn = document.getElementById('open-login');
            if (btn) {
                btn.addEventListener('click', () => openLoginPopup());
            }

            // Listen for OAuth success message from popup
            const onMessage = (event) => {
                try {
                    // Only accept messages from same-origin
                    if (!event || event.origin !== window.location.origin) return;
                    const data = event && event.data;
                    if (data && data.type === 'oauthSuccess' && data.token) {
                        localStorage.setItem('token', data.token);
                        window.removeEventListener('message', onMessage);
                        // If a post-login redirect was requested, go there; otherwise reload
                        try {
                            const redirect = sessionStorage.getItem('postLoginRedirect');
                            if (redirect) {
                                sessionStorage.removeItem('postLoginRedirect');
                                window.location.href = redirect;
                                return;
                            }
                        } catch (e) { /* ignore */ }
                        window.location.reload();
                    }
                } catch (e) {
                    // ignore
                }
            };
            window.addEventListener('message', onMessage);
        }
    };

    function openLoginPopup(redirectUrl) {
        // Optional: set a post-login redirect (e.g., '/account.html')
        try {
            if (redirectUrl) sessionStorage.setItem('postLoginRedirect', redirectUrl);
        } catch (e) { /* ignore storage errors */ }
        const w = 480;
        const h = 640;
        const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
        const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
        const width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
        const height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;
        const left = ((width - w) / 2) + (dualScreenLeft || 0);
        const top = ((height - h) / 2) + (dualScreenTop || 0);
        const features = `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`;
        const popup = window.open('/login.html', 'tartLogin', features);
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            // Popup blocked; navigate instead
            window.location.href = '/login.html';
        }
    }

    // Helper: strip HTML tags to plain text
    function stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = String(html || '');
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    // Helper: escape text for safe HTML insertion (legacy poetryData)
    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Helper: convert escaped <font color> to safe <span style="color:"> for legacy poems
    function convertEscapedFontToSpan(html) {
        if (typeof html !== 'string') return '';
        // First, decode common entities so we can operate on real elements if needed
        const decoded = html
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        // Use DOM to robustly replace <font> with <span style="color:">
        const container = document.createElement('div');
        container.innerHTML = decoded;
        const fonts = container.querySelectorAll('font');
        fonts.forEach((font) => {
            const color = (font.getAttribute('color') || '').trim();
            const span = document.createElement('span');
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
                span.style.color = color;
            }
            span.innerHTML = font.innerHTML;
            font.replaceWith(span);
        });
        return container.innerHTML;
    }

    // Minimal sanitizer for legacy poetryData to allow safe inline markup
    function sanitizeLineHtml(html) {
        if (typeof html !== 'string') return '';
        let clean = String(html);
        // Strip scripts
        clean = clean.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
        // Remove inline event handlers
        clean = clean.replace(/ on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        // Convert tags
        clean = clean.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (m, tag, attrs) => {
            const isClosing = m.startsWith('</');
            const t = String(tag).toLowerCase();
            if (['b','i','u','s','strike','strong','em','br'].includes(t)) {
                return isClosing ? `</${t}>` : `<${t}>`;
            }
            if (t === 'font') {
                if (isClosing) return '</span>';
                const colorMatch = attrs && attrs.match(/color\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
                const color = colorMatch ? (colorMatch[2] || colorMatch[3] || colorMatch[4] || '').trim() : '';
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
                    return `<span style="color: ${color}">`;
                }
                return '<span>';
            }
            if (t === 'span') {
                if (isClosing) return '</span>';
                let color = '';
                const styleMatch = attrs && attrs.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
                const style = styleMatch ? (styleMatch[2] || styleMatch[3] || '') : '';
                const colorMatch = style.match(/color\s*:\s*([^;]+)/i);
                if (colorMatch) color = colorMatch[1].trim();
                return color ? `<span style="color: ${color}">` : '<span>';
            }
            // Escape any other tag types
            return m.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        });
        // Also handle escaped <font> that slipped in
        clean = convertEscapedFontToSpan(clean);
        return clean;
    }

    // Helper: get poetry first N lines (preferred) with sensible fallbacks
    function getPoetryPreview(artwork, linesCount = 1) {
        const MAX_PER_LINE = 60;
        const lines = [];
        if (artwork && artwork.poem && Array.isArray(artwork.poem.lines) && artwork.poem.lines.length) {
            for (let i = 0; i < Math.min(linesCount, artwork.poem.lines.length); i++) {
                const raw = artwork.poem.lines[i]?.html || '';
                const txt = stripHtml(raw).replace(/\s+/g, ' ').trim();
                if (txt) lines.push(txt);
            }
        } else if (artwork && Array.isArray(artwork.poetryData) && artwork.poetryData.length) {
            for (let i = 0; i < Math.min(linesCount, artwork.poetryData.length); i++) {
                const raw = artwork.poetryData[i]?.text || '';
                const txt = String(raw || '').replace(/\s+/g, ' ').trim();
                if (txt) lines.push(txt);
            }
        }
        // Fallback if no lines available
        if (!lines.length) {
            const fallback = (artwork.description || artwork.title || '').trim();
            return fallback.length > MAX_PER_LINE ? fallback.slice(0, MAX_PER_LINE) + '...' : fallback;
        }
        // Truncate each line and join with a line break
        const truncated = lines.map(l => (l.length > MAX_PER_LINE ? l.slice(0, MAX_PER_LINE) + '...' : l));
        return truncated.join('<br>');
    }

    // -------- Reveal-on-scroll helpers --------
    let revealObserver;
    function ensureRevealObserver() {
        if (revealObserver) return revealObserver;
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    el.classList.remove('will-reveal');
                    el.classList.add('fade-in');
                    revealObserver.unobserve(el);
                }
            });
        }, { root: null, threshold: 0.1 });
        return revealObserver;
    }

    function observeNewReveals(root) {
        const obs = ensureRevealObserver();
        const scope = root || document;
        scope.querySelectorAll('.will-reveal').forEach(el => obs.observe(el));
    }

    // --- Analytics helper ---
    function getSessionId() {
        try {
            const k = 'tart_session_id';
            let id = sessionStorage.getItem(k);
            if (!id) {
                id = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
                sessionStorage.setItem(k, id);
            }
            return id;
        } catch (_) { return undefined; }
    }
    function sendArtworkEvent(type, artworkId, extra) {
        try {
            const payload = JSON.stringify({ type, artworkId, sessionId: getSessionId(), ...(extra || {}) });
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon('/api/analytics/artwork-event', blob);
        } catch (_) { /* ignore */ }
    }

    function createArtworkCard(artwork, extraClasses = []) {
        const el = document.createElement('div');
        el.classList.add('artwork-card', ...extraClasses);
        const isHero = Array.isArray(extraClasses) && extraClasses.includes('hero');
        if (artwork.medium === 'poetry') {
            console.log('Processing poetry artwork:', artwork.title);
            console.log('Poem data structure:', {
                hasPoem: !!artwork.poem,
                poemType: artwork.poem ? typeof artwork.poem : 'none',
                hasPoetryData: Array.isArray(artwork.poetryData),
                description: artwork.description ? 'has description' : 'no description'
            });
            el.classList.add('poetry');
            // Always show only 2 lines in grid view, 4 lines in hero view
            const desiredLineCount = isHero ? 4 : 2;
            let lines = [];
            
            // Helper to split text into lines, handling both newlines and <br> tags
            const splitIntoLines = (text) => {
                if (!text) return [];
                
                // First split by <br> tags, then by newlines
                const lines = [];
                const parts = text.split(/(<br\s*\/?>|\r?\n)/i);
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    // Skip empty parts and <br> tags (we'll add them as empty lines)
                    if (!part || part.match(/^<br\s*\/?>$/i)) {
                        lines.push('');
                        continue;
                    }
                    // Skip the split delimiters (they're captured in the split)
                    if (i > 0 && (parts[i-1] === '\n' || parts[i-1] === '\r\n' || parts[i-1].match(/^<br\s*\/?>$/i))) {
                        continue;
                    }
                    // Trim and add non-empty lines
                    const trimmed = part.trim();
                    if (trimmed) {
                        lines.push(trimmed);
                    }
                }
                
                return lines;
            };
            
            // Try to get lines from poem data structure first
            if (artwork && artwork.poem) {
                let textContent = '';
                
                // Handle different poem data structures
                if (Array.isArray(artwork.poem.lines)) {
                    // If we have an array of lines, join them with newlines
                    textContent = artwork.poem.lines
                        .filter(line => line && (line.html || line.text))
                        .map(line => String(line.html || line.text || ''))
                        .join('\n');
                } else if (artwork.poem.text) {
                    // If we have a single text block
                    textContent = artwork.poem.text;
                }
                
                // Split into lines, handling both newlines and <br> tags
                if (textContent) {
                    // Replace all <br> tags with newlines
                    const normalizedText = textContent.replace(/<br\s*\/?>/gi, '\n');
                    // Split by newlines and filter out empty lines
                    const rawLines = normalizedText.split(/\r?\n/)
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    
                    // Take only the desired number of lines
                    lines = rawLines
                        .slice(0, desiredLineCount)
                        .map(line => ({
                            html: convertEscapedFontToSpan(line),
                            indent: 0,
                            spacing: 0
                        }));
                }
            }
            
            // If no lines from poem data, try poetryData array
            if (lines.length === 0 && Array.isArray(artwork.poetryData) && artwork.poetryData.length) {
                // Join all text with newlines, then split into lines
                const textContent = artwork.poetryData
                    .filter(item => item && item.text)
                    .map(item => String(item.text || '').trim())
                    .join('\n');
                
                // Split into lines, handling both newlines and <br> tags
                if (textContent) {
                    // Replace all <br> tags with newlines
                    const normalizedText = textContent.replace(/<br\s*\/?>/gi, '\n');
                    // Split by newlines and filter out empty lines
                    const rawLines = normalizedText.split(/\r?\n/)
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    
                    // Take only the desired number of lines
                    lines = rawLines
                        .slice(0, desiredLineCount)
                        .map(line => ({
                            html: convertEscapedFontToSpan(line),
                            indent: 0,
                            spacing: 0
                        }));
                }
            }
            
            // If still no lines, try to parse from description or title
            if (lines.length === 0) {
                const fallbackText = (artwork.description || artwork.title || '').trim();
                const fallbackLines = splitIntoLines(fallbackText);
                lines = fallbackLines
                    .slice(0, desiredLineCount)
                    .map(line => ({
                        html: escapeHtml(line),
                        indent: 0,
                        spacing: 0
                    }));
            }
            
            // If we still have no lines, use a placeholder
            if (lines.length === 0) {
                lines = [{ html: '&nbsp;', indent: 0, spacing: 0 }];
            }

            // Take only the desired number of lines
            const visibleLines = lines.slice(0, desiredLineCount);
            
            console.log('Processed lines:', lines);
            console.log('Visible lines:', visibleLines);
            
            const linesHtml = visibleLines.map((ln, idx) => {
                const pad = ln.indent > 0 ? `${ln.indent * 2}em` : '0';
                const mt = ln.spacing > 0 ? `${ln.spacing * 0.4}em` : '0';
                const mtStyle = mt !== '0' ? `margin-top: ${mt};` : '';
                return `<div class="poem-line" style="padding-left: ${pad}; ${mtStyle}">${ln.html}</div>`;
            }).join('');
            
            console.log('Generated HTML:', linesHtml);

            el.innerHTML = `
                <div class="poetry-preview">
                    <div class="poem-viewer">${linesHtml}</div>
                </div>
                <div class="artwork-info${artwork.source === 'ai' ? ' has-badge' : ''}">
                    <h3>${artwork.title}</h3>
                    <p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>
                    ${artwork.source === 'ai' ? '<span class="ai-badge" aria-label="AI generated">AI</span>' : ''}
                </div>
            `;
        } else {
            el.innerHTML = `
                <img src="${artwork.imageUrl}" alt="${artwork.title}" class="blurred" loading="lazy" decoding="async" fetchpriority="low">
                <div class="artwork-info${artwork.source === 'ai' ? ' has-badge' : ''}">
                    <h3>${artwork.title}</h3>
                    <p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>
                    ${artwork.source === 'ai' ? '<span class="ai-badge" aria-label="AI generated">AI</span>' : ''}
                </div>
            `;
        }
        el.addEventListener('click', () => {
            // Treat click to open as an unblur signal
            sendArtworkEvent('unblur', artwork._id);
            window.location.href = `/artwork.html?id=${artwork._id}`;
        });
        return el;
    }

    // ------- Rendering helpers for home list -------
    function renderFromList(list) {
        const useShowcase = !!(stickyHero && stickyGrid);
        try {
            if (useShowcase) {
                stickyHero.innerHTML = '';
                stickyGrid.innerHTML = '';
                artworksContainer.innerHTML = '';

                const hero = list[0];
                const rightCol = list.slice(1, 4);
                const rest = list.slice(4);

                if (hero) {
                    const heroCard = createArtworkCard(hero, ['hero']);
                    heroCard.classList.add('will-reveal');
                    heroCard.style.setProperty('--stagger', '0ms');
                    stickyHero.appendChild(heroCard);
                }
                rightCol.forEach((a, i) => {
                    const card = createArtworkCard(a);
                    card.classList.add('will-reveal');
                    card.style.setProperty('--stagger', `${(i + 1) * 100}ms`);
                    stickyGrid.appendChild(card);
                });

                rest.forEach((a, i) => {
                    const card = createArtworkCard(a);
                    card.classList.add('will-reveal');
                    const delay = (i % 10) * 60;
                    card.style.setProperty('--stagger', `${delay}ms`);
                    artworksContainer.appendChild(card);
                });

                observeNewReveals(document);
            } else {
                artworksContainer.innerHTML = '';
                list.forEach(a => artworksContainer.appendChild(createArtworkCard(a)));
            }
        } catch (e) {
            console.error('Render error:', e);
        }
    }

    function getFilteredList() {
        const base = _allArtworks.length ? _allArtworks : _rankedArtworks;
        if (!_selectedMediums || _selectedMediums.size === 0) return base;
        return base.filter(a => _selectedMediums.has(a.medium));
    }

    function getSortedList(list) {
        const arr = [...list];
        if (_sortMode === 'latest') {
            return arr.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
        }
        if (_sortMode === 'default') {
            // Preserve server/default algorithm order using ranked baseline
            if (Array.isArray(_rankedArtworks) && _rankedArtworks.length) {
                const idx = new Map(_rankedArtworks.map((x, i) => [x._id, i]));
                return arr.sort((a, b) => (idx.get(a._id) ?? 999999) - (idx.get(b._id) ?? 999999));
            }
            return arr; // no-op if no baseline
        }
        // popularity: primarily collectsCount, then commentsCount, fallback to ranked order if available index
        return arr.sort((a, b) => {
            const pa = (a.collectsCount || 0) * 10 + (a.commentsCount || 0);
            const pb = (b.collectsCount || 0) * 10 + (b.commentsCount || 0);
            if (pb !== pa) return pb - pa;
            // tie-breaker: if both in ranked list, keep ranked order
            const ia = _rankedArtworks.findIndex(x => x._id === a._id);
            const ib = _rankedArtworks.findIndex(x => x._id === b._id);
            if (ia !== -1 && ib !== -1) return ia - ib;
            return 0;
        });
    }

    function applyFiltersAndRender() {
        const filtered = getFilteredList();
        const sorted = getSortedList(filtered);
        renderFromList(sorted);
    }

    function updateFilterCountUI() {
        if (!filterCountEl) return;
        const n = _selectedMediums.size;
        filterCountEl.textContent = `${n} filter${n === 1 ? '' : 's'} applied`;
    }

    // -------- Sidebar + Page Switching --------
    function setActiveNav(id) {
        [navHome, navTart, navAbout].forEach(btn => btn && btn.classList.remove('active'));
        if (id) {
            const el = document.getElementById(id);
            el && el.classList.add('active');
        }
    }

    function renderTartHTML() {
        return `
          <style>
            .tart-container {
              background: #fff;
              min-height: 100vh;
              padding: 80px 40px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              color: #000;
            }
            
            .content-wrapper {
              max-width: 1400px;
              margin: 0 auto;
            }
            
            /* Header */
            .header-section {
              display: grid;
              grid-template-columns: auto 1fr 1fr 1fr;
              align-items: start;
              column-gap: 60px;
              margin-bottom: 160px;
            }
            
            .tagline-group {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 60px;
              max-width: 900px;
              grid-column: 2 / -1; /* place to the right of wordmark */
            }
            
            .tagline-item {
              position: relative;
              padding-left: 60px;
              font-size: 15px;
              line-height: 1.6;
              color: #000;
            }
            
            .tagline-item::before {
              content: '';
              position: absolute;
              left: 0;
              top: 8px;
              width: 40px;
              height: 1px;
              background: #000;
              animation: lineExpand 0.6s ease-out;
              animation-delay: var(--stagger, 0ms);
              animation-fill-mode: both;
            }
            
            /* Features */
            .features-section {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 80px;
            }
            
            .feature { }
            
            .feature-number {
              font-size: 14px;
              color: #999;
              margin-bottom: 40px;
              font-weight: 400;
            }
            
            .feature-title {
              font-size: 24px;
              font-weight: 400;
              margin-bottom: 32px;
              line-height: 1.3;
              letter-spacing: -0.01em;
            }
            
            .feature-description {
              font-size: 15px;
              line-height: 1.7;
              color: #333;
            }
            
            .feature-description p {
              margin: 0 0 16px 0;
            }
            
            .feature-description strong {
              font-weight: 500;
              color: #000;
            }
            
            .feature-description em {
              font-style: normal;
              color: #666;
              font-size: 14px;
            }
            
            /* CTA styles moved to global stylesheet */
            
            /* Responsive */
            @media (max-width: 1024px) {
              .header-section {
                grid-template-columns: 1fr; /* stack wordmark above taglines */
                row-gap: 24px;
              }
              .tagline-group {
                grid-template-columns: 1fr;
                gap: 40px;
                max-width: 500px;
                grid-column: auto;
              }
              
              .features-section {
                grid-template-columns: 1fr;
                gap: 100px;
              }
            }
            
            @media (max-width: 640px) {
              .tart-container {
                padding: 60px 24px;
              }
              
              .header-section {
                margin-bottom: 100px;
              }
              
              .tart-wordmark {
                font-size: 28px;
                margin-bottom: 60px;
              }
              
              .tagline-item {
                padding-left: 50px;
              }
              
              .feature-title {
                font-size: 20px;
              }
            }
            
            /* Subtle hover states */
            @media (hover: hover) {
              .feature {
                transition: transform 0.3s ease;
              }
              
              .feature:hover {
                transform: translateX(8px);
              }
            }
          </style>
          
          <div class="tart-container">
            <div class="content-wrapper">
              <!-- Header -->
              <header class="header-section">
                <h1 class="tart-wordmark">Tart</h1>
                
                <div class="tagline-group">
                  <div class="tagline-item fade-in" style="--stagger: 100ms">
                    <strong>Slow experience.</strong>
                  </div>
                  <div class="tagline-item fade-in" style="--stagger: 200ms">
                    <strong>Artist empowerment.</strong>
                  </div>
                  <div class="tagline-item fade-in" style="--stagger: 300ms">
                    <strong>Combat climate change.</strong>
                  </div>
                </div>
              </header>
              
              <!-- Features -->
              <section class="features-section">
                <!-- Feature 1 -->
                <article class="feature fade-in" style="--stagger: 400ms">
                  <div class="feature-number">01</div>
                  <h2 class="feature-title">A slow, clean experience</h2>
                  <div class="feature-description">
                    <p><strong>Focus Mode</strong>: surrounding UI is minimized so the piece takes center stage — follows, likes, numbers, gone.</p>
                    <p><strong>Blurred Browsing</strong>: nothing is forced upon you; wander at your own pace.</p>
                  </div>
                </article>
                
                <!-- Feature 2 -->
                <article class="feature fade-in" style="--stagger: 500ms">
                  <div class="feature-number">02</div>
                  <h2 class="feature-title">Artist empowerment</h2>
                  <div class="feature-description">
                    <p><strong>Portfolio website in under 5 minutes</strong>.</p>
                    <p>Your personal website on your own domain — just a few clicks.</p>
                    <p><strong>And it's Free.</strong></p>
                    <a href="/survey.html" class="cta-link">Start your site</a>
                  </div>
                </article>
                
                <!-- Feature 3 -->
                <article class="feature fade-in" style="--stagger: 600ms">
                  <div class="feature-number">03</div>
                  <h2 class="feature-title">Combat Climate Change</h2>
                  <div class="feature-description">
                  <p>Official partnership with <a href="https://trees.org" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">TREES</a>, <strong>a UN World Restoration Flagship</strong>.</p>
                    <p>Grow a Forest with Your Art. <strong>Every 12 artworks you share plants a real tree.</strong> 🌱</p>
                    <p>Your creativity leaves roots in the world.</p>
                    <a href="/upload.html" id="cta-upload" class="cta-link">Upload your artwork</a>
                  </div>
                </article>
              </section>
            </div>
          </div>
        `;
    }

    function renderAboutHTML() {
    return `
        <h2 class="will-reveal" style="--stagger: 0ms">About us</h2>
        <div class="letter will-reveal" style="--stagger: 120ms">
            <p>I'd much prefer to write a letter to you, than doing more boasting and showing a stupid profile picture of myself. So.</p>
            <p>Dear creators,</p>
            <p>I will start by telling you two interesting anecdotes.</p>
            <p>In 1929, Faulkner wrote, "I wish publishing was advanced enough to use colored ink... I'll just have to save the idea until publishing grows up." Publishing never did grow up—he wrote <em>The Sound and the Fury</em> in black and white.</p>
            <p>The Victorian art critic John Ruskin, upon seeing Turner's Venice works, wrote: <em>"They are like visions seen in fever—unspeakable in their beauty, but trembling, perishing, before they are grasped."</em> Yet he also complained in <em>Modern Painters</em> that Turner's works were dismissed as "indistinct" because visitors simply couldn't view them under good conditions: <em>"He has hidden his light under bushels of dust and darkness."</em></p>
            <p>I share their frustration. I've heard countless complaints about current social media platforms, about how hard it is for artists be seen—from friends at Brown and RISD with unseen talents, from artist friends, and from people I consider extremely talented who feel discouraged from even attempting to create because of the status quo. Unlike Faulkner and Ruskin, however, we have the advantage of living in the 21st century with AI and the internet at our disposal. Things can be and will be different. This website is the first step and I need your help. </p>
            <p>Upload your artwork. Share this website with friends. Let your art be seen and felt. Don't hide your light under bushels of dust and darkness.</p>
            <p>Thank you for building with us. We can't wait to see what you publish. :)</p>
            <p style="margin-top: 32px;">Cheers,<br />
            Jason Lin</p>
        </div>
    `;
}

function showPage(page) {
    const showcase = document.getElementById('showcase');
    if (!page || page === 'home') {
        // Show artworks
        setActiveNav('nav-home');
        pageContent.hidden = true;
        showcase && (showcase.style.display = '');
        artworksContainer.style.display = '';
        // Show filter on Home
        if (homeFilterContainer) homeFilterContainer.style.display = '';
        // Re-render artworks if container is empty
        if (!artworksContainer.children.length) fetchArtworks();
        // observe any pending reveals in artworks containers
        observeNewReveals(document);
    } else if (page === 'tart') {
        setActiveNav('nav-tart');
        pageContent.hidden = false;
        pageContent.innerHTML = renderTartHTML();
        showcase && (showcase.style.display = 'none');
        artworksContainer.style.display = 'none';
        // Hide filter and close panel when leaving Home
        if (homeFilterContainer) homeFilterContainer.style.display = 'none';
        if (filterPanel && filterPanel.classList.contains('active')) {
            filterPanel.classList.remove('active');
            filterTrigger && filterTrigger.classList.remove('active');
            filterTrigger && filterTrigger.setAttribute('aria-expanded', 'false');
            filterPanel.setAttribute('aria-hidden', 'true');
        }
        // Tart uses direct fade-in; still observe in case future will-reveal exists
        observeNewReveals(pageContent);
        // Wire CTA: if not logged in, open login then redirect to account; if logged in, go to upload
        const uploadCta = pageContent.querySelector('#cta-upload');
        if (uploadCta) {
            uploadCta.addEventListener('click', (e) => {
                const t = localStorage.getItem('token');
                if (!t) {
                    e.preventDefault();
                    try { sessionStorage.setItem('postLoginRedirect', '/account.html'); } catch (err) { /* ignore */ }
                    openLoginPopup('/account.html');
                }
                // if logged in, allow default navigation to /upload.html
            });
        }
    } else if (page === 'about') {
        setActiveNav('nav-about');
        pageContent.hidden = false;
        pageContent.innerHTML = renderAboutHTML();
        showcase && (showcase.style.display = 'none');
        artworksContainer.style.display = 'none';
        // Hide filter and close panel when leaving Home
        if (homeFilterContainer) homeFilterContainer.style.display = 'none';
        if (filterPanel && filterPanel.classList.contains('active')) {
            filterPanel.classList.remove('active');
            filterTrigger && filterTrigger.classList.remove('active');
            filterTrigger && filterTrigger.setAttribute('aria-expanded', 'false');
            filterPanel.setAttribute('aria-hidden', 'true');
        }
        observeNewReveals(pageContent);
    }

    // On mobile, auto-close the sidebar after navigation
    closeSidebarOnMobile();
}

    // Update labels/titles for toggle and logo area based on sidebar state
    function updateSidebarToggleA11y() {
        const isOpen = appEl && appEl.classList.contains('sidebar-open');
        const label = isOpen ? 'Close sidebar' : 'Open sidebar';
        if (sidebarToggle) {
            sidebarToggle.setAttribute('aria-label', label);
            sidebarToggle.setAttribute('title', label);
        }
    }

    // -------- Mobile helpers: detect and close sidebar --------
    function isMobile() {
        return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 680px)').matches;
    }

    function closeSidebarOnMobile() {
        if (!appEl) return;
        if (isMobile()) {
            appEl.classList.remove('sidebar-open');
            appEl.classList.add('sidebar-closed');
            updateSidebarToggleA11y();
        }
    }

    if (sidebarToggle && appEl) {
        sidebarToggle.addEventListener('click', () => {
            const open = appEl.classList.contains('sidebar-open');
            appEl.classList.toggle('sidebar-open', !open);
            appEl.classList.toggle('sidebar-closed', open);
            updateSidebarToggleA11y();
        });
    }

    // Initialize correct labels/titles on load
    updateSidebarToggleA11y();

    // ------- Mobile header toggle placement -------
    function moveToggleForMobile() {
        if (!sidebarToggle || !headerEl) return;
        const tagline = headerEl.querySelector('p');
        if (!tagline) return;
        if (sidebarToggle.dataset.moved === '1') return; // already moved
        headerEl.insertBefore(sidebarToggle, tagline);
        sidebarToggle.dataset.moved = '1';
    }

    function restoreToggleForDesktop() {
        if (!sidebarToggle || !logoToggleContainer) return;
        if (sidebarToggle.dataset.moved !== '1') return;
        logoToggleContainer.appendChild(sidebarToggle);
        delete sidebarToggle.dataset.moved;
    }

    function placeToggleBasedOnViewport() {
        if (isMobile()) moveToggleForMobile();
        else restoreToggleForDesktop();
    }

    // Initial placement and keep in sync on resize
    placeToggleBasedOnViewport();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(placeToggleBasedOnViewport, 150);
    });

    navTart && navTart.addEventListener('click', () => {
        if (location.hash !== '#tart') location.hash = '#tart';
        else showPage('tart');
        // Auto-close sidebar on mobile after clicking
        closeSidebarOnMobile();
    });
    navAbout && navAbout.addEventListener('click', () => {
        if (location.hash !== '#about') location.hash = '#about';
        else showPage('about');
        closeSidebarOnMobile();
    });
    navHome && navHome.addEventListener('click', () => {
        if (location.hash !== '#home') location.hash = '#home';
        else showPage('home');
        closeSidebarOnMobile();
    });

    window.addEventListener('hashchange', () => {
        const hash = location.hash.replace('#', '');
        showPage(hash || 'home');
    });

    const fetchArtworks = async () => {
        try {
            let res = await fetch('/api/artworks/home-ranked');
            if (!res.ok) {
                // fallback to chronological if ranked not available
                res = await fetch('/api/artworks');
            }
            const artworks = await res.json();
            // Ensure counts exist if backend fallback was used
            const withCounts = Array.isArray(artworks) ? artworks.map(a => ({
                ...a,
                collectsCount: typeof a.collectsCount === 'number' ? a.collectsCount : 0,
                commentsCount: typeof a.commentsCount === 'number' ? a.commentsCount : 0,
            })) : [];

            // If response was from /home-ranked, treat as ranked baseline
            _rankedArtworks = withCounts;
            _allArtworks = withCounts;
            applyFiltersAndRender();
        } catch (error) {
            console.error('Failed to fetch artworks:', error);
            artworksContainer.innerHTML = '<p>Could not load artworks.</p>';
        }
    };

    // ---- Wire AREA17 filter UI ----
    if (filterTrigger && filterPanel) {
        const openPanel = () => {
            filterPanel.classList.add('active');
            filterTrigger.classList.add('active');
            filterTrigger.setAttribute('aria-expanded', 'true');
            filterPanel.setAttribute('aria-hidden', 'false');
            document.addEventListener('click', outsideClickHandler);
            document.addEventListener('keydown', escHandler);
        };
        const closePanel = () => {
            filterPanel.classList.remove('active');
            filterTrigger.classList.remove('active');
            filterTrigger.setAttribute('aria-expanded', 'false');
            filterPanel.setAttribute('aria-hidden', 'true');
            document.removeEventListener('click', outsideClickHandler);
            document.removeEventListener('keydown', escHandler);
        };
        const outsideClickHandler = (e) => {
            if (!filterTrigger.contains(e.target) && !filterPanel.contains(e.target)) {
                closePanel();
            }
        };
        const escHandler = (e) => { if (e.key === 'Escape') closePanel(); };

        filterTrigger.addEventListener('click', () => {
            if (filterPanel.classList.contains('active')) closePanel(); else openPanel();
        });

        // Track checkbox changes for count UI
        document.querySelectorAll('.filter-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) _selectedMediums.add(cb.value); else _selectedMediums.delete(cb.value);
                updateFilterCountUI();
            });
        });

        // Sort radio
        document.querySelectorAll('.sort-radio').forEach(r => {
            r.addEventListener('change', () => {
                if (r.checked) _sortMode = r.value; // 'popularity' | 'latest'
            });
        });

        // Apply
        applyBtn && applyBtn.addEventListener('click', () => {
            closePanel();
            applyFiltersAndRender();
        });

        // Clear
        clearBtn && clearBtn.addEventListener('click', () => {
            _selectedMediums.clear();
            document.querySelectorAll('.filter-checkbox').forEach(cb => { cb.checked = false; });
            // reset sort to default
            _sortMode = 'default';
            const def = document.querySelector('.sort-radio[value="default"]');
            if (def) def.checked = true;
            updateFilterCountUI();
        });

        // Initialize count label
        updateFilterCountUI();
    }

    setupAuthUI();
    // Initial route
    const initial = location.hash.replace('#', '') || 'home';
    // Do not pre-fetch here; showPage('home') will fetch if needed.
    showPage(initial);
});
