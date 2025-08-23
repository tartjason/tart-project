document.addEventListener('DOMContentLoaded', () => {
    const artworksContainer = document.getElementById('artworks-container');
    const stickyHero = document.getElementById('sticky-hero');
    const stickyGrid = document.getElementById('sticky-grid');
    const authContainer = document.getElementById('auth-container');
    const appEl = document.getElementById('app');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const pageContent = document.getElementById('page-content');
    const navTart = document.getElementById('nav-tart');
    const navAbout = document.getElementById('nav-about');
    const navHome = document.getElementById('nav-home');
    const token = localStorage.getItem('token');

    const setupAuthUI = async () => {
        const t = localStorage.getItem('token');
        if (t) {
            // Fetch current user to get avatar URL
            let avatarUrl = '/assets/default-avatar.svg';
            try {
                const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': t } });
                if (res.ok) {
                    const me = await res.json();
                    if (me && me.profilePictureUrl) {
                        avatarUrl = me.profilePictureUrl;
                    }
                }
            } catch (e) {
                // ignore and use default avatar
            }

            authContainer.innerHTML = `
                <div class="avatar-wrapper" id="header-avatar-wrapper">
                    <img src="${avatarUrl}" alt="Account" class="header-avatar" id="header-avatar" />
                    <div class="avatar-dropdown" id="avatar-dropdown">
                        <a href="/account.html" class="dropdown-item">My account</a>
                        <button class="dropdown-item btn-link" id="header-logout">Log out</button>
                    </div>
                </div>
            `;

            const logoutBtn = document.getElementById('header-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    localStorage.removeItem('token');
                    window.location.reload();
                });
            }

            // Toggle dropdown on click (better for touch devices)
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
                // Keep dropdown open when interacting inside
                const dropdown = document.getElementById('avatar-dropdown');
                if (dropdown) {
                    dropdown.addEventListener('click', (e) => e.stopPropagation());
                }
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
                        window.location.reload();
                    }
                } catch (e) {
                    // ignore
                }
            };
            window.addEventListener('message', onMessage);
        }
    };

    function openLoginPopup() {
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

    function createArtworkCard(artwork, extraClasses = []) {
        const el = document.createElement('div');
        el.classList.add('artwork-card', ...extraClasses);
        if (artwork.medium === 'poetry') {
            el.classList.add('poetry');
            // Build up to 2 faithful lines using poem metadata when available
            let lines = [];
            if (artwork && artwork.poem && Array.isArray(artwork.poem.lines) && artwork.poem.lines.length) {
                lines = artwork.poem.lines.slice(0, 2).map((line) => ({
                    html: convertEscapedFontToSpan(String(line.html || '')),
                    indent: Number.isFinite(line.indent) ? line.indent : 0,
                    spacing: Number.isFinite(line.spacing) ? line.spacing : 0
                }));
            } else if (artwork && Array.isArray(artwork.poetryData) && artwork.poetryData.length) {
                lines = artwork.poetryData.slice(0, 2).map((l) => ({
                    html: sanitizeLineHtml(l.text || ''),
                    indent: 0,
                    spacing: 0
                }));
            } else {
                // Fallback single line from description/title
                lines = [{ html: escapeHtml(artwork.description || artwork.title || ''), indent: 0, spacing: 0 }];
            }

            const linesHtml = lines.map((ln, idx) => {
                const pad = ln.indent > 0 ? `${ln.indent * 2}em` : '0';
                const mt = ln.spacing > 0 ? `${ln.spacing * 0.4}em` : '0';
                const mtStyle = mt !== '0' ? `margin-top: ${mt};` : '';
                return `<div class="poem-line" style="padding-left: ${pad}; ${mtStyle}">${ln.html}</div>`;
            }).join('');

            el.innerHTML = `
                <div class="poetry-preview">
                    <div class="poem-viewer">${linesHtml}</div>
                </div>
                <div class="artwork-info">
                    <h3>${artwork.title}</h3>
                    <p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>
                </div>
            `;
        } else {
            el.innerHTML = `
                <img src="${artwork.imageUrl}" alt="${artwork.title}" class="blurred" loading="lazy" decoding="async" fetchpriority="low">
                <div class="artwork-info">
                    <h3>${artwork.title}</h3>
                    <p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>
                </div>
            `;
        }
        el.addEventListener('click', () => {
            window.location.href = `/artwork.html?id=${artwork._id}`;
        });
        return el;
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
            <h2>What is Tart</h2>
            <p>We are building a new home for artists — simple tools, expressive canvases, and a community that values creativity.</p>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-img" aria-hidden="true"></div>
                    <div class="feature-body">
                        <h3>Creative Canvas</h3>
                        <p>Compose poetry, images, and layouts with intuitive controls designed for flow.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <div class="feature-img" aria-hidden="true"></div>
                    <div class="feature-body">
                        <h3>Showcase First</h3>
                        <p>Your work takes center stage with immersive presentation and clean typography.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <div class="feature-img" aria-hidden="true"></div>
                    <div class="feature-body">
                        <h3>Own Your Space</h3>
                        <p>Publish a beautiful site in minutes and keep full control over your content.</p>
                    </div>
                </div>
            </div>
            <div class="section-divider" style="margin:24px 0"></div>
            <h3>Our philosophy</h3>
            <p>Great tools should disappear. Tart focuses on clarity and speed so artists can stay in the moment — from spark to shareable work.</p>
        `;
    }

    function renderAboutHTML() {
        return `
            <h2>About us</h2>
            <div class="letter">
                <p>Dear creators,</p>
                <p>We started Tart to make a calmer, kinder place for art online. A place where your ideas are respected and your pages load fast. We obsess over the details so you can focus on the work.</p>
                <p>Thank you for building with us. We can’t wait to see what you publish.</p>
                <div class="signature">— The Founder, Tart</div>
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
            // Re-render artworks if container is empty
            if (!artworksContainer.children.length) fetchArtworks();
        } else if (page === 'tart') {
            setActiveNav('nav-tart');
            pageContent.hidden = false;
            pageContent.innerHTML = renderTartHTML();
            showcase && (showcase.style.display = 'none');
            artworksContainer.style.display = 'none';
        } else if (page === 'about') {
            setActiveNav('nav-about');
            pageContent.hidden = false;
            pageContent.innerHTML = renderAboutHTML();
            showcase && (showcase.style.display = 'none');
            artworksContainer.style.display = 'none';
        }
    }

    if (sidebarToggle && appEl) {
        sidebarToggle.addEventListener('click', () => {
            const open = appEl.classList.contains('sidebar-open');
            appEl.classList.toggle('sidebar-open', !open);
            appEl.classList.toggle('sidebar-closed', open);
        });
    }

    navTart && navTart.addEventListener('click', () => {
        if (location.hash !== '#tart') location.hash = '#tart';
        else showPage('tart');
    });
    navAbout && navAbout.addEventListener('click', () => {
        if (location.hash !== '#about') location.hash = '#about';
        else showPage('about');
    });
    navHome && navHome.addEventListener('click', () => {
        if (location.hash !== '#home') location.hash = '#home';
        else showPage('home');
    });

    window.addEventListener('hashchange', () => {
        const hash = location.hash.replace('#', '');
        showPage(hash || 'home');
    });

    const fetchArtworks = async () => {
        try {
            const res = await fetch('/api/artworks');
            const artworks = await res.json();
            // If showcase containers exist, use sticky hero + right grid for first 4 items
            const useShowcase = !!(stickyHero && stickyGrid);
            if (useShowcase) {
                stickyHero.innerHTML = '';
                stickyGrid.innerHTML = '';
                artworksContainer.innerHTML = '';

                const hero = artworks[0];
                const rightCol = artworks.slice(1, 4);
                const rest = artworks.slice(4);

                if (hero) {
                    const heroCard = createArtworkCard(hero, ['hero']);
                    stickyHero.appendChild(heroCard);
                }
                rightCol.forEach(a => {
                    const card = createArtworkCard(a);
                    stickyGrid.appendChild(card);
                });

                // Uniform grid for the remaining list (no tall/featured variants)
                rest.forEach((a) => {
                    const card = createArtworkCard(a);
                    artworksContainer.appendChild(card);
                });
            } else {
                // Fallback: original single grid behavior
                artworksContainer.innerHTML = '';
                artworks.forEach(a => artworksContainer.appendChild(createArtworkCard(a)));
            }
        } catch (error) {
            console.error('Failed to fetch artworks:', error);
            artworksContainer.innerHTML = '<p>Could not load artworks.</p>';
        }
    };

    setupAuthUI();
    // Initial route
    const initial = location.hash.replace('#', '') || 'home';
    if (initial === 'home') fetchArtworks();
    showPage(initial);
});
