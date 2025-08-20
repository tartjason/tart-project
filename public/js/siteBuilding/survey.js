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
            },
            selectedArtworks: [],
            worksSelections: {}
        };
        
        // Initialize basic step order (will be expanded after feature selection)
        this.stepOrder = ['step-1', 'step-2'];
        this.totalSteps = 2;
        
        // Index for single-focus selected artworks preview
        this.currentSelectedWorkIndex = 0;
        // Current works subpage key (year/theme)
        this.currentWorksFilter = null;
        
        // Template loading state
        this.templatesLoaded = false;
        this._templatesLoadingPromise = null;
        this.templates = {
            home: { grid: '', split: '', hero: '' },
            works: { grid: '', single: '' },
            about: { split: '', vertical: '' }
        };
        // Compiled data cache (from server-side JSON)
        this.mediumPlaceholders = null;
        this._compiled = null;

        // Initialize preview renderer module (handles preview, side panel, styles)
        this.previewRenderer = new PreviewRenderer(this);

        this.init();
    }
    
    init() {
        this.setupMediumSelection();
        this.setupFeatureSelection();
        this.setupLayoutSelection();
        this.setupWorksOrganization();
        this.setupAboutSections();
        this.setupLogoUpload();
        // Delegate preview and style setup to renderer
        this.previewRenderer.setupWebsitePreview();
        this.previewRenderer.setupStyleCustomization();
        this.setupNavigation();
        // Preload templates via renderer
        this.previewRenderer.loadTemplates();
        this.generateStepOrder();
        
        // Try loading an existing draft and jump directly to preview
        this.tryLoadDraftAndJumpToPreview();

        // Wire preview/style tool navigation (outside of survey wizard)
        const openStyleBtn = document.getElementById('open-style-tool');
        if (openStyleBtn) {
            openStyleBtn.addEventListener('click', () => {
                // Hide all steps, then show style tool
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const styleEl = document.getElementById('step-style');
                if (styleEl) styleEl.classList.add('active');
                this.previewRenderer.updateStylePreview();
            });
        }

        const backToPreviewBtn = document.getElementById('back-to-preview');
        if (backToPreviewBtn) {
            backToPreviewBtn.addEventListener('click', async () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                await this.previewRenderer.ensureTemplatesLoaded();
                await this.previewRenderer.generateWebsitePreview();
            });
        }

        const closeStyleBtn = document.getElementById('close-style-tool');
        if (closeStyleBtn) {
            closeStyleBtn.addEventListener('click', async () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                await this.previewRenderer.ensureTemplatesLoaded();
                await this.previewRenderer.generateWebsitePreview();
            });
        }

        // Route to Publish step from Preview
        const goToPublishBtn = document.getElementById('go-to-publish');
        if (goToPublishBtn) {
            goToPublishBtn.addEventListener('click', async () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const publishEl = document.getElementById('step-publish');
                if (publishEl) publishEl.classList.add('active');
                if (!this._publishSetupDone) this.setupPublishStep();
            });
        }
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
        // Next buttons (ignore preview/style tool sections)
        document.querySelectorAll('.next-btn').forEach(btn => {
            const stepEl = btn.closest('.survey-step');
            if (stepEl && (stepEl.id === 'step-preview' || stepEl.id === 'step-style')) return;
            btn.addEventListener('click', () => {
                this.nextStep();
            });
        });
        
        // Previous buttons (ignore preview/style tool sections)
        document.querySelectorAll('.prev-btn').forEach(btn => {
            const stepEl = btn.closest('.survey-step');
            if (stepEl && (stepEl.id === 'step-preview' || stepEl.id === 'step-style')) return;
            btn.addEventListener('click', () => {
                this.prevStep();
            });
        });
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
    
    // Helpers for works subpages (years/themes)
    getCurrentWorksFolders() {
        const { features, worksDetails } = this.surveyData;
        if (!features || !features.worksOrganization) return [];
        if (features.worksOrganization === 'year') return worksDetails.years || [];
        if (features.worksOrganization === 'theme') return worksDetails.themes || [];
        return [];
    }
    ensureCurrentWorksFilter() {
        if (this.currentWorksFilter) return this.currentWorksFilter;
        const folders = this.getCurrentWorksFolders();
        return (folders && folders.length) ? folders[0] : null;
    }
    getCurrentFolderSelection() {
        const key = this.currentWorksFilter || this.ensureCurrentWorksFilter();
        if (!key) return [];
        const map = this.surveyData.worksSelections || {};
        return Array.isArray(map[key]) ? map[key] : [];
    }
    setCurrentFolderSelection(arr) {
        const key = this.currentWorksFilter || this.ensureCurrentWorksFilter();
        if (!key) return;
        if (!this.surveyData.worksSelections) this.surveyData.worksSelections = {};
        this.surveyData.worksSelections[key] = Array.isArray(arr) ? arr : [];
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
        this.stepOrder.push('step-logo');
        this.totalSteps = this.stepOrder.length;
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
    
    async nextStep() {
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
        if (currentStepId === 'step-logo') {
            // Finish survey: save + compile, then jump to preview (outside wizard)
            await this.completeSurvey();
            document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
            const previewEl = document.getElementById('step-preview');
            if (previewEl) {
                previewEl.classList.add('active');
                await this.previewRenderer.ensureTemplatesLoaded();
                await this.previewRenderer.generateWebsitePreview();
            }
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
    
    async completeSurvey() {
        console.log('Survey completed with data:', this.surveyData);
        
        // Persist survey data and compile JSON on the backend
        const token = localStorage.getItem('token');
        try {
            // Save current survey data
            await fetch('/api/website-state/survey', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': token || ''
                },
                body: JSON.stringify(this.surveyData)
            });

            // Create/update compiled JSON for this user
            const compileRes = await fetch('/api/website-state/compile', {
                method: 'POST',
                headers: { 'x-auth-token': token || '' }
            });
            if (compileRes.ok) {
                const { compiledJsonPath } = await compileRes.json();
                this.compiledJsonPath = compiledJsonPath;
                console.log('Compiled JSON path:', compiledJsonPath);
            }
        } catch (err) {
            console.warn('Saving/compiling survey draft failed:', err);
        }
        
        const selectedFeatures = Object.keys(this.surveyData.features).filter(key => this.surveyData.features[key] === true);
        const selectedLayouts = Object.entries(this.surveyData.layouts).filter(([key, value]) => value !== null);
        const worksDetails = this.surveyData.features.worksOrganization === 'year' ? 
            this.surveyData.worksDetails.years.join(', ') : 
            this.surveyData.worksDetails.themes.join(', ');
        
        alert(`Portfolio setup completed!\n\nMedium: ${this.surveyData.medium}\nFeatures: ${selectedFeatures.join(', ')}\nWorks Organization: ${this.surveyData.features.worksOrganization} (${worksDetails})\nLayouts Selected: ${selectedLayouts.length}\nLogo: ${this.surveyData.logo ? 'Uploaded' : 'Skipped'}\nStyle: Custom colors and font size applied${this.compiledJsonPath ? `\nSaved draft: ${this.compiledJsonPath}` : ''}`);
    }
    
    // Load existing WebsiteState and jump to preview if found
    async tryLoadDraftAndJumpToPreview() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/website-state', {
                method: 'GET',
                headers: { 'x-auth-token': token || '' }
            });
            if (!res.ok) return; // Not logged in or no draft; keep wizard
            const state = await res.json();
            if (!state || !state.surveyData) return;

            // Only auto-jump when the user actually completed survey previously
            if (!state.surveyCompleted && !state.compiledJsonPath) return;

            // Merge saved survey data
            this.surveyData = { ...this.surveyData, ...state.surveyData };
            if (state.compiledJsonPath) this.compiledJsonPath = state.compiledJsonPath;
            if (state.publishedUrl) this.publishedUrl = state.publishedUrl;
            
            // If logo is stored as a string path, normalize to { dataUrl }
            if (this.surveyData.logo && typeof this.surveyData.logo === 'string') {
                this.surveyData.logo = { dataUrl: this.surveyData.logo };
            }

            // Show preview directly (outside of wizard)
            document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
            const previewEl = document.getElementById('step-preview');
            if (previewEl) previewEl.classList.add('active');

            // Ensure templates are ready and render via PreviewRenderer
            await this.previewRenderer.ensureTemplatesLoaded();
            await this.previewRenderer.generateWebsitePreview();
        } catch (err) {
            console.warn('Draft load skipped:', err);
        }
    }

    // Publish step setup: slug validation and event handlers
    setupPublishStep() {
        if (this._publishSetupDone) return;
        this._publishSetupDone = true;

        const slugInput = document.getElementById('publish-slug');
        const publishBtn = document.getElementById('publish-btn');
        const errorEl = document.getElementById('slug-error');
        const successEl = document.getElementById('publish-success');
        const availabilityEl = document.getElementById('slug-availability');
        const backBtn = document.getElementById('back-to-preview-from-publish');

        const sanitize = (s) => {
            s = (s || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
            s = s.replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
            return s;
        };
        const isValid = (s) => {
            if (!s) return false;
            if (s.length < 3 || s.length > 30) return false;
            if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(s)) return false;
            return true;
        };

        if (slugInput) {
            if (this.publishedUrl && !slugInput.value) slugInput.value = this.publishedUrl;
            let checkTimer = null;
            slugInput.addEventListener('input', () => {
                const sanitized = sanitize(slugInput.value);
                if (slugInput.value !== sanitized) slugInput.value = sanitized;
                const ok = isValid(sanitized);
                if (ok) {
                    if (errorEl) errorEl.style.display = 'none';
                    if (availabilityEl) {
                        availabilityEl.textContent = 'Checking availability…';
                        availabilityEl.style.display = 'block';
                        availabilityEl.style.color = '#666';
                    }
                    if (publishBtn) publishBtn.disabled = true;
                    if (checkTimer) clearTimeout(checkTimer);
                    checkTimer = setTimeout(async () => {
                        try {
                            const res = await this.checkSlugAvailability(sanitized);
                            if (res && res.available) {
                                if (availabilityEl) {
                                    availabilityEl.textContent = 'Available';
                                    availabilityEl.style.display = 'block';
                                    availabilityEl.style.color = '#0a7a0a';
                                }
                                if (publishBtn) publishBtn.disabled = false;
                            } else {
                                if (availabilityEl) {
                                    availabilityEl.textContent = res && res.reason === 'invalid' ? 'Invalid slug' : 'Not available';
                                    availabilityEl.style.display = 'block';
                                    availabilityEl.style.color = '#c00';
                                }
                                if (publishBtn) publishBtn.disabled = true;
                            }
                        } catch (e) {
                            if (availabilityEl) {
                                availabilityEl.textContent = 'Unable to check right now';
                                availabilityEl.style.display = 'block';
                                availabilityEl.style.color = '#c00';
                            }
                            if (publishBtn) publishBtn.disabled = true;
                        }
                    }, 350);
                } else {
                    if (errorEl) errorEl.style.display = 'block';
                    if (availabilityEl) availabilityEl.style.display = 'none';
                    if (publishBtn) publishBtn.disabled = true;
                }
                if (successEl) successEl.style.display = 'none';
            });
        }

        if (publishBtn) {
            publishBtn.addEventListener('click', async () => {
                const slug = sanitize(slugInput ? slugInput.value : '');
                if (!isValid(slug)) {
                    if (errorEl) errorEl.style.display = 'block';
                    return;
                }
                publishBtn.disabled = true;
                const oldText = publishBtn.textContent;
                publishBtn.textContent = 'Publishing...';
                try {
                    await this.publishSite(slug);
                    if (successEl) {
                        const url = `https://tartart.org/${slug}`;
                        successEl.innerHTML = `Published! Your site is live at <a href="${url}" target="_blank" rel="noopener">${url}</a>`;
                        successEl.style.display = 'block';
                    }
                } catch (e) {
                    alert('Failed to publish. Please try again.');
                    publishBtn.disabled = false;
                } finally {
                    publishBtn.textContent = oldText;
                }
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', async () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                await this.previewRenderer.ensureTemplatesLoaded();
                await this.previewRenderer.generateWebsitePreview();
            });
        }
    }

    async checkSlugAvailability(slug) {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/website-state/slug-available?slug=${encodeURIComponent(slug)}`, {
            method: 'GET',
            headers: {
                'x-auth-token': token || ''
            }
        });
        if (!res.ok) {
            throw new Error('availability check failed');
        }
        return res.json();
    }

    async publishSite(slug) {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/website-state/publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token || ''
            },
            body: JSON.stringify({ customUrl: slug })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.msg || 'Publish failed');
        }
        const state = await res.json();
        this.isPublished = true;
        this.publishedUrl = state.publishedUrl || slug;
        return state;
    }
}

// Initialize survey when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.portfolioSurvey = new PortfolioSurvey();
});
