document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token && window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
        // Allow access to upload/settings if developing, but functionality will be limited.
        // In a real app, you'd redirect: window.location.href = '/login.html';
        console.warn('No token found. Functionality will be limited.');
    }

// --- Notifications Modal (match Connections look & feel) ---
async function openNotificationsModal() {
    try {
        const bell = document.getElementById('notif-bell');
        if (bell) bell.setAttribute('aria-expanded', 'true');

        // Ensure we have rich follower/following data
        const artist = Object.assign({}, window.__currentArtist || {});
        let followers = Array.isArray(artist.followers) ? artist.followers : [];
        let following = Array.isArray(artist.following) ? artist.following : [];

        const needsRefresh = followers.some(x => typeof x === 'string' || (x && !x.name))
            || following.some(x => typeof x === 'string' || (x && !x.name));
        if (needsRefresh) {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
                    if (res.ok) {
                        const fresh = await res.json();
                        window.__currentArtist = fresh;
                        followers = Array.isArray(fresh.followers) ? fresh.followers : [];
                        following = Array.isArray(fresh.following) ? fresh.following : [];
                    }
                }
            } catch (e) {
                console.warn('Could not refresh notifications data:', e);
            }
        }

        // Always attempt to fetch recent follower notifications (with accurate createdAt timestamps)
        try {
            const token2 = localStorage.getItem('token');
            if (token2) {
                const resNotif = await fetch('/api/notifications/followers?limit=50', {
                    headers: { 'x-auth-token': token2 }
                });
                if (resNotif.ok) {
                    const events = await resNotif.json(); // [{ follower: {...}, createdAt }]
                    const notifFollowers = (Array.isArray(events) ? events : []).map(ev => {
                        const f = Object.assign({}, ev && ev.follower ? ev.follower : {});
                        if (ev && ev.createdAt) f._followedAt = ev.createdAt; // prefer this in UI
                        return f;
                    }).filter(f => f && (f._id || f.id || f.name));
                    if (notifFollowers.length) {
                        followers = notifFollowers;
                    }
                }
            }
        } catch (e) {
            console.warn('Could not load notifications API, falling back to cached followers:', e);
        }

        // Mark notifications as seen and clear indicator
        try {
            localStorage.setItem('notif.lastSeen', String(Date.now()));
            updateNotifBellIndicator(window.__currentArtist || {});
        } catch (_) {}

        // Overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #fff;
            padding: 16px;
            border-radius: 8px;
            width: 92%;
            max-width: 520px;
            max-height: 80vh;
            overflow: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        `;

        const title = document.createElement('h3');
        title.textContent = 'Notifications';
        title.style.margin = '0 0 12px 0';
        modal.appendChild(title);

        const content = document.createElement('div');
        modal.appendChild(content);

        function renderNotifications() {
            content.innerHTML = '';
            const followingIds = new Set((Array.isArray(following) ? following : []).map((a) => String(a && (a._id || a.id) ? (a._id || a.id) : a)));
            if (!followers || followers.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = 'No notifications yet.';
                empty.style.color = '#555';
                content.appendChild(empty);
                return;
            }

            const list = document.createElement('ul');
            list.style.listStyle = 'none';
            list.style.padding = '0';
            list.style.margin = '0';

            followers.forEach(f => {
                const id = (f && (f._id || f.id)) ? (f._id || f.id) : String(f);
                const name = (f && f.name) ? f.name : 'Someone';
                const avatar = (f && f.profilePictureUrl) ? f.profilePictureUrl : '/assets/default-avatar.svg';
                const isFollowingBack = followingIds.has(String(id));

                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '10px';
                li.style.padding = '8px 0';

                const img = document.createElement('img');
                img.src = avatar;
                img.alt = '';
                img.width = 36;
                img.height = 36;
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';

                const body = document.createElement('div');
                body.style.flex = '1';
                const text = document.createElement('div');
                text.innerHTML = `<strong>${name}</strong> followed you.`;
                text.style.fontSize = '14px';
                const time = document.createElement('div');
                const when = deriveDateFromFollower(f);
                time.textContent = formatRelativeTime(when);
                time.style.fontSize = '12px';
                time.style.color = '#6b7280';
                body.appendChild(text);
                body.appendChild(time);

                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary follow-back-btn';
                btn.textContent = isFollowingBack ? 'Following' : 'Follow back';
                btn.style.marginLeft = 'auto';
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await followBackArtist(String(id), btn);
                });

                li.appendChild(img);
                li.appendChild(body);
                li.appendChild(btn);
                list.appendChild(li);
            });

            content.appendChild(list);
        }

        renderNotifications();

        const actions = document.createElement('div');
        actions.style.cssText = 'margin-top:12px; display:flex; justify-content:flex-end;';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn';
        closeBtn.textContent = 'Close';
        const close = () => {
            if (bell) bell.setAttribute('aria-expanded', 'false');
            document.body.removeChild(overlay);
        };
        closeBtn.addEventListener('click', close);
        actions.appendChild(closeBtn);
        modal.appendChild(actions);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, { once: true });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    } catch (e) {
        console.error('Failed to open notifications modal:', e);
        showNotice('Could not open notifications. Please try again.', 'error');
    }
}

// Expose notification helpers globally (used in various flows safely)
window.initializeNotificationsUi = initializeNotificationsUi;
window.renderNotificationsFromArtist = renderNotificationsFromArtist;
window.updateNotifBellIndicator = updateNotifBellIndicator;
window.followBackArtist = followBackArtist;
window.openNotificationsModal = openNotificationsModal;

// --- Notifications: Bell, Panel, Follow-Back ---
function initializeNotificationsUi() {
    try {
        if (window.__notifUiInit) return; // idempotent
        const bell = document.getElementById('notif-bell');
        if (!bell) return;

        bell.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNotificationsModal();
        });

        // Initial indicator state if artist already cached
        if (window.__currentArtist) updateNotifBellIndicator(window.__currentArtist);

        window.__notifUiInit = true;
    } catch (e) {
        console.warn('Failed to initialize notifications UI:', e);
    }
}

// Helper: convert various follower shapes to a Date when they likely followed
function deriveDateFromFollower(f) {
    try {
        if (!f) return null;
        const ts = f._followedAt || f.followedAt || f.followed_at || f.createdAt || f.updatedAt || null;
        if (ts) {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) return d;
        }
        // Fallback: try ObjectId timestamp
        const oid = (f && (f._id || f.id)) ? String(f._id || f.id) : null;
        if (oid && /^[a-f\d]{24}$/i.test(oid)) {
            const seconds = parseInt(oid.substring(0, 8), 16);
            if (!isNaN(seconds)) return new Date(seconds * 1000);
        }
    } catch (_) {}
    return null;
}

// Helper: format relative time like "3 min ago"
function formatRelativeTime(date) {
    try {
        if (!(date instanceof Date) || isNaN(date.getTime())) return 'recently';
        const now = Date.now();
        let diff = Math.floor((now - date.getTime()) / 1000); // seconds
        if (diff < 0) diff = 0;
        if (diff < 60) return 'just now';
        if (diff < 3600) {
            const m = Math.floor(diff / 60);
            return `${m} min${m === 1 ? '' : 's'} ago`;
        }
        if (diff < 86400) {
            const h = Math.floor(diff / 3600);
            return `${h} hr${h === 1 ? '' : 's'} ago`;
        }
        if (diff < 2592000) { // < 30 days
            const d = Math.floor(diff / 86400);
            return `${d} day${d === 1 ? '' : 's'} ago`;
        }
        // 30+ days: show date
        return date.toLocaleDateString();
    } catch (_) {
        return 'recently';
    }
}

function renderNotificationsFromArtist(artist) {
    const list = document.getElementById('notif-list');
    const empty = document.getElementById('notif-empty');
    if (!list || !empty) return;

    const followers = Array.isArray(artist.followers) ? artist.followers : [];
    const followingIds = new Set((Array.isArray(artist.following) ? artist.following : []).map((a) => String(a && (a._id || a.id) ? (a._id || a.id) : a)));

    list.innerHTML = '';

    if (!followers.length) {
        empty.style.display = 'block';
        updateNotifBellIndicator(artist);
        return;
    }

    empty.style.display = 'none';

    followers.forEach((f) => {
        const id = (f && (f._id || f.id)) ? (f._id || f.id) : String(f);
        const name = (f && f.name) ? f.name : 'Someone';
        const avatar = (f && f.profilePictureUrl) ? f.profilePictureUrl : '/assets/default-avatar.svg';
        const isFollowingBack = followingIds.has(String(id));

        const li = document.createElement('li');
        li.className = 'notif-item';

        const img = document.createElement('img');
        img.className = 'notif-avatar';
        img.src = avatar;
        img.alt = '';

        const body = document.createElement('div');
        body.className = 'notif-body';
        const text = document.createElement('p');
        text.className = 'notif-text';
        text.innerHTML = `<strong>${name}</strong> followed you.`;
        const time = document.createElement('p');
        time.className = 'notif-time';
        const when = deriveDateFromFollower(f);
        time.textContent = formatRelativeTime(when);
        body.appendChild(text);
        body.appendChild(time);

        const action = document.createElement('div');
        action.className = 'notif-action';
        const btn = document.createElement('button');
        btn.className = 'btn-small follow-back-btn';
        btn.setAttribute('data-artist-id', String(id));
        btn.textContent = isFollowingBack ? 'Following' : 'Follow back';
        if (isFollowingBack) btn.disabled = true;
        action.appendChild(btn);

        li.appendChild(img);
        li.appendChild(body);
        li.appendChild(action);
        list.appendChild(li);
    });

    updateNotifBellIndicator(artist);
}

async function updateNotifBellIndicator(artist) {
    const bell = document.getElementById('notif-bell');
    if (!bell) return;
    try {
        const lastSeen = parseInt(localStorage.getItem('notif.lastSeen') || '0', 10) || 0;
        const token = localStorage.getItem('token');
        if (!token) { bell.removeAttribute('data-has-new'); return; }
        const res = await fetch('/api/notifications/followers?limit=1', {
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) { bell.removeAttribute('data-has-new'); return; }
        const events = await res.json();
        const latest = Array.isArray(events) && events.length ? events[0] : null;
        const ts = latest && latest.createdAt ? new Date(latest.createdAt) : null;
        const latestMs = (ts && !isNaN(ts.getTime())) ? ts.getTime() : 0;
        if (latestMs > lastSeen) bell.setAttribute('data-has-new', 'true');
        else bell.removeAttribute('data-has-new');
    } catch (_) {
        // On error, do not show false positives
        const bell = document.getElementById('notif-bell');
        if (bell) bell.removeAttribute('data-has-new');
    }
}

async function followBackArtist(targetId, button) {
    const token = localStorage.getItem('token');
    if (!token) { showNotice('You must be logged in to follow artists.', 'error'); return; }
    try {
        if (button) button.disabled = true;
        const res = await fetch(`/api/artists/${encodeURIComponent(targetId)}/follow`, {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ msg: 'Failed to update follow' }));
            throw new Error(err.msg || 'Failed to update follow');
        }
        const followingIds = await res.json();
        // Update cache and UI
        if (window.__currentArtist) {
            window.__currentArtist.following = followingIds;
            updateNotifBellIndicator(window.__currentArtist);
        }
        const isNowFollowing = Array.isArray(followingIds) && followingIds.some(x => String(x) === String(targetId));
        if (button) {
            button.textContent = isNowFollowing ? 'Following' : 'Follow back';
            button.disabled = false;
        }
        showNotice(isNowFollowing ? 'You are now following.' : 'You unfollowed.', 'success');
    } catch (err) {
        console.error('Follow toggle error:', err);
        showNotice(err.message || 'Failed to update follow', 'error');
        if (button) button.disabled = false;
    }
}

// --- Connections Modal ---
async function openConnectionsModal() {
    try {
        const artist = Object.assign({}, window.__currentArtist || {});
        let followers = Array.isArray(artist.followers) ? artist.followers : [];
        let following = Array.isArray(artist.following) ? artist.following : [];

        // If arrays contain plain IDs or items without name, refresh from backend to get populated docs
        const needsRefresh = followers.some(x => typeof x === 'string' || (x && !x.name))
            || following.some(x => typeof x === 'string' || (x && !x.name));
        if (needsRefresh) {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
                    if (res.ok) {
                        const fresh = await res.json();
                        window.__currentArtist = fresh;
                        followers = Array.isArray(fresh.followers) ? fresh.followers : [];
                        following = Array.isArray(fresh.following) ? fresh.following : [];
                    }
                }
            } catch (e) {
                console.warn('Could not refresh connections:', e);
            }
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Modal content
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #fff;
            padding: 16px;
            border-radius: 8px;
            width: 92%;
            max-width: 520px;
            max-height: 80vh;
            overflow: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        `;

        const title = document.createElement('h3');
        title.textContent = 'Connections';
        title.style.margin = '0 0 12px 0';
        modal.appendChild(title);

        // Tabs container
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display:flex; gap:24px; align-items:flex-end; border-bottom:1px solid #e5e7eb; margin-bottom:8px;`;
        const tabFollowing = document.createElement('button');
        const tabFollowers = document.createElement('button');
        [tabFollowing, tabFollowers].forEach(btn => {
            btn.type = 'button';
            btn.style.cssText = `
                background:none; border:none; padding:8px 2px; cursor:pointer; font-size:16px;
                color:#6b7280; position:relative; outline:none;`;
        });
        tabFollowing.textContent = 'Following';
        tabFollowers.textContent = 'Followers';
        tabs.appendChild(tabFollowing);
        tabs.appendChild(tabFollowers);
        modal.appendChild(tabs);

        // Active underline helper
        function setActive(tab) {
            [tabFollowing, tabFollowers].forEach(btn => {
                const active = (btn === tab);
                btn.style.color = active ? '#111827' : '#6b7280';
                // underline via bottom border highlight using pseudo replacement element
                btn.style.borderBottom = active ? '2px solid #333' : '2px solid transparent';
                btn.style.marginBottom = '-1px';
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
        }

        // Content container
        const content = document.createElement('div');
        modal.appendChild(content);

        function renderList(which) {
            const data = which === 'following' ? following : followers;
            content.innerHTML = '';
            if (!data || data.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = which === 'following' ? 'Not following anyone yet.' : 'No followers yet.';
                empty.style.color = '#555';
                content.appendChild(empty);
                return;
            }

            const list = document.createElement('ul');
            list.style.listStyle = 'none';
            list.style.padding = '0';
            list.style.margin = '0';

            data.forEach(item => {
                const id = (item && (item._id || item.id)) ? (item._id || item.id) : String(item);
                const name = (item && item.name) ? item.name : 'Unknown';
                const avatar = (item && item.profilePictureUrl) ? item.profilePictureUrl : '/assets/default-avatar.svg';

                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '10px';
                li.style.padding = '8px 0';

                const img = document.createElement('img');
                img.src = avatar;
                img.alt = '';
                img.width = 36;
                img.height = 36;
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';

                const span = document.createElement('span');
                span.textContent = name;
                span.style.flex = '1';

                li.appendChild(img);
                li.appendChild(span);

                // Add toggle only for Following tab
                if (which === 'following') {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-secondary';
                    btn.textContent = 'Following';
                    btn.style.marginLeft = 'auto';
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const token = localStorage.getItem('token');
                        if (!token) { showNotice('You must be logged in to follow artists.', 'error'); return; }
                        btn.disabled = true;
                        try {
                            const res = await fetch(`/api/artists/${id}/follow`, {
                                method: 'PUT',
                                headers: { 'x-auth-token': token }
                            });
                            if (!res.ok) {
                                const err = await res.json().catch(() => ({ msg: 'Failed to update follow' }));
                                throw new Error(err.msg || 'Failed to update follow');
                            }
                            const followingIds = await res.json();
                            const isNowFollowing = followingIds.map(String).includes(String(id));
                            btn.textContent = isNowFollowing ? 'Following' : 'Follow';
                            if (window.__currentArtist) {
                                window.__currentArtist.following = followingIds;
                            }
                        } catch (err) {
                            console.error('Follow toggle error:', err);
                            showNotice(err.message || 'Failed to update follow', 'error');
                        } finally {
                            btn.disabled = false;
                        }
                    });
                    li.appendChild(btn);
                }

                list.appendChild(li);
            });

            content.appendChild(list);
        }

        // Wire tabs
        tabFollowing.addEventListener('click', () => { setActive(tabFollowing); renderList('following'); });
        tabFollowers.addEventListener('click', () => { setActive(tabFollowers); renderList('followers'); });

        // Default to Following tab
        setActive(tabFollowing);
        renderList('following');

        const actions = document.createElement('div');
        actions.style.cssText = 'margin-top:12px; display:flex; justify-content:flex-end;';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
        actions.appendChild(closeBtn);
        modal.appendChild(actions);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) document.body.removeChild(overlay);
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    } catch (e) {
        console.error('Failed to open connections modal:', e);
        showNotice('Could not open connections. Please try again.', 'error');
    }
}

