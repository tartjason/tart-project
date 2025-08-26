document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const authContainer = document.getElementById('auth-container');

    // --- Header auth UI (avatar/login) mirroring home page ---
    async function setupAuthUI() {
        if (!authContainer) return;
        const t = localStorage.getItem('token');
        if (t) {
            // Render avatar shell first to avoid layout shift
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
            // Listeners
            const logoutBtn = document.getElementById('header-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    localStorage.removeItem('token');
                    window.location.reload();
                }); 
            }
 
// ---------------- Comments UI (frontend only, to be wired to API later) ----------------
 
            const wrapper = document.getElementById('header-avatar-wrapper');
            const avatarImg = document.getElementById('header-avatar');
            if (wrapper && avatarImg) {
                avatarImg.addEventListener('click', (e) => {
                    e.stopPropagation();
                    wrapper.classList.toggle('open');
                });
                document.addEventListener('click', () => wrapper.classList.remove('open'));
                const dropdown = document.getElementById('avatar-dropdown');
                if (dropdown) dropdown.addEventListener('click', (e) => e.stopPropagation());
            }
            // Fetch user to update avatar image
            try {
                const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': t } });
                if (res.ok) {
                    const me = await res.json();
                    if (me && me.profilePictureUrl) {
                        const img = document.getElementById('header-avatar');
                        if (img) img.src = me.profilePictureUrl;
                    }
                }
            } catch (e) { /* keep default avatar */ }
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
                } catch (_) { /* ignore */ }
            };
            window.addEventListener('message', onMessage);
        }
    }

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
            window.location.href = '/login.html';
        }
    }

    await setupAuthUI();

    const params = new URLSearchParams(window.location.search);
    const artworkId = params.get('id');
    const visitorMode = !!params.get('artistId');

    if (!artworkId) {
        document.querySelector('main').innerHTML = '<h1>Artwork not found.</h1>';
        // Ensure the page becomes visible even if there's no ID
        document.body.classList.add('ready');
        return;
    }

