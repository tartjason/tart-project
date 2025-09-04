document.addEventListener('DOMContentLoaded', () => {
  const authContainer = document.getElementById('auth-container');

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
          if (me && me.profilePictureUrl) {
            const avatarImg = document.getElementById('header-avatar');
            if (avatarImg) avatarImg.src = me.profilePictureUrl;
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
        } catch (_) { /* ignore */ }
      };
      window.addEventListener('message', onMessage);
    }
  };

  setupAuthUI();
});

