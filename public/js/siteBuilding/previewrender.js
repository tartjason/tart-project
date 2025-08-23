// Preview rendering logic extracted from survey.js
// Encapsulates: template loading, preview HTML creation, side panel, start over/revert,
// global helpers for image upload and gallery, and style preview.

(function(){
  class PreviewRenderer {
    constructor(survey) {
      this.survey = survey; // PortfolioSurvey instance

      // Rendering state (moved from PortfolioSurvey)
      this.currentSelectedWorkIndex = 0;
      this.currentWorksFilter = null;
      this.currentPreviewPage = undefined;
      this.originalLayout = null;

      this.templatesLoaded = false;
      this._templatesLoadingPromise = null;
      this.templates = {
        home: { grid: '', split: '', hero: '' },
        works: { grid: '', single: '' },
        about: { split: '', vertical: '' }
      };

      // Compiled data cache
      this._compiled = null;

      // Editable content state
      this._dirty = {}; // map: path -> { type, value }
      this._version = 0;
      this._isSaving = false;
      this._saveBtn = null;
      this._saveStatus = null;

      // Bridge: expose surveyData through this.surveyData
      Object.defineProperty(this, 'surveyData', {
        get: () => this.survey && this.survey.surveyData,
        set: (v) => { if (this.survey) this.survey.surveyData = v; }
      });
    }

    // Public API used by survey.js
    setupWebsitePreview() {
      const revertBtn = document.getElementById('revert-preview');
      if (revertBtn) {
        revertBtn.addEventListener('click', () => this.revertToOriginalLayout());
      }

      const startOverBtn = document.getElementById('start-over');
      if (startOverBtn) {
        startOverBtn.addEventListener('click', async () => {
          const confirmed = confirm('Start over will reset your survey and permanently delete all uploaded site images. Continue?');
          if (!confirmed) return;
          const token = localStorage.getItem('token');
          startOverBtn.disabled = true;
          try {
            const res = await fetch('/api/website-state/start-over', {
              method: 'POST',
              headers: { 'x-auth-token': token || '' }
            });
            if (!res.ok) {
              const msg = await res.text().catch(() => '');
              throw new Error(msg || 'Failed to start over');
            }

            // Clear compiled state on both renderer and survey holder
            if (this.survey) this.survey.compiledJsonPath = null;
            this._compiled = null;
            this._version = 0;
            this._dirty = {};
            this.originalLayout = null;

            window.location.reload();
          } catch (e) {
            console.warn('Start over failed:', e);
            alert('Failed to start over. Please try again.');
            startOverBtn.disabled = false;
          }
        });
      }
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

      // Preview-specific messaging for empty artworks
      try {
        if (window.RuntimeRenderer && window.RuntimeRenderer.config) {
          window.RuntimeRenderer.config.emptyArtworksMessage = 'No artworks selected. Use the side panel to add artworks.';
        }
      } catch {}

      // If we have a compiled JSON path, prefer rendering from it
      const compiledPath = this.survey && this.survey.compiledJsonPath;
      if (compiledPath) {
        try {
          // Cache-bust to guarantee we never read a stale compiled JSON
          const vb = (typeof this._version === 'number' && this._version > 0) ? this._version : Date.now();
          const url = compiledPath + (compiledPath.includes('?') ? '&' : '?') + 'v=' + vb;
          const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
          if (res.ok) {
            const compiled = await res.json();
            this._compiled = compiled;
            // Track backend version for optimistic concurrency
            if (compiled && typeof compiled.version === 'number') {
              this._version = compiled.version;
            }
            if (compiled && compiled.surveyData && this.surveyData) {
              // Merge minimally to preserve client-side tweaks
              this.surveyData = { ...this.surveyData, ...compiled.surveyData };
            }
            try { console.debug('Loaded compiled JSON', { url, version: this._version }); } catch {}
          } else {
            // If the compiled file cannot be fetched, reset compiled state
            console.warn('Compiled JSON fetch not OK, resetting state. Status:', res.status);
            this._compiled = null;
            this._version = 0;
            if (this.survey) this.survey.compiledJsonPath = null;
          }
        } catch (e) {
          console.warn('Failed to fetch compiled JSON, falling back to local data:', e);
          // Ensure stale compiled cache is cleared on error
          this._compiled = null;
          this._version = 0;
        }
      } else {
        // No compiled path provided: ensure a clean state for a fresh preview
        this._compiled = null;
        this._version = 0;
      }

      // Generate preview
      const previewHTML = this.createPreviewHTML();
      if (previewFrame) previewFrame.innerHTML = previewHTML;
      this.applyDataStyles(previewFrame);
      this.applyDataBindings(previewFrame);
      // Update header title from logged-in user if possible using shared module
      try {
        const SH = window.SiteHeader;
        if (SH && SH.updateLogoFromUserIfAvailable) SH.updateLogoFromUserIfAvailable(previewFrame);
      } catch {}

      // Save controls and editable listeners
      this.setupSaveControls();
      this.attachEditableListeners(previewFrame);

      if (!this.originalLayout) this.originalLayout = previewHTML;

      // Set up navigation and globals
      this.setupPreviewNavigation();
      this.setupGlobalFunctions();

      // If default page is Home and layout is grid, surface the works side panel
      try {
        const homeLayout = (this.surveyData.layouts && this.surveyData.layouts.homepage) || 'grid';
        if (homeLayout === 'grid') {
          this.currentPreviewPage = 'home';
          this.ensureExternalWorksSidePanel();
          const sidePanel = document.getElementById('works-side-panel');
          if (sidePanel) sidePanel.style.display = 'block';
          const layoutLabel = document.getElementById('works-side-layout-label');
          if (layoutLabel) {
            const wl = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
            layoutLabel.textContent = wl === 'grid' ? 'grid' : 'single focus';
          }
          if (window.loadSideGallery) window.loadSideGallery();
        }
      } catch (e) {
        console.warn('Home grid side panel setup skipped:', e);
      }
    }

    revertToOriginalLayout() {
      const previewFrame = document.getElementById('website-preview');
      if (this.originalLayout && previewFrame) {
        previewFrame.innerHTML = this.originalLayout;
        this.setupPreviewNavigation();
        this.setupGlobalFunctions();
        this.applyDataStyles(previewFrame);
        this.applyDataBindings(previewFrame);
        const sidePanel = document.getElementById('works-side-panel');
        if (sidePanel) sidePanel.style.display = 'none';
      }
    }

    // Template loader and renderer
    async loadTemplates() {
      if (this._templatesLoadingPromise) return this._templatesLoadingPromise;
      const RR = window.RuntimeRenderer;
      this._templatesLoadingPromise = (RR && RR.loadTemplates ? RR.loadTemplates() : Promise.resolve()).then(() => {
        if (RR) {
          this.templates = RR.templates;
          this.templatesLoaded = true;
        }
      }).finally(() => {
        this._templatesLoadingPromise = null;
      });
      return this._templatesLoadingPromise;
    }

    ensureTemplatesLoaded() {
      if (this.templatesLoaded) return Promise.resolve();
      const RR = window.RuntimeRenderer;
      if (RR && RR.ensureTemplatesLoaded) {
        return RR.ensureTemplatesLoaded().then(() => {
          this.templates = RR.templates;
          this.templatesLoaded = true;
        });
      }
      return this.loadTemplates();
    }

    applyDataStyles(root) {
      try {
        const RR = window.RuntimeRenderer;
        if (RR && RR.applyDataStyles) RR.applyDataStyles(root);
      } catch (err) {
        console.error('applyDataStyles error:', err);
      }
    }

    // Populate elements that declare a data-content-path from compiled JSON
    applyDataBindings(root) {
      try {
        const RR = window.RuntimeRenderer;
        if (RR && RR.applyDataBindings) RR.applyDataBindings(root, this._compiled || {});
      } catch (err) {
        console.error('applyDataBindings error:', err);
      }
    }

    // (Removed) Local template helpers are no longer needed; RuntimeRenderer handles all rendering.

    // Global helpers moved to public/js/preview-globals.js

    // High-level preview HTML wrapper
    createPreviewHTML() {
      const { features, logo } = this.surveyData;
      const SH = window.SiteHeader;
      let headerHTML = '';
      if (SH && SH.render) {
        headerHTML = SH.render({
          features: features || {},
          worksOrganization: features && features.worksOrganization,
          worksDetails: (this.surveyData && this.surveyData.worksDetails) || {},
          activePage: 'home',
          logo: logo || null
        });
      }

      return `
        <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
          ${headerHTML}
          <main id="preview-content">
            ${this.createHomePreview()}
          </main>
        </div>
      `;
    }

    // Try to replace default logo text with the logged-in user's name when available
    updateLogoFromUserIfAvailable(root) {
      try {
        // If a logo image is present, skip
        const hasLogoImg = (root || document).querySelector('header img[alt="Logo"]');
        if (hasLogoImg) return;
        const el = (root || document).querySelector('#site-logo-text');
        if (!el) return;
        const token = localStorage.getItem('token');
        if (!token) return;
        fetch('/api/auth/me', { headers: { 'x-auth-token': token } })
          .then(res => res.ok ? res.json() : null)
          .then(user => {
            if (user && user.name && el && el.textContent === 'Your Portfolio') {
              el.textContent = user.name;
            }
          })
          .catch(() => {});
      } catch {}
    }


    createHomePreview() {
      const { layouts } = this.surveyData;
      const homeLayout = layouts.homepage;
      if (homeLayout === 'grid') return this.createGridHomePreview();
      if (homeLayout === 'split') return this.createSplitHomePreview();
      if (homeLayout === 'hero') return this.createHeroHomePreview();
      return this.createGridHomePreview();
    }

    createSplitHomePreview() {
      const RR = window.RuntimeRenderer;
      return (RR && RR.renderHome) ? RR.renderHome('split', this._compiled, null) : '';
    }

    createHeroHomePreview() {
      const RR = window.RuntimeRenderer;
      return (RR && RR.renderHome) ? RR.renderHome('hero', this._compiled, null) : '';
    }

    createGridHomePreview() {
      const compiledHome = (this._compiled && this._compiled.homeContent) || {};
      const compiledSel = Array.isArray(compiledHome.homeSelections) ? compiledHome.homeSelections : [];
      const localSel = Array.isArray(this.surveyData && this.surveyData.homeSelections) ? this.surveyData.homeSelections : [];
      // Prefer unsaved local changes, otherwise compiled selections, otherwise local
      let selection = localSel;
      if (this._dirty && this._dirty['surveyData.homeSelections'] && Array.isArray(this._dirty['surveyData.homeSelections'].value)) {
        selection = this._dirty['surveyData.homeSelections'].value;
      } else if (compiledSel && compiledSel.length > 0) {
        selection = compiledSel;
      }
      const RR = window.RuntimeRenderer;
      return (RR && RR.renderHome) ? RR.renderHome('grid', this._compiled, { homeSelections: selection }) : '';
    }

    getCompiled(/* medium */) {
      // Return compiled home content only (no client-side defaults)
      return (this._compiled && this._compiled.homeContent) || {};
    }

    setupPreviewNavigation() {
      const navItems = document.querySelectorAll('.preview-nav-item');
      const previewContent = document.getElementById('preview-content');
      if (!previewContent) return;

      // Prefer shared header navigation wiring when available
      try {
        const SH = window.SiteHeader;
        if (SH && SH.attachNavigation) {
          SH.attachNavigation(document, {
            onNavigate: (page, params) => {
              this.currentPreviewPage = page;
              if (page === 'home') {
                previewContent.innerHTML = this.createHomePreview();
                this.applyDataStyles(previewContent);
                this.applyDataBindings(previewContent);
                this.attachEditableListeners(previewContent);
                const sidePanel = document.getElementById('works-side-panel');
                const homeLayout = (this.surveyData.layouts && this.surveyData.layouts.homepage) || 'grid';
                if (sidePanel) sidePanel.style.display = homeLayout === 'grid' ? 'block' : 'none';
                if (homeLayout === 'grid' && window.loadSideGallery) window.loadSideGallery();
              } else if (page === 'about') {
                previewContent.innerHTML = this.createAboutPreview();
                this.applyDataStyles(previewContent);
                this.applyDataBindings(previewContent);
                this.attachEditableListeners(previewContent);
                const sidePanel = document.getElementById('works-side-panel');
                if (sidePanel) sidePanel.style.display = 'none';
              } else if (page === 'works') {
                const filter = params && params.filter;
                if (filter) {
                  this.currentWorksFilter = filter;
                  this.currentSelectedWorkIndex = 0;
                  if (!this.surveyData.worksSelections) this.surveyData.worksSelections = {};
                  if (!Array.isArray(this.surveyData.worksSelections[filter])) this.surveyData.worksSelections[filter] = [];
                }
                previewContent.innerHTML = this.createWorksPreview();
                this.applyDataStyles(previewContent);
                this.applyDataBindings(previewContent);
                this.attachEditableListeners(previewContent);
                this.setupWorkNavigation();
                this.ensureExternalWorksSidePanel();
                const sidePanel = document.getElementById('works-side-panel');
                if (sidePanel) sidePanel.style.display = 'block';
                const layoutLabel = document.getElementById('works-side-layout-label');
                if (layoutLabel) {
                  const wl = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
                  layoutLabel.textContent = wl === 'grid' ? 'grid' : 'single focus';
                }
                if (window.loadSideGallery) window.loadSideGallery();
              } else {
                previewContent.innerHTML = `<div style="text-align: center; padding: 60px 0;"><h2>${page.charAt(0).toUpperCase() + page.slice(1)} Page</h2><p style="color: #666;">Content coming soon.</p></div>`;
                this.applyDataStyles(previewContent);
                this.applyDataBindings(previewContent);
                this.attachEditableListeners(previewContent);
                const sidePanel = document.getElementById('works-side-panel');
                if (sidePanel) sidePanel.style.display = 'none';
              }
            }
          });
          return; // Skip legacy wiring
        }
      } catch (e) { /* fall back to legacy below */ }

      const worksNavItem = document.querySelector('.preview-nav-item[data-page="works"]');
      if (worksNavItem) {
        const dropdown = worksNavItem.parentElement.querySelector('.works-dropdown');
        if (dropdown) {
          worksNavItem.parentElement.addEventListener('mouseenter', () => { dropdown.style.display = 'block'; });
          worksNavItem.parentElement.addEventListener('mouseleave', () => { dropdown.style.display = 'none'; });

          const filterItems = dropdown.querySelectorAll('.works-filter');
          filterItems.forEach(filterItem => {
            filterItem.addEventListener('click', (e) => {
              e.preventDefault();
              this.currentPreviewPage = 'works';
              const filter = filterItem.dataset.filter;
              this.currentWorksFilter = filter;
              this.currentSelectedWorkIndex = 0;
              if (!this.surveyData.worksSelections) this.surveyData.worksSelections = {};
              if (!Array.isArray(this.surveyData.worksSelections[filter])) this.surveyData.worksSelections[filter] = [];

              navItems.forEach(nav => {
                nav.classList.remove('active');
                nav.style.color = '#333';
                nav.style.fontWeight = 'normal';
                nav.style.borderBottom = 'none';
              });
              worksNavItem.classList.add('active');
              worksNavItem.style.color = '#007bff';
              worksNavItem.style.fontWeight = 'bold';
              worksNavItem.style.borderBottom = '2px solid #007bff';

              previewContent.innerHTML = this.createWorksPreview();
              this.applyDataStyles(previewContent);
              this.applyDataBindings(previewContent);
              this.setupWorkNavigation();
              this.ensureExternalWorksSidePanel();
              const sidePanel = document.getElementById('works-side-panel');
              if (sidePanel) sidePanel.style.display = 'block';
              const layoutLabel = document.getElementById('works-side-layout-label');
              if (layoutLabel) {
                const wl = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
                layoutLabel.textContent = wl === 'grid' ? 'grid' : 'single focus';
              }
              if (window.loadSideGallery) window.loadSideGallery();
            });
          });
        }
      }

      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const page = item.dataset.page;
          this.currentPreviewPage = page;
          navItems.forEach(nav => {
            nav.classList.remove('active');
            nav.style.color = '#333';
            nav.style.fontWeight = 'normal';
            nav.style.borderBottom = 'none';
          });
          item.classList.add('active');
          item.style.color = '#007bff';
          item.style.fontWeight = 'bold';
          item.style.borderBottom = '2px solid #007bff';

          if (page === 'home') {
            previewContent.innerHTML = this.createHomePreview();
            this.applyDataStyles(previewContent);
            this.applyDataBindings(previewContent);
            this.attachEditableListeners(previewContent);
            const sidePanel = document.getElementById('works-side-panel');
            const homeLayout = (this.surveyData.layouts && this.surveyData.layouts.homepage) || 'grid';
            if (sidePanel) sidePanel.style.display = homeLayout === 'grid' ? 'block' : 'none';
            if (homeLayout === 'grid' && window.loadSideGallery) window.loadSideGallery();
          } else if (page === 'about') {
            previewContent.innerHTML = this.createAboutPreview();
            this.applyDataStyles(previewContent);
            this.applyDataBindings(previewContent);
            this.attachEditableListeners(previewContent);
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'none';
          } else if (page === 'works') {
            previewContent.innerHTML = this.createWorksPreview();
            this.applyDataStyles(previewContent);
            this.applyDataBindings(previewContent);
            this.attachEditableListeners(previewContent);
            this.setupWorkNavigation();
            this.ensureExternalWorksSidePanel();
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'block';
            if (window.loadSideGallery) window.loadSideGallery();
          } else {
            previewContent.innerHTML = `<div style="text-align: center; padding: 60px 0;"><h2>${page.charAt(0).toUpperCase() + page.slice(1)} Page</h2><p style="color: #666;">Content coming soon.</p></div>`;
            this.applyDataStyles(previewContent);
            this.applyDataBindings(previewContent);
            this.attachEditableListeners(previewContent);
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'none';
          }
        });
      });
    }

    // Works navigation for single/grid
    setupWorkNavigation() {
      // Support both legacy IDs and template class buttons
      const prevBtn = document.querySelector('#prev-work, .prev-work-btn');
      const nextBtn = document.querySelector('#next-work, .next-work-btn');
      this.removeExistingWorkListeners(prevBtn, nextBtn);
      // Set disabled state based on selection length
      const selection = this.getCurrentFolderSelection() || [];
      const n = selection.length;
      if (prevBtn) prevBtn.disabled = n <= 1;
      if (nextBtn) nextBtn.disabled = n <= 1;
      this.setupNewWorkListeners(prevBtn, nextBtn);
    }

    removeExistingWorkListeners(prevBtn, nextBtn) {
      if (prevBtn) prevBtn.replaceWith(prevBtn.cloneNode(true));
      if (nextBtn) nextBtn.replaceWith(nextBtn.cloneNode(true));
    }

    setupNewWorkListeners(prevBtn, nextBtn) {
      const newPrev = document.querySelector('.prev-work-btn');
      const newNext = document.querySelector('.next-work-btn');
      if (newPrev) newPrev.addEventListener('click', (e) => {
        e.preventDefault();
        const selection = this.getCurrentFolderSelection();
        const n = (selection || []).length;
        if (n <= 1) return;
        this.currentSelectedWorkIndex = (this.currentSelectedWorkIndex - 1 + n) % n;
        const previewContent = document.getElementById('preview-content');
        if (previewContent) {
          previewContent.innerHTML = this.createWorksSinglePreview();
          this.applyDataStyles(previewContent);
          this.applyDataBindings(previewContent);
          this.setupWorkNavigation();
        }
      });
      if (newNext) newNext.addEventListener('click', (e) => {
        e.preventDefault();
        const selection = this.getCurrentFolderSelection();
        const n = (selection || []).length;
        if (n <= 1) return;
        this.currentSelectedWorkIndex = (this.currentSelectedWorkIndex + 1) % n;
        const previewContent = document.getElementById('preview-content');
        if (previewContent) {
          previewContent.innerHTML = this.createWorksSinglePreview();
          this.applyDataStyles(previewContent);
          this.applyDataBindings(previewContent);
          this.setupWorkNavigation();
        }
      });
    }

    updateWorksPreview() {
      const previewContent = document.getElementById('preview-content');
      if (!previewContent) return;
      const worksLayout = (this.surveyData.layouts && this.surveyData.layouts.works) || 'grid';
      if (worksLayout === 'single') {
        previewContent.innerHTML = this.createWorksSinglePreview();
        // Re-attach navigation for overlay buttons
        this.setupWorkNavigation();
      } else {
        previewContent.innerHTML = this.createWorksGridPreview();
      }

      // Keep side panel state consistent when on Works
      this.applyDataStyles(previewContent);
      this.applyDataBindings(previewContent);
      this.attachEditableListeners(previewContent);
      if (this.currentPreviewPage === 'works') {
        this.ensureExternalWorksSidePanel();
        const sidePanel = document.getElementById('works-side-panel');
        if (sidePanel) sidePanel.style.display = 'block';
        const layoutLabel = document.getElementById('works-side-layout-label');
        if (layoutLabel) layoutLabel.textContent = worksLayout === 'grid' ? 'grid' : 'single focus';
        if (window.loadSideGallery) window.loadSideGallery();
      }
    }

    updateHomePreview() {
      const previewContent = document.getElementById('preview-content');
      if (!previewContent) return;
      previewContent.innerHTML = this.createHomePreview();
      this.applyDataStyles(previewContent);
      this.applyDataBindings(previewContent);
      this.attachEditableListeners(previewContent);
      // Keep side panel behavior consistent: only show on Home when layout is grid
      const sidePanel = document.getElementById('works-side-panel');
      const homeLayout = (this.surveyData.layouts && this.surveyData.layouts.homepage) || 'grid';
      if (sidePanel) sidePanel.style.display = homeLayout === 'grid' ? 'block' : 'none';
      if (homeLayout === 'grid' && window.loadSideGallery) window.loadSideGallery();
    }

    updateAboutPreview() {
      const previewContent = document.getElementById('preview-content');
      if (!previewContent) return;
      previewContent.innerHTML = this.createAboutPreview();
      this.applyDataStyles(previewContent);
      this.applyDataBindings(previewContent);
      this.attachEditableListeners(previewContent);
      const sidePanel = document.getElementById('works-side-panel');
      if (sidePanel) sidePanel.style.display = 'none';
    }

    // About
    createAboutPreview() {
      const { layouts } = this.surveyData;
      const aboutLayout = layouts.about;
      if (aboutLayout === 'vertical') return this.createAboutVerticalPreview();
      if (aboutLayout === 'split') return this.createAboutSplitPreview();
      return `<div style="text-align: center; padding: 60px 0;"><h2>About Page Preview</h2><p style="color: #666;">Your About page layout will appear here based on your selections.</p></div>`;
    }

    createAboutVerticalPreview() {
      const RR = window.RuntimeRenderer;
      return (RR && RR.renderAbout) ? RR.renderAbout('vertical', this._compiled || {}, this.surveyData || {}) : '';
    }

    createAboutSplitPreview() {
      const RR = window.RuntimeRenderer;
      return (RR && RR.renderAbout) ? RR.renderAbout('split', this._compiled || {}, this.surveyData || {}) : '';
    }

    // (Removed) About helpers used only by local fallback rendering.

    // Works
    createWorksPreview() {
      const { layouts, features } = this.surveyData;
      const worksLayout = layouts.works;
      if (worksLayout === 'grid') return this.createWorksGridPreview();
      if (worksLayout === 'single') return this.createWorksSinglePreview();
      return `<div style="text-align: center; padding: 60px 0;"><h2>Works</h2><p style="color: #666;">Select a layout for your works page to see the preview.</p></div>`;
    }

    // Helpers for works subpages (years/themes)
    getCurrentWorksFolders() {
      const orgType = this.surveyData.features.worksOrganization;
      return orgType === 'year' ? this.surveyData.worksDetails.years : this.surveyData.worksDetails.themes;
    }

    ensureCurrentWorksFilter() {
      const folders = this.getCurrentWorksFolders();
      if (!this.currentWorksFilter && folders && folders.length > 0) {
        this.currentWorksFilter = folders[0];
      }
    }

    getCurrentFolderSelection() {
      this.ensureCurrentWorksFilter();
      if (!this.currentWorksFilter) return [];
      const sel = (this.surveyData.worksSelections && this.surveyData.worksSelections[this.currentWorksFilter]) || [];
      return Array.isArray(sel) ? sel : [];
    }

    setCurrentFolderSelection(arr) {
      this.ensureCurrentWorksFilter();
      if (!this.currentWorksFilter) return;
      if (!this.surveyData.worksSelections) this.surveyData.worksSelections = {};
      this.surveyData.worksSelections[this.currentWorksFilter] = Array.isArray(arr) ? arr : [];
    }

    createWorksSelectionInterface() {
      const folders = this.getCurrentWorksFolders();
      const tabs = (folders || []).map(f => `<button class="works-folder-tab${f === this.currentWorksFilter ? ' active' : ''}" data-folder="${f}" style="margin-right:8px; padding:6px 10px;">${f}</button>`).join('');
      return `
        <div style="margin-bottom:12px;">${tabs}</div>
      `;
    }

    ensureExternalWorksSidePanel() {
      const panel = document.getElementById('works-side-panel');
      if (!panel) return;
      panel.style.display = 'block';
    }

    createWorksGridPreview() {
      const RR = window.RuntimeRenderer;
      const selection = this.getCurrentFolderSelection() || [];
      return (RR && RR.renderWorks) ? RR.renderWorks('grid', this._compiled, { worksSelection: selection }) : '';
    }
    
    createWorksSinglePreview() {
      const RR = window.RuntimeRenderer;
      const selection = this.getCurrentFolderSelection() || [];
      const state = { worksSelection: selection, worksIndex: this.currentSelectedWorkIndex };
      return (RR && RR.renderWorks) ? RR.renderWorks('single', this._compiled, state) : '';
    }

    // Editable + Save integration moved to public/js/preview-editable.js
  }

  // Expose globally
  window.PreviewRenderer = PreviewRenderer;
})();