// -------- Poem rendering --------
function renderPoem(container, poem) {
    if (!container) return;
    container.innerHTML = '';
    const lines = (poem && Array.isArray(poem.lines)) ? poem.lines : [];
    lines.forEach((line) => {
        const div = document.createElement('div');
        div.className = 'poem-line';
        const indent = Number.isFinite(line.indent) ? line.indent : 0;
        const spacing = Number.isFinite(line.spacing) ? line.spacing : 0;
        // Inline styles derived from numeric metadata
        const pad = indent > 0 ? `${indent * 2}em` : '0';
        const marginTop = spacing > 0 ? `${spacing * 0.4}em` : '0';
        div.style.paddingLeft = pad;
        if (marginTop !== '0') div.style.marginTop = marginTop;
        // HTML has been sanitized server-side
        div.innerHTML = String(line.html || '');
        container.appendChild(div);
    });
}

    let currentUserId = null;
    if (token) {
        try {
            const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
            if (res.ok) {
                const artist = await res.json();
                currentUserId = artist._id;
            }
        } catch (e) {
            console.error('Could not fetch current user', e);
        }
    }

    try {
        const res = await fetch(`/api/artworks/${artworkId}`);
        if (!res.ok) {
            throw new Error('Artwork not found');
        }
        const artwork = await res.json();

        // Populate Page Elements
        document.title = artwork.title; // Set page title
        const imageContainer = document.getElementById('artwork-image-container');
        const poemContainer = document.getElementById('poem-container');
        const hasPoemLines = !!(artwork.poem && Array.isArray(artwork.poem.lines) && artwork.poem.lines.length > 0);

        // Reset page state to non-poetry first (prevents stale poetry layout)
        document.body.classList.remove('poetry-mode');
        if (poemContainer) { poemContainer.hidden = true; poemContainer.style.display = 'none'; poemContainer.innerHTML = ''; }
        if (imageContainer) { imageContainer.style.display = 'block'; imageContainer.innerHTML = ''; }
        if (artwork.medium === 'poetry' || hasPoemLines) {
            // Poetry rendering
            if (imageContainer) imageContainer.innerHTML = '';
            if (imageContainer) imageContainer.style.display = 'none';
            if (poemContainer) {
                poemContainer.hidden = false;
                poemContainer.style.display = 'block';
                renderPoem(poemContainer, artwork.poem);
            }
            document.body.classList.add('poetry-mode');
            // Enable focus mode for poetry as well
            setupFocusMode();
        } else {
            // Image rendering
            // Make sure poetry mode is off first to avoid CSS hiding the image
            document.body.classList.remove('poetry-mode');
            if (imageContainer) {
                imageContainer.style.display = 'block';
                imageContainer.innerHTML = `<img src="${artwork.imageUrl}" alt="${artwork.title}" decoding="async" fetchpriority="high">`;
            }
            if (poemContainer) {
                poemContainer.hidden = true;
                poemContainer.style.display = 'none';
                poemContainer.innerHTML = '';
            }
            // Immersive additions
            const mainImg = document.querySelector('#artwork-image-container img');
            if (mainImg) {
                setupAmbientBg(artwork.imageUrl);
                setupLightbox(mainImg, artwork.imageUrl);
                setupFocusMode();
            }
            // Ensure poetry mode is off for non-poetry (redundant safety)
            document.body.classList.remove('poetry-mode');
        }
        document.getElementById('artwork-title').textContent = artwork.title;
        
        // Handle description section - hide if empty
        const descriptionSection = document.querySelector('.artwork-inspiration');
        const descriptionText = document.getElementById('artwork-inspiration-text');
        
        if (artwork.description && artwork.description.trim() !== '') {
            descriptionText.textContent = artwork.description;
            descriptionSection.style.display = 'block';
            // Also show the divider before description section
            const dividerBefore = descriptionSection.previousElementSibling;
            if (dividerBefore && dividerBefore.classList.contains('section-divider')) {
                dividerBefore.style.display = 'block';
            }
            // And show the divider after description section
            const dividerAfter = descriptionSection.nextElementSibling;
            if (dividerAfter && dividerAfter.classList.contains('section-divider')) {
                dividerAfter.style.display = 'block';
            }
        } else {
            descriptionSection.style.display = 'none';
            // Also hide the divider before description section
            const dividerBefore = descriptionSection.previousElementSibling;
            if (dividerBefore && dividerBefore.classList.contains('section-divider')) {
                dividerBefore.style.display = 'none';
            }
            // Hide the divider after description section
            const dividerAfter = descriptionSection.nextElementSibling;
            if (dividerAfter && dividerAfter.classList.contains('section-divider')) {
                dividerAfter.style.display = 'none';
            }
        }
        
        document.getElementById('artwork-time').textContent = new Date(artwork.createdAt).toLocaleDateString();
        document.getElementById('artwork-location').textContent = artwork.locationDisplay || artwork.location || 'Unknown';
        // Source (optional)
        const sourceEl = document.getElementById('artwork-source');
        if (artwork.source) {
            const label = artwork.source === 'ai' ? 'AI generated' : 'Human made';
            sourceEl.textContent = `Source: ${label}`;
        } else {
            sourceEl.textContent = '';
        }

        // Metrics (optional)
        const metricsWrap = document.getElementById('artwork-metrics');
        const metricsText = document.getElementById('artwork-metrics-text');
        let metricsOut = '';
        if (artwork.metrics2d && (artwork.metrics2d.width !== undefined || artwork.metrics2d.height !== undefined) && artwork.metrics2d.units) {
            const w = artwork.metrics2d.width;
            const h = artwork.metrics2d.height;
            const u = artwork.metrics2d.units;
            if (w !== undefined && h !== undefined) {
                metricsOut = `${w} × ${h} ${u}`;
            } else if (w !== undefined) {
                metricsOut = `Width: ${w} ${u}`;
            } else if (h !== undefined) {
                metricsOut = `Height: ${h} ${u}`;
            }
        } else if (artwork.metrics3d && (artwork.metrics3d.length !== undefined || artwork.metrics3d.width !== undefined || artwork.metrics3d.height !== undefined) && artwork.metrics3d.units) {
            const L = artwork.metrics3d.length;
            const W = artwork.metrics3d.width;
            const H = artwork.metrics3d.height;
            const U = artwork.metrics3d.units;
            const parts = [];
            if (L !== undefined) parts.push(L);
            if (W !== undefined) parts.push(W);
            if (H !== undefined) parts.push(H);
            if (parts.length) metricsOut = `${parts.join(' × ')} ${U}`;
        }
        const dividerBeforeMetrics = metricsWrap ? metricsWrap.previousElementSibling : null; // expected: .section-divider
        const dividerAfterMetrics = metricsWrap ? metricsWrap.nextElementSibling : null;   // expected: .section-divider
        // Divider right after Description section (to prevent double lines when metrics are hidden)
        const descSectionForDividers = document.querySelector('.artwork-inspiration');
        const dividerAfterDescription = descSectionForDividers ? descSectionForDividers.nextElementSibling : null;
        if (metricsOut) {
            metricsWrap.hidden = false;
            metricsText.textContent = metricsOut;
            if (dividerBeforeMetrics && dividerBeforeMetrics.classList.contains('section-divider')) {
                dividerBeforeMetrics.style.display = '';
            }
            if (dividerAfterMetrics && dividerAfterMetrics.classList.contains('section-divider')) {
                dividerAfterMetrics.style.display = '';
            }
        } else {
            // Keep the divider after metrics (separator before footer), hide the one before metrics
            if (dividerBeforeMetrics && dividerBeforeMetrics.classList.contains('section-divider')) {
                dividerBeforeMetrics.style.display = 'none';
            }
            if (dividerAfterMetrics && dividerAfterMetrics.classList.contains('section-divider')) {
                dividerAfterMetrics.style.display = '';
            }
            // Hide the divider immediately after Description to avoid two consecutive lines
            if (dividerAfterDescription && dividerAfterDescription.classList.contains('section-divider')) {
                dividerAfterDescription.style.display = 'none';
            }
        }

        // Populate Artist Info
        const artist = artwork.artist;
        const avatarEl = document.getElementById('artist-avatar');
        if (avatarEl) avatarEl.src = artist.profilePictureUrl || '/assets/default-avatar.svg';
        const nameEl = document.getElementById('artist-name');
        if (nameEl) nameEl.textContent = artist.name;
        const artistLink = document.getElementById('artist-link');
        const profileUrl = `/account.html?artistId=${encodeURIComponent(String(artist._id))}`;
        if (artistLink) {
            artistLink.href = profileUrl;
            artistLink.style.cursor = 'pointer';
            artistLink.style.textDecoration = '';
        }
        if (nameEl) {
            nameEl.style.cursor = 'pointer';
            nameEl.title = 'View artist profile';
            nameEl.addEventListener('click', () => { window.location.href = profileUrl; });
        }

        // Setup Buttons
        const collectBtn = document.getElementById('collect-btn');
        const followBtn = document.getElementById('follow-btn');

        if (!token) {
            // Not logged in: keep buttons clickable and show a login-required notice
            if (collectBtn) {
                collectBtn.disabled = false;
                collectBtn.title = 'Log in to collect this artwork';
                collectBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    showNotice('Please log in to collect this artwork.', 'info');
                });
            }
            if (followBtn) {
                followBtn.disabled = false;
                followBtn.title = 'Log in to follow this artist';
                followBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    showNotice('Please log in to follow this artist.', 'info');
                });
            }
        } else {
            // Update button states based on user's status
            const isCollectedByMe = Array.isArray(artwork.collectedBy) && artwork.collectedBy.some(id => String(id) === String(currentUserId));
            updateCollectButton(isCollectedByMe);
            
            // Fetch full current user data for following status
            const userRes = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
            const currentUser = await userRes.json();
            const isFollowing = Array.isArray(currentUser.following) && currentUser.following.some(f => String((f && f._id) || f) === String(artist._id));
            updateFollowButton(isFollowing);

            // Hide follow button if viewing own profile
            if (artist._id === currentUserId) {
                followBtn.style.display = 'none';
            } else if (visitorMode) {
                // In visitor mode, disable follow actions
                followBtn.disabled = true;
                followBtn.title = 'Follow is disabled in visitor mode';
            } else {
                followBtn.addEventListener('click', () => handleFollow(artist._id, token));
            }

            collectBtn.addEventListener('click', () => handleCollect(artwork._id, token, currentUserId));
        }

        // Initialize Comments UI (frontend-only for now)
        initCommentsUI({ artworkId: artwork._id, token, currentUserId, artistId: artist._id });

        // Ready gate: reveal once content and first image (if any) are loaded
        const isPoetry = (artwork.medium === 'poetry' || hasPoemLines);
        if (isPoetry) {
            setReadyAndReveal();
            // If user came from preview upload flow, show a success notice with a quick return link
            let fromPreview = (params.get('fromPreview') === '1');
            try { if (!fromPreview && sessionStorage.getItem('fromPreviewUpload') === '1') fromPreview = true; } catch (_) {}
            if (fromPreview) {
                const n = showNotice('Upload succeeds. Back to Preview.', 'success', 6000);
                if (n) {
                    n.style.cursor = 'pointer';
                    n.setAttribute('role', 'link');
                    n.title = 'Back to Preview';
                    n.addEventListener('click', (e) => {
                        e.preventDefault();
                        window.location.href = '/survey.html';
                    });
                }
                // Clean the URL so notice doesn't reappear on refresh
                params.delete('fromPreview');
                const newQs = params.toString();
                const cleanUrl = window.location.pathname + (newQs ? ('?' + newQs) : '') + window.location.hash;
                try { history.replaceState(null, '', cleanUrl); } catch (_) {}
                // Clear the session flag so it doesn't persist
                try { sessionStorage.removeItem('fromPreviewUpload'); } catch (_) {}
            }
        } else {
            const mainImgLoadedEl = document.querySelector('#artwork-image-container img');
            if (mainImgLoadedEl) {
                // Wait for the image to load, but don't block forever
                await Promise.race([
                    imageLoaded(mainImgLoadedEl),
                    new Promise((r) => setTimeout(r, 1600))
                ]);
            }
            setReadyAndReveal();
            // Non-poetry flow: show the preview success notice if applicable
            let fromPreview = (params.get('fromPreview') === '1');
            try { if (!fromPreview && sessionStorage.getItem('fromPreviewUpload') === '1') fromPreview = true; } catch (_) {}
            if (fromPreview) {
                const n = showNotice('Upload succeeds. Back to Preview.', 'success', 6000);
                if (n) {
                    n.style.cursor = 'pointer';
                    n.setAttribute('role', 'link');
                    n.title = 'Back to Preview';
                    n.addEventListener('click', (e) => {
                        e.preventDefault();
                        window.location.href = '/survey.html';
                    });
                }
                // Clean the URL so notice doesn't reappear on refresh
                params.delete('fromPreview');
                const newQs = params.toString();
                const cleanUrl = window.location.pathname + (newQs ? ('?' + newQs) : '') + window.location.hash;
                try { history.replaceState(null, '', cleanUrl); } catch (_) {}
                // Clear the session flag so it doesn't persist
                try { sessionStorage.removeItem('fromPreviewUpload'); } catch (_) {}
            }
        }

    } catch (error) {
        console.error(error);
        document.querySelector('main').innerHTML = `<h1>Error: ${error.message}</h1>`;
        // Avoid a stuck hidden state when errors occur
        document.body.classList.add('ready');
    }
});