// Load published website info and render link under "Portfolio Website"
async function loadPublishedWebsiteInfo() {
    const container = document.getElementById('account-published-url');
    const link = document.getElementById('account-published-url-link');
    if (!container || !link) return;

    const token = localStorage.getItem('token');
    if (!token) {
        container.style.display = 'none';
        return;
    }

    try {
        const res = await fetch('/api/website-state', { headers: { 'x-auth-token': token } });
        if (!res.ok) {
            container.style.display = 'none';
            return;
        }
        const state = await res.json();
        const slugOrUrl = state && state.publishedUrl;
        const isPublished = !!(state && (state.isPublished || slugOrUrl));
        if (isPublished && slugOrUrl) {
            let fullUrl = '';
            if (/^https?:\/\//i.test(slugOrUrl)) {
                fullUrl = slugOrUrl;
            } else {
                const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
                const slug = String(slugOrUrl).replace(/^\//, '');
                fullUrl = slug ? `${origin}/${slug}` : origin;
            }
            link.href = fullUrl;
            link.textContent = fullUrl;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    } catch (e) {
        console.warn('Failed to load website state:', e);
        container.style.display = 'none';
    }
}

    // --- Event Listeners (only attach if element exists) ---
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', savePortfolioSettings);
    }

    const uploadFormBtn = document.getElementById('upload-form-btn');
    if (uploadFormBtn) {
        uploadFormBtn.addEventListener('click', uploadArtwork);
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/';
        });
    }

    // Edit Profile modal controls
    const editBtn = document.getElementById('edit-profile-btn');
    if (editBtn) editBtn.addEventListener('click', openEditProfileModal);
    const cancelProfileBtn = document.getElementById('cancel-profile-btn');
    if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', closeEditProfileModal);
    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfileChanges);

    // Connections: open followers/following modal on the paragraph (keep original look)
    const connectionsEl = document.getElementById('artist-connections');
    if (connectionsEl) {
        connectionsEl.addEventListener('click', openConnectionsModal);
        // keyboard accessibility without changing look
        connectionsEl.setAttribute('role', 'button');
        connectionsEl.tabIndex = 0;
        // visual cue and prevent text selection when hovering/clicking
        connectionsEl.style.cursor = 'pointer';
        connectionsEl.style.userSelect = 'none';
        connectionsEl.setAttribute('title', 'View followers and following');
        connectionsEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openConnectionsModal();
            }
        });
    }

    // --- Page Specific Loaders ---
    if (document.querySelector('.profile-container')) {
        // Initialize notifications UI elements on account page
        initializeNotificationsUi();
        if (document.getElementById('artist-name')) {
            loadProfileData();
            initializeProfilePictureUpload();
        }

        if (document.getElementById('portfolio-settings-form')) {
            loadPortfolioData();
        }

        // Always try to show published site URL on account page
        loadPublishedWebsiteInfo();
    }
});

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    // Corrected to handle potential case-sensitivity issues by selecting ID directly
    const tabToShow = document.getElementById(tabName);
    if (tabToShow) {
        tabToShow.style.display = "block";
    } else {
        // Fallback for the 'Collection' vs 'collection' typo
        const correctedTabName = tabName.charAt(0).toUpperCase() + tabName.slice(1);
        const fallbackTab = document.getElementById(correctedTabName);
        if (fallbackTab) {
            fallbackTab.style.display = "block";
        }
    }
    evt.currentTarget.className += " active";
}

