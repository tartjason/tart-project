document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token && window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
        // Allow access to upload/settings if developing, but functionality will be limited.
        // In a real app, you'd redirect: window.location.href = '/login.html';
        console.warn('No token found. Functionality will be limited.');
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
        document.querySelector('.profile-avatar').src = artist.profilePictureUrl || '/assets/default-avatar.png';

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

    card.innerHTML = `
        <img src="${artwork.imageUrl}" alt="${artwork.title}" class="artwork-img-blur">
        <div class="artwork-info">
            <h3>${artwork.title}</h3>
            ${artistInfo}
        </div>
        ${deleteButton}
    `;
    
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
