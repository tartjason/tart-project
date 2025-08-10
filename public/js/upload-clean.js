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

    // Initialize
    initializeWorkspace();
    
    // Test authentication on page load
    testAuthentication();

    // Event listeners
    mediumSelect.addEventListener('change', handleMediumChange);
    uploadBtn.addEventListener('click', handleUpload);
    countrySelect.addEventListener('change', updateLocationLabel);
    cityInput.addEventListener('input', updateLocationLabel);

    // FIXED: Camera icon click handling
    if (cameraTrigger && artworkImageInput) {
        cameraTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Camera clicked - triggering file input');
            artworkImageInput.click();
        });
        console.log('Camera icon event listener attached successfully');
    } else {
        console.error('Camera trigger or file input not found');
    }

    // Image upload handling
    if (artworkImageInput) {
        artworkImageInput.addEventListener('change', handleImageUpload);
    }

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
        imageUploadSection.style.display = 'flex';
        poetryCreationSection.style.display = 'none';
        
        // Hide background controls initially
        if (backgroundControls) {
            backgroundControls.style.display = 'none';
        }
        
        handleMediumChange();
    }

    function handleMediumChange() {
        const selectedMedium = mediumSelect.value;
        
        if (selectedMedium === 'poetry') {
            // Poetry mode: show poetry section, hide image section
            imageUploadSection.style.display = 'none';
            poetryCreationSection.style.display = 'flex';
            artworkImageInput.required = false;
        } else {
            // Non-poetry mode: show image section, hide poetry section
            imageUploadSection.style.display = 'flex';
            poetryCreationSection.style.display = 'none';
            artworkImageInput.required = true;
        }

        // Update medium picker label
        const mediumLabel = document.querySelector('#medium-picker .picker-label');
        if (mediumLabel && selectedMedium) {
            mediumLabel.textContent = selectedMedium.charAt(0).toUpperCase() + selectedMedium.slice(1);
        }
    }

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            console.log('File selected:', file.name);
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
        
        // Hide placeholder, show preview
        uploadPlaceholder.style.display = 'none';
        imagePreviewContainer.style.display = 'block';
        
        // Create draggable and resizable image wrapper
        const imageWrapper = document.createElement('div');
        imageWrapper.style.cssText = `
            position: absolute;
            cursor: move;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 300px;
            height: auto;
            z-index: 3;
            border: 2px dashed transparent;
        `;
        
        imageWrapper.addEventListener('mouseenter', () => {
            imageWrapper.style.border = '2px dashed #007bff';
            resizeHandle.style.display = 'block';
        });
        
        imageWrapper.addEventListener('mouseleave', () => {
            imageWrapper.style.border = '2px dashed transparent';
            resizeHandle.style.display = 'none';
        });
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            pointer-events: none;
        `;
        
        // Add resize handle for images
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
            display: none;
        `;
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
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
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        `;
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            imagePreviewContainer.innerHTML = '';
            imagePreviewContainer.style.display = 'none';
            
            // Show camera overlay when image is deleted
            const cameraOverlay = document.getElementById('camera-trigger');
            if (cameraOverlay) {
                cameraOverlay.style.display = 'flex';
            }
            
            artworkImageInput.value = '';
        });
    
    // Make draggable and resizable
    makeDraggableAndResizable(imageWrapper, imageUploadArea, resizeHandle);
    
    // Add click handler for selection
    imageWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        selectElement(imageWrapper);
    });
    
    imageWrapper.appendChild(img);
    imageWrapper.appendChild(deleteBtn);
    imageWrapper.appendChild(resizeHandle);
    imagePreviewContainer.innerHTML = '';
    imagePreviewContainer.appendChild(imageWrapper);
    
    // Hide camera overlay when image is uploaded
    const cameraOverlay = document.getElementById('camera-trigger');
    if (cameraOverlay) {
        cameraOverlay.style.display = 'none';
    }
    
    // Show image preview container
    imagePreviewContainer.style.display = 'block';
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
            if (backgroundContainer) {
                backgroundContainer.innerHTML = '';
                backgroundContainer.style.display = 'none';
            }
        }
    }

    function createBackgroundRectangle() {
        const backgroundContainer = document.getElementById('background-container');
        const imageUploadArea = document.querySelector('.image-upload-area');
        
        if (!backgroundContainer) return;
        
        backgroundContainer.style.display = 'block';
        
        const bgRect = document.createElement('div');
        bgRect.className = 'background-rect'; // Add the class name for keyboard delete detection
        bgRect.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            height: 70%;
            background-color: ${bgColorInput.value};
            border: 2px dashed #ccc;
            cursor: move;
            z-index: 1;
            border-radius: 4px;
        `;
        
        // Resize handle
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
        
        // Add click handler for selection
        bgRect.addEventListener('click', (e) => {
            e.stopPropagation();
            selectElement(bgRect);
        });
        
        bgRect.appendChild(resizeHandle);
        backgroundContainer.innerHTML = '';
        backgroundContainer.appendChild(bgRect);
    }

    function updateBackground() {
        const bgRect = document.querySelector('.background-rectangle');
        if (bgRect && bgColorInput) {
            bgRect.style.backgroundColor = bgColorInput.value;
            if (bgSizeInput) {
                const size = bgSizeInput.value;
                bgRect.style.width = size + 'px';
                bgRect.style.height = (size * 0.75) + 'px';
            }
        }
    }

    function createTextBox() {
        const textBox = document.createElement('div');
        textBox.className = 'draggable-text';
        // Start non-editable; enable editing on double-click
        textBox.contentEditable = false;
        textBox.textContent = 'Your text here...';
        textBox.style.cssText = `
            position: absolute;
            padding: 8px 12px;
            background: transparent;
            border: none;
            outline: none;
            box-shadow: none;
            cursor: move;
            user-select: none;
            min-width: 120px;
            min-height: 35px;
            font-size: 16px;
            line-height: 1.4;
            color: #000000;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            z-index: 2;
        `;
        
        // Not in edit mode initially
        textBox.dataset.editing = 'false';
        

        

        
        // Add advanced text editing capabilities
        setupAdvancedTextEditing(textBox);
        
        // Add click handler for selection
        textBox.addEventListener('click', (e) => {
            if (!textBox.isContentEditable) {
                e.stopPropagation();
                selectElement(textBox);
            }
        });
        
        poetryWorkspace.appendChild(textBox);
        poetryTextBoxes.push(textBox);
        
        // Hide the hint once a text box is added
        const hint = poetryWorkspace.querySelector('.poetry-hint');
        if (hint) hint.style.display = 'none';
        
        // Make the text box draggable within the poetry workspace
        makeDraggable(textBox, poetryWorkspace);
        
        // Focus only if editable
        if (textBox.isContentEditable) {
            textBox.focus();
            // Select all text on first focus for easy replacement
            setTimeout(() => {
                const range = document.createRange();
                range.selectNodeContents(textBox);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }, 10);
        }
    }



    function makeDraggable(element, container) {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        element.addEventListener('mousedown', (e) => {
            // Safely ignore clicks on delete buttons; text nodes have no classList
            const tgt = e.target;
            const isDeleteBtn = (tgt && tgt.classList && (tgt.classList.contains('delete-btn') || tgt.classList.contains('delete-image-btn')));
            if (isDeleteBtn) return;
            
            // For textboxes, allow dragging anywhere unless currently editing
            if (element.classList.contains('draggable-text')) {
                if (element.dataset.editing === 'true') {
                    return;
                }
            }
            
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

        // Touch support for mobile/tablet
        element.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            if (!touch) return;
            
            // For textboxes, allow dragging anywhere unless currently editing
            if (element.classList.contains('draggable-text') && element.dataset.editing === 'true') {
                return;
            }
            
            isDragging = true;
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = element.getBoundingClientRect();
            const parentRect = container.getBoundingClientRect();
            initialX = rect.left - parentRect.left;
            initialY = rect.top - parentRect.top;
            element.style.cursor = 'grabbing';
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            if (!touch) return;
            e.preventDefault();
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;
            element.style.left = (initialX + deltaX) + 'px';
            element.style.top = (initialY + deltaY) + 'px';
            element.style.transform = 'none';
        }, { passive: false });

        document.addEventListener('touchend', () => {
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

    function updateLocationLabel() {
        const country = countrySelect.value;
        const city = cityInput.value.trim();
        const locationLabel = document.getElementById('location-label');
        
        if (locationLabel) {
            if (country && city) {
                locationLabel.textContent = `${city}, ${country}`;
            } else if (country) {
                locationLabel.textContent = country;
            } else {
                locationLabel.textContent = 'Select location';
            }
        }
    }

    async function handleUpload() {
        try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';

            // Debug: Check token
            console.log('Token exists:', !!token);
            console.log('Token length:', token ? token.length : 0);
            if (token) {
                console.log('Token starts with:', token.substring(0, 20) + '...');
            }

            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();
            const medium = mediumSelect.value;
            const country = countrySelect.value;
            const city = cityInput.value.trim();

            console.log('Form data:', { title, description, medium, country, city });

            if (!title || !medium || !country || !city) {
                throw new Error('Please fill in all required fields.');
            }

            const location = `${city}, ${country}`;
            const formData = new FormData();
            
            formData.append('title', title);
            formData.append('description', description);
            formData.append('medium', medium);
            formData.append('location', location);

            // Generate image from workspace for all mediums
            const workspaceImage = await generateWorkspaceImage(medium);
            if (!workspaceImage) {
                throw new Error('Failed to generate artwork image. Please add content to your workspace.');
            }
            formData.append('artworkImage', workspaceImage, `artwork-${medium}.png`);

            // Debug FormData contents
            console.log('=== FORMDATA DEBUG ===');
            for (let [key, value] of formData.entries()) {
                console.log(key + ':', value);
            }
            console.log('=====================');
            
            console.log('Sending request to /api/artworks with token:', token ? 'present' : 'missing');
            
            const res = await fetch('/api/artworks', {
                method: 'POST',
                headers: {
                    'x-auth-token': token,
                },
                body: formData,
            });
            
            console.log('Response status:', res.status);
            console.log('Response ok:', res.ok);

            if (!res.ok) {
                console.log('Request failed with status:', res.status);
                const errorData = await res.json().catch((e) => {
                    console.log('Failed to parse error response:', e);
                    return { message: 'Upload failed.' };
                });
                console.log('Error data:', errorData);
                throw new Error(errorData.message || `Upload failed with status ${res.status}`);
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

    async function testAuthentication() {
        try {
            console.log('Testing authentication...');
            const response = await fetch('/api/auth/me', {
                method: 'GET',
                headers: {
                    'x-auth-token': token
                }
            });
            
            console.log('Auth test response status:', response.status);
            
            if (response.ok) {
                const userData = await response.json();
                console.log('Authentication successful. User:', userData.name);
            } else {
                console.error('Authentication failed:', response.status);
                const errorData = await response.json().catch(() => ({}));
                console.error('Auth error details:', errorData);
                
                if (response.status === 401) {
                    alert('Your session has expired. Please log in again.');
                    localStorage.removeItem('token');
                    window.location.href = '/login.html';
                }
            }
        } catch (error) {
            console.error('Auth test error:', error);
        }
    }

    // Generate high-quality image from workspace for all mediums
    async function generateWorkspaceImage(medium) {
        try {
            console.log('=== WORKSPACE IMAGE GENERATION ===');
            console.log('Generating image for medium:', medium);
            
            // Get the appropriate workspace based on medium
            let workspace;
            if (medium === 'poetry') {
                workspace = document.getElementById('poetry-workspace');
            } else {
                workspace = document.querySelector('.image-upload-area');
            }
            
            if (!workspace) {
                console.error('Workspace not found for medium:', medium);
                return null;
            }
            
            const workspaceRect = workspace.getBoundingClientRect();
            
            // Create high-resolution canvas (2x for better quality)
            const scale = 2;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = workspaceRect.width * scale;
            canvas.height = workspaceRect.height * scale;
            
            // Scale context for high-resolution rendering
            ctx.scale(scale, scale);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Handle background based on medium and user choice
            if (medium === 'poetry') {
                // Poetry always gets white background for readability
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, workspaceRect.width, workspaceRect.height);
                // Draw text boxes for poetry
                await drawTextBoxes(ctx, workspace, workspaceRect);
            } else {
                // For non-poetry: only add white background if no user background exists
                const hasUserBackground = workspace.querySelector('#background-container > div');
                
                if (!hasUserBackground) {
                    // No user background - use transparent/no background
                    // Canvas is already transparent by default
                    console.log('No user background detected - keeping transparent');
                } else {
                    // User has added a background - draw it
                    console.log('User background detected - drawing backgrounds');
                }
                
                // Draw all workspace elements
                await drawBackgrounds(ctx, workspace, workspaceRect);
                await drawImages(ctx, workspace, workspaceRect);
                await drawTextBoxes(ctx, workspace, workspaceRect);
            }
            
            // Convert canvas to high-quality blob
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    console.log('Generated image size:', blob.size, 'bytes');
                    resolve(blob);
                }, 'image/png', 1.0); // Maximum quality
            });
            
        } catch (error) {
            console.error('Error generating workspace image:', error);
            return null;
        }
    }
    
    // Helper function to draw text boxes
    async function drawTextBoxes(ctx, workspace, workspaceRect) {
        const textBoxes = workspace.querySelectorAll('.draggable-text');
        
        for (const textBox of textBoxes) {
            if (!textBox || !textBox.getBoundingClientRect) continue;
            
            const rect = textBox.getBoundingClientRect();
            const offset = {
                x: rect.left - workspaceRect.left,
                y: rect.top - workspaceRect.top
            };
            
            // Get computed styles for accurate rendering
            const computedStyle = window.getComputedStyle(textBox);
            ctx.fillStyle = computedStyle.color || '#000000';
            ctx.font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Draw text with proper line handling
            const text = textBox.textContent.replace('×', '').trim();
            const lines = text.split('\n');
            const lineHeight = parseInt(computedStyle.fontSize) * 1.4;
            
            lines.forEach((line, index) => {
                ctx.fillText(
                    line,
                    offset.x + 8,
                    offset.y + 8 + (index * lineHeight)
                );
            });
        }
    }
    
    // Helper function to draw background rectangles
    async function drawBackgrounds(ctx, workspace, workspaceRect) {
        const backgrounds = workspace.querySelectorAll('#background-container > div');
        
        for (const bg of backgrounds) {
            if (!bg || !bg.getBoundingClientRect) continue;
            
            const rect = bg.getBoundingClientRect();
            const offset = {
                x: rect.left - workspaceRect.left,
                y: rect.top - workspaceRect.top
            };
            
            const computedStyle = window.getComputedStyle(bg);
            ctx.fillStyle = computedStyle.backgroundColor || '#ffffff';
            ctx.fillRect(offset.x, offset.y, rect.width, rect.height);
        }
    }
    
    // Helper function to draw uploaded images
    async function drawImages(ctx, workspace, workspaceRect) {
        const images = workspace.querySelectorAll('#image-preview-container img');
        
        for (const img of images) {
            if (!img || !img.getBoundingClientRect) continue;
            
            const rect = img.getBoundingClientRect();
            const offset = {
                x: rect.left - workspaceRect.left,
                y: rect.top - workspaceRect.top
            };
            
            // Draw image with high quality
            try {
                await new Promise((resolve, reject) => {
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        ctx.drawImage(tempImg, offset.x, offset.y, rect.width, rect.height);
                        resolve();
                    };
                    tempImg.onerror = reject;
                    tempImg.src = img.src;
                });
            } catch (error) {
                console.warn('Failed to draw image:', error);
            }
        }
    }

    // Setup advanced text editing capabilities
    function setupAdvancedTextEditing(textBox) {
        let isEditing = false;
        // Ensure dataset reflects editing state
        textBox.dataset.editing = 'false';
        
        // Double-click to enter edit mode with cursor placement
        textBox.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            isEditing = true;
            textBox.dataset.editing = 'true';
            textBox.contentEditable = true;
            textBox.style.cursor = 'text';
            textBox.style.userSelect = 'text';
            
            // Enable text selection and place cursor at click position
            textBox.focus();
            
            // Place cursor at the clicked position
            const range = document.createRange();
            const selection = window.getSelection();
            
            // Find the text node and position within it
            const textNode = textBox.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                const rect = textBox.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Approximate cursor position based on click location
                const charWidth = 8; // Approximate character width
                const clickedChar = Math.floor(x / charWidth);
                const position = Math.min(clickedChar, textNode.textContent.length);
                
                range.setStart(textNode, Math.max(0, position));
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });
        
        // Single click to select for dragging
        textBox.addEventListener('click', (e) => {
            if (!isEditing) {
                e.preventDefault();
                selectElement(textBox);
            }
        });
        
        // Exit edit mode on blur
        textBox.addEventListener('blur', () => {
            isEditing = false;
            textBox.dataset.editing = 'false';
            textBox.contentEditable = false;
            textBox.style.cursor = 'move';
            textBox.style.userSelect = 'none';
        });
        
        // Handle text selection and show formatting toolbar
        function handleTextSelection() {
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && !selection.isCollapsed) {
                // Check if selection is within this textbox
                const range = selection.getRangeAt(0);
                if (textBox.contains(range.commonAncestorContainer) || 
                    textBox === range.commonAncestorContainer) {
                    // Text is selected, show formatting toolbar
                    showFormattingToolbar(textBox, selection);
                }
            }
        }
        
        textBox.addEventListener('mouseup', handleTextSelection);
        textBox.addEventListener('keyup', handleTextSelection);
        
        // Prevent dragging when in edit mode
        textBox.addEventListener('mousedown', (e) => {
            if (isEditing) {
                e.stopPropagation();
            }
        });
    }
    
    // Show Notion-style formatting toolbar for selected text
    function showFormattingToolbar(textBox, selection) {
        // Remove existing toolbar if any
        const existingToolbar = document.getElementById('formatting-toolbar');
        if (existingToolbar) {
            existingToolbar.remove();
        }
        
        // Create floating toolbar
        const toolbar = document.createElement('div');
        toolbar.id = 'formatting-toolbar';
        toolbar.style.cssText = `
            position: absolute;
            background: #2d2d2d;
            border-radius: 8px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            gap: 4px;
            z-index: 1000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        // Get selection position for toolbar placement
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Position toolbar above selection
        toolbar.style.left = (rect.left + rect.width / 2 - 150) + 'px';
        toolbar.style.top = (rect.top - 50) + 'px';
        
        // Create formatting buttons
        const buttons = [
            { icon: 'B', command: 'bold', title: 'Bold' },
            { icon: 'I', command: 'italic', title: 'Italic' },
            { icon: 'U', command: 'underline', title: 'Underline' },
            { icon: 'S', command: 'strikeThrough', title: 'Strikethrough' },
            { icon: 'A', command: 'fontSize', title: 'Font Size', type: 'dropdown' },
            { icon: '●', command: 'foreColor', title: 'Text Color', type: 'color' }
        ];
        
        buttons.forEach(btn => {
            if (btn.type === 'dropdown') {
                // Font size dropdown
                const select = document.createElement('select');
                select.style.cssText = `
                    background: #404040;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 12px;
                    cursor: pointer;
                `;
                
                const sizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
                sizes.forEach(size => {
                    const option = document.createElement('option');
                    option.value = size;
                    option.textContent = size;
                    select.appendChild(option);
                });
                
                select.addEventListener('change', () => {
                    applyFormatting('fontSize', select.value, selection, range);
                });
                
                toolbar.appendChild(select);
                
            } else if (btn.type === 'color') {
                // Color picker
                const colorBtn = document.createElement('button');
                colorBtn.style.cssText = `
                    background: #404040;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 8px;
                    font-size: 12px;
                    font-weight: bold;
                    cursor: pointer;
                    min-width: 28px;
                `;
                colorBtn.textContent = btn.icon;
                colorBtn.title = btn.title;
                
                colorBtn.addEventListener('click', () => {
                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.style.opacity = '0';
                    colorInput.style.position = 'absolute';
                    document.body.appendChild(colorInput);
                    
                    colorInput.addEventListener('change', () => {
                        applyFormatting('foreColor', colorInput.value, selection, range);
                        document.body.removeChild(colorInput);
                    });
                    
                    colorInput.click();
                });
                
                toolbar.appendChild(colorBtn);
                
            } else {
                // Regular formatting button
                const button = document.createElement('button');
                button.style.cssText = `
                    background: #404040;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 8px;
                    font-size: 12px;
                    font-weight: bold;
                    cursor: pointer;
                    min-width: 28px;
                `;
                button.textContent = btn.icon;
                button.title = btn.title;
                
                button.addEventListener('click', () => {
                    applyFormatting(btn.command, null, selection, range);
                });
                
                toolbar.appendChild(button);
            }
        });
        
        document.body.appendChild(toolbar);
        
        // Remove toolbar when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', function removeToolbar(e) {
                if (!toolbar.contains(e.target) && !textBox.contains(e.target)) {
                    toolbar.remove();
                    document.removeEventListener('click', removeToolbar);
                }
            });
        }, 100);
    }
    
    // Apply formatting to selected text
    function applyFormatting(command, value, selection, range) {
        // Restore selection
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Apply formatting
        if (command === 'fontSize') {
            // Wrap selected text in span with font-size
            const span = document.createElement('span');
            span.style.fontSize = value;
            try {
                range.surroundContents(span);
            } catch (e) {
                // Fallback for complex selections
                document.execCommand('fontSize', false, '7');
                const fontElements = document.querySelectorAll('font[size="7"]');
                fontElements.forEach(el => {
                    const newSpan = document.createElement('span');
                    newSpan.style.fontSize = value;
                    newSpan.innerHTML = el.innerHTML;
                    el.parentNode.replaceChild(newSpan, el);
                });
            }
        } else {
            document.execCommand(command, false, value);
        }
        
        // Clear selection
        selection.removeAllRanges();
    }
    
    // Global element selection and delete functionality
    let selectedElement = null;
    
    function selectElement(element) {
        // Deselect previous element
        if (selectedElement) {
            selectedElement.style.outline = 'none';
        }
        
        // Select new element
        selectedElement = element;
        element.style.outline = '2px dashed #007cba';
    }
    
    // Global keyboard event handler for delete key
    document.addEventListener('keydown', (e) => {
        // Only handle delete/backspace if we have a selected element and we're not editing text
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
            // Don't delete if we're currently editing text in a contentEditable element
            const isEditingText = selectedElement.contentEditable === 'true' || 
                                selectedElement.isContentEditable ||
                                document.activeElement === selectedElement ||
                                selectedElement.contains(document.activeElement);
            
            if (!isEditingText) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('Deleting element:', selectedElement.className, selectedElement.tagName);
                
                // Remove from appropriate arrays and clean up
                if (selectedElement.classList.contains('draggable-text')) {
                    // Remove from poetry text boxes array
                    poetryTextBoxes = poetryTextBoxes.filter(box => box !== selectedElement);
                    console.log('Removed text box, remaining:', poetryTextBoxes.length);
                    
                } else if (selectedElement.classList.contains('draggable-image')) {
                    // Remove from uploaded images array if it exists
                    if (typeof uploadedImages !== 'undefined') {
                        uploadedImages = uploadedImages.filter(img => img !== selectedElement);
                    }
                    console.log('Removed uploaded image');
                    
                } else if (selectedElement.classList.contains('background-rect') || 
                          (selectedElement.id && selectedElement.id.includes('background'))) {
                    // Handle background rectangle deletion
                    console.log('Removed background rectangle');
                    
                    // Reset background button state
                    const addBackgroundBtn = document.getElementById('add-background-btn');
                    const backgroundControls = document.getElementById('background-controls');
                    if (addBackgroundBtn) {
                        addBackgroundBtn.textContent = '+ Add Background';
                    }
                    if (backgroundControls) {
                        backgroundControls.style.display = 'none';
                    }
                }
                
                // Remove the element from DOM
                selectedElement.remove();
                selectedElement = null;
                
                // Remove any lingering formatting toolbar
                const toolbar = document.getElementById('formatting-toolbar');
                if (toolbar) {
                    toolbar.remove();
                }
            }
        }
        
        // Deselect on Escape
        if (e.key === 'Escape' && selectedElement) {
            selectedElement.style.outline = 'none';
            selectedElement = null;
            
            // Also remove formatting toolbar
            const toolbar = document.getElementById('formatting-toolbar');
            if (toolbar) {
                toolbar.remove();
            }
        }
    });
    
    // Deselect when clicking empty space
    document.addEventListener('click', (e) => {
        if (selectedElement && !selectedElement.contains(e.target)) {
            selectedElement.style.outline = 'none';
            selectedElement = null;
        }
    });

    console.log('Upload page initialized successfully');
});