// -------- Immersive helpers --------
function setupAmbientBg(imageUrl) {
    const ambient = document.getElementById('ambient-bg');
    if (ambient && imageUrl) {
        ambient.style.backgroundImage = `url('${imageUrl}')`;
    }
}

function setupLightbox(triggerImg, imageUrl) {
    const overlay = document.getElementById('lightbox');
    const overlayImg = document.getElementById('lightbox-img');
    if (!overlay || !overlayImg || !triggerImg) return;

    const open = () => {
        overlayImg.src = imageUrl || triggerImg.src;
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.documentElement.style.overflow = 'hidden';
        resetZoom();
    };
    const close = () => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.documentElement.style.overflow = '';
        resetZoom();
    };

    // Open on click of main image
    triggerImg.style.cursor = 'zoom-in';
    triggerImg.addEventListener('click', open);

    // Close when clicking backdrop
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // Zoom/pan interactions
    let scale = 1;
    let pos = { x: 0, y: 0 };
    let start = null;

    function applyTransform() {
        overlayImg.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
        overlayImg.classList.toggle('zoomed', scale > 1);
    }
    function resetZoom() {
        scale = 1; pos = { x: 0, y: 0 }; start = null; applyTransform();
    }
    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

    overlayImg.addEventListener('click', () => {
        // Toggle zoom on click
        if (scale === 1) {
            scale = 2.5;
        } else {
            scale = 1; pos = { x: 0, y: 0 };
        }
        applyTransform();
    });

    overlayImg.addEventListener('pointerdown', (e) => {
        if (scale === 1) return; // only pan when zoomed
        overlayImg.setPointerCapture(e.pointerId);
        start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    });
    overlayImg.addEventListener('pointermove', (e) => {
        if (!start || scale === 1) return;
        const maxX = Math.max(0, (overlayImg.naturalWidth * scale - window.innerWidth) / 2 + 50);
        const maxY = Math.max(0, (overlayImg.naturalHeight * scale - window.innerHeight) / 2 + 50);
        pos.x = clamp(e.clientX - start.x, -maxX, maxX);
        pos.y = clamp(e.clientY - start.y, -maxY, maxY);
        applyTransform();
    });
    const endPan = () => { start = null; };
    overlayImg.addEventListener('pointerup', endPan);
    overlayImg.addEventListener('pointercancel', endPan);
}