async function loadProfileData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        // Single API call to get all necessary data
        const res = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
        if (!res.ok) throw new Error('Failed to fetch artist data');
        const artist = await res.json();

        // Populate Profile Header
        window.__currentArtist = artist; // cache for edit modal
        // Update notifications indicator and list if panel open
        window.initializeNotificationsUi && window.initializeNotificationsUi();
        window.updateNotifBellIndicator && window.updateNotifBellIndicator(artist);
        const notifPanel = document.getElementById('notif-panel');
        if (notifPanel && !notifPanel.hidden) {
            window.renderNotificationsFromArtist && window.renderNotificationsFromArtist(artist);
        }
        document.getElementById('artist-name').textContent = artist.name;
        const regionEl = document.getElementById('artist-region');
        if (regionEl) {
            const region = formatRegion(artist.city, artist.country);
            regionEl.textContent = region;
        }
        document.querySelector('.profile-avatar').src = artist.profilePictureUrl || '/assets/default-avatar.svg';

        // Update connections text with combined unique count
        const conEl = document.getElementById('artist-connections');
        if (conEl) {
            const followerIds = Array.isArray(artist.followers) ? artist.followers.map(a => (a && (a._id || a.id)) ? (a._id || a.id) : String(a)) : [];
            const followingIds = Array.isArray(artist.following) ? artist.following.map(a => (a && (a._id || a.id)) ? (a._id || a.id) : String(a)) : [];
            const uniqueCount = new Set([...followerIds, ...followingIds].map(String)).size;
            conEl.textContent = `${uniqueCount} Connection${uniqueCount === 1 ? '' : 's'}`;
        }

        // --- Populate Gallery Tab ---
        const galleryContainer = document.getElementById('artist-artworks-container');
        galleryContainer.innerHTML = ''; // Clear existing
        if (artist.artworks && artist.artworks.length > 0) {
            artist.artworks.forEach(artwork => {
                const card = createArtworkCard(artwork, false);
                galleryContainer.appendChild(card);
            });
        } else {
            galleryContainer.innerHTML = '<p>You have not uploaded any artworks yet.</p>';
        }

        // --- Populate Collection Tab ---
        const collectionContainer = document.getElementById('artist-collection-container');
        collectionContainer.innerHTML = ''; // Clear existing
        if (artist.collections && artist.collections.length > 0) {
            artist.collections.forEach(artwork => {
                const card = createArtworkCard(artwork, true);
                collectionContainer.appendChild(card);
            });
        } else {
            collectionContainer.innerHTML = '<p>You have not collected any artworks yet.</p>';
        }
    } catch (error) {
        console.error('Error loading profile data:', error);
        document.getElementById('artist-name').textContent = 'Error';
        const regionEl = document.getElementById('artist-region');
        if (regionEl) regionEl.textContent = 'City, Country';
    }
}

