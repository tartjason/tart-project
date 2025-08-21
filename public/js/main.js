document.addEventListener('DOMContentLoaded', () => {
    const artworksContainer = document.getElementById('artworks-container');
    const authContainer = document.getElementById('auth-container');
    const token = localStorage.getItem('token');

    const setupAuthUI = () => {
        if (token) {
            authContainer.innerHTML = `<a href="/account.html" class="btn">My Account</a> <button id="logout-btn" class="btn">Logout</button>`;
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    localStorage.removeItem('token');
                    window.location.reload();
                });
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

    const fetchArtworks = async () => {
        try {
            const res = await fetch('/api/artworks');
            const artworks = await res.json();
            artworksContainer.innerHTML = '';
            artworks.forEach(artwork => {
                const artworkEl = document.createElement('div');
                artworkEl.classList.add('artwork-card');
                
                // Handle poetry differently - show text snippet instead of blurred image
                if (artwork.medium === 'poetry') {
                    // Extract text snippet from poetry description or title
                    const poetryText = artwork.description || artwork.title || 'Poetry artwork';
                    const snippet = poetryText.length > 60 ? poetryText.substring(0, 60) + '...' : poetryText;
                    
                    artworkEl.innerHTML = `
                        <div class="poetry-preview">
                            <div class="poetry-snippet">${snippet}</div>
                        </div>
                        <div class="artwork-info">
                            <h3>${artwork.title}</h3>
                            <p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>
                        </div>
                    `;
                } else {
                    // Non-poetry artworks get the blurred image treatment
                    artworkEl.innerHTML = `
                        <img src="${artwork.imageUrl}" alt="${artwork.title}" class="blurred" loading="lazy" decoding="async" fetchpriority="low">
                        <div class="artwork-info">
                            <h3>${artwork.title}</h3>
                            <p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>
                        </div>
                    `;
                }
                
                artworkEl.addEventListener('click', () => {
                    window.location.href = `/artwork.html?id=${artwork._id}`;
                });
                artworksContainer.appendChild(artworkEl);
            });
        } catch (error) {
            console.error('Failed to fetch artworks:', error);
            artworksContainer.innerHTML = '<p>Could not load artworks.</p>';
        }
    };

    setupAuthUI();
    fetchArtworks();
});
