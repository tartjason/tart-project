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
          const confirmed = confirm('Start over will clear your current preview and reset the survey. Continue?');
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

    // Populate elements that declare a data-content-path from compiled JSON
    applyDataBindings(root) {
      try {
        const scope = root && root.querySelectorAll ? root : document;
        const elements = scope.querySelectorAll('[data-content-path]');
        if (!elements || elements.length === 0) return;

        // Use compiled JSON only (no client-side defaults)
        const dataRoot = this._compiled || {};

        elements.forEach(el => {
          const path = el.getAttribute('data-content-path');
          if (!path) return;
          const rawType = el.getAttribute('data-type') || el.getAttribute('data-content-type') || 'text';
          const type = String(rawType).toLowerCase();
          const value = this.getValueAtPath(dataRoot, path);
          // Treat empty strings as "no value" for text/html so we don't clobber defaults
          const isEmptyString = (typeof value === 'string' && value.trim() === '');
          if (value == null || (type !== 'imageurl' && type !== 'image' && isEmptyString)) return;

          if (type === 'html') {
            el.innerHTML = String(value);
          } else if (type === 'imageurl' || type === 'image') {
            const url = String(value || '');
            if (url) {
              const current = el.getAttribute('style') || '';
              const separator = current && !current.trim().endsWith(';') ? '; ' : '';
              const imgStyle = `background-image: url('${url}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
              el.setAttribute('style', current + separator + imgStyle);
            } else {
              // Clear background if empty
              el.style.backgroundImage = '';
            }
          } else {
            el.textContent = String(value);
          }
        });
      } catch (err) {
        console.error('applyDataBindings error:', err);
      }
    }

    // Resolve deep value from object using dotted/bracket path, e.g.,
    // "aboutContent.title" or "content.about.workExperience[0].role"
    getValueAtPath(obj, path) {
      try {
        if (!obj || !path) return undefined;
        // Convert bracket indices to dot form
        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
        let cur = obj;
        for (const p of parts) {
          if (cur == null) return undefined;
          cur = cur[p];
        }
        return cur;
      } catch {
        return undefined;
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

    // Global helpers moved to public/js/preview-globals.js

    // High-level preview HTML wrapper
    createPreviewHTML() {
      const { medium, features, logo } = this.surveyData;
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
            <div style="display:flex; align-items:center; gap:16px;">
              <nav style="display: flex; gap: 20px;">
                ${navItems.map((item, index) => {
                  if (item === 'Works' && this.surveyData.features.works) {
                    const orgType = this.surveyData.features.worksOrganization;
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
              <div style="display:flex; align-items:center; gap:10px;">
                <div id="preview-save-status" style="font-size:0.9rem; color:#666;">All changes saved</div>
                <button id="preview-save-btn" style="padding:6px 10px; border:1px solid #ccc; border-radius:4px; background:#f7f7f7; color:#333; cursor:not-allowed;" disabled>Save</button>
              </div>
            </div>
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
      if (!fontSizeSlider || !fontSizeValue || !textColorPicker || !themeColorPicker) return;

      fontSizeSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        this.surveyData.style.fontSize = parseInt(value);
        fontSizeValue.textContent = `${value}px`;
        this.updateStylePreview();
      });
      textColorPicker.addEventListener('change', (e) => {
        this.surveyData.style.textColor = e.target.value;
        this.updateStylePreview();
      });
      themeColorPicker.addEventListener('change', (e) => {
        this.surveyData.style.themeColor = e.target.value;
        this.updateStylePreview();
      });
    }

    updateStylePreview() {
      const stylePreviewFrame = document.getElementById('style-preview');
      if (!stylePreviewFrame) return;
      const styledHTML = this.createStyledPreviewHTML();
      stylePreviewFrame.innerHTML = styledHTML;
    }

    createHomePreview() {
      const { layouts } = this.surveyData;
      const homeLayout = layouts.homepage;
      if (homeLayout === 'grid') return this.createGridHomePreview();
      if (homeLayout === 'split') return this.createSplitHomePreview();
      if (homeLayout === 'hero') return this.createHeroHomePreview();
      return this.createGridHomePreview();
    }

    createGridHomePreview() {
      const tpl = this.templates.home.grid;
      const selected = Array.isArray(this.surveyData.homeSelections) ? this.surveyData.homeSelections : [];
      const hasSelection = selected.length > 0;
      const gridItems = (selected || []).map(a => `
        <div style="background:#fff;">
          ${a.imageUrl ? `<img src="${a.imageUrl}" alt="${(a.title||'Untitled').replace(/"/g,'&quot;')}" style="display:block; width:100%; height:auto;">` : `
            <div style=\"display:flex; align-items:center; justify-content:center; padding:24px; color:#999; background:#f5f5f5;\">${(a.title||'Untitled')}</div>
          `}
          <div style="padding:6px 4px; font-size:0.9rem; text-align:center; color:#7a2ea6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.title || 'Untitled'}</div>
        </div>
      `).join('');
      const emptyMsg = `<div style="grid-column: 1 / -1; text-align:center; color:#999; padding-top:40px;">No artworks selected. Use the side panel below to add artworks.</div>`;
      return this.renderTemplate(tpl, { works_grid_items: hasSelection ? gridItems : emptyMsg });
    }

    createSplitHomePreview() {
      const tpl = this.templates.home.split;
      const home = (this._compiled && this._compiled.homeContent) || {};
      const imgUrl = home.imageUrl;
      const splitStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
      return this.renderTemplate(tpl, {
        title: home.title || '',
        description: home.description || '',
        explore_text: home.explore_text || '',
        split_feature_style: splitStyle
      });
    }

    createHeroHomePreview() {
      const tpl = this.templates.home.hero;
      const home = (this._compiled && this._compiled.homeContent) || {};
      const imgUrl = home.imageUrl;
      const heroStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
      return this.renderTemplate(tpl, {
        title: home.title || '',
        subtitle: home.subtitle || '',
        hero_description: home.description || '',
        hero_style: heroStyle
      });
    }

    getCompiled(/* medium */) {
      // Return compiled home content only (no client-side defaults)
      return (this._compiled && this._compiled.homeContent) || {};
    }

    setupPreviewNavigation() {
      const navItems = document.querySelectorAll('.preview-nav-item');
      const previewContent = document.getElementById('preview-content');
      if (!previewContent) return;

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
      const prevBtn = document.getElementById('prev-work');
      const nextBtn = document.getElementById('next-work');
      this.removeExistingWorkListeners(prevBtn, nextBtn);
      this.setupNewWorkListeners(prevBtn, nextBtn);
    }

    removeExistingWorkListeners(prevBtn, nextBtn) {
      if (prevBtn) prevBtn.replaceWith(prevBtn.cloneNode(true));
      if (nextBtn) nextBtn.replaceWith(nextBtn.cloneNode(true));
    }

    setupNewWorkListeners(prevBtn, nextBtn) {
      const newPrev = document.getElementById('prev-work');
      const newNext = document.getElementById('next-work');
      if (newPrev) newPrev.addEventListener('click', (e) => {
        e.preventDefault();
        const selection = this.getCurrentFolderSelection();
        const n = selection.length;
        if (n > 0) {
          this.currentSelectedWorkIndex = (this.currentSelectedWorkIndex - 1 + n) % n;
          this.updateWorksPreview();
        }
      });
      if (newNext) newNext.addEventListener('click', (e) => {
        e.preventDefault();
        const selection = this.getCurrentFolderSelection();
        const n = selection.length;
        if (n > 0) {
          this.currentSelectedWorkIndex = (this.currentSelectedWorkIndex + 1) % n;
          this.updateWorksPreview();
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
      const selectedSections = this.getSelectedAboutSections();
      const aboutSectionsHTML = selectedSections.map(section => `
        <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
          <h3 contenteditable="true" style="font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${section.replace(/([A-Z])/g, ' $1').trim()}</h3>
          <div contenteditable="true" data-content-path="aboutContent.${section}" data-type="html" style="color: #666; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
            ${this.getAboutSectionContent(section)}
          </div>
        </div>
      `).join('');
      const tpl = this.templates.about.vertical;
      const compiledAbout = this._compiled && this._compiled.aboutContent;
      const imgUrl = compiledAbout && compiledAbout.imageUrl;
      const aboutPhotoStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
      const aboutTitle = (compiledAbout && compiledAbout.title) || '';
      const aboutBio = (compiledAbout && compiledAbout.bio) || '';
      return this.renderTemplate(tpl, { about_title: aboutTitle, about_bio: aboutBio, about_sections_html: aboutSectionsHTML, about_photo_style: aboutPhotoStyle });
    }

    createAboutSplitPreview() {
      const selectedSections = this.getSelectedAboutSections();
      const aboutSectionsHTML = selectedSections.map(section => `
        <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
          <h3 contenteditable="true" style="font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">${section.replace(/([A-Z])/g, ' $1').trim()}</h3>
          <div contenteditable="true" data-content-path="aboutContent.${section}" data-type="html" style="color: #666; line-height: 1.6; outline: none; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
            ${this.getAboutSectionContent(section)}
          </div>
        </div>
      `).join('');
      const tpl = this.templates.about.split;
      const compiledAbout = this._compiled && this._compiled.aboutContent;
      const imgUrl = compiledAbout && compiledAbout.imageUrl;
      const aboutPhotoStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
      const aboutTitle = (compiledAbout && compiledAbout.title) || '';
      const aboutBio = (compiledAbout && compiledAbout.bio) || '';
      return this.renderTemplate(tpl, { about_title: aboutTitle, about_bio: aboutBio, about_sections_html: aboutSectionsHTML, about_photo_style: aboutPhotoStyle });
    }

    getSelectedAboutSections() {
      // Combine compiled.aboutContent keys (excluding title/bio) with survey selections
      const compiledAbout = this._compiled && this._compiled.aboutContent;
      const compiledKeys = (compiledAbout && typeof compiledAbout === 'object')
        ? Object.keys(compiledAbout).filter(k => k !== 'title' && k !== 'bio' && compiledAbout[k])
        : [];
      const { aboutSections } = this.surveyData || {};
      const surveyKeys = aboutSections ? Object.keys(aboutSections).filter(section => aboutSections[section]) : [];
      const orderedUnion = [];
      const seen = new Set();
      compiledKeys.forEach(k => { if (!seen.has(k)) { seen.add(k); orderedUnion.push(k); } });
      surveyKeys.forEach(k => { if (!seen.has(k)) { seen.add(k); orderedUnion.push(k); } });
      return orderedUnion;
    }

    getAboutSectionContent(section) {
      const compiledAbout = this._compiled && this._compiled.aboutContent;
      if (compiledAbout && compiledAbout[section]) return compiledAbout[section];
      return '';
    }

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
      const tpl = this.templates.works.grid;
      const selection = this.getCurrentFolderSelection() || [];
      const hasSelection = selection.length > 0;
      const gridItems = selection.map(a => `
        <div style="background:#fff;">
          ${a.imageUrl ? `<img src="${a.imageUrl}" alt="${(a.title||'Untitled').replace(/"/g,'&quot;')}" style="display:block; width:100%; height:auto;">` : `
            <div style=\"display:flex; align-items:center; justify-content:center; padding:24px; color:#999; background:#f5f5f5;\">${(a.title||'Untitled')}</div>
          `}
          <div style="padding:6px 4px; font-size:0.9rem; text-align:center; color:#7a2ea6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.title || 'Untitled'}</div>
        </div>
      `).join('');
      const emptyMsg = `<div style="grid-column: 1 / -1; text-align:center; color:#999; padding-top:40px;">No artworks selected. Use the side panel to add artworks.</div>`;
      return this.renderTemplate(tpl, { works_grid_items: hasSelection ? gridItems : emptyMsg });
    }
    
    createWorksSinglePreview() {
      const selection = this.getCurrentFolderSelection();
      const n = selection.length;
      const idx = n > 0 ? (this.currentSelectedWorkIndex % n + n) % n : 0;
      const a = selection[idx];
      const hero = a
        ? (a.imageUrl
            ? `<img src="${a.imageUrl}" alt="${(a.title||'Untitled').replace(/"/g,'&quot;')}" style="display:block; max-width:100%; max-height:70vh; width:auto; height:auto; margin:0 auto;">`
            : `<div style=\"text-align:center; color:#999;\">${(a.title||'Untitled')}</div>`)
        : `<div style=\"text-align:center; color:#999;\">No artwork selected. Use the side panel below to add artworks.</div>`;
      const disableAttr = n <= 1 ? 'disabled' : '';

      return `
        <div style="position:relative; display:flex; align-items:center; justify-content:center; min-height:60vh;">
          <button id="prev-work" class="prev-work-btn" aria-label="Previous" style="position:absolute; left:24px; top:50%; transform:translateY(-50%); background:none; border:none; font-size:28px; color:#7a2ea6; cursor:pointer; line-height:1;" ${disableAttr}>&lt;</button>
          <div class="artwork-content" style="max-width: min(80vw, 960px);">
            ${hero}
            ${a ? `<div style=\"text-align:center; margin-top:12px; color:#7a2ea6; font-size:0.9rem;\">${a.title || 'Untitled'}</div>` : ''}
          </div>
          <button id="next-work" class="next-work-btn" aria-label="Next" style="position:absolute; right:24px; top:50%; transform:translateY(-50%); background:none; border:none; font-size:28px; color:#7a2ea6; cursor:pointer; line-height:1;" ${disableAttr}>&gt;</button>
        </div>
      `;
    }

    // Editable + Save integration moved to public/js/preview-editable.js

    createStyledPreviewHTML() {
      const { medium, logo, style } = this.surveyData;
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
  }

  // Expose globally
  window.PreviewRenderer = PreviewRenderer;
})();
