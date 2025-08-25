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
        let collections = [];

        const needsRefresh = followers.some(x => typeof x === 'string' || (x && !x.name))
            || following.some(x => typeof x === 'string' || (x && !x.name));
        if (needsRefresh) {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const res = await authFetch('/api/auth/me');
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
                const resNotif = await authFetch('/api/notifications/followers?limit=50');
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

        // Also fetch collection notifications (who collected your artworks)
        try {
            const token3 = localStorage.getItem('token');
            if (token3) {
                const resColl = await authFetch('/api/notifications/collections?limit=50');
                if (resColl.ok) {
                    const events = await resColl.json(); // [{ collector, artwork, createdAt }]
                    collections = Array.isArray(events) ? events.filter(ev => ev && ev.collector && ev.artwork) : [];
                }
            }
        } catch (e) {
            console.warn('Could not load collection notifications:', e);
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
            const noFollowers = !followers || followers.length === 0;
            const noCollections = !collections || collections.length === 0;
            if (noFollowers && noCollections) {
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

            // Build a combined, sorted list of events
            const items = [];
            (Array.isArray(followers) ? followers : []).forEach(f => {
                const id = (f && (f._id || f.id)) ? (f._id || f.id) : String(f);
                items.push({
                    type: 'follow',
                    date: deriveDateFromFollower(f) || new Date(),
                    user: {
                        id: String(id),
                        name: (f && f.name) ? f.name : 'Someone',
                        avatar: (f && f.profilePictureUrl) ? f.profilePictureUrl : '/assets/default-avatar.svg'
                    }
                });
            });
            (Array.isArray(collections) ? collections : []).forEach(ev => {
                const collector = ev && ev.collector ? ev.collector : null;
                const artwork = ev && ev.artwork ? ev.artwork : null;
                if (!collector || !artwork) return;
                items.push({
                    type: 'collection',
                    date: (ev && ev.createdAt) ? new Date(ev.createdAt) : new Date(),
                    user: {
                        id: String(collector._id || collector.id || ''),
                        name: collector.name || 'Someone',
                        avatar: collector.profilePictureUrl || '/assets/default-avatar.svg'
                    },
                    artwork: { id: String(artwork._id || artwork.id || ''), title: artwork.title || 'artwork' }
                });
            });
            items.sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));

            items.forEach(item => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '10px';
                li.style.padding = '8px 0';

                const link = document.createElement('a');
                link.href = `/account.html?artistId=${encodeURIComponent(String(item.user.id))}`;
                link.style.display = 'flex';
                link.style.alignItems = 'center';
                link.style.gap = '10px';
                link.style.textDecoration = 'none';
                link.style.color = 'inherit';
                const img = document.createElement('img');
                img.src = item.user.avatar;
                img.alt = '';
                img.width = 36;
                img.height = 36;
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';

                const body = document.createElement('div');
                body.style.flex = '1';
                const text = document.createElement('div');
                const nameLink = document.createElement('a');
                nameLink.href = link.href;
                nameLink.textContent = item.user.name;
                nameLink.style.textDecoration = 'none';
                nameLink.style.color = 'inherit';
                text.innerHTML = '';
                const strong = document.createElement('strong');
                strong.appendChild(nameLink);
                text.appendChild(strong);
                if (item.type === 'follow') {
                    text.appendChild(document.createTextNode(' followed you.'));
                } else {
                    const awLink = document.createElement('a');
                    awLink.href = `/artwork.html?id=${encodeURIComponent(item.artwork.id)}`;
                    awLink.textContent = item.artwork.title || 'artwork';
                    awLink.style.textDecoration = 'none';
                    awLink.style.color = 'inherit';
                    text.appendChild(document.createTextNode(' collected '));
                    text.appendChild(awLink);
                    text.appendChild(document.createTextNode('.'));
                }
                text.style.fontSize = '14px';
                const time = document.createElement('div');
                time.textContent = formatRelativeTime(item.date instanceof Date ? item.date : new Date());
                time.style.fontSize = '12px';
                time.style.color = '#6b7280';
                body.appendChild(text);
                body.appendChild(time);

                link.appendChild(img);
                li.appendChild(link);
                li.appendChild(body);

                if (item.type === 'follow') {
                    const isFollowingBack = followingIds.has(String(item.user.id));
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-secondary follow-back-btn';
                    btn.textContent = isFollowingBack ? 'Following' : 'Follow back';
                    btn.style.marginLeft = 'auto';
                    if (isVisitorMode()) {
                        btn.disabled = true;
                        btn.title = 'Disabled in visitor view';
                    }
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await followBackArtist(String(item.user.id), btn);
                    });
                    li.appendChild(btn);
                }

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

