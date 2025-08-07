// Survey functionality
class PortfolioSurvey {
    constructor() {
        this.currentStep = 1;
        this.surveyData = {
            medium: null,
            features: {
                home: true,
                about: true,
                works: true,
                worksOrganization: null,
                commission: false,
                exhibition: false
            },
            layouts: {
                homepage: null,
                about: null,
                works: null,
                commission: null,
                exhibition: null
            },
            worksDetails: {
                years: [],
                themes: []
            },
            aboutSections: {
                education: false,
                workExperience: false,
                recentlyFeatured: false,
                selectedExhibition: false,
                selectedPress: false,
                selectedAwards: false,
                selectedProjects: false,
                contactInfo: false
            },
            logo: null,
            style: {
                fontSize: 16,
                textColor: '#333333',
                themeColor: '#007bff'
            }
        };
        
        // Initialize basic step order (will be expanded after feature selection)
        this.stepOrder = ['step-1', 'step-2'];
        this.totalSteps = 2;
        
        this.init();
    }
    
    init() {
        this.setupMediumSelection();
        this.setupFeatureSelection();
        this.setupLayoutSelection();
        this.setupWorksOrganization();
        this.setupAboutSections();
        this.setupLogoUpload();
        this.setupWebsitePreview();
        this.setupStyleCustomization();
        this.setupNavigation();
        this.generateStepOrder();
    }
    