function setupFocusMode() {
    const body = document.body;
    if (!body.classList.contains('artwork-page')) return;
    let timer;
    const reset = () => {
        body.classList.remove('focus-mode');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => body.classList.add('focus-mode'), 1800);
    };
    ['mousemove','keydown','touchstart','pointerdown','scroll'].forEach(evt => {
        document.addEventListener(evt, reset, { passive: true });
    });
    reset();
}

// -------- Fade-in reveal helpers (match home page behavior) --------
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

function markArtworkPageForReveal() {
    const els = [];
    const img = document.querySelector('#artwork-image-container img');
    const poem = document.getElementById('poem-container');
    const title = document.getElementById('artwork-title');
    const desc = document.querySelector('.artwork-inspiration');
    const metrics = document.getElementById('artwork-metrics');
    const footer = document.querySelector('.artwork-footer');
    const comments = document.getElementById('comments-section');
    if (img && img.offsetParent !== null) els.push(img);
    if (poem && poem.hidden === false) els.push(poem);
    if (title) els.push(title);
    if (desc && desc.style.display !== 'none') els.push(desc);
    if (metrics && metrics.hidden === false) els.push(metrics);
    if (footer) els.push(footer);
    if (comments) els.push(comments);
    els.forEach((el, i) => {
        el.classList.remove('fade-in');
        el.classList.add('will-reveal');
        el.style.setProperty('--stagger', `${(i + 1) * 120}ms`);
    });
}

// Ready gate helpers
function imageLoaded(img) {
    return new Promise((resolve) => {
        if (!img) return resolve();
        if (img.complete && img.naturalWidth > 0) return resolve();
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
    });
}
function setReadyAndReveal() {
    if (document.body.classList.contains('ready')) return;
    document.body.classList.add('ready');
    markArtworkPageForReveal();
    observeNewReveals(document.querySelector('.artwork-detail-container') || document);
}

function updateCollectButton(isCollected) {
    const collectBtn = document.getElementById('collect-btn');
    if (isCollected) {
        collectBtn.classList.add('collected');
        collectBtn.title = 'Un-collect this artwork';
    } else {
        collectBtn.classList.remove('collected');
        collectBtn.title = 'Collect this artwork';
    }
}

function updateFollowButton(isFollowing) {
    const followBtn = document.getElementById('follow-btn');
    if (!followBtn) return;
    // Keep the old light secondary style permanently; only toggle label
    followBtn.textContent = isFollowing ? 'Following' : 'Follow';
}

