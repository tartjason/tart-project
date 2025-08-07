document.addEventListener('DOMContentLoaded', () => {
    const artworksContainer = document.getElementById('artworks-container');
    const authContainer = document.getElementById('auth-container');
    const token = localStorage.getItem('token');

    const setupAuthUI = () => {
        if (token) {
            authContainer.innerHTML = `<a href="/account.html" class="btn">My Account</a> <button id="logout-btn" class="btn">Logout</button>`;
            document.getElementById('logout-btn').addEventListener('click', () => {
                localStorage.removeItem('token');
                window.location.reload();
            });
        } else {
            authContainer.innerHTML = `
                <form id="login-form">
                    <input type="email" id="email" placeholder="Email" required>
                    <input type="password" id="password" placeholder="Password" required>
                    <button type="submit" class="btn">Login</button>
                </form>
            `;
            document.getElementById('login-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                try {
                    const res = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });
                    if (!res.ok) throw new Error('Login failed');
                    const { token } = await res.json();
                    localStorage.setItem('token', token);
                    window.location.reload();
                } catch (error) {
                    alert(error.message);
                }
            });
        }
    };

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
                        <img src="${artwork.imageUrl}" alt="${artwork.title}" class="blurred">
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
