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
                this.updatePreviewPublishUi();
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
                this.updatePreviewPublishUi();
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

    // Toggle preview step CTA vs. published URL if already published
    updatePreviewPublishUi() {
        try {
            const goToPublishBtn = document.getElementById('go-to-publish');
            const urlContainer = document.getElementById('published-url-container');
            const urlLink = document.getElementById('published-url-link');
            const headerUrlSpan = document.querySelector('#step-preview .preview-header .preview-url');
            const hasUrl = !!(this.isPublished || this.publishedUrl);
            if (hasUrl) {
                const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
                const raw = String(this.publishedUrl || '');
                let fullUrl = '';
                if (/^https?:\/\//i.test(raw)) {
                    // Already an absolute URL
                    fullUrl = raw;
                } else {
                    const slug = raw.replace(/^\/+/, '');
                    fullUrl = slug ? `${origin}/${slug}` : origin;
                }
                // For header display, strip protocol (http/https)
                const displayUrl = fullUrl.replace(/^https?:\/\//i, '');
                if (urlLink) {
                    urlLink.href = fullUrl;
                    urlLink.textContent = fullUrl;
                }
                if (headerUrlSpan) {
                    headerUrlSpan.textContent = displayUrl;
                    headerUrlSpan.style.display = '';
                }
                if (urlContainer) urlContainer.style.display = 'block';
                if (goToPublishBtn) goToPublishBtn.style.display = 'none';
            } else {
                if (urlContainer) urlContainer.style.display = 'none';
                if (goToPublishBtn) goToPublishBtn.style.display = '';
                if (headerUrlSpan) headerUrlSpan.style.display = 'none';
            }
        } catch (e) {
            console && console.warn && console.warn('updatePreviewPublishUi failed:', e);
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
            // Allow dedicated Back-to-account link to navigate normally
            if (btn.id === 'back-to-account') return;
            btn.addEventListener('click', () => {
                this.prevStep();
            });
        });
    }
    
    // Lightweight toast (non-blocking) to avoid browser alert("<origin> says")
    showToast(message, type = 'info') {
        try {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.style.position = 'fixed';
                container.style.top = '16px';
                container.style.right = '16px';
                container.style.zIndex = '9999';
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '8px';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.role = 'status';
            toast.style.minWidth = '260px';
            toast.style.maxWidth = '420px';
            toast.style.padding = '10px 12px';
            toast.style.borderRadius = '6px';
            toast.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
            toast.style.color = '#fff';
            toast.style.fontSize = '14px';
            toast.style.lineHeight = '1.4';
            toast.style.whiteSpace = 'pre-line';
            toast.style.cursor = 'pointer';
            toast.style.transition = 'opacity 200ms ease';
            const bg = type === 'error' ? '#c4453d' : (type === 'success' ? '#198754' : '#333');
            toast.style.background = bg;
            toast.textContent = String(message || '');
            toast.addEventListener('click', () => toast.remove());
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 250);
            }, 4500);
        } catch (e) {
            // As a last resort, fall back silently to avoid blocking alert
            console && console.warn && console.warn('Toast failed:', e);
        }
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
            this.showToast('File size must be less than 2MB', 'error');
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
            this.showToast('Please select an artwork medium.', 'error');
            return;
        }
    }
        
    if (this.currentStep === 2) {
        // Validate works organization selection
        if (!this.surveyData.features.worksOrganization) {
            this.showToast('Please select how you want to organize your works.', 'error');
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
            this.showToast(`Please enter at least one ${orgType === 'year' ? 'year' : 'theme'}.`, 'error');
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
            this.updatePreviewPublishUi();
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

async prevStep() {
    const currentIndex = this.currentStep - 1;
    if (currentIndex <= 0) return;
    const currentStepId = this.stepOrder[currentIndex];
    const prevStepId = this.stepOrder[currentIndex - 1];
    const currentStepElement = document.getElementById(currentStepId);
    const prevStepElement = document.getElementById(prevStepId);
    if (currentStepElement) currentStepElement.classList.remove('active');
    if (prevStepElement) prevStepElement.classList.add('active');
    this.currentStep = Math.max(1, this.currentStep - 1);
}

async checkSlugAvailability(slug) {
    const token = localStorage.getItem('token');
    const url = `/api/website-state/slug-available?slug=${encodeURIComponent(slug)}`;
    const res = await fetch(url, {
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

    // Load saved state and jump to preview if a compiled site exists
    async tryLoadDraftAndJumpToPreview() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/website-state', { headers: { 'x-auth-token': token || '' } });
            if (!res.ok) return; // no-op if unauthenticated or not found
            const state = await res.json();
            // Merge survey data if present
            if (state && state.surveyData) {
                this.surveyData = { ...this.surveyData, ...state.surveyData };
                this.generateStepOrder();
            }
            // Track compiled + publication flags
            this.compiledJsonPath = state && state.compiledJsonPath ? state.compiledJsonPath : null;
            this.isPublished = !!(state && state.isPublished);
            this.publishedUrl = state && state.publishedUrl ? state.publishedUrl : null;

            // If compiled exists, jump to preview immediately
            if (this.compiledJsonPath || (state && state.surveyCompleted)) {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                await this.previewRenderer.ensureTemplatesLoaded();
                await this.previewRenderer.generateWebsitePreview();
                this.updatePreviewPublishUi();
            }
        } catch (e) {
            // best-effort load; ignore
            try { console.warn('Failed to load draft state:', e); } catch {}
        }
    }

    // Save survey and compile site JSON; sets compiledJsonPath
    async completeSurvey() {
        const token = localStorage.getItem('token');
        try {
            // Persist survey selections
            await fetch('/api/website-state/survey', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': token || ''
                },
                body: JSON.stringify(this.surveyData || {})
            });
        } catch (e) {
            this.showToast('Failed to save survey data. Please try again.', 'error');
            throw e;
        }

        try {
            const res = await fetch('/api/website-state/compile', {
                method: 'POST',
                headers: { 'x-auth-token': token || '' }
            });
            if (!res.ok) throw new Error('Compile failed');
            const data = await res.json();
            this.compiledJsonPath = (data && data.compiledJsonPath) ? data.compiledJsonPath : null;
        } catch (e) {
            this.showToast('Failed to compile preview. You can still publish later.', 'error');
            throw e;
        }
    }

    // Wire up the publish step: slug validation, availability check, and publish action
    setupPublishStep() {
        this._publishSetupDone = true;
        const slugInput = document.getElementById('publish-slug');
        const errorEl = document.getElementById('slug-error');
        const availEl = document.getElementById('slug-availability');
        const publishBtn = document.getElementById('publish-btn');
        const successEl = document.getElementById('publish-success');
        const backBtn = document.getElementById('back-to-preview-from-publish');

        const setPublishEnabled = (enabled) => {
            if (publishBtn) publishBtn.disabled = !enabled;
        };

        const validateSlugFormat = (s) => {
            if (!s) return false;
            if (s.length < 3 || s.length > 30) return false;
            return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(s);
        };

        let checkTimer = null;
        const handleInput = async () => {
            if (!slugInput) return;
            let raw = slugInput.value || '';
            // sanitize similar to backend
            raw = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
            slugInput.value = raw;
            successEl && (successEl.style.display = 'none');

            const valid = validateSlugFormat(raw);
            if (!valid) {
                errorEl && (errorEl.style.display = 'block');
                availEl && (availEl.style.display = 'none');
                setPublishEnabled(false);
                return;
            }
            errorEl && (errorEl.style.display = 'none');
            availEl && (availEl.style.display = 'block');
            setPublishEnabled(false);
            if (checkTimer) clearTimeout(checkTimer);
            checkTimer = setTimeout(async () => {
                try {
                    const resp = await this.checkSlugAvailability(raw);
                    const ok = !!(resp && resp.available);
                    availEl && (availEl.textContent = ok ? 'Available' : 'Not available');
                    availEl && (availEl.style.color = ok ? '#0a7a0a' : '#c00');
                    setPublishEnabled(ok);
                } catch (e) {
                    availEl && (availEl.textContent = 'Error checking availability');
                    availEl && (availEl.style.color = '#c00');
                    setPublishEnabled(false);
                }
            }, 350);
        };

        if (slugInput) {
            slugInput.addEventListener('input', handleInput);
            // pre-fill from existing publishedUrl if present
            if (this.publishedUrl) {
                slugInput.value = this.publishedUrl;
                handleInput();
            }
        }

        if (publishBtn) {
            publishBtn.addEventListener('click', async () => {
                if (!slugInput) return;
                const slug = String(slugInput.value || '').trim();
                if (!slug) return;
                publishBtn.disabled = true;
                try {
                    const state = await this.publishSite(slug);
                    // Update UI state immediately
                    this.isPublished = true;
                    this.publishedUrl = state && state.publishedUrl ? state.publishedUrl : slug;
                    if (successEl) {
                        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
                        const full = this.publishedUrl ? `${origin}/${String(this.publishedUrl).replace(/^\//,'')}` : origin;
                        successEl.textContent = `Published! Your site is live at ${full}`;
                        successEl.style.display = 'block';
                    }
                    // Navigate back to preview and update UI to avoid flicker/races
                    document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                    const previewEl = document.getElementById('step-preview');
                    if (previewEl) previewEl.classList.add('active');
                    this.updatePreviewPublishUi();
                } catch (e) {
                    this.showToast(e && e.message ? e.message : 'Publish failed', 'error');
                } finally {
                    publishBtn.disabled = false;
                }
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                this.updatePreviewPublishUi();
            });
        }
    }
}

// Initialize survey when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.portfolioSurvey = new PortfolioSurvey();
});