// --- Inline Notification Helper (local copy) ---
function showNotice(message, type = 'info', timeoutMs) {
    try {
        const container = document.getElementById('notice-container') || (function () {
            const c = document.createElement('div');
            c.id = 'notice-container';
            c.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:1100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
            document.body.appendChild(c);
            return c;
        })();

        const notice = document.createElement('div');
        const colors = {
            success: { bg: 'rgba(22,163,74,0.95)', border: '#16a34a' },
            error: { bg: 'rgba(220,38,38,0.95)', border: '#dc2626' },
            info: { bg: 'rgba(51,65,85,0.95)', border: '#334155' }
        };
        const palette = colors[type] || colors.info;
        notice.setAttribute('role', type === 'error' ? 'alert' : 'status');
        notice.style.cssText = `
            color: #fff;
            background: ${palette.bg};
            border: 1px solid ${palette.border};
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 14px;
            max-width: 90vw;
            pointer-events: auto;
            opacity: 0;
            transform: translateY(-6px);
            transition: opacity .2s ease, transform .2s ease;
        `;
        notice.textContent = String(message || '');
        container.appendChild(notice);

        requestAnimationFrame(() => {
            notice.style.opacity = '1';
            notice.style.transform = 'translateY(0)';
        });

        const autoTimeout = typeof timeoutMs === 'number' ? timeoutMs : (type === 'error' ? 5000 : 2500);
        const close = () => {
            notice.style.opacity = '0';
            notice.style.transform = 'translateY(-6px)';
            setTimeout(() => notice.remove(), 200);
        };
        const timer = setTimeout(close, autoTimeout);
        notice.addEventListener('click', () => {
            clearTimeout(timer);
            close();
        });
        return notice;
    } catch (e) {
        console.log(`[${type}]`, message);
    }
}

// ---------------- Comments UI (frontend only, to be wired to API later) ----------------
function initCommentsUI(ctx) {
    try {
        const form = document.getElementById('comment-form');
        const textarea = document.getElementById('comment-text');
        const list = document.getElementById('comments-list');
        const empty = document.getElementById('comments-empty');

        // Empty state visibility
        if (list && empty) empty.hidden = list.children.length > 0;

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const body = (textarea && textarea.value ? textarea.value.trim() : '');
                if (!ctx.token) {
                    showNotice('Please log in to post a comment.', 'info');
                    return;
                }
                if (!body) {
                    showNotice('Please enter a comment.', 'info');
                    return;
                }
                try {
                    const created = await postComment(ctx.artworkId, ctx.token, body);
                    if (!created) throw new Error('Failed to post comment');
                    const listEl = document.getElementById('comments-list');
                    if (listEl) {
                        const el = renderCommentItem(created, ctx);
                        listEl.insertBefore(el, listEl.firstChild);
                    }
                    if (textarea) textarea.value = '';
                    const empty = document.getElementById('comments-empty');
                    if (empty) empty.hidden = true;
                } catch (err) {
                    console.error(err);
                    showNotice(err.message || 'Failed to post comment', 'error');
                }
            });
        }

        if (list) {
            list.addEventListener('click', async (e) => {
                const heartBtn = e.target.closest('.comment-heart');
                if (heartBtn) {
                    e.preventDefault();
                    if (!ctx.token) {
                        showNotice('Please log in to like comments.', 'info');
                        return;
                    }
                    const item = e.target.closest('.comment-item, .reply-comment');
                    if (!item) return;
                    const id = item.dataset.id;
                    const willLike = !heartBtn.classList.contains('liked');
                    // optimistic update
                    const countEl = heartBtn.querySelector('.heart-count');
                    let prev = 0;
                    if (countEl) {
                        const parsed = parseInt(countEl.textContent || '0', 10);
                        prev = isNaN(parsed) ? 0 : parsed;
                    }
                    heartBtn.classList.toggle('liked', willLike);
                    if (countEl) countEl.textContent = String(Math.max(0, willLike ? prev + 1 : prev - 1));
                    try {
                        const res = await toggleLike(id, ctx.token, willLike);
                        if (res) {
                            heartBtn.classList.toggle('liked', !!res.likedByMe);
                            if (countEl) countEl.textContent = String(res.likesCount ?? prev);
                        }
                    } catch (err) {
                        // revert on error
                        heartBtn.classList.toggle('liked', !willLike);
                        if (countEl) countEl.textContent = String(prev);
                        showNotice('Failed to update like.', 'error');
                    }
                    return;
                }

                const replyBtn = e.target.closest('[data-action="reply"]');
                if (replyBtn) {
                    e.preventDefault();
                    const item = e.target.closest('.comment-item, .reply-comment');
                    if (!item) return;
                    let replyForm = item.querySelector(':scope > .reply-form');
                    if (!replyForm) {
                        replyForm = createReplyForm();
                        item.appendChild(replyForm);
                    }
                    replyForm.classList.toggle('active');
                    const t = replyForm.querySelector('textarea');
                    if (t && replyForm.classList.contains('active')) t.focus();
                    return;
                }

                const deleteBtn = e.target.closest('[data-action="delete"]');
                if (deleteBtn) {
                    e.preventDefault();
                    if (!ctx.token) {
                        showNotice('Please log in to delete comments.', 'info');
                        return;
                    }
                    const item = e.target.closest('.comment-item, .reply-comment');
                    if (!item) return;
                    const id = item.dataset.id;
                    const ok = confirm('Delete this comment?');
                    if (!ok) return;
                    try {
                        await deleteCommentOrReply(id, ctx.token);
                        // remove from DOM
                        if (item.classList.contains('comment-item')) {
                            const listEl = document.getElementById('comments-list');
                            item.remove();
                            // update empty state if needed
                            if (listEl && listEl.children.length === 0) {
                                const empty = document.getElementById('comments-empty');
                                if (empty) empty.hidden = false;
                            }
                        } else {
                            // reply
                            const container = item.parentElement;
                            item.remove();
                            if (container && container.classList.contains('replies-container') && container.children.length === 0) {
                                container.remove();
                            }
                        }
                    } catch (err) {
                        console.error(err);
                        showNotice('Failed to delete.', 'error');
                    }
                    return;
                }
            });
        }

        function createReplyForm() {
            const f = document.createElement('form');
            f.className = 'reply-form';
            f.innerHTML = `
                <div class="form-group">
                    <textarea class="form-textarea" placeholder="Write a reply..."></textarea>
                </div>
                <button type="submit" class="submit-btn">Reply</button>
            `;
            f.addEventListener('submit', async (e) => {
                e.preventDefault();
                const body = (f.querySelector('textarea')?.value || '').trim();
                if (!ctx.token) {
                    showNotice('Please log in to reply.', 'info');
                    return;
                }
                if (!body) {
                    showNotice('Please enter a reply.', 'info');
                    return;
                }
                try {
                    const triggerItem = f.closest('.comment-item, .reply-comment');
                    const commentItem = triggerItem?.closest('.comment-item');
                    const parentId = commentItem?.dataset?.id;
                    if (!parentId) throw new Error('Missing parent');
                    // If replying to a reply, enforce prefix "Reply {Name}: " before sending
                    let sendText = body;
                    if (triggerItem && triggerItem.classList.contains('reply-comment')) {
                        const nameEl = triggerItem.querySelector('.comment-author');
                        const targetName = (nameEl && nameEl.textContent ? nameEl.textContent.trim() : '');
                        if (targetName) {
                            const prefix = `Reply ${targetName}: `;
                            const normalized = sendText.toLowerCase();
                            if (!normalized.startsWith(prefix.toLowerCase())) {
                                sendText = prefix + sendText;
                            }
                        }
                    }
                    const created = await postReply(parentId, ctx.token, sendText);
                    if (!created) throw new Error('Failed to post reply');
                    let replies = commentItem?.querySelector(':scope > .replies-container');
                    if (!replies) {
                        replies = document.createElement('div');
                        replies.className = 'replies-container';
                        commentItem?.appendChild(replies);
                    }
                    if (replies) replies.appendChild(renderReplyItem(created, ctx));
                    const t = f.querySelector('textarea');
                    if (t) t.value = '';
                    f.classList.remove('active');
                } catch (err) {
                    console.error(err);
                    showNotice(err.message || 'Failed to post reply', 'error');
                }
            });
            return f;
        }
    } catch (e) {
        /* no-op */
    }
    // Load and render comments (read-only for now)
    try { loadAndRenderComments(ctx); } catch (_) { /* ignore */ }
}

