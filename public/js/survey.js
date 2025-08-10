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
        this.loadTemplates();
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
                this.updateStylePreview();
            });
        }

        const backToPreviewBtn = document.getElementById('back-to-preview');
        if (backToPreviewBtn) {
            backToPreviewBtn.addEventListener('click', async () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                await this.ensureTemplatesLoaded();
                await this.generateWebsitePreview();
            });
        }

        const closeStyleBtn = document.getElementById('close-style-tool');
        if (closeStyleBtn) {
            closeStyleBtn.addEventListener('click', async () => {
                document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
                const previewEl = document.getElementById('step-preview');
                if (previewEl) previewEl.classList.add('active');
                await this.ensureTemplatesLoaded();
                await this.generateWebsitePreview();
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
    
    // Deprecated: legacy navigation method retained for reference (not used)
    async nextStepLegacy() {
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
        // When leaving the Logo step, generate compiled JSON and mark survey complete
        if (currentStepId === 'step-logo') {
            await this.completeSurvey();
        }
        if (currentStepId === 'step-preview') {
            await this.generateWebsitePreview();
        }
        
        if (currentStepId === 'step-style') {
            this.updateStylePreview();
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
    
    async generateWebsitePreview() {
        const previewFrame = document.getElementById('website-preview');
        
        // Ensure templates are loaded
        if (!this.templatesLoaded) {
            if (previewFrame) {
                previewFrame.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">Loading templates...</div>';
            }
            await this.ensureTemplatesLoaded();
        }

        // If we have a compiled JSON path, prefer rendering from it
        if (this.compiledJsonPath) {
            try {
                const res = await fetch(this.compiledJsonPath, { credentials: 'same-origin' });
                if (res.ok) {
                    const compiled = await res.json();
                    this._compiled = compiled;
                    if (compiled && compiled.surveyData) {
                        // Merge minimally to preserve client-side session tweaks
                        this.surveyData = { ...this.surveyData, ...compiled.surveyData };
                    }
                    this.mediumPlaceholders = (compiled && compiled.mediumPlaceholders) || null;
                }
            } catch (e) {
                console.warn('Failed to fetch compiled JSON, falling back to local data:', e);
            }
        }

        // Generate preview based on (possibly compiled) data
        const previewHTML = this.createPreviewHTML();
        previewFrame.innerHTML = previewHTML;
        this.applyDataStyles(previewFrame);
        
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

            // Re-apply data styles in reverted layout
            this.applyDataStyles(previewFrame);

            // Hide works side panel on revert
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'none';
        }
    }
    
    // Template loader and renderer
    async loadTemplates() {
        if (this._templatesLoadingPromise) return this._templatesLoadingPromise;
        const files = [
            { key: ['home','grid'], url: '/templates/home/grid.html' },
            { key: ['home','split'], url: '/templates/home/split.html' },
            { key: ['home','hero'], url: '/templates/home/hero.html' },
            { key: ['works','grid'], url: '/templates/works/grid.html' },
            { key: ['works','single'], url: '/templates/works/single.html' },
            { key: ['about','split'], url: '/templates/about/split.html' },
            { key: ['about','vertical'], url: '/templates/about/vertical.html' }
        ];
        this._templatesLoadingPromise = Promise.all(files.map(async f => {
            try {
                const res = await fetch(f.url, { credentials: 'same-origin' });
                if (!res.ok) throw new Error(`Failed to load ${f.url}`);
                const txt = await res.text();
                this.templates[f.key[0]][f.key[1]] = txt;
            } catch (e) {
                console.error('Template load error:', e);
                this.templates[f.key[0]][f.key[1]] = '';
            }
        })).then(() => {
            this.templatesLoaded = true;
        }).finally(() => {
            this._templatesLoadingPromise = null;
        });
        return this._templatesLoadingPromise;
    }

    ensureTemplatesLoaded() {
        if (this.templatesLoaded) return Promise.resolve();
        return this.loadTemplates();
    }

    applyDataStyles(root) {
        try {
            const scope = root && root.querySelectorAll ? root : document;
            const elements = scope.querySelectorAll('[data-style]');
            elements.forEach(el => {
                const data = el.getAttribute('data-style');
                if (!data) return;
                const current = el.getAttribute('style') || '';
                const separator = current && !current.trim().endsWith(';') ? '; ' : '';
                el.setAttribute('style', current + separator + data);
                el.removeAttribute('data-style');
            });
        } catch (err) {
            console.error('applyDataStyles error:', err);
        }
    }

    renderTemplate(template, data) {
        if (!template) return '';
        let out = template;
        Object.entries(data || {}).forEach(([k, v]) => {
            const re = new RegExp(`{{\s*${k}\s*}}`, 'g');
            out = out.replace(re, v == null ? '' : String(v));
        });
        return out;
    }

    setupGlobalFunctions() {
        // Upload image into placeholder elements by id
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
        
        const self = this;
        
        // Load user's artworks into the right-side gallery panel (no modal)
        window.loadSideGallery = function() {
            const sideContainer = document.getElementById('works-side-gallery');
            if (!sideContainer) return;
            if (!self.currentWorksFilter) {
                sideContainer.innerHTML = '<div style="color:#666; padding:8px 0;">Choose a year/theme from Works to start selecting artworks.</div>';
                return;
            }
            sideContainer.innerHTML = '<div style="color:#666;">Loading your gallery...</div>';
            const token = localStorage.getItem('token');
            fetch('/api/artworks/user', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': token || ''
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
                window.renderSideGallery(artworks);
            })
            .catch(error => {
                console.error('Error fetching user artworks:', error);
                // Fallback: show message if API is not available yet
                alert('Unable to fetch your gallery artworks. Please ensure you are logged in and have artworks in your gallery.');
            });
        };
        

        // Render artworks into the side gallery panel with inline selection
        window.renderSideGallery = function(artworks) {
            const sideContainer = document.getElementById('works-side-gallery');
            if (!sideContainer) return;
            if (!Array.isArray(artworks) || artworks.length === 0) {
                sideContainer.innerHTML = '<div style="color:#666; padding:8px 0;">No artworks found in your gallery yet.</div>';
                return;
            }

            // Build grid
            sideContainer.innerHTML = '';
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:12px;';
            sideContainer.appendChild(grid);

            const folderKey = self.currentWorksFilter;
            const folderSelection = (self.surveyData.worksSelections && self.surveyData.worksSelections[folderKey]) || [];
            const preselected = new Set(folderSelection.map(a => a._id));

            artworks.forEach(a => {
                const id = a._id;
                const isSelected = id && preselected.has(id);
                const tile = document.createElement('div');
                tile.className = 'side-artwork-tile';
                tile.dataset.id = id || '';
                tile.style.cssText = `position:relative; border:2px solid ${isSelected ? '#007bff' : '#eee'}; border-radius:10px; overflow:hidden; cursor:pointer; background:#fff;`;
                tile.innerHTML = `
                    <div style="position:absolute; top:6px; left:6px; z-index:2; background:${isSelected ? '#007bff' : 'rgba(255,255,255,0.9)'}; color:${isSelected ? '#fff' : '#333'}; font-size:12px; padding:2px 6px; border-radius:6px;">${isSelected ? 'Selected' : 'Select'}</div>
                    <div style="width:100%; padding-top:100%; background:#f5f5f5; position:relative;">
                        ${a.imageUrl ? `<img src="${a.imageUrl}" alt="${(a.title||'Untitled').replace(/"/g,'&quot;')}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">` : `
                            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#999;">${(a.title||'Untitled')}</div>
                        `}
                    </div>
                `;
                grid.appendChild(tile);
            });

            // Delegate click handling
            sideContainer.onclick = (e) => {
                const tile = e.target.closest('.side-artwork-tile');
                if (!tile) return;
                const id = tile.dataset.id;
                if (!id) return;

                const currentArr = ((self.surveyData.worksSelections && self.surveyData.worksSelections[self.currentWorksFilter]) || []);
                const currently = new Set(currentArr.map(a => a._id));
                if (currently.has(id)) currently.delete(id); else currently.add(id);
                // Persist selection in the order of artworks as rendered
                const ordered = artworks.filter(a => a._id && currently.has(a._id));
                if (!self.surveyData.worksSelections) self.surveyData.worksSelections = {};
                self.surveyData.worksSelections[self.currentWorksFilter] = ordered;
                self.currentSelectedWorkIndex = 0;

                // Update tile UI quickly
                const badge = tile.querySelector('div');
                const nowSelected = currently.has(id);
                tile.style.borderColor = nowSelected ? '#007bff' : '#eee';
                if (badge) {
                    badge.textContent = nowSelected ? 'Selected' : 'Select';
                    badge.style.background = nowSelected ? '#007bff' : 'rgba(255,255,255,0.9)';
                    badge.style.color = nowSelected ? '#fff' : '#333';
                }

                // Refresh main works preview
                self.updateWorksPreview();
            };
        };

        // Navigation for selected artworks (single focus)
        window.prevSelectedWork = function() {
            const n = (self.getCurrentFolderSelection() || []).length;
            if (!n) return;
            self.currentSelectedWorkIndex = (self.currentSelectedWorkIndex - 1 + n) % n;
            self.updateWorksPreview();
        };
        window.nextSelectedWork = function() {
            const n = (self.getCurrentFolderSelection() || []).length;
            if (!n) return;
            self.currentSelectedWorkIndex = (self.currentSelectedWorkIndex + 1) % n;
            self.updateWorksPreview();
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
        const worksItems = mediumContent.works.map(work => `
            <div style="${work.brightMorandiStyle}; height: 200px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 14px; border-radius: 8px; cursor: pointer; transition: transform 0.3s;">${work.cleanContent}</div>
        `).join('');
        const tpl = this.templates.home.grid;
        return this.renderTemplate(tpl, {
            title: mediumContent.title,
            subtitle: mediumContent.subtitle,
            works_grid_items: worksItems
        });
    }
    
    createSplitHomePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        const tpl = this.templates.home.split;
        return this.renderTemplate(tpl, {
            split_feature_style: mediumContent.featured.morandiStyle,
            split_feature_content: mediumContent.featured.cleanContent,
            title: mediumContent.title,
            description: mediumContent.description,
            explore_text: `Explore my collection of ${medium} works, each piece carefully crafted to capture the essence of light, color, and emotion.`
        });
    }
    
    createHeroHomePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        const tpl = this.templates.home.hero;
        return this.renderTemplate(tpl, {
            hero_style: mediumContent.hero.morandiStyle,
            hero_content: mediumContent.hero.cleanContent,
            title: mediumContent.title,
            subtitle: mediumContent.subtitle,
            hero_description: `${mediumContent.description} Each piece tells a story, capturing fleeting moments and transforming them into lasting memories through the power of visual art.`
        });
    }
    
    getMediumSpecificContent(medium) {
        // If compiled JSON provided placeholders, prefer them
        if (this.mediumPlaceholders) {
            return this.mediumPlaceholders;
        }
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
                        this.currentSelectedWorkIndex = 0;
                        // Ensure per-folder selection is initialized empty
                        if (!this.surveyData.worksSelections) this.surveyData.worksSelections = {};
                        if (!Array.isArray(this.surveyData.worksSelections[filter])) {
                            this.surveyData.worksSelections[filter] = [];
                        }
                        // Mark Works tab active
                        navItems.forEach(nav => {
                            nav.classList.remove('active');
                            nav.style.color = '#333';
                            nav.style.fontWeight = 'normal';
                            nav.style.borderBottom = 'none';
                        });
                        if (worksNavItem) {
                            worksNavItem.classList.add('active');
                            worksNavItem.style.color = '#007bff';
                            worksNavItem.style.fontWeight = 'bold';
                            worksNavItem.style.borderBottom = '2px solid #007bff';
                        }
                        const content = this.createWorksPreview();
                        previewContent.innerHTML = content;
                        this.applyDataStyles(previewContent);
                        dropdown.style.display = 'none';

                        // Ensure external side panel exists and is visible; sync label
                        this.ensureExternalWorksSidePanel();
                        const sidePanel = document.getElementById('works-side-panel');
                        if (sidePanel) sidePanel.style.display = 'block';
                        const layoutLabel = document.getElementById('works-side-layout-label');
                        if (layoutLabel) {
                            const wl = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
                            layoutLabel.textContent = wl === 'grid' ? 'grid' : 'single focus';
                        }
                        if (window.loadSideGallery) window.loadSideGallery();
                        this.setupWorkNavigation();
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
                    this.currentWorkIndex = 0; // Reset mock single index
                    this.currentSelectedWorkIndex = 0; // Reset selected focus index
                    if (!this.currentWorksFilter) {
                        this.currentWorksFilter = this.ensureCurrentWorksFilter();
                    }
                    // Ensure per-folder selection is initialized empty
                    if (!this.surveyData.worksSelections) this.surveyData.worksSelections = {};
                    if (this.currentWorksFilter && !Array.isArray(this.surveyData.worksSelections[this.currentWorksFilter])) {
                        this.surveyData.worksSelections[this.currentWorksFilter] = [];
                    }
                    content = this.createWorksPreview();
                } else if (page === 'about') {
                    content = this.createAboutPreview();
                } else {
                    content = `<div style="text-align: center; padding: 60px 0;"><h2>${page.charAt(0).toUpperCase() + page.slice(1)} Page</h2><p style="color: #666;">This page would contain your ${page} content.</p></div>`;
                }
                
                previewContent.innerHTML = content;
                this.applyDataStyles(previewContent);
                
                // Re-setup navigation for single work view
                if (page === 'works') {
                    this.setupWorkNavigation();
                    this.ensureExternalWorksSidePanel();
                    const sidePanel = document.getElementById('works-side-panel');
                    if (sidePanel) sidePanel.style.display = 'block';
                    const layoutLabel = document.getElementById('works-side-layout-label');
                    if (layoutLabel) {
                        const wl = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
                        layoutLabel.textContent = wl === 'grid' ? 'grid' : 'single focus';
                    }
                    // Load side gallery
                    if (window.loadSideGallery) window.loadSideGallery();
                } else {
                    const sidePanel = document.getElementById('works-side-panel');
                    if (sidePanel) sidePanel.style.display = 'none';
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
            // If we're showing selected artworks UI, rely on window.prevSelectedWork/window.nextSelectedWork wired via inline handlers.
            const selectedContainer = document.getElementById('selected-artworks-container');
            if (selectedContainer) return;

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
        // In our generated HTML, the container has id="preview-content" (not a class)
        const previewContent = previewFrame
            ? (previewFrame.querySelector('#preview-content') || document.getElementById('preview-content'))
            : document.getElementById('preview-content');
        
        if (previewContent) {
            const content = this.createWorksPreview();
            previewContent.innerHTML = content;
            this.applyDataStyles(previewContent);
            // Re-setup navigation after content update
            this.setupWorkNavigation();

            // Update works side panel layout label if present
            const layoutLabel = document.getElementById('works-side-layout-label');
            if (layoutLabel) {
                const wl = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
                layoutLabel.textContent = wl === 'grid' ? 'grid' : 'single focus';
            }

            // Ensure external side panel is visible while on Works
            this.ensureExternalWorksSidePanel();
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'block';
            // Reload side gallery after DOM replacement
            if (window.loadSideGallery) window.loadSideGallery();
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
        const aboutSectionsHTML = selectedSections.map(section => `
            <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
                <h3 contenteditable="true" style="font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${section.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <div contenteditable="true" style="color: #666; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                    ${this.getAboutSectionContent(section)}
                </div>
            </div>
        `).join('');
        const tpl = this.templates.about.vertical;
        return this.renderTemplate(tpl, { about_sections_html: aboutSectionsHTML });
    }
    
    createAboutSplitPreview() {
        const selectedSections = this.getSelectedAboutSections();
        const aboutSectionsHTML = selectedSections.map(section => `
            <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
                <h3 contenteditable="true" style="font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${section.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <div contenteditable="true" style="color: #666; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                    ${this.getAboutSectionContent(section)}
                </div>
            </div>
        `).join('');
        const tpl = this.templates.about.split;
        return this.renderTemplate(tpl, { about_sections_html: aboutSectionsHTML });
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
    
    createWorksSelectionInterface() {
        const { layouts, features } = this.surveyData;
        const worksLayout = layouts.works || 'grid';
        const folder = this.currentWorksFilter || this.ensureCurrentWorksFilter();
        this.currentWorksFilter = folder;
        const selected = this.getCurrentFolderSelection();
        const hasFolder = !!folder;
        const hasSelection = Array.isArray(selected) && selected.length > 0;

        const gridItems = (selected || []).map(a => `
            <div style="background:#fff;">
                ${a.imageUrl ? `<img src="${a.imageUrl}" alt="${(a.title||'Untitled').replace(/"/g,'&quot;')}" style="display:block; width:100%; height:auto;">` : `
                    <div style=\"display:flex; align-items:center; justify-content:center; padding:24px; color:#999; background:#f5f5f5;\">${(a.title||'Untitled')}</div>
                `}
                <div style="padding:6px 4px; font-size:0.9rem; text-align:center; color:#7a2ea6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.title || 'Untitled'}</div>
            </div>
        `).join('');

        const idx = Math.min(this.currentSelectedWorkIndex || 0, Math.max(0, (selected || []).length - 1));
        const focus = hasSelection ? selected[idx] : null;
        const singleFocus = focus ? `
            <div style="position:relative; display:flex; align-items:center; justify-content:center; min-height:60vh;">
                <button class="prev-work-btn" onclick="window.prevSelectedWork && window.prevSelectedWork()" aria-label="Previous" style="position:absolute; left:24px; top:50%; transform:translateY(-50%); background:none; border:none; font-size:28px; color:#7a2ea6; cursor:pointer; line-height:1;">&lt;</button>
                <div class="artwork-content" style="max-width: min(80vw, 960px);">
                    ${focus.imageUrl ? `<img src="${focus.imageUrl}" alt="${(focus.title||'Untitled').replace(/"/g,'&quot;')}" style="display:block; max-width:100%; max-height:70vh; width:auto; height:auto; margin:0 auto;">` : `
                        <div style=\"text-align:center; color:#999;\">${(focus.title||'Untitled')}</div>
                    `}
                    <div style="text-align:center; margin-top:12px; color:#7a2ea6; font-size:0.9rem;">${focus.title || 'Untitled'}</div>
                </div>
                <button class="next-work-btn" onclick="window.nextSelectedWork && window.nextSelectedWork()" aria-label="Next" style="position:absolute; right:24px; top:50%; transform:translateY(-50%); background:none; border:none; font-size:28px; color:#7a2ea6; cursor:pointer; line-height:1;">&gt;</button>
            </div>
        ` : '';

        const selectedSection = hasSelection ? `
            <div id="selected-artworks-preview" style="margin-top:0;">
                <div id="selected-artworks-container" style="${worksLayout === 'grid' ? 'display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;' : 'display:block;'}">
                    ${worksLayout === 'grid' ? gridItems : singleFocus}
                </div>
            </div>
        ` : '';

        const emptyMain = hasFolder
            ? `<div style=\"text-align:center; color:#999; padding-top:40px;\">No artworks selected for “${folder}”. Use the side panel to add artworks.</div>`
            : `<div style=\"text-align:center; color:#999; padding-top:40px;\">No ${features && features.worksOrganization === 'year' ? 'years' : 'themes'} configured. Go back to the Works step to add them, then choose a subpage from the Works menu.</div>`;

        return `
            <div id="works-main" style="min-height: 500px;">
                ${hasSelection ? selectedSection : emptyMain}
            </div>
        `;
    }

    // Ensure external, fixed-position side panel exists for Works selection
    ensureExternalWorksSidePanel() {
        let panel = document.getElementById('works-side-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'works-side-panel';
            panel.setAttribute('style', [
                'position:fixed',
                'right:16px',
                'top:80px',
                'bottom:16px',
                'width:320px',
                'background:#fff',
                'border:1px solid #e5e5e5',
                'border-radius:10px',
                'box-shadow:0 6px 24px rgba(0,0,0,0.08)',
                'padding:12px',
                'overflow:auto',
                'z-index:9999'
            ].join('; ') + ';');
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="color:#555; font-weight:600;">Your TART gallery</div>
                    <div style="color:#999; font-size:0.9rem;">Layout: <span id="works-side-layout-label">${(this.surveyData.layouts && this.surveyData.layouts.works) === 'single' ? 'single focus' : 'grid'}</span></div>
                </div>
                <div style="color:#666; font-size:12px; margin-bottom:10px;">Select works for this subpage from your TART gallery. Click tiles to add/remove.</div>
                <div id="works-side-gallery"></div>
            `;
            document.body.appendChild(panel);
        }
        return panel;
    }
    

    
    createWorksGridPreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        const worksItems = mediumContent.works.map(work => `
            <div style="cursor: pointer; transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'"><div style="${work.brightMorandiStyle}; height: 250px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 16px;">${work.cleanContent}</div></div>
        `).join('');
        const tpl = this.templates.works.grid;
        return this.renderTemplate(tpl, { works_grid_items: worksItems });
    }
    
    createWorksSinglePreview() {
        const { medium } = this.surveyData;
        const mediumContent = this.getMediumSpecificContent(medium);
        const currentIndex = this.currentWorkIndex || 0;
        const currentWork = mediumContent.works[currentIndex];
        const totalWorks = mediumContent.works.length;
        const tpl = this.templates.works.single;
        return this.renderTemplate(tpl, {
            single_work_style: currentWork.brightMorandiStyle,
            single_work_content: currentWork.cleanContent,
            single_index: currentIndex + 1,
            single_total: totalWorks
        });
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
        this.stepOrder.push('step-logo');
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
                await this.ensureTemplatesLoaded();
                await this.generateWebsitePreview();
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
            
            // If logo is stored as a string path, normalize to { dataUrl }
            if (this.surveyData.logo && typeof this.surveyData.logo === 'string') {
                this.surveyData.logo = { dataUrl: this.surveyData.logo };
            }

            // Show preview directly (outside of wizard)
            document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
            const previewEl = document.getElementById('step-preview');
            if (previewEl) previewEl.classList.add('active');

            // Ensure templates are ready and render
            await this.ensureTemplatesLoaded();
            await this.generateWebsitePreview();
        } catch (err) {
            console.warn('Draft load skipped:', err);
        }
    }
}

// Initialize survey when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.portfolioSurvey = new PortfolioSurvey();
});