// Helpers for region display
function formatRegion(city, country) {
    const c = String(city || '').trim();
    const co = String(country || '').trim();
    const region = [c, co].filter(Boolean).join(', ');
    return region || 'City, Country';
}

// --- Inline Notification Helper ---
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

        // Animate in
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
    } catch (e) {
        // Fallback if DOM not ready
        console.log(`[${type}]`, message);
    }
}

// --- Edit Profile Modal Logic ---
function openEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if (!modal) return;
    const artist = window.__currentArtist || {};
    const nameInput = document.getElementById('edit-name');
    const cityInput = document.getElementById('edit-city');
    const countryInput = document.getElementById('edit-country');
    if (nameInput) nameInput.value = artist.name || '';
    if (cityInput) cityInput.value = artist.city || '';
    if (countryInput) countryInput.value = artist.country || '';
    modal.style.display = 'flex';
}

function closeEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if (!modal) return;
    modal.style.display = 'none';
}

async function saveProfileChanges() {
    const token = localStorage.getItem('token');
    if (!token) { showNotice('You must be logged in to edit your profile.', 'error'); return; }

    const name = (document.getElementById('edit-name')?.value || '').trim();
    const city = (document.getElementById('edit-city')?.value || '').trim();
    const country = (document.getElementById('edit-country')?.value || '').trim();

    if (!name) { showNotice('Name is required.', 'error'); return; }

    try {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ name, city, country })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to update profile' }));
            throw new Error(err.message || 'Failed to update profile');
        }

        const data = await res.json();
        const updated = data.artist || {};
        // Update UI
        const nameEl = document.getElementById('artist-name');
        const regionEl = document.getElementById('artist-region');
        if (nameEl && updated.name) nameEl.textContent = updated.name;
        if (regionEl) regionEl.textContent = formatRegion(updated.city, updated.country);
        // Cache
        window.__currentArtist = Object.assign({}, window.__currentArtist, updated);

        closeEditProfileModal();
        showNotice('Profile updated', 'success');
    } catch (e) {
        console.error('Save profile error:', e);
        showNotice(e.message || 'Failed to update profile', 'error');
    }
}