// Fetch and render helpers (Phase 1 – read-only)
async function loadAndRenderComments(ctx) {
    const list = document.getElementById('comments-list');
    const empty = document.getElementById('comments-empty');
    if (!list) return;
    // init pagination state
    ctx._comments = { items: [], cursor: null, hasMore: false };
    // show lightweight skeletons during first fetch
    showCommentsLoading(list, 2);
    await loadCommentsPage(ctx, { initial: true });
    if (empty) empty.hidden = (ctx._comments.items.length > 0);
}

async function loadCommentsPage(ctx, { initial = false } = {}) {
    const list = document.getElementById('comments-list');
    if (!list) return;
    const pageSize = 10;
    const res = await fetchComments(ctx.artworkId, ctx.token, ctx._comments.cursor, pageSize);
    const comments = Array.isArray(res) ? res : (Array.isArray(res?.comments) ? res.comments : []);
    const nextCursor = (res && typeof res === 'object' && ('nextCursor' in res)) ? res.nextCursor : null;
    if (initial) list.innerHTML = '';
    comments.forEach(c => {
        const el = renderCommentItem(c, ctx);
        list.appendChild(el);
    });
    // update state
    ctx._comments.items.push(...comments);
    ctx._comments.cursor = nextCursor || null;
    ctx._comments.hasMore = !!nextCursor && comments.length >= 1;
    ensureLoadMoreButton(ctx);
}

function showCommentsLoading(list, count = 2) {
    try {
        list.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const li = document.createElement('li');
            li.className = 'comment-item skeleton';
            li.innerHTML = `
                <div class="comment-header">
                    <div class="comment-avatar skeleton-box"></div>
                    <div class="comment-info" style="flex:1; min-width:0;">
                        <div class="skeleton-box" style="width: 40%; height: 12px; margin-bottom: 8px;"></div>
                        <div class="skeleton-box" style="width: 24%; height: 10px;"></div>
                    </div>
                    <div class="comment-heart skeleton-box" style="width: 36px; height: 16px; border-radius: 16px;"></div>
                </div>
                <div class="comment-content">
                    <div class="skeleton-box" style="width: 100%; height: 12px; margin-bottom: 8px;"></div>
                    <div class="skeleton-box" style="width: 80%; height: 12px;"></div>
                </div>
            `;
            list.appendChild(li);
        }
    } catch (_) { /* noop */ }
}