    setupMediumSelection() {
        const mediumOptions = document.querySelectorAll('.medium-option');
        const nextBtn = document.querySelector('#step-1 .next-btn');
        
        mediumOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove selected class from all options
                mediumOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Add selected class to clicked option
                option.classList.add('selected');
                
                // Store selected medium
                this.surveyData.medium = option.dataset.medium;
                
                // Enable next button
                nextBtn.disabled = false;
            });
        });
    }
    
    setupFeatureSelection() {
        // Handle optional feature checkboxes
        const optionalCheckboxes = document.querySelectorAll('.feature-group.optional input[type="checkbox"]');
        
        optionalCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const feature = checkbox.closest('.feature-item').dataset.feature;
                this.surveyData.features[feature] = checkbox.checked;
            });
        });
        
        // Handle works organization radio buttons
        const organizationRadios = document.querySelectorAll('input[name="works-organization"]');
        
        organizationRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    this.surveyData.features.worksOrganization = radio.value;
                }
            });
        });
    }
    
    setupNavigation() {
        // Next buttons
        document.querySelectorAll('.next-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.nextStep();
            });
        });
        
        // Previous buttons
        document.querySelectorAll('.prev-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.prevStep();
            });
        });
    }
    
    nextStep() {
        const currentStepElement = document.querySelector(`#step-${this.currentStep}`);
        
        if (this.currentStep === 1) {
            // Validate medium selection
            if (!this.surveyData.medium) {
                alert('Please select an artwork medium.');
                return;
            }
        }
        
        if (this.currentStep === 2) {
            // Validate works organization selection
            if (!this.surveyData.features.worksOrganization) {
                alert('Please select how you want to organize your works.');
                return;
            }
            // Generate step order after feature selection
            this.generateStepOrder();
            this.showWorksOrganizationInput();
        }
        
        if (this.currentStep === 4) {
            // Validate works organization details (now step 4 instead of 5)
            if (!this.validateWorksDetails()) {
                return;
            }
        }
        
        // Handle dynamic step validation
        const currentStepId = this.stepOrder[this.currentStep - 1];
        if (currentStepId === 'step-preview') {
            this.generateWebsitePreview();
        }
        
        if (currentStepId === 'step-style') {
            this.updateStylePreview();
            this.completeSurvey();
            return;
        }
        
        // Hide current step
        currentStepElement.classList.remove('active');
        
        // Show next step
        this.currentStep++;
        const nextStepElement = document.querySelector(`#step-${this.currentStep}`);
        if (nextStepElement) {
            nextStepElement.classList.add('active');
        }
    }
    
    prevStep() {
        if (this.currentStep > 1) {
            // Hide current step
            const currentStepElement = document.querySelector(`#step-${this.currentStep}`);
            currentStepElement.classList.remove('active');
            
            // Show previous step
            this.currentStep--;
            const prevStepElement = document.querySelector(`#step-${this.currentStep}`);
            if (prevStepElement) {
                prevStepElement.classList.add('active');
            }
        }
    }
    
    setupAboutSections() {
        // Handle section checkbox changes
        document.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.closest('.section-options')) {
                const sectionItem = e.target.closest('.section-item');
                const sectionName = sectionItem.dataset.section;
                
                if (sectionName && this.surveyData.aboutSections.hasOwnProperty(sectionName)) {
                    this.surveyData.aboutSections[sectionName] = e.target.checked;
                }
            }
        });
    }
    
    setupLogoUpload() {
        const uploadArea = document.getElementById('logo-upload-area');
        const logoInput = document.getElementById('logo-input');
        const logoPreview = document.getElementById('logo-preview');
        const logoPreviewImg = document.getElementById('logo-preview-img');
        const removeLogoBtn = document.querySelector('.remove-logo');
        
        // Handle upload area click
        uploadArea.addEventListener('click', () => {
            logoInput.click();
        });
        
        // Handle file selection
        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleLogoUpload(file);
            }
        });
        
        // Handle logo removal
        removeLogoBtn.addEventListener('click', () => {
            this.removeLogo();
        });
    }
    
    handleLogoUpload(file) {
        // Validate file size (2MB max)
        if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB');
            return;
        }
        
        // Create file reader
        const reader = new FileReader();
        reader.onload = (e) => {
            const logoPreview = document.getElementById('logo-preview');
            const logoPreviewImg = document.getElementById('logo-preview-img');
            const uploadArea = document.getElementById('logo-upload-area');
            
            // Store logo data
            this.surveyData.logo = {
                file: file,
                dataUrl: e.target.result
            };
            
            // Show preview
            logoPreviewImg.src = e.target.result;
            uploadArea.style.display = 'none';
            logoPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    
    removeLogo() {
        const logoPreview = document.getElementById('logo-preview');
        const uploadArea = document.getElementById('logo-upload-area');
        const logoInput = document.getElementById('logo-input');
        
        this.surveyData.logo = null;
        logoInput.value = '';
        logoPreview.style.display = 'none';
        uploadArea.style.display = 'block';
    }
    
    setupWebsitePreview() {
        const revertBtn = document.getElementById('revert-preview');
        
        // Store the original layout when first generated
        if (!this.originalLayout) {
            this.originalLayout = null;
        }
        
        revertBtn.addEventListener('click', () => {
            this.revertToOriginalLayout();
        });
    }
    
    generateWebsitePreview() {
        const previewFrame = document.getElementById('website-preview');
        
        // Generate a mock website preview based on survey data
        const previewHTML = this.createPreviewHTML();
        previewFrame.innerHTML = previewHTML;
        
        // Store the original layout if not already stored
        if (!this.originalLayout) {
            this.originalLayout = previewHTML;
        }
        
        // Set up tab navigation
        this.setupPreviewNavigation();
        
        // Setup global functions
        this.setupGlobalFunctions();
    }
    
    revertToOriginalLayout() {
        const previewFrame = document.getElementById('website-preview');
        
        if (this.originalLayout) {
            // Restore the original layout
            previewFrame.innerHTML = this.originalLayout;
            
            // Re-setup navigation and functionality for the reverted layout
            this.setupPreviewNavigation();
            
            // Re-setup global functions
            this.setupGlobalFunctions();
        }
    }
    
    setupGlobalFunctions() {
        // Setup global image upload function
        window.uploadImage = function(elementId) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';
            
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const element = document.getElementById(elementId);
                        if (element) {
                            // Replace the placeholder content with the uploaded image
                            element.style.backgroundImage = `url(${e.target.result})`;
                            element.style.backgroundSize = 'cover';
                            element.style.backgroundPosition = 'center';
                            element.style.backgroundRepeat = 'no-repeat';
                            element.innerHTML = ''; // Clear placeholder text
                            
                            // Add a subtle overlay for better text readability if needed
                            if (elementId === 'hero-image') {
                                const overlay = document.createElement('div');
                                overlay.style.cssText = `
                                    position: absolute;
                                    top: 0;
                                    left: 0;
                                    right: 0;
                                    bottom: 0;
                                    background: rgba(0,0,0,0.3);
                                    pointer-events: none;
                                `;
                                element.appendChild(overlay);
                            }
                        }
                    };
                    reader.readAsDataURL(file);
                }
            };
            
            document.body.appendChild(input);
            input.click();
        };
        
        // Setup function to open user's real gallery
        const self = this;
        
        // Function to open user's gallery and fetch their uploaded artworks
        window.openUserGallery = function() {
            // Fetch artworks from the logged-in user's gallery
            console.log('Fetching artworks from logged-in user\'s gallery...');
            
            // API call to get artworks from the user's account page gallery
            // This assumes the user is already logged in and we can access their gallery
            fetch('/api/artworks/user', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    // Include authentication headers if needed
                    // 'Authorization': 'Bearer ' + localStorage.getItem('authToken')
                },
                credentials: 'include' // Include cookies for session-based auth
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch user artworks');
                }
                return response.json();
            })
            .then(artworks => {
                console.log('User artworks fetched:', artworks);
                self.displayUserArtworks(artworks);
            })
            .catch(error => {
                console.error('Error fetching user artworks:', error);
                // Fallback: show message if API is not available yet
                alert('Unable to fetch your gallery artworks. Please ensure you are logged in and have artworks in your gallery.');
            });
        };
        
        // Function to display user's artworks for selection
        window.displayUserArtworks = function(artworks) {
            // This will show the user's real artworks in a selection interface
            // TODO: Implement artwork selection UI
            console.log('Displaying user artworks:', artworks);
        };

    }
    
    createPreviewHTML() {
        const { medium, features, logo } = this.surveyData;
        
        // Create navigation based on selected features in correct order
        const navItems = [];
        if (features.home) navItems.push('Home');
        if (features.works) navItems.push('Works');
        if (features.about) navItems.push('About');
        if (features.commission) navItems.push('Commission');
        if (features.exhibition) navItems.push('Exhibition');
        
        const logoHTML = logo ? `<img src="${logo.dataUrl}" alt="Logo" style="max-height: 40px;">` : '<div style="font-weight: bold;">Your Portfolio</div>';
        
        return `
            <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
                <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                    ${logoHTML}
                    <nav style="display: flex; gap: 20px;">
                        ${navItems.map((item, index) => {
                            if (item === 'Works' && features.works) {
                                const orgType = features.worksOrganization;
                                const orgItems = orgType === 'year' ? this.surveyData.worksDetails.years : this.surveyData.worksDetails.themes;
                                return `
                                    <div style="position: relative; display: inline-block;">
                                        <a href="#" class="preview-nav-item ${index === 0 ? 'active' : ''}" data-page="${item.toLowerCase()}" style="text-decoration: none; color: ${index === 0 ? '#007bff' : '#333'}; font-weight: ${index === 0 ? 'bold' : 'normal'}; border-bottom: ${index === 0 ? '2px solid #007bff' : 'none'}; padding-bottom: 5px; cursor: pointer;">${item}</a>
                                        <div class="works-dropdown" style="position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); min-width: 150px; display: none; z-index: 1000;">
                                            ${orgItems.map(orgItem => `<a href="#" class="works-filter" data-filter="${orgItem}" style="display: block; padding: 10px 15px; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">${orgItem}</a>`).join('')}
                                        </div>
                                    </div>
                                `;
                            } else {
                                return `<a href="#" class="preview-nav-item ${index === 0 ? 'active' : ''}" data-page="${item.toLowerCase()}" style="text-decoration: none; color: ${index === 0 ? '#007bff' : '#333'}; font-weight: ${index === 0 ? 'bold' : 'normal'}; border-bottom: ${index === 0 ? '2px solid #007bff' : 'none'}; padding-bottom: 5px; cursor: pointer;">${item}</a>`;
                            }
                        }).join('')}
                    </nav>
                </header>
                <main id="preview-content">
                    ${this.createHomePreview()}
                </main>
            </div>
        `;
    }
    
    setupStyleCustomization() {
        const fontSizeSlider = document.getElementById('font-size');
        const fontSizeValue = document.getElementById('font-size-value');
        const textColorPicker = document.getElementById('text-color');
        const themeColorPicker = document.getElementById('theme-color');
        
        // Font size slider
        fontSizeSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            this.surveyData.style.fontSize = parseInt(value);
            fontSizeValue.textContent = `${value}px`;
            this.updateStylePreview();
        });
        
        // Text color picker
        textColorPicker.addEventListener('change', (e) => {
            this.surveyData.style.textColor = e.target.value;
            this.updateStylePreview();
        });
        
        // Theme color picker
        themeColorPicker.addEventListener('change', (e) => {
            this.surveyData.style.themeColor = e.target.value;
            this.updateStylePreview();
        });
    }
    
    updateStylePreview() {
        const stylePreviewFrame = document.getElementById('style-preview');
        const { fontSize, textColor, themeColor } = this.surveyData.style;
        
        // Create styled preview
        const styledHTML = this.createStyledPreviewHTML();
        stylePreviewFrame.innerHTML = styledHTML;
    }
    
    createHomePreview() {
        const { medium, layouts } = this.surveyData;
        const homeLayout = layouts.homepage;
        
        if (homeLayout === 'grid') {
            return this.createGridHomePreview();
        } else if (homeLayout === 'split') {
            return this.createSplitHomePreview();
        } else if (homeLayout === 'hero') {
            return this.createHeroHomePreview();
        }
        
        // Default to grid if no layout selected
        return this.createGridHomePreview();
    }
    
    createGridHomePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        
        // Reverted to original simple grid layout
        return `
            <div style="text-align: center; margin-bottom: 40px;">
                <div style="padding: 10px;">
                    <h1 contenteditable="true" id="grid-home-title-1" style="font-size: 2.5rem; margin-bottom: 10px; color: #333; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${mediumContent.title}</h1>
                </div>
                <div style="padding: 10px;">
                    <p contenteditable="true" id="grid-home-subtitle-1" style="color: #666; font-size: 1.2rem; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${mediumContent.subtitle}</p>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px;">
                ${mediumContent.works.map(work => `
                    <div style="${work.brightMorandiStyle}; height: 200px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 14px; border-radius: 8px; cursor: pointer; transition: transform 0.3s;">${work.cleanContent}</div>
                `).join('')}
            </div>
            <div id="restore-buttons" style="text-align: center; margin-top: 20px;"></div>
        `;
    }
    
    createSplitHomePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        
        // Clean split layout with photo on left, text on right
        return `
            <div style="display: flex; gap: 60px; align-items: center; min-height: 500px; padding: 60px 40px;">
                <!-- Photo on Left -->
                <div style="flex: 1;">
                    <div onclick="window.uploadImage('split-home-photo-1')" style="${mediumContent.featured.morandiStyle}; height: 400px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #8a8a8a; font-size: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); cursor: pointer; transition: opacity 0.3s, transform 0.2s;" onmouseover="this.style.opacity='0.8'; this.style.transform='scale(1.02)'" onmouseout="this.style.opacity='1'; this.style.transform='scale(1)'" id="split-home-photo-1">${mediumContent.featured.cleanContent}</div>
                    <p style="text-align: center; margin-top: 10px; color: #999; font-size: 12px;">Click to upload image</p>
                </div>
                
                <!-- Text on Right -->
                <div style="flex: 1;">
                    <div style="padding: 10px;">
                        <h1 contenteditable="true" id="split-home-title-1" style="font-size: 2.5rem; margin-bottom: 20px; color: #333; line-height: 1.3; font-weight: normal; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${mediumContent.title}</h1>
                    </div>
                    <div style="padding: 10px;">
                        <p contenteditable="true" id="split-home-description-1" style="color: #666; font-size: 1.2rem; line-height: 1.7; margin-bottom: 30px; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${mediumContent.description}</p>
                    </div>
                    <div style="padding: 10px;">
                        <p contenteditable="true" id="split-home-explore-1" style="color: #888; font-size: 1rem; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                            Explore my collection of ${medium} works, each piece carefully crafted to capture the essence of light, color, and emotion.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
    
    createHeroHomePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        
        // Full-width immersive hero image with minimal design
        return `
            <div style="min-height: 600px; display: flex; flex-direction: column; justify-content: center; text-align: center;">
                <!-- Full-width Hero Image -->
                <div onclick="window.uploadImage('hero-home-image-1')" style="${mediumContent.hero.morandiStyle}; height: 500px; width: 100%; margin-bottom: 50px; display: flex; align-items: center; justify-content: center; color: #8a8a8a; font-size: 20px; cursor: pointer; transition: opacity 0.3s, transform 0.2s; position: relative;" onmouseover="this.style.opacity='0.8'; this.querySelector('.upload-hint').style.display='block'" onmouseout="this.style.opacity='1'; this.querySelector('.upload-hint').style.display='none'" id="hero-home-image-1">
                    ${mediumContent.hero.cleanContent}
                    <div class="upload-hint" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: none;">Click to upload image</div>
                </div>
                
                <!-- Minimal Typography -->
                <div style="padding: 0 40px;">
                    <div style="padding: 10px;">
                        <h1 contenteditable="true" id="hero-home-title-1" style="font-size: 4rem; margin-bottom: 15px; color: #333; font-weight: 300; line-height: 1.1; letter-spacing: -1px; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                            Capturing the Moment
                        </h1>
                    </div>
                    <div style="padding: 10px;">
                        <h2 contenteditable="true" id="hero-home-subtitle-1" style="font-size: 1.3rem; margin-bottom: 40px; color: #666; font-weight: 400; text-transform: uppercase; letter-spacing: 2px; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                            FOLLOW YOUR INSTINCTS.
                        </h2>
                    </div>
                    
                    <!-- Simple Description -->
                    <div style="max-width: 700px; margin: 0 auto;">
                        <div style="padding: 10px;">
                            <p contenteditable="true" id="hero-home-description-1" style="color: #666; font-size: 1.1rem; line-height: 1.8; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                                ${mediumContent.description} Each piece tells a story, capturing fleeting moments and transforming them into lasting memories through the power of visual art.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    getMediumSpecificContent(medium) {
        const mediumData = {
            painting: {
                title: "Contemporary Painting Studio",
                subtitle: "Exploring color, form, and emotion through paint",
                description: "My paintings explore the intersection of color and emotion, creating vibrant compositions that speak to the human experience.",
                works: [
                    { title: "Abstract Composition #1", year: "2024", cleanContent: "Oil on Canvas", morandiStyle: "background: #d9c7b7;", brightMorandiStyle: "background: #e8d7c7;" },
                    { title: "Urban Landscape", year: "2024", cleanContent: "Acrylic on Board", morandiStyle: "background: #b8a082;", brightMorandiStyle: "background: #d4c4a8;" },
                    { title: "Portrait Study", year: "2023", cleanContent: "Mixed Media", morandiStyle: "background: #c9b7a6;", brightMorandiStyle: "background: #e0d0c0;" }
                ],
                featured: { cleanContent: "Featured Painting", morandiStyle: "background: #d9c7b7;" },
                hero: { cleanContent: "Latest Work", morandiStyle: "background: #e8ddd4;" }
            },
            photography: {
                title: "Visual Storytelling",
                subtitle: "Capturing moments that matter",
                description: "Through my lens, I capture the beauty in everyday moments and the extraordinary in the ordinary.",
                works: [
                    { title: "Street Photography Series", year: "2024", cleanContent: "Digital", morandiStyle: "background: #8a9a9a;", brightMorandiStyle: "background: #c0c8c8;" },
                    { title: "Portrait Collection", year: "2024", cleanContent: "Film", morandiStyle: "background: #b5b5b5;", brightMorandiStyle: "background: #d0d0d0;" },
                    { title: "Nature Studies", year: "2023", cleanContent: "Landscape", morandiStyle: "background: #a8b5a8;", brightMorandiStyle: "background: #c8d0c8;" }
                ],
                featured: { cleanContent: "Featured Photo", morandiStyle: "background: #8a9a9a;" },
                hero: { cleanContent: "Latest Shot", morandiStyle: "background: #9aa5aa;" }
            },
            poetry: {
                title: "Words & Verses",
                subtitle: "Poetry that speaks to the soul",
                description: "My poetry explores themes of love, loss, hope, and the human condition through carefully crafted verses.",
                works: [
                    { title: "Midnight Reflections", year: "2024", cleanContent: "\"In the quiet hours...\"", morandiStyle: "background: #8a8a8a;", brightMorandiStyle: "background: #c0c0c0;" },
                    { title: "Spring Awakening", year: "2024", cleanContent: "\"Petals fall like...\"", morandiStyle: "background: #a8b5c7;", brightMorandiStyle: "background: #d0d8e0;" },
                    { title: "Urban Symphony", year: "2023", cleanContent: "\"City lights dance...\"", morandiStyle: "background: #c7b5a8;", brightMorandiStyle: "background: #e0d0c8;" }
                ],
                featured: { cleanContent: "Featured Poem", morandiStyle: "background: #b5a8c7;" },
                hero: { cleanContent: "Latest Verse", morandiStyle: "background: #c7a8b5;" }
            },
            furniture: {
                title: "Functional Art",
                subtitle: "Where design meets craftsmanship",
                description: "I create furniture pieces that blend functionality with artistic expression, using sustainable materials and traditional techniques.",
                works: [
                    { title: "Modern Oak Table", year: "2024", cleanContent: "Handcrafted Oak", morandiStyle: "background: #c4a882;", brightMorandiStyle: "background: #e0c8a8;" },
                    { title: "Minimalist Bookshelf", year: "2024", cleanContent: "Walnut & Steel", morandiStyle: "background: #a08270;", brightMorandiStyle: "background: #d0b8a0;" },
                    { title: "Ergonomic Chair", year: "2023", cleanContent: "Sustainable Pine", morandiStyle: "background: #b5a082;", brightMorandiStyle: "background: #d8c8a8;" }
                ],
                featured: { cleanContent: "Featured Piece", morandiStyle: "background: #a89082;" },
                hero: { cleanContent: "Latest Creation", morandiStyle: "background: #c4b082;" }
            },
            'multi-medium': {
                title: "Mixed Media Art",
                subtitle: "Exploring creativity across mediums",
                description: "My work spans multiple mediums, combining traditional and contemporary techniques to create unique artistic expressions.",
                works: [
                    { title: "Digital Collage", year: "2024", cleanContent: "Mixed Media", morandiStyle: "background: #a8a8c7;", brightMorandiStyle: "background: #d0d0e0;" },
                    { title: "Sculptural Installation", year: "2024", cleanContent: "3D Art", morandiStyle: "background: #c7a8b5;", brightMorandiStyle: "background: #e0d0d8;" },
                    { title: "Interactive Piece", year: "2023", cleanContent: "Performance", morandiStyle: "background: #a8c7c7;", brightMorandiStyle: "background: #d0e0e0;" }
                ],
                featured: { cleanContent: "Featured Work", morandiStyle: "background: #c7b5a8;" },
                hero: { cleanContent: "Latest Project", morandiStyle: "background: #b5c7a8;" }
            }
        };
        
        return mediumData[medium] || mediumData['multi-medium'];
    }
    
    setupPreviewNavigation() {
        const navItems = document.querySelectorAll('.preview-nav-item');
        const previewContent = document.getElementById('preview-content');
        
        if (!previewContent) return;
        
        // Set up Works dropdown hover functionality
        const worksNavItem = document.querySelector('.preview-nav-item[data-page="works"]');
        if (worksNavItem) {
            const dropdown = worksNavItem.parentElement.querySelector('.works-dropdown');
            if (dropdown) {
                worksNavItem.parentElement.addEventListener('mouseenter', () => {
                    dropdown.style.display = 'block';
                });
                worksNavItem.parentElement.addEventListener('mouseleave', () => {
                    dropdown.style.display = 'none';
                });
                
                // Handle filter clicks
                const filterItems = dropdown.querySelectorAll('.works-filter');
                filterItems.forEach(filterItem => {
                    filterItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        const filter = filterItem.dataset.filter;
                        this.currentWorksFilter = filter;
                        const content = this.createWorksPreview();
                        previewContent.innerHTML = content;
                        dropdown.style.display = 'none';
                    });
                });
            }
        }
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove active class from all nav items
                navItems.forEach(nav => {
                    nav.classList.remove('active');
                    nav.style.color = '#333';
                    nav.style.fontWeight = 'normal';
                    nav.style.borderBottom = 'none';
                });
                
                // Add active class to clicked item
                item.classList.add('active');
                item.style.color = '#007bff';
                item.style.fontWeight = 'bold';
                item.style.borderBottom = '2px solid #007bff';
                
                // Get page type and update content
                const page = item.dataset.page;
                let content = '';
                
                if (page === 'home') {
                    content = this.createHomePreview();
                } else if (page === 'works') {
                    this.currentWorkIndex = 0; // Reset to first work
                    content = this.createWorksPreview();
                } else if (page === 'about') {
                    content = this.createAboutPreview();
                } else {
                    content = `<div style="text-align: center; padding: 60px 0;"><h2>${page.charAt(0).toUpperCase() + page.slice(1)} Page</h2><p style="color: #666;">This page would contain your ${page} content.</p></div>`;
                }
                
                previewContent.innerHTML = content;
                
                // Re-setup navigation for single work view
                if (page === 'works') {
                    this.setupWorkNavigation();
                }
            });
        });
    }
    
    setupWorkNavigation() {
        // Store reference to 'this' for use in event handlers
        const self = this;
        
        // Remove any existing event listeners to prevent duplicates
        const removeExistingListeners = () => {
            const prevButtons = document.querySelectorAll('.prev-work-btn');
            const nextButtons = document.querySelectorAll('.next-work-btn');
            
            prevButtons.forEach(btn => {
                btn.replaceWith(btn.cloneNode(true));
            });
            
            nextButtons.forEach(btn => {
                btn.replaceWith(btn.cloneNode(true));
            });
        };
        
        // Add new event listeners
        const setupNewListeners = () => {
            const prevButtons = document.querySelectorAll('.prev-work-btn');
            const nextButtons = document.querySelectorAll('.next-work-btn');
            
            const handlePrevClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const mediumContent = self.getMediumSpecificContent(self.surveyData.medium);
                if (self.currentWorkIndex > 0) {
                    self.currentWorkIndex--;
                } else {
                    // Loop to last artwork when at first
                    self.currentWorkIndex = mediumContent.works.length - 1;
                }
                self.updateWorksPreview();
            };
            
            const handleNextClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const mediumContent = self.getMediumSpecificContent(self.surveyData.medium);
                if (self.currentWorkIndex < mediumContent.works.length - 1) {
                    self.currentWorkIndex++;
                } else {
                    // Loop to first artwork when at last
                    self.currentWorkIndex = 0;
                }
                self.updateWorksPreview();
            };
            
            prevButtons.forEach(btn => {
                btn.addEventListener('click', handlePrevClick);
            });
            
            nextButtons.forEach(btn => {
                btn.addEventListener('click', handleNextClick);
            });
        };
        
        // Clean up and set up new listeners
        removeExistingListeners();
        setupNewListeners();
        

    }
    
    updateWorksPreview() {
        // Target the specific preview content area within the website preview
        const previewFrame = document.getElementById('website-preview');
        const previewContent = previewFrame ? previewFrame.querySelector('.preview-content') : null;
        
        if (previewContent) {
            const content = this.createWorksPreview();
            previewContent.innerHTML = content;
            // Re-setup navigation after content update
            this.setupWorkNavigation();
        }
    }
    
    createAboutPreview() {
        const { layouts, aboutSections } = this.surveyData;
        const aboutLayout = layouts.about;
        
        if (aboutLayout === 'vertical') {
            return this.createAboutVerticalPreview();
        } else if (aboutLayout === 'split') {
            return this.createAboutSplitPreview();
        }
        
        // Default preview if no layout selected
        return `<div style="text-align: center; padding: 60px 0;"><h2>About Page Preview</h2><p style="color: #666;">Your About page layout will appear here based on your selections.</p></div>`;
    }
    
    createAboutVerticalPreview() {
        const selectedSections = this.getSelectedAboutSections();
        
        return `
            <div style="padding: 60px 40px; max-width: 800px; margin: 0 auto; font-family: 'Georgia', serif;">
                <!-- Artist Photo -->
                <div style="text-align: center; margin-bottom: 50px;">
                    <div onclick="window.uploadImage('vertical-about-photo-1')" style="width: 300px; height: 400px; background: linear-gradient(135deg, #f5f1eb, #e8ddd4); border-radius: 8px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #999; font-size: 16px; cursor: pointer; transition: opacity 0.3s, transform 0.2s;" onmouseover="this.style.opacity='0.8'; this.style.transform='scale(1.02)'" onmouseout="this.style.opacity='1'; this.style.transform='scale(1)'" id="vertical-about-photo-1">Artist Photo</div>
                    <p style="text-align: center; margin-top: 10px; color: #999; font-size: 12px;">Click to upload photo</p>
                </div>
                
                <!-- Bio Section -->
                <div style="margin-bottom: 50px;">
                    <h2 contenteditable="true" style="font-size: 2rem; margin-bottom: 25px; color: #333; font-weight: 300; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">About Me</h2>
                    <p contenteditable="true" style="line-height: 1.7; color: #555; font-size: 1.1rem; margin-bottom: 20px; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">Growing up surrounded by art instilled a deep appreciation for creative expression and the power of visual storytelling. Through my work, I explore themes of identity, memory, and the intersection between the personal and universal.</p>
                    <p contenteditable="true" style="line-height: 1.7; color: #555; font-size: 1.1rem; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">I am an artist currently based in [Location]. My work has been exhibited in galleries and shows, and I continue to develop my practice through exploration of various mediums and techniques.</p>
                </div>
                
                <!-- Selected Sections -->
                ${selectedSections.map(section => `
                    <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
                        <h3 contenteditable="true" style="font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${section.replace(/([A-Z])/g, ' $1').trim()}</h3>
                        <div contenteditable="true" style="color: #666; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                            ${this.getAboutSectionContent(section)}
                        </div>
                    </div>
                `).join('')}
                

            </div>
        `;
    }
    
    createAboutSplitPreview() {
        const selectedSections = this.getSelectedAboutSections();
        
        return `
            <div style="padding: 60px 40px; max-width: 1200px; margin: 0 auto; font-family: 'Georgia', serif;">
                <div style="display: flex; gap: 60px; align-items: flex-start;">
                    <!-- Left Side: Artist Photo -->
                    <div style="flex: 0 0 350px; margin-right: 50px;">
                        <div onclick="window.uploadImage('split-about-photo-1')" style="width: 100%; height: 450px; background: linear-gradient(135deg, #f5f1eb, #e8ddd4); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 16px; position: sticky; top: 20px; cursor: pointer; transition: opacity 0.3s, transform 0.2s;" onmouseover="this.style.opacity='0.8'; this.style.transform='scale(1.02)'" onmouseout="this.style.opacity='1'; this.style.transform='scale(1)'" id="split-about-photo-1">Artist Photo</div>
                        <p style="text-align: center; margin-top: 10px; color: #999; font-size: 12px;">Click to upload photo</p>
                    </div>
                    
                    <!-- Right Side: Content -->
                    <div style="flex: 1;">
                        <!-- Bio Section -->
                        <div style="margin-bottom: 50px;">
                            <h2 contenteditable="true" style="font-size: 2rem; margin-bottom: 25px; color: #333; font-weight: 300; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">About Me</h2>
                            <p contenteditable="true" style="line-height: 1.7; color: #555; font-size: 1.1rem; margin-bottom: 20px; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">I am a [Location]-based artist whose work explores the intersection of memory, identity, and visual narrative. My practice encompasses various mediums, each chosen for its ability to convey specific emotional and conceptual content.</p>
                            <p contenteditable="true" style="line-height: 1.7; color: #555; font-size: 1.1rem; margin-bottom: 20px; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">Through careful observation and traditional techniques, I create works that invite viewers to engage with both personal and universal themes. My background in art history informs my approach, allowing me to draw from classical traditions while developing a contemporary voice.</p>
                            <p contenteditable="true" style="line-height: 1.7; color: #555; font-size: 1.1rem; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">Currently, I work primarily in [medium], finding this approach ideal for capturing the subtleties of light, atmosphere, and emotion that define my artistic vision.</p>
                        </div>
                        
                        <!-- Selected Sections -->
                        ${selectedSections.map(section => `
                            <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
                                <h3 contenteditable="true" style="font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${section.replace(/([A-Z])/g, ' $1').trim()}</h3>
                                <div contenteditable="true" style="color: #666; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                                    ${this.getAboutSectionContent(section)}
                                </div>
                            </div>
                        `).join('')}
                        

                    </div>
                </div>
            </div>
        `;
    }
    
    getSelectedAboutSections() {
        const { aboutSections } = this.surveyData;
        return Object.keys(aboutSections).filter(section => aboutSections[section]);
    }
    
    getAboutSectionContent(section) {
        const sectionContent = {
            education: `
                <p><strong>2023</strong> - BFA in Fine Arts, [University Name]</p>
                <p><strong>2021</strong> - Certificate in Traditional Painting Techniques, [Art School]</p>
            `,
            workExperience: `
                <p><strong>2023-Present</strong> - Freelance Artist</p>
                <p><strong>2022-2023</strong> - Gallery Assistant, [Gallery Name]</p>
            `,
            recentlyFeatured: `
                <p><strong>2024</strong> - Art Magazine Feature</p>
                <p><strong>2024</strong> - Online Gallery Spotlight</p>
            `,
            selectedExhibition: `
                <p><strong>2024</strong> - "Contemporary Visions" Group Show, [Gallery Name]</p>
                <p><strong>2023</strong> - "Emerging Artists" Solo Exhibition, [Gallery Name]</p>
            `,
            selectedPress: `
                <p><strong>2024</strong> - Featured in [Art Publication]</p>
                <p><strong>2023</strong> - Interview with [Magazine Name]</p>
            `,
            selectedAwards: `
                <p><strong>2024</strong> - Emerging Artist Grant</p>
                <p><strong>2023</strong> - Excellence in Fine Arts Award</p>
            `,
            selectedProjects: `
                <p><strong>2024</strong> - Community Mural Project</p>
                <p><strong>2023</strong> - Artist Talk at [Institution]</p>
            `,
            contactInfo: `
                <p>Email: <a href="mailto:artist@email.com" style="color: #333;">artist@email.com</a></p>
                <p>Phone: [Phone Number]</p>
                <p>Studio: [Address]</p>
            `
        };
        
        return sectionContent[section] || '<p>Content for this section will be customized based on your information.</p>';
    }
    
    createWorksPreview() {
        const { layouts, features } = this.surveyData;
        const worksLayout = layouts.works;
        
        // Always show the gallery selection interface first
        return this.createWorksSelectionInterface();
    }
    
    createWorksSelectionInterface() {
        const { layouts } = this.surveyData;
        const worksLayout = layouts.works || 'grid';
        
        return `
            <div style="padding: 60px 40px; text-align: center; min-height: 500px;">
                <div style="max-width: 600px; margin: 0 auto;">
                    <h2 style="font-size: 2rem; margin-bottom: 20px; color: #333;">Select Your Artworks</h2>
                    <p style="color: #666; font-size: 1.1rem; line-height: 1.6; margin-bottom: 40px;">
                        Choose artworks from your Tart gallery to display in your portfolio.
                        Selected artworks will be shown in <strong>${worksLayout === 'grid' ? 'grid layout' : 'single focus layout'}</strong>.
                    </p>
                    
                    <!-- Gallery Selection Area -->
                    <div id="works-gallery-selection" style="border: 2px dashed #ddd; border-radius: 12px; padding: 60px 40px; background: #fafafa; cursor: pointer; transition: all 0.3s ease;" 
                         onclick="window.openUserGallery && window.openUserGallery()" 
                         onmouseover="this.style.borderColor='#007bff'; this.style.backgroundColor='#f8f9ff'" 
                         onmouseout="this.style.borderColor='#ddd'; this.style.backgroundColor='#fafafa'">
                        
                        <div style="font-size: 3rem; color: #ccc; margin-bottom: 20px;">🖼️</div>
                        
                        <button type="button" style="background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 1rem; cursor: pointer; transition: background-color 0.2s;" 
                                onmouseover="this.style.backgroundColor='#0056b3'" 
                                onmouseout="this.style.backgroundColor='#007bff'">
                            Browse My Gallery
                        </button>
                    </div>
                    
                    <!-- Selected Artworks Preview -->
                    <div id="selected-artworks-preview" style="margin-top: 40px; display: none;">
                        <h3 style="font-size: 1.2rem; margin-bottom: 20px; color: #333;">Selected Artworks</h3>
                        <div id="selected-artworks-container" style="display: ${worksLayout === 'grid' ? 'grid' : 'flex'}; ${worksLayout === 'grid' ? 'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;' : 'justify-content: center; align-items: center;'}">
                            <!-- Selected artworks will be displayed here -->
                        </div>
                        <p style="color: #666; font-size: 0.9rem; margin-top: 20px;">Layout: ${worksLayout === 'grid' ? 'Grid View' : 'Single Focus View'}</p>
                    </div>
                </div>
            </div>
        `;
    }
    

    
    createWorksGridPreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        
        // Simple grid layout - images with titles only
        return `
            <div style="padding: 40px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px;">
                    ${mediumContent.works.map(work => `
                        <div style="cursor: pointer; transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="${work.brightMorandiStyle}; height: 250px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 16px;">${work.cleanContent}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    createWorksSinglePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        const currentIndex = this.currentWorkIndex || 0;
        const currentWork = mediumContent.works[currentIndex];
        const totalWorks = mediumContent.works.length;
        
        // Single artwork focus - centered image with navigation arrows
        return `
            <div class="single-artwork-container" style="padding: 60px 40px; text-align: center; min-height: 500px; display: flex; flex-direction: column; justify-content: center;">
                <!-- Navigation Container -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 40px;">
                    <!-- Left Arrow -->
                    <button class="prev-work-btn" style="background: none; border: 2px solid #333; border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: #333; transition: all 0.2s;">
                        ←
                    </button>
                    
                    <!-- Featured Artwork -->
                    <div class="artwork-content" style="max-width: 500px; transition: opacity 0.3s ease;">
                        <div style="${currentWork.brightMorandiStyle}; height: 400px; width: 400px; border-radius: 8px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 20px;">${currentWork.cleanContent}</div>
                        <p style="color: #999; margin: 0; font-size: 1rem; text-align: center;">${currentIndex + 1} of ${totalWorks}</p>
                    </div>
                    
                    <!-- Right Arrow -->
                    <button class="next-work-btn" style="background: none; border: 2px solid #333; border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: #333; transition: all 0.2s;">
                        →
                    </button>
                </div>
            </div>
            <style>
                .prev-work-btn,
                .next-work-btn {
                    position: relative;
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
                    will-change: transform, background-color;
                }
                
                .prev-work-btn:not([disabled]):hover,
                .next-work-btn:not([disabled]):hover {
                    background-color: #f8f9fa;
                    transform: scale(1.1);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                
                .prev-work-btn:not([disabled]):active,
                .next-work-btn:not([disabled]):active {
                    transform: scale(0.98);
                    transition-duration: 0.1s;
                }
                
                .prev-work-btn[disabled],
                .next-work-btn[disabled] {
                    opacity: 0.25;
                    cursor: not-allowed;
                    border-color: #999 !important;
                    transform: none !important;
                }
                
                .artwork-content {
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    will-change: opacity, transform;
                }
                
                /* Animation for sliding effect */
                .artwork-slide-enter {
                    opacity: 0;
                    transform: translateX(20px);
                }
                
                .artwork-slide-enter-active {
                    opacity: 1;
                    transform: translateX(0);
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .artwork-slide-exit {
                    opacity: 1;
                    transform: translateX(0);
                }
                
                .artwork-slide-exit-active {
                    opacity: 0;
                    transform: translateX(-20px);
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
            </style>
        `;
    }
    
    createStyledPreviewHTML() {
        const { medium, features, logo, style } = this.surveyData;
        const { fontSize, textColor, themeColor } = style;
        
        const logoHTML = logo ? `<img src="${logo.dataUrl}" alt="Logo" style="max-height: 40px;">` : `<div style="font-weight: bold; color: ${themeColor};">Your Portfolio</div>`;
        
        return `
            <div style="padding: 20px; font-family: Arial, sans-serif; font-size: ${fontSize}px; color: ${textColor};">
                <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid ${themeColor}; padding-bottom: 15px;">
                    ${logoHTML}
                    <nav style="display: flex; gap: 15px;">
                        <a href="#" style="text-decoration: none; color: ${themeColor}; font-weight: 500;">Home</a>
                        <a href="#" style="text-decoration: none; color: ${textColor};">About</a>
                        <a href="#" style="text-decoration: none; color: ${textColor};">Works</a>
                    </nav>
                </header>
                <main>
                    <h1 style="font-size: ${fontSize * 1.8}px; margin-bottom: 10px; color: ${themeColor};">My ${medium} Portfolio</h1>
                    <p style="color: ${textColor}; opacity: 0.8; margin-bottom: 20px;">Showcasing my creative works</p>
                    <div style="border: 1px solid ${themeColor}; padding: 15px; text-align: center; background: ${themeColor}10;">
                        <div style="background: #f0f0f0; height: 100px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; color: ${textColor};">Sample Work</div>
                        <h3 style="color: ${themeColor}; font-size: ${fontSize * 1.2}px;">Featured Piece</h3>
                    </div>
                </main>
            </div>
        `;
    }
    
    generateStepOrder() {
        this.stepOrder = ['step-1', 'step-2']; // Medium and features
        
        // Add layout selection steps for each selected feature
        if (this.surveyData.features.home) this.stepOrder.push('step-3'); // Homepage layout
        if (this.surveyData.features.works) {
            this.stepOrder.push('step-4'); // Works organization details (moved from step-5)
            this.stepOrder.push('step-5'); // Works layout (moved from step-6)
        }
        if (this.surveyData.features.about) {
            this.stepOrder.push('step-6'); // About layout (moved to after works)
            this.stepOrder.push('step-7'); // About sections selection
        }
        
        // Add additional feature layout steps (to be implemented)
        if (this.surveyData.features.commission) {
            // this.stepOrder.push('step-commission');
        }
        if (this.surveyData.features.exhibition) {
            // this.stepOrder.push('step-exhibition');
        }
        
        // Add final steps
        this.stepOrder.push('step-logo', 'step-preview', 'step-style');
        this.totalSteps = this.stepOrder.length;
    }
    
    setupLayoutSelection() {
        // Handle all layout option selections
        document.addEventListener('click', (e) => {
            if (e.target.closest('.layout-option')) {
                const option = e.target.closest('.layout-option');
                const container = option.closest('.layout-options');
                const page = option.dataset.page;
                const layout = option.dataset.layout;
                
                // Remove selected class from siblings
                container.querySelectorAll('.layout-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Add selected class to clicked option
                option.classList.add('selected');
                
                // Store layout choice
                this.surveyData.layouts[page] = layout;
                
                // Enable next button
                const nextBtn = option.closest('.survey-step').querySelector('.next-btn');
                if (nextBtn) nextBtn.disabled = false;
            }
        });
    }
    
    setupWorksOrganization() {
        const yearsInput = document.getElementById('years-input');
        const themesInput = document.getElementById('themes-input');
        const yearsDropdown = document.getElementById('years-dropdown');
        const themesDropdown = document.getElementById('themes-dropdown');
        
        // Handle years input
        if (yearsInput) {
            yearsInput.addEventListener('input', () => {
                const years = this.parseCommaSeparated(yearsInput.value);
                this.surveyData.worksDetails.years = years;
                this.updateDropdownPreview(yearsDropdown, years);
                this.validateStep4();
            });
        }
        
        // Handle themes input
        if (themesInput) {
            themesInput.addEventListener('input', () => {
                const themes = this.parseCommaSeparated(themesInput.value);
                this.surveyData.worksDetails.themes = themes;
                this.updateDropdownPreview(themesDropdown, themes);
                this.validateStep4();
            });
        }
    }
    
    showWorksOrganizationInput() {
        const yearOrg = document.getElementById('year-organization');
        const themeOrg = document.getElementById('theme-organization');
        
        if (this.surveyData.features.worksOrganization === 'year') {
            yearOrg.style.display = 'block';
            themeOrg.style.display = 'none';
        } else if (this.surveyData.features.worksOrganization === 'theme') {
            yearOrg.style.display = 'none';
            themeOrg.style.display = 'block';
        }
    }
    
    parseCommaSeparated(input) {
        return input.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
    
    updateDropdownPreview(dropdown, items) {
        if (!dropdown) return;
        
        dropdown.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.textContent = item;
            dropdown.appendChild(div);
        });
    }
    
    validateStep4() {
        const nextBtn = document.querySelector('#step-4 .next-btn');
        if (!nextBtn) return;
        
        const isValid = this.validateWorksDetails();
        nextBtn.disabled = !isValid;
    }
    
    validateWorksDetails() {
        if (this.surveyData.features.worksOrganization === 'year') {
            return this.surveyData.worksDetails.years.length > 0;
        } else if (this.surveyData.features.worksOrganization === 'theme') {
            return this.surveyData.worksDetails.themes.length > 0;
        }
        return false;
    }
    
    nextStep() {
        const currentStepElement = document.querySelector(`#${this.stepOrder[this.currentStep - 1]}`);
        
        if (this.currentStep === 1) {
            // Validate medium selection
            if (!this.surveyData.medium) {
                alert('Please select an artwork medium.');
                return;
            }
        }
        
        if (this.currentStep === 2) {
            // Validate works organization selection
            if (!this.surveyData.features.worksOrganization) {
                alert('Please select how you want to organize your works.');
                return;
            }
            // Generate step order after feature selection
            this.generateStepOrder();
            this.showWorksOrganizationInput();
        }
        
        if (this.currentStep === 5) {
            // Validate works organization details
            if (!this.validateWorksDetails()) {
                const orgType = this.surveyData.features.worksOrganization;
                alert(`Please enter at least one ${orgType === 'year' ? 'year' : 'theme'}.`);
                return;
            }
        }
        
        // Handle dynamic step validation
        const currentStepId = this.stepOrder[this.currentStep - 1];
        if (currentStepId === 'step-preview') {
            this.generateWebsitePreview();
        }
        
        if (currentStepId === 'step-style') {
            this.updateStylePreview();
            this.completeSurvey();
            return;
        }
        
        // Hide current step
        currentStepElement.classList.remove('active');
        
        // Show next step
        this.currentStep++;
        const nextStepId = this.stepOrder[this.currentStep - 1];
        const nextStepElement = document.querySelector(`#${nextStepId}`);
        if (nextStepElement) {
            nextStepElement.classList.add('active');
            
            // Auto-generate preview when entering preview step
            if (nextStepId === 'step-preview') {
                this.generateWebsitePreview();
            }
        }
    }
    
    prevStep() {
        if (this.currentStep <= 1) return;
        
        // Hide current step
        const currentStepId = this.stepOrder[this.currentStep - 1];
        const currentStepElement = document.querySelector(`#${currentStepId}`);
        currentStepElement.classList.remove('active');
        
        // Show previous step
        this.currentStep--;
        const prevStepId = this.stepOrder[this.currentStep - 1];
        const prevStepElement = document.querySelector(`#${prevStepId}`);
        prevStepElement.classList.add('active');
    }
    
    completeSurvey() {
        console.log('Survey completed with data:', this.surveyData);
        
        const selectedFeatures = Object.keys(this.surveyData.features).filter(key => this.surveyData.features[key] === true);
        const selectedLayouts = Object.entries(this.surveyData.layouts).filter(([key, value]) => value !== null);
        const worksDetails = this.surveyData.features.worksOrganization === 'year' ? 
            this.surveyData.worksDetails.years.join(', ') : 
            this.surveyData.worksDetails.themes.join(', ');
        
        alert(`Portfolio setup completed!\n\nMedium: ${this.surveyData.medium}\nFeatures: ${selectedFeatures.join(', ')}\nWorks Organization: ${this.surveyData.features.worksOrganization} (${worksDetails})\nLayouts Selected: ${selectedLayouts.length}\nLogo: ${this.surveyData.logo ? 'Uploaded' : 'Skipped'}\nStyle: Custom colors and font size applied`);
    }
}

// Initialize survey when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.portfolioSurvey = new PortfolioSurvey();
});
