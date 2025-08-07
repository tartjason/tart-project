document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('You must be logged in to upload artwork.');
        window.location.href = '/login.html';
        return;
    }

    // DOM elements
    const mediumSelect = document.getElementById('medium');
    const imageUploadSection = document.getElementById('image-upload-section');
    const poetryCreationSection = document.getElementById('poetry-creation-section');
    const artworkImageInput = document.getElementById('artwork-image');
    const addTextBoxBtn = document.getElementById('add-text-box');
    const textColorInput = document.getElementById('text-color');
    const poetryWorkspace = document.getElementById('poetry-workspace');
    const uploadBtn = document.getElementById('upload-form-btn');
    const countrySelect = document.getElementById('country');
    const cityInput = document.getElementById('city');
    const bgColorInput = document.getElementById('bg-color');
    const bgSizeInput = document.getElementById('bg-size');
    const addBackgroundBtn = document.getElementById('add-background-btn');
    const backgroundControls = document.getElementById('background-controls');
    const cameraTrigger = document.getElementById('camera-trigger');

    let poetryTextBoxes = [];

    // Initialize workspace
    initializeWorkspace();

    // Event listeners
    mediumSelect.addEventListener('change', handleMediumChange);
    uploadBtn.addEventListener('click', handleUpload);
    countrySelect.addEventListener('change', updateLocationLabel);
    cityInput.addEventListener('input', updateLocationLabel);

    // Camera icon click handling - Fixed
    if (cameraTrigger && artworkImageInput) {
        cameraTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Camera icon clicked');
            artworkImageInput.click();
        });
    }

    // Image upload handling
    artworkImageInput.addEventListener('change', handleImageUpload);

    // Add background button (non-poetry only)
    if (addBackgroundBtn) {
        addBackgroundBtn.addEventListener('click', toggleBackgroundControls);
    }

    // Background controls
    if (bgColorInput) {
        bgColorInput.addEventListener('change', updateBackground);
    }
    if (bgSizeInput) {
        bgSizeInput.addEventListener('input', updateBackground);
    }

    // Poetry text box creation
    if (addTextBoxBtn) {
        addTextBoxBtn.addEventListener('click', createTextBox);
    }

    function initializeWorkspace() {
        // Show image upload section by default
        imageUploadSection.style.display = 'flex';
        poetryCreationSection.style.display = 'none';
        handleMediumChange();
    }

    function handleMediumChange() {
        const selectedMedium = mediumSelect.value;
        
        if (selectedMedium === 'poetry') {
            // Show poetry creation, hide image upload
            imageUploadSection.style.display = 'none';
            poetryCreationSection.style.display = 'flex';
            artworkImageInput.required = false;
        } else {
            // Show image upload, hide poetry creation
            imageUploadSection.style.display = 'flex';
            poetryCreationSection.style.display = 'none';
            artworkImageInput.required = true;
        }

        // Update picker label
        const mediumLabel = document.querySelector('#medium-picker .picker-label');
        if (mediumLabel && selectedMedium) {
            mediumLabel.textContent = selectedMedium.charAt(0).toUpperCase() + selectedMedium.slice(1);
        }
    }

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                createDraggableImage(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    }

    function createDraggableImage(imageSrc) {
        const imageUploadArea = document.querySelector('.image-upload-area');
        const uploadPlaceholder = imageUploadArea.querySelector('.upload-placeholder');
        const imagePreviewContainer = document.getElementById('image-preview-container');
        
        // Hide placeholder and show preview container
        uploadPlaceholder.style.display = 'none';
        imagePreviewContainer.style.display = 'block';
        
        // Create draggable image element
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'draggable-image-wrapper';
        imageWrapper.style.cssText = `
            position: absolute;
            cursor: move;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            max-width: 80%;
            max-height: 80%;
            z-index: 3;
        `;
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        `;
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.className = 'delete-image-btn';
        deleteBtn.style.cssText = `
            position: absolute;
            top: -10px;
            right: -10px;
            width: 24px;
            height: 24px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        `;
        
        // Delete functionality
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            imagePreviewContainer.innerHTML = '';
            imagePreviewContainer.style.display = 'none';
            uploadPlaceholder.style.display = 'flex';
            artworkImageInput.value = '';
        });
        
        // Drag functionality
        makeDraggable(imageWrapper, imageUploadArea);
        
        imageWrapper.appendChild(img);
        imageWrapper.appendChild(deleteBtn);
        imagePreviewContainer.innerHTML = '';
        imagePreviewContainer.appendChild(imageWrapper);
    }

    function toggleBackgroundControls() {
        const backgroundContainer = document.getElementById('background-container');
        
        if (backgroundControls.style.display === 'none' || !backgroundControls.style.display) {
            backgroundControls.style.display = 'block';
            addBackgroundBtn.textContent = '- Remove Background';
            createBackgroundRectangle();
        } else {
            backgroundControls.style.display = 'none';
            addBackgroundBtn.textContent = '+ Add Background';
            backgroundContainer.innerHTML = '';
            backgroundContainer.style.display = 'none';
        }
    }

    function createBackgroundRectangle() {
        const backgroundContainer = document.getElementById('background-container');
        const imageUploadArea = document.querySelector('.image-upload-area');
        
        backgroundContainer.style.display = 'block';
        
        const bgRect = document.createElement('div');
        bgRect.className = 'background-rectangle';
        bgRect.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 200px;
            height: 150px;
            background-color: ${bgColorInput.value};
            border: 2px dashed #ccc;
            cursor: move;
            z-index: 1;
            border-radius: 4px;
        `;
        
        // Add resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: -5px;
            right: -5px;
            width: 10px;
            height: 10px;
            background: #007bff;
            cursor: se-resize;
            border-radius: 2px;
        `;
        
        // Make draggable and resizable
        makeDraggableAndResizable(bgRect, imageUploadArea, resizeHandle);
        
        bgRect.appendChild(resizeHandle);
        backgroundContainer.innerHTML = '';
        backgroundContainer.appendChild(bgRect);
    }

    function updateBackground() {
        const bgRect = document.querySelector('.background-rectangle');
        if (bgRect) {
            bgRect.style.backgroundColor = bgColorInput.value;
            if (bgSizeInput) {
                const size = bgSizeInput.value;
                bgRect.style.width = size + 'px';
                bgRect.style.height = (size * 0.75) + 'px';
            }
        }
    }

    function makeDraggable(element, container) {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        element.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('delete-image-btn')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            const parentRect = container.getBoundingClientRect();
            initialX = rect.left - parentRect.left;
            initialY = rect.top - parentRect.top;
            element.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            element.style.left = (initialX + deltaX) + 'px';
            element.style.top = (initialY + deltaY) + 'px';
            element.style.transform = 'none';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'move';
            }
        });
    }

    function makeDraggableAndResizable(element, container, resizeHandle) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY, initialX, initialY, initialWidth, initialHeight;
        
        element.addEventListener('mousedown', (e) => {
            if (e.target === resizeHandle) {
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                initialWidth = element.offsetWidth;
                initialHeight = element.offsetHeight;
            } else {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = element.getBoundingClientRect();
                const parentRect = container.getBoundingClientRect();
                initialX = rect.left - parentRect.left;
                initialY = rect.top - parentRect.top;
            }
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                element.style.left = (initialX + deltaX) + 'px';
                element.style.top = (initialY + deltaY) + 'px';
                element.style.transform = 'none';
            } else if (isResizing) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                element.style.width = Math.max(50, initialWidth + deltaX) + 'px';
                element.style.height = Math.max(50, initialHeight + deltaY) + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            isResizing = false;
        });
    }

    function createTextBox() {
        const textBox = document.createElement('div');
        textBox.className = 'draggable-text';
        textBox.contentEditable = true;
        textBox.textContent = 'Your text here...';
        textBox.style.color = textColorInput.value;
        
        // Position randomly within workspace
        const workspaceRect = poetryWorkspace.getBoundingClientRect();
        const randomX = Math.random() * (workspaceRect.width - 200) + 100;
        const randomY = Math.random() * (workspaceRect.height - 100) + 100;
        
        textBox.style.left = randomX + 'px';
        textBox.style.top = randomY + 'px';
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.className = 'delete-btn';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            textBox.remove();
            poetryTextBoxes = poetryTextBoxes.filter(box => box !== textBox);
        });
        
        textBox.appendChild(deleteBtn);
        
        // Make draggable
        makeDraggable(textBox, poetryWorkspace);
        
        poetryWorkspace.appendChild(textBox);
        poetryTextBoxes.push(textBox);
        
        // Focus on the text box
        textBox.focus();
    }

    function updateLocationLabel() {
        const country = countrySelect.value;
        const city = cityInput.value.trim();
        const locationLabel = document.getElementById('location-label');
        
        if (country && city) {
            locationLabel.textContent = `${city}, ${country}`;
        } else if (country) {
            locationLabel.textContent = country;
        } else {
            locationLabel.textContent = 'Select location';
        }
    }

    async function handleUpload() {
        try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';

            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();
            const medium = mediumSelect.value;
            const country = countrySelect.value;
            const city = cityInput.value.trim();

            if (!title || !medium || !country || !city) {
                throw new Error('Please fill in all required fields.');
            }

            const location = `${city}, ${country}`;
            const formData = new FormData();
            
            formData.append('title', title);
            formData.append('description', description);
            formData.append('medium', medium);
            formData.append('location', location);

            if (medium === 'poetry') {
                // Handle poetry upload
                const poetryData = poetryTextBoxes.map(textBox => ({
                    text: textBox.textContent.replace('×', '').trim(),
                    color: textBox.style.color || '#000000',
                    x: parseInt(textBox.style.left) || 0,
                    y: parseInt(textBox.style.top) || 0
                }));
                
                formData.append('poetryData', JSON.stringify(poetryData));
            } else {
                // Handle image upload
                if (!artworkImageInput.files[0]) {
                    throw new Error('Please select an image file.');
                }
                formData.append('artworkImage', artworkImageInput.files[0]);
            }

            const res = await fetch('/api/artworks', {
                method: 'POST',
                headers: {
                    'x-auth-token': token,
                },
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: 'An unknown error occurred.' }));
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
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Publish Artwork';
        }
    }

    // Debug logging
    console.log('Upload page loaded successfully');
    console.log('Camera trigger:', cameraTrigger);
    console.log('Add background button:', addBackgroundBtn);
});