// Load another artist's public profile when viewing in visitor mode
async function loadPublicProfileData(artistId) {
    try {
        const url = `/api/artists/${encodeURIComponent(String(artistId))}`;
        const res = await fetch(url);
        const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (!res.ok) {
            let msg = `Failed to fetch public artist (status ${res.status})`;
            try {
                if (ct.includes('application/json')) {
                    const err = await res.json();
                    if (err && (err.msg || err.message)) msg = err.msg || err.message;
                } else {
                    const txt = await res.text();
                    if (txt) msg += `: ${String(txt).slice(0, 160)}`;
                }
            } catch (_) { /* ignore */ }
            throw new Error(msg);
        }
        if (!ct.includes('application/json')) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Expected JSON from ${url} but received content-type "${ct}". Preview: ${String(txt).slice(0, 160)}`);
        }
        const artist = await res.json();

        // Cache and mark as viewed (visitor)
        window.__viewedArtist = artist;

        // Populate Profile Header
        const nameEl = document.getElementById('artist-name');
        if (nameEl) nameEl.textContent = artist.name || 'Artist';
        // Update artworks heading to "<Name>'s Artworks" in visitor mode
        const artworksHeading = document.getElementById('artworks-heading');
        if (artworksHeading) artworksHeading.textContent = `${formatPossessive(artist.name)} Artworks`;
        const regionEl = document.getElementById('artist-region');
        if (regionEl) regionEl.textContent = formatRegion(artist.city, artist.country);
        const avatarEl = document.querySelector('.profile-avatar');
        if (avatarEl) avatarEl.src = artist.profilePictureUrl || '/assets/default-avatar.svg';

        // Update connections text with combined unique count (or hidden)
        const conEl = document.getElementById('artist-connections');
        if (conEl) {
            if (artist.followersVisible === false && artist.followingVisible === false) {
                conEl.textContent = 'Connections hidden';
            } else {
                const followerIds = Array.isArray(artist.followers) ? artist.followers.map(a => (a && (a._id || a.id)) ? (a._id || a.id) : String(a)) : [];
                const followingIds = Array.isArray(artist.following) ? artist.following.map(a => (a && (a._id || a.id)) ? (a._id || a.id) : String(a)) : [];
                const uniqueCount = new Set([...followerIds, ...followingIds].map(String)).size;
                conEl.textContent = `${uniqueCount} Connection${uniqueCount === 1 ? '' : 's'}`;
            }
        }

        // Populate Gallery Tab (respect privacy)
        const galleryContainer = document.getElementById('artist-artworks-container');
        if (galleryContainer) {
            galleryContainer.innerHTML = '';
            if (artist.galleryVisible === false) {
                galleryContainer.innerHTML = '<p>Gallery is hidden by the artist.</p>';
            } else if (artist.artworks && artist.artworks.length > 0) {
                artist.artworks.forEach(aw => {
                    const card = createArtworkCard(aw, false);
                    galleryContainer.appendChild(card);
                });
            } else {
                galleryContainer.innerHTML = '<p>No artworks yet.</p>';
            }
        }

        // Populate Collection Tab (respect privacy)
        const collectionContainer = document.getElementById('artist-collection-container');
        if (collectionContainer) {
            collectionContainer.innerHTML = '';
            if (artist.collectionVisible === false) {
                collectionContainer.innerHTML = '<p>Collection is hidden by the artist.</p>';
            } else if (artist.collections && artist.collections.length > 0) {
                artist.collections.forEach(aw => {
                    const card = createArtworkCard(aw, true);
                    collectionContainer.appendChild(card);
                });
            } else {
                collectionContainer.innerHTML = '<p>No collections yet.</p>';
            }
        }
    } catch (e) {
        console.error('Error loading public profile:', e);
        const nameEl = document.getElementById('artist-name');
        if (nameEl) nameEl.textContent = 'Artist';
        const regionEl = document.getElementById('artist-region');
        if (regionEl) regionEl.textContent = 'City, Country';
        showNotice((e && e.message) ? e.message : 'Could not load public profile.', 'error');
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
        const [resF, resC] = await Promise.all([
            authFetch('/api/notifications/followers?limit=1'),
            authFetch('/api/notifications/collections?limit=1')
        ]);
        let latestMs = 0;
        if (resF && resF.ok) {
            const evF = await resF.json();
            const latestF = Array.isArray(evF) && evF.length ? evF[0] : null;
            const tsF = latestF && latestF.createdAt ? new Date(latestF.createdAt) : null;
            if (tsF && !isNaN(tsF.getTime())) latestMs = Math.max(latestMs, tsF.getTime());
        }
        if (resC && resC.ok) {
            const evC = await resC.json();
            const latestC = Array.isArray(evC) && evC.length ? evC[0] : null;
            const tsC = latestC && latestC.createdAt ? new Date(latestC.createdAt) : null;
            if (tsC && !isNaN(tsC.getTime())) latestMs = Math.max(latestMs, tsC.getTime());
        }
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
        const res = await authFetch(`/api/artists/${encodeURIComponent(targetId)}/follow`, {
            method: 'PUT'
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
        const artist = Object.assign({}, (window.__profileIsOwner ? window.__currentArtist : window.__viewedArtist) || {});
        let followers = Array.isArray(artist.followers) ? artist.followers : [];
        let following = Array.isArray(artist.following) ? artist.following : [];

        const isOwner = !!window.__profileIsOwner;
        const followersVisible = isOwner ? true : (artist.followersVisible !== false);
        const followingVisible = isOwner ? true : (artist.followingVisible !== false);

        // If arrays contain plain IDs or items without name, refresh from backend to get populated docs
        const needsRefresh = followers.some(x => typeof x === 'string' || (x && !x.name))
            || following.some(x => typeof x === 'string' || (x && !x.name));
        if (needsRefresh && window.__profileIsOwner) {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const res = await authFetch('/api/auth/me');
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
            // Respect privacy in visitor mode
            if (!isOwner && which === 'followers' && !followersVisible) {
                const hidden = document.createElement('p');
                hidden.textContent = 'Followers are hidden by the artist.';
                hidden.style.color = '#555';
                content.appendChild(hidden);
                return;
            }
            if (!isOwner && which === 'following' && !followingVisible) {
                const hidden = document.createElement('p');
                hidden.textContent = 'Following is hidden by the artist.';
                hidden.style.color = '#555';
                content.appendChild(hidden);
                return;
            }
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

                const link = document.createElement('a');
                link.href = `/account.html?artistId=${encodeURIComponent(String(id))}`;
                link.style.display = 'flex';
                link.style.alignItems = 'center';
                link.style.gap = '10px';
                link.style.textDecoration = 'none';
                link.style.color = 'inherit';

                const img = document.createElement('img');
                img.src = avatar;
                img.alt = '';
                img.width = 36;
                img.height = 36;
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = name;
                nameSpan.style.flex = '1';

                link.appendChild(img);
                link.appendChild(nameSpan);
                li.appendChild(link);

                // Add toggle only for Following tab
                if (which === 'following') {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-secondary';
                    btn.textContent = 'Following';
                    btn.style.marginLeft = 'auto';
                    if (isVisitorMode()) {
                        btn.disabled = true;
                        btn.title = 'Disabled in visitor view';
                    }
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const token = localStorage.getItem('token');
                        if (!token) { showNotice('You must be logged in to follow artists.', 'error'); return; }
                        btn.disabled = true;
                        try {
                            const res = await authFetch(`/api/artists/${id}/follow`, {
                                method: 'PUT'
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

        // Default to a visible tab (owner sees both). Prefer Following.
        let defaultTab = 'following';
        if (!isOwner && !followingVisible && followersVisible) defaultTab = 'followers';
        if (!isOwner && !followingVisible && !followersVisible) defaultTab = 'following';
        setActive(defaultTab === 'following' ? tabFollowing : tabFollowers);
        renderList(defaultTab);

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
        const res = await authFetch('/api/website-state');
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

// Load published website info for the viewed artist (visitor mode)
async function loadPublishedWebsiteInfoForViewedArtist(artistId) {
    const container = document.getElementById('account-published-url');
    const link = document.getElementById('account-published-url-link');
    if (!container || !link) return;

    try {
        const res = await fetch(`/api/public/site-by-artist/${encodeURIComponent(String(artistId))}`);
        if (!res || !res.ok) {
            container.style.display = 'none';
            return;
        }
        const data = await res.json();
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
        let fullUrl = '';
        const slug = data && data.slug ? String(data.slug).replace(/^\//, '') : '';
        if (slug) {
            fullUrl = `${origin}/${slug}`;
        } else if (data && data.artistId) {
            // Fallback for environments without slugs: point to static site renderer
            fullUrl = `${origin}/site.html?site=${encodeURIComponent(String(data.artistId))}`;
        } else {
            container.style.display = 'none';
            return;
        }
        link.href = fullUrl;
        link.textContent = fullUrl;
        container.style.display = 'block';
    } catch (e) {
        console.warn('Failed to load viewed artist website info:', e);
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
    const savePrivacyBtn = document.getElementById('save-privacy-btn');
    if (savePrivacyBtn) savePrivacyBtn.addEventListener('click', savePrivacySettings);

    // Settings modal: side nav switching and backdrop close
    const settingsNavItems = document.querySelectorAll('.settings-nav-item');
    if (settingsNavItems && settingsNavItems.length) {
        settingsNavItems.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-panel') || 'edit';
                selectSettingsPanel(target);
            });
        });
    }
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeEditProfileModal();
        });
    }

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
        const viewedId = getViewedArtistId();
        // Hide/disable edit & creation controls in visitor mode
        const profileActions = document.querySelector('.profile-actions');
        const editBtnHdr = document.getElementById('edit-profile-btn');
        const avatarOverlay = document.querySelector('.avatar-upload-overlay');
        const avatarInput = document.getElementById('avatar-upload');
        const publishedWrap = document.getElementById('account-published-url');
        const notifBell = document.getElementById('notif-bell');
        const notifPanel = document.getElementById('notif-panel');

        if (viewedId) {
            window.__profileIsOwner = false;
            // Hide actions not applicable to visitor view
            if (profileActions) profileActions.style.display = 'none';
            if (editBtnHdr) editBtnHdr.style.display = 'none';
            if (avatarOverlay) avatarOverlay.style.display = 'none';
            if (avatarInput) avatarInput.disabled = true;
            // Hide notifications bell entirely in visitor view
            if (notifBell) notifBell.style.display = 'none';
            if (notifPanel) notifPanel.hidden = true;

            // Show the visitor's own published site link
            loadPublishedWebsiteInfoForViewedArtist(viewedId);

            // Load public profile for the viewed artist
            loadPublicProfileData(viewedId);
            // Insert and wire follow toggle button near artist name
            setupVisitorFollowButton(viewedId);
        } else {
            window.__profileIsOwner = true;
            // Initialize notifications UI elements on own profile only
            initializeNotificationsUi();
            if (document.getElementById('artist-name')) {
                loadProfileData();
                // Only enable avatar upload on own profile
                initializeProfilePictureUpload();
            }

            if (document.getElementById('portfolio-settings-form')) {
                loadPortfolioData();
            }

            // Only show published URL for own profile
            loadPublishedWebsiteInfo();
        }
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

// --- Visitor Mode Helpers ---
function getViewedArtistId() {
    try {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('artistId');
        return id ? String(id) : null;
    } catch (_) { return null; }
}

function isVisitorMode() {
    return !!getViewedArtistId();
}

// Insert and manage a follow button in visitor mode
async function setupVisitorFollowButton(viewedId) {
    try {
        const nameRow = document.querySelector('.name-row');
        if (!nameRow) return;

        // Avoid duplicates
        let btn = document.getElementById('visitor-follow-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'visitor-follow-btn';
            btn.type = 'button';
            btn.className = 'btn btn-secondary';
            btn.style.marginLeft = '12px';
            btn.textContent = 'Follow';
            // Insert right after the artist name heading
            const nameEl = document.getElementById('artist-name');
            if (nameEl && nameEl.parentNode === nameRow) {
                nameRow.insertBefore(btn, nameEl.nextSibling);
            } else {
                nameRow.appendChild(btn);
            }
        }

        const token = localStorage.getItem('token');
        if (!token) {
            btn.disabled = true;
            btn.title = 'Log in to follow';
            return;
        }

        // Determine initial follow state
        let current = window.__currentArtist;
        if (!current) {
            try {
                const res = await authFetch('/api/auth/me');
                if (res.ok) {
                    current = await res.json();
                    window.__currentArtist = current;
                }
            } catch (_) {}
        }

        const currentId = current && (current._id || current.id);
        if (currentId && String(currentId) === String(viewedId)) {
            // Should not happen, but guard: cannot follow yourself
            btn.style.display = 'none';
            return;
        }

        const following = Array.isArray(current && current.following) ? current.following.map(a => String(a && (a._id || a.id) ? (a._id || a.id) : a)) : [];
        let isFollowing = following.includes(String(viewedId));
        btn.textContent = isFollowing ? 'Following' : 'Follow';

        btn.addEventListener('click', async () => {
            try {
                btn.disabled = true;
                const res = await authFetch(`/api/artists/${encodeURIComponent(String(viewedId))}/follow`, {
                    method: 'PUT'
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ msg: 'Failed to update follow' }));
                    throw new Error(err.msg || 'Failed to update follow');
                }
                const followingIds = await res.json();
                isFollowing = Array.isArray(followingIds) && followingIds.map(String).includes(String(viewedId));
                btn.textContent = isFollowing ? 'Following' : 'Follow';
                // Update cache for consistency
                if (window.__currentArtist) {
                    window.__currentArtist.following = followingIds;
                }
                showNotice(isFollowing ? 'You are now following.' : 'You unfollowed.', 'success');
            } catch (e) {
                console.error('Follow toggle error:', e);
                showNotice(e.message || 'Failed to update follow', 'error');
            } finally {
                btn.disabled = false;
            }
        });
    } catch (e) {
        console.warn('Failed to setup visitor follow button:', e);
    }
}

async function loadProfileData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        // Single API call to get all necessary data
        const res = await authFetch('/api/auth/me');
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
        // Ensure artworks heading is "My Artworks" on own profile
        const artworksHeading = document.getElementById('artworks-heading');
        if (artworksHeading) artworksHeading.textContent = 'My Artworks';
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

// Helper: format possessive form of a name (Alex's, Chris')
function formatPossessive(name) {
    const n = String(name || '').trim();
    if (!n) return "Artist's";
    const endsWithS = /s$/i.test(n);
    return endsWithS ? `${n}'` : `${n}'s`;
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

// --- Centralized authenticated fetch helper ---
async function authFetch(url, options = {}) {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : null;
    const headers = new Headers(options.headers || {});
    if (token && !headers.has('x-auth-token')) {
        headers.set('x-auth-token', token);
    }
    try {
        const res = await fetch(url, { ...options, headers });
        if (res && res.status === 401) {
            // Handle expired/invalid session globally
            try {
                if (!window.__authExpiredHandling) {
                    window.__authExpiredHandling = true;
                    if (typeof localStorage !== 'undefined') localStorage.removeItem('token');
                    showNotice('Session expired. Please log in again.', 'error', 6000);
                    setTimeout(() => { window.location.href = '/'; }, 1200);
                }
            } catch (_) { /* no-op */ }
            throw new Error('Unauthorized');
        }
        return res;
    } catch (e) {
        // Network or other error
        showNotice('Network error. Please try again.', 'error');
        throw e;
    }
}

// --- Settings Modal (Edit Profile inside) ---
function openEditProfileModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const artist = window.__currentArtist || {};
    const nameInput = document.getElementById('edit-name');
    const cityInput = document.getElementById('edit-city');
    const countryInput = document.getElementById('edit-country');
    if (nameInput) nameInput.value = artist.name || '';
    if (cityInput) cityInput.value = artist.city || '';
    if (countryInput) countryInput.value = artist.country || '';
    // Populate Privacy toggles (default true when undefined)
    const followersCb = document.getElementById('privacy-followers-visible');
    const followingCb = document.getElementById('privacy-following-visible');
    const galleryCb = document.getElementById('privacy-gallery-visible');
    const collectionCb = document.getElementById('privacy-collection-visible');
    if (followersCb) followersCb.checked = artist.followersVisible !== false;
    if (followingCb) followingCb.checked = artist.followingVisible !== false;
    if (galleryCb) galleryCb.checked = artist.galleryVisible !== false;
    if (collectionCb) collectionCb.checked = artist.collectionVisible !== false;
    // Ensure Edit panel is active by default when opening
    selectSettingsPanel('edit');
    modal.style.display = 'flex';
    // Close on Escape
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeEditProfileModal(); } };
    document.addEventListener('keydown', onKey, { once: true });
}

function closeEditProfileModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.style.display = 'none';
}

function selectSettingsPanel(panel) {
    try {
        const panels = {
            edit: document.getElementById('settings-panel-edit'),
            privacy: document.getElementById('settings-panel-privacy')
        };
        if (panels.edit && panels.privacy) {
            // Use flex so the panel fills height and absolute Save button pins to bottom-right
            panels.edit.style.display = panel === 'edit' ? 'flex' : 'none';
            panels.privacy.style.display = panel === 'privacy' ? 'flex' : 'none';
            const privacySave = document.getElementById('privacy-save-anchor');
            if (privacySave) privacySave.style.display = (panel === 'privacy') ? 'flex' : 'none';
        }
        const items = document.querySelectorAll('.settings-nav-item');
        items.forEach((el) => {
            const p = el.getAttribute('data-panel');
            const isActive = (p === panel);
            if (isActive) {
                el.classList.add('active');
                el.style.backgroundColor = '#f3f4f6';
                el.style.fontWeight = '600';
            } else {
                el.classList.remove('active');
                el.style.backgroundColor = 'transparent';
                el.style.fontWeight = '400';
            }
        });
    } catch (_) { /* no-op */ }
}

async function saveProfileChanges() {
    const token = localStorage.getItem('token');
    if (!token) { showNotice('You must be logged in to edit your profile.', 'error'); return; }

    const name = (document.getElementById('edit-name')?.value || '').trim();
    const city = (document.getElementById('edit-city')?.value || '').trim();
    const country = (document.getElementById('edit-country')?.value || '').trim();
    // Also include privacy toggles when saving profile (keeps data in sync)
    const followersVisible = !!(document.getElementById('privacy-followers-visible')?.checked ?? (window.__currentArtist ? (window.__currentArtist.followersVisible !== false) : true));
    const followingVisible = !!(document.getElementById('privacy-following-visible')?.checked ?? (window.__currentArtist ? (window.__currentArtist.followingVisible !== false) : true));
    const galleryVisible = !!(document.getElementById('privacy-gallery-visible')?.checked ?? (window.__currentArtist ? (window.__currentArtist.galleryVisible !== false) : true));
    const collectionVisible = !!(document.getElementById('privacy-collection-visible')?.checked ?? (window.__currentArtist ? (window.__currentArtist.collectionVisible !== false) : true));

    if (!name) { showNotice('Name is required.', 'error'); return; }

    try {
        const res = await authFetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, city, country, followersVisible, followingVisible, galleryVisible, collectionVisible })
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
        // Re-populate toggles to reflect saved values
        if (document.getElementById('privacy-followers-visible')) {
            document.getElementById('privacy-followers-visible').checked = (updated.followersVisible !== false);
        }
        if (document.getElementById('privacy-following-visible')) {
            document.getElementById('privacy-following-visible').checked = (updated.followingVisible !== false);
        }
        if (document.getElementById('privacy-gallery-visible')) {
            document.getElementById('privacy-gallery-visible').checked = (updated.galleryVisible !== false);
        }
        if (document.getElementById('privacy-collection-visible')) {
            document.getElementById('privacy-collection-visible').checked = (updated.collectionVisible !== false);
        }

        closeEditProfileModal();
        showNotice('Profile updated', 'success');
    } catch (e) {
        console.error('Save profile error:', e);
        showNotice(e.message || 'Failed to update profile', 'error');
    }
}

// Save only privacy toggles from the Privacy & Security panel
async function savePrivacySettings() {
    const token = localStorage.getItem('token');
    if (!token) { showNotice('You must be logged in to update privacy settings.', 'error'); return; }
    try {
        const followersVisible = !!document.getElementById('privacy-followers-visible')?.checked;
        const followingVisible = !!document.getElementById('privacy-following-visible')?.checked;
        const galleryVisible = !!document.getElementById('privacy-gallery-visible')?.checked;
        const collectionVisible = !!document.getElementById('privacy-collection-visible')?.checked;

        const res = await authFetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followersVisible, followingVisible, galleryVisible, collectionVisible })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to update privacy settings' }));
            throw new Error(err.msg || err.message || 'Failed to update privacy settings');
        }
        const data = await res.json();
        const updated = data.artist || {};
        window.__currentArtist = Object.assign({}, window.__currentArtist, updated);
        showNotice('Privacy settings updated', 'success');
    } catch (e) {
        console.error('Save privacy error:', e);
        showNotice(e.message || 'Failed to update privacy settings', 'error');
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
        const artistId = (artwork.artist && (artwork.artist._id || artwork.artist.id)) ? (artwork.artist._id || artwork.artist.id) : null;
        const safeName = escapeHtml(artwork.artist.name || '');
        const nameHtml = artistId
            ? `<a href="/account.html?artistId=${encodeURIComponent(String(artistId))}" onclick="event.stopPropagation()">${safeName}</a>`
            : safeName;
        artistInfo = `<p><em>${artwork.medium}</em> by ${nameHtml}</p>`;
    }

    // Add delete button for user's own artworks (not for collected artworks)
    const deleteButton = (!showArtistName && window.__profileIsOwner && !isVisitorMode()) ? `
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
            let href = `/artwork.html?id=${artwork._id}`;
            const viewed = (typeof window !== 'undefined' && window.__viewedArtist) ? window.__viewedArtist : null;
            const viewedId = viewed && (viewed._id || viewed.id);
            if (isVisitorMode() && viewedId) {
                href += `&artistId=${encodeURIComponent(String(viewedId))}`;
            }
            window.location.href = href;
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
        
        const response = await authFetch(`/api/artworks/${artworkId}`, {
            method: 'DELETE',
            headers: {
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
        const response = await authFetch('/api/auth/profile-picture', {
            method: 'POST',
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
        const res = await authFetch('/api/portfolios/mine');
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
        const res = await authFetch('/api/portfolios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
        const res = await authFetch('/api/artworks', {
            method: 'POST',
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