// --- Helpers for poetry rendering (scoped to account page) ---
// Escape text for safe HTML insertion
function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Convert legacy escaped <font color> to <span style="color:"> safely
function convertEscapedFontToSpan(html) {
    if (typeof html !== 'string') return '';
    const decoded = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
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

function createArtworkCard(artwork, showArtistName) {
    const card = document.createElement('div');
    card.className = 'artwork-card';
    card.style.position = 'relative';

    let artistInfo = `<p><em>${artwork.medium}</em></p>`;
    if (showArtistName && artwork.artist) {
        artistInfo = `<p><em>${artwork.medium}</em> by ${artwork.artist.name}</p>`;
    }

    // Add delete button for user's own artworks (not for collected artworks)
    const deleteButton = !showArtistName ? `
        <button class="delete-artwork-btn" onclick="deleteArtwork('${artwork._id}', event)" title="Delete artwork">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        </button>
    ` : '';

    if (artwork.medium === 'poetry') {
        card.classList.add('poetry');
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

        const linesHtml = lines.map((ln) => {
            const pad = ln.indent > 0 ? `${ln.indent * 2}em` : '0';
            const mt = ln.spacing > 0 ? `${ln.spacing * 0.4}em` : '0';
            const mtStyle = mt !== '0' ? `margin-top: ${mt};` : '';
            return `<div class="poem-line" style="padding-left: ${pad}; ${mtStyle}">${ln.html}</div>`;
        }).join('');

        card.innerHTML = `
            <div class="poetry-preview">
                <div class="poem-viewer">${linesHtml}</div>
            </div>
            <div class="artwork-info">
                <h3>${artwork.title}</h3>
                ${artistInfo}
            </div>
            ${deleteButton}
        `;
    } else {
        card.innerHTML = `
            <img src="${artwork.imageUrl}" alt="${artwork.title}" class="artwork-img-blur">
            <div class="artwork-info">
                <h3>${artwork.title}</h3>
                ${artistInfo}
            </div>
            ${deleteButton}
        `;
    }
    
    // Add click handler for navigation (but not on delete button)
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-artwork-btn')) {
            window.location.href = `/artwork.html?id=${artwork._id}`;
        }
    });
    
    return card;
}

