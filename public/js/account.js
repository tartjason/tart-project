document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token && window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
        // Allow access to upload/settings if developing, but functionality will be limited.
        // In a real app, you'd redirect: window.location.href = '/login.html';
        console.warn('No token found. Functionality will be limited.');
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

    // --- Page Specific Loaders ---
    if (document.querySelector('.profile-container')) {
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
        document.getElementById('artist-name').textContent = artist.name;
        document.getElementById('artist-id').textContent = `@${artist.username || artist.name.toLowerCase().replace(/\s+/g, '')}`;
        document.querySelector('.profile-avatar').src = artist.profilePictureUrl || '/assets/default-avatar.svg';

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
        document.getElementById('artist-id').textContent = 'Could not load profile';
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
            alert('Artwork deleted successfully!');
            
            // Refresh the gallery to update counts
            loadProfileData();
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to delete artwork' }));
            alert(`Error: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Error deleting artwork:', error);
        alert('Failed to delete artwork. Please try again.');
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
                    alert('Error processing image. Please try again.');
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
            
            alert('Profile picture updated successfully!');
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to upload profile picture' }));
            alert(`Error: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        alert('Failed to upload profile picture. Please try again.');
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
        alert('Could not load your portfolio settings.');
    }
}

async function savePortfolioSettings() {
    const token = localStorage.getItem('token');
    if (!token) return alert('You must be logged in to save settings.');

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

        alert('Settings saved successfully!');
        window.location.href = '/account.html';
    } catch (error) {
        console.error('Error saving settings:', error);
        alert(`Error: ${error.message}`);
    }
}

async function uploadArtwork() {
    const token = localStorage.getItem('token');
    if (!token) return alert('You must be logged in to upload artwork.');

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

        alert('Artwork uploaded successfully!');
        window.location.href = '/account.html'; 

    } catch (error) {
        console.error('Upload error:', error);
        alert(`Upload failed: ${error.message}`);
    }
}