async function fetchComments(artworkId, token, cursor, limit) {
    try {
        const qs = new URLSearchParams();
        if (limit) qs.set('limit', String(limit));
        if (cursor) qs.set('cursor', String(cursor));
        const url = `/api/artworks/${encodeURIComponent(String(artworkId))}/comments` + (qs.toString() ? `?${qs.toString()}` : '');
        const res = await fetch(url, {
            headers: token ? { 'x-auth-token': token } : {}
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.comments)) return data.comments;
        return data || [];
    } catch (_) {
        return [];
    }
}

// --- Comments API helpers ---
async function postComment(artworkId, token, text) {
    const res = await fetch(`/api/artworks/${encodeURIComponent(String(artworkId))}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ text })
    });
    if (!res.ok) {
        let msg = 'Failed to post comment';
        try { const e = await res.json(); if (e && e.msg) msg = e.msg; } catch (_) {}
        throw new Error(msg);
    }
    const payload = await res.json();
    const c = payload?.comment || payload;
    return c && typeof c === 'object' ? c : null;
}

async function postReply(commentId, token, text) {
    const res = await fetch(`/api/comments/${encodeURIComponent(String(commentId))}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ text })
    });
    if (!res.ok) {
        let msg = 'Failed to post reply';
        try { const e = await res.json(); if (e && e.msg) msg = e.msg; } catch (_) {}
        throw new Error(msg);
    }
    const payload = await res.json();
    const r = payload?.reply || payload;
    return r && typeof r === 'object' ? r : null;
}

async function toggleLike(id, token, like) {
    const res = await fetch(`/api/comments/${encodeURIComponent(String(id))}/like`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ like: !!like })
    });
    if (!res.ok) throw new Error('Failed to update like');
    return res.json();
}