// Delete artwork function
async function deleteArtwork(artworkId, event) {
    event.stopPropagation();
    
    console.log('Attempting to delete artwork with ID:', artworkId);
    
    if (!confirm('Are you sure you want to delete this artwork? This action cannot be undone.')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        console.log('Token exists:', !!token);
        console.log('DELETE URL:', `/api/artworks/${artworkId}`);
        
        const response = await fetch(`/api/artworks/${artworkId}`, {
            method: 'DELETE',
            headers: {
                'x-auth-token': token,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (response.ok) {
            // Remove the artwork card from the DOM
            const artworkCard = event.target.closest('.artwork-card');
            if (artworkCard) {
                artworkCard.remove();
            }
            
            // Show success message
            showNotice('Artwork deleted successfully!', 'success');
            
            // Refresh the gallery to update counts
            loadProfileData();
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to delete artwork' }));
            showNotice(`Error: ${errorData.message}`, 'error');
        }
    } catch (error) {
        console.error('Error deleting artwork:', error);
        showNotice('Failed to delete artwork. Please try again.', 'error');
    }
}

// Profile picture upload functionality
function initializeProfilePictureUpload() {
    const avatarContainer = document.querySelector('.profile-avatar-container');
    const avatarUpload = document.getElementById('avatar-upload');
    const profileAvatar = document.getElementById('profile-avatar');
    
    if (avatarContainer && avatarUpload && profileAvatar) {
        // Click handler for avatar container
        avatarContainer.addEventListener('click', () => {
            avatarUpload.click();
        });
        
        // File upload handler
        avatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    // Create a preview for cropping
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        showImageCropModal(event.target.result, file);
                    };
                    reader.readAsDataURL(file);
                } catch (error) {
                    console.error('Error processing image:', error);
                    showNotice('Error processing image. Please try again.', 'error');
                }
            }
        });
    }
}

