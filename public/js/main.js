document.addEventListener('DOMContentLoaded', () => {
    const artworksContainer = document.getElementById('artworks-container');
    const stickyHero = document.getElementById('sticky-hero');
    const stickyGrid = document.getElementById('sticky-grid');
    const authContainer = document.getElementById('auth-container');
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

    function createArtworkCard(artwork, extraClasses = []) {
        const el = document.createElement('div');
        el.classList.add('artwork-card', ...extraClasses);
        if (artwork.medium === 'poetry') {
            const poetryText = artwork.description || artwork.title || 'Poetry artwork';
            const snippet = poetryText.length > 60 ? poetryText.substring(0, 60) + '...' : poetryText;
            el.innerHTML = `
                <div class="poetry-preview">
                    <div class="poetry-snippet">${snippet}</div>
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

                // Featured rhythm for the remaining list
                rest.forEach((a, idx) => {
                    const classes = [];
                    if (idx % 7 === 0) classes.push('featured');
                    else if (idx % 3 === 0) classes.push('tall');
                    const card = createArtworkCard(a, classes);
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
    fetchArtworks();
});