async function deleteCommentOrReply(id, token) {
    const res = await fetch(`/api/comments/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
    });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
}

function ensureLoadMoreButton(ctx) {
    const list = document.getElementById('comments-list');
    if (!list) return;
    let container = document.getElementById('comments-load-more');
    if (!container) {
        container = document.createElement('div');
        container.id = 'comments-load-more';
        container.className = 'comments-load-more';
        list.parentElement?.appendChild(container);
    }
    container.innerHTML = '';
    if (ctx._comments.hasMore) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'load-more-btn';
        btn.textContent = 'Load more comments';
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Loading…';
            try { await loadCommentsPage(ctx, { initial: false }); }
            finally {
                btn.disabled = false;
                // if still more, restore label; else container will be cleared on next ensureLoadMoreButton
                btn.textContent = 'Load more comments';
            }
        });
        container.appendChild(btn);
    }
}

function renderCommentItem(c, ctx) {
    const li = document.createElement('li');
    li.className = 'comment-item';
    li.dataset.id = String(c._id || '');

    const authorName = (c.author && (c.author.name || c.author.username)) || 'Unknown';
    const avatar = (c.author && c.author.profilePictureUrl) || '';
    const initials = authorName.trim().slice(0, 2).toUpperCase();
    const canDelete = String(ctx.currentUserId) === String(c.author?._id) || String(ctx.currentUserId) === String(ctx.artistId);
    const liked = !!c.likedByMe;
    const likeCount = Number.isFinite(c.likesCount) ? c.likesCount : 0;

    // Header
    const header = document.createElement('div');
    header.className = 'comment-header';
    const avatarEl = document.createElement('div');
    avatarEl.className = 'comment-avatar';
    if (avatar) {
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = authorName;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.decoding = 'async';
        avatarEl.appendChild(img);
    } else {
        avatarEl.textContent = initials;
    }
    const info = document.createElement('div');
    info.className = 'comment-info';
    info.innerHTML = `
        <span class="comment-author">${escapeHtml(authorName)}</span>
        <span class="comment-date">${relativeTime(c.createdAt)}</span>
    `;
    const heart = document.createElement('button');
    heart.className = 'comment-heart' + (liked ? ' liked' : '');
    heart.setAttribute('aria-label', 'Like');
    heart.innerHTML = `
        <svg class="heart-icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
            <path class="heart-shape" d="M12 21c-.3 0-.6-.1-.8-.3C6.1 16.2 3 13.4 3 9.9 3 7.3 5.1 5.2 7.7 5.2c1.7 0 3.2.9 4.3 2.3 1.1-1.5 2.6-2.3 4.3-2.3 2.6 0 4.7 2.1 4.7 4.7 0 3.5-3.1 6.3-8.2 10.8-.2.2-.5.3-.8.3z"/>
        </svg>
        <span class="heart-count">${likeCount}</span>`;
    header.appendChild(avatarEl);
    header.appendChild(info);
    header.appendChild(heart);

    // Content
    const content = document.createElement('div');
    content.className = 'comment-content';
    content.textContent = String(c.text || '');

    // Actions
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const replyBtn = document.createElement('button');
    replyBtn.className = 'comment-action';
    replyBtn.setAttribute('data-action', 'reply');
    replyBtn.textContent = 'Reply';
    actions.appendChild(replyBtn);
    if (canDelete) {
        const del = document.createElement('button');
        del.className = 'comment-action';
        del.setAttribute('data-action', 'delete');
        del.textContent = 'Delete';
        actions.appendChild(del);
    }

    li.appendChild(header);
    li.appendChild(content);
    li.appendChild(actions);

    // Replies
    if (Array.isArray(c.replies) && c.replies.length) {
        const replies = document.createElement('div');
        replies.className = 'replies-container';
        c.replies.forEach(r => replies.appendChild(renderReplyItem(r, ctx)));
        li.appendChild(replies);
    }
    return li;
}

function renderReplyItem(r, ctx) {
    const div = document.createElement('div');
    div.className = 'reply-comment';
    div.dataset.id = String(r._id || '');
    const authorName = (r.author && (r.author.name || r.author.username)) || 'Unknown';
    const avatar = (r.author && r.author.profilePictureUrl) || '';
    const initials = authorName.trim().slice(0, 2).toUpperCase();
    const liked = !!r.likedByMe;
    const likeCount = Number.isFinite(r.likesCount) ? r.likesCount : 0;
    const canDelete = String(ctx.currentUserId) === String(r.author?._id) || String(ctx.currentUserId) === String(ctx.artistId);

    const header = document.createElement('div');
    header.className = 'comment-header';
    const avatarEl = document.createElement('div');
    avatarEl.className = 'comment-avatar';
    if (avatar) {
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = authorName;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.decoding = 'async';
        avatarEl.appendChild(img);
    } else {
        avatarEl.textContent = initials;
    }
    const info = document.createElement('div');
    info.className = 'comment-info';
    info.innerHTML = `
        <span class="comment-author">${escapeHtml(authorName)}</span>
        <span class="comment-date">${relativeTime(r.createdAt)}</span>
    `;
    const heart = document.createElement('button');
    heart.className = 'comment-heart' + (liked ? ' liked' : '');
    heart.setAttribute('aria-label', 'Like');
    heart.innerHTML = `
        <svg class="heart-icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
            <path class="heart-shape" d="M12 21c-.3 0-.6-.1-.8-.3C6.1 16.2 3 13.4 3 9.9 3 7.3 5.1 5.2 7.7 5.2c1.7 0 3.2.9 4.3 2.3 1.1-1.5 2.6-2.3 4.3-2.3 2.6 0 4.7 2.1 4.7 4.7 0 3.5-3.1 6.3-8.2 10.8-.2.2-.5.3-.8.3z"/>
        </svg>
        <span class="heart-count">${likeCount}</span>`;
    header.appendChild(avatarEl);
    header.appendChild(info);
    header.appendChild(heart);

    const content = document.createElement('div');
    content.className = 'comment-content';
    content.textContent = String(r.text || '');

    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const replyBtn = document.createElement('button');
    replyBtn.className = 'comment-action';
    replyBtn.setAttribute('data-action', 'reply');
    replyBtn.textContent = 'Reply';
    actions.appendChild(replyBtn);
    if (canDelete) {
        const del = document.createElement('button');
        del.className = 'comment-action';
        del.setAttribute('data-action', 'delete');
        del.textContent = 'Delete';
        actions.appendChild(del);
    }

    div.appendChild(header);
    div.appendChild(content);
    div.appendChild(actions);
    return div;
}

function relativeTime(dateInput) {
    try {
        const ts = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput).getTime() : (dateInput?.getTime?.() || Date.now());
        const now = Date.now();
        const diff = Math.max(0, now - ts);
        const s = Math.floor(diff / 1000);
        if (s < 60) return `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.floor(h / 24);
        if (d < 7) return `${d}d ago`;
        const w = Math.floor(d / 7);
        if (w < 4) return `${w}w ago`;
        const months = Math.floor(d / 30);
        if (months < 12) return `${months}mo ago`;
        const years = Math.floor(d / 365);
        return `${years}y ago`;
    } catch (_) { return ''; }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function handleCollect(artworkId, token, currentUserId) {
    try {
        const res = await fetch(`/api/artworks/${artworkId}/collect`, {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) throw new Error('Failed to update collection');
        const updatedArtwork = await res.json();
        updateCollectButton(updatedArtwork.collectedBy.includes(currentUserId));
    } catch (error) {
        console.error(error);
        showNotice(error.message || 'Action failed.', 'error');
    }
}

async function handleFollow(artistId, token) {
    try {
        const res = await fetch(`/api/artists/${artistId}/follow`, {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.msg || 'Failed to follow artist');
        }
        const following = await res.json();
        const isFollowingNow = Array.isArray(following) && following.some(id => String(id) === String(artistId));
        updateFollowButton(isFollowingNow);
    } catch (error) {
        console.error(error);
        showNotice(error.message || 'Action failed.', 'error');
    }
}