// Show image crop modal
function showImageCropModal(imageSrc, file) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 500px;
        width: 90%;
        text-align: center;
    `;
    
    // Create crop container
    const cropContainer = document.createElement('div');
    cropContainer.style.cssText = `
        position: relative;
        width: 300px;
        height: 300px;
        margin: 20px auto;
        border: 2px dashed #ccc;
        overflow: hidden;
        border-radius: 50%;
    `;
    
    // Create image for cropping
    const cropImage = document.createElement('img');
    cropImage.src = imageSrc;
    cropImage.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        cursor: move;
    `;
    
    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        margin-top: 20px;
        display: flex;
        gap: 10px;
        justify-content: center;
    `;
    
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.style.cssText = `
        background: #007cba;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
    `;
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
        background: #ccc;
        color: black;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
    `;
    
    // Event handlers
    saveButton.addEventListener('click', () => {
        uploadProfilePicture(file, modal);
    });
    
    cancelButton.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Assemble modal
    cropContainer.appendChild(cropImage);
    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(cancelButton);
    modalContent.appendChild(document.createElement('h3')).textContent = 'Crop Profile Picture';
    modalContent.appendChild(cropContainer);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

// Upload profile picture
async function uploadProfilePicture(file, modal) {
    try {
        const formData = new FormData();
        formData.append('profilePicture', file);
        
        const token = localStorage.getItem('token');
        const response = await fetch('/api/auth/profile-picture', {
            method: 'POST',
            headers: {
                'x-auth-token': token
            },
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Update profile picture in UI
            const profileAvatar = document.getElementById('profile-avatar');
            if (profileAvatar && result.profilePictureUrl) {
                profileAvatar.src = result.profilePictureUrl;
            }
            
            // Close modal
            document.body.removeChild(modal);
            
            showNotice('Profile picture updated successfully!', 'success');
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to upload profile picture' }));
            showNotice(`Error: ${errorData.message}`, 'error');
        }
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showNotice('Failed to upload profile picture. Please try again.', 'error');
    }
}

async function loadPortfolioData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch('/api/portfolios/mine', { headers: { 'x-auth-token': token } });
        if (res.status === 404) {
             console.log('No portfolio found for this artist. Form will be blank.');
             return;
        }
        if (!res.ok) throw new Error('Failed to load portfolio data');
        const portfolio = await res.json();

        document.getElementById('artist-statement').value = portfolio.artistStatement || '';
        document.getElementById('layout').value = portfolio.layout || 'grid';
        document.getElementById('color-palette').value = portfolio.colorPalette || 'light';
        document.getElementById('custom-url').value = portfolio.customUrl || '';

    } catch (error) {
        console.error('Error loading portfolio settings:', error);
        showNotice('Could not load your portfolio settings.', 'error');
    }
}

