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

    if (!artworkId) {
        document.querySelector('main').innerHTML = '<h1>Artwork not found.</h1>';
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
        document.getElementById('artist-avatar').src = artist.profilePictureUrl || '/assets/default-avatar.svg';
        document.getElementById('artist-name').textContent = artist.name;
        // Artist link removed since public artist profiles don't exist
        const artistLink = document.getElementById('artist-link');
        if (artistLink) {
            artistLink.removeAttribute('href');
            artistLink.style.cursor = 'default';
            artistLink.style.textDecoration = 'none';
        }

        // Setup Buttons
        const collectBtn = document.getElementById('collect-btn');
        const followBtn = document.getElementById('follow-btn');

        if (!token) {
            collectBtn.disabled = true;
            followBtn.disabled = true;
            collectBtn.title = 'You must be logged in to collect';
            followBtn.title = 'You must be logged in to follow';
        } else {
            // Update button states based on user's status
            updateCollectButton(artwork.collectedBy.includes(currentUserId));
            
            // Fetch full current user data for following status
            const userRes = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
            const currentUser = await userRes.json();
            updateFollowButton(currentUser.following.includes(artist._id));

            // Hide follow button if viewing own profile
            if (artist._id === currentUserId) {
                followBtn.style.display = 'none';
            } else {
                followBtn.addEventListener('click', () => handleFollow(artist._id, token));
            }

            collectBtn.addEventListener('click', () => handleCollect(artwork._id, token, currentUserId));
        }

        // Fade-in reveals: mark sections and observe
        markArtworkPageForReveal();
        observeNewReveals(document.querySelector('.artwork-detail-container') || document);

    } catch (error) {
        console.error(error);
        document.querySelector('main').innerHTML = `<h1>Error: ${error.message}</h1>`;
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
    if (img && img.offsetParent !== null) els.push(img);
    if (poem && poem.hidden === false) els.push(poem);
    if (title) els.push(title);
    if (desc && desc.style.display !== 'none') els.push(desc);
    if (metrics && metrics.hidden === false) els.push(metrics);
    if (footer) els.push(footer);
    els.forEach((el, i) => {
        el.classList.remove('fade-in');
        el.classList.add('will-reveal');
        el.style.setProperty('--stagger', `${(i + 1) * 120}ms`);
    });
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
        alert(error.message);
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
        updateFollowButton(following.includes(artistId));
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
}
