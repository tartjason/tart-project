document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams(window.location.search);
    const artworkId = params.get('id');

    if (!artworkId) {
        document.querySelector('main').innerHTML = '<h1>Artwork not found.</h1>';
        return;
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
        document.getElementById('artwork-image-container').innerHTML = `<img src="${artwork.imageUrl}" alt="${artwork.title}" decoding="async" fetchpriority="high">`;
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
        document.getElementById('artwork-location').textContent = artwork.location || 'Unknown';

        // Populate Artist Info
        const artist = artwork.artist;
        document.getElementById('artist-avatar').src = artist.profilePictureUrl || '/assets/default-avatar.png';
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

    } catch (error) {
        console.error(error);
        document.querySelector('main').innerHTML = `<h1>Error: ${error.message}</h1>`;
    }
});

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
    if (isFollowing) {
        followBtn.textContent = 'Following';
        followBtn.classList.add('btn-secondary');
    } else {
        followBtn.textContent = 'Follow';
        followBtn.classList.remove('btn-secondary');
    }
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