async function savePortfolioSettings() {
    const token = localStorage.getItem('token');
    if (!token) { showNotice('You must be logged in to save settings.', 'error'); return; }

    const settings = {
        artistStatement: document.getElementById('artist-statement').value,
        layout: document.getElementById('layout').value,
        colorPalette: document.getElementById('color-palette').value,
        customUrl: document.getElementById('custom-url').value,
    };

    try {
        const res = await fetch('/api/portfolios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token,
            },
            body: JSON.stringify(settings),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || 'Failed to save settings');
        }

        showNotice('Settings saved successfully!', 'success');
        window.location.href = '/account.html';
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotice(`Error: ${error.message}`, 'error');
    }
}

async function uploadArtwork() {
    const token = localStorage.getItem('token');
    if (!token) { showNotice('You must be logged in to upload artwork.', 'error'); return; }

    const formData = new FormData();
    formData.append('title', document.getElementById('title').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('medium', document.getElementById('medium').value);
    formData.append('artworkImage', document.getElementById('artwork-image').files[0]);

    try {
        const res = await fetch('/api/artworks', {
            method: 'POST',
            headers: {
                'x-auth-token': token,
            },
            body: formData,
        });

        if (!res.ok) {
            // Handle complex error structures from the server
            const errorData = await res.json().catch(() => ({ message: 'An unknown error occurred. The server response was not valid JSON.' }));
            let errorMessage = 'Failed to upload artwork.';
            if (typeof errorData === 'string') {
                errorMessage = errorData;
            } else if (errorData.message) {
                errorMessage = errorData.message;
            } else if (errorData.errors) {
                errorMessage = Object.values(errorData.errors).map(e => e.message).join('\n');
            }
            throw new Error(errorMessage);
        }

        showNotice('Artwork uploaded successfully!', 'success');
        window.location.href = '/account.html'; 

    } catch (error) {
        console.error('Upload error:', error);
        showNotice(`Upload failed: ${error.message}`, 'error');
    }
}
