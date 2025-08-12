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
      this.mediumPlaceholders = null;

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
            this.mediumPlaceholders = null;
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
          const res = await fetch(compiledPath, { credentials: 'same-origin' });
          if (res.ok) {
            const compiled = await res.json();
            this._compiled = compiled;
            if (compiled && compiled.surveyData && this.surveyData) {
              // Merge minimally to preserve client-side tweaks
              this.surveyData = { ...this.surveyData, ...compiled.surveyData };
            }
            this.mediumPlaceholders = (compiled && compiled.mediumPlaceholders) || null;
          }
        } catch (e) {
          console.warn('Failed to fetch compiled JSON, falling back to local data:', e);
        }
      }

      // Generate preview
      const previewHTML = this.createPreviewHTML();
      if (previewFrame) previewFrame.innerHTML = previewHTML;
      this.applyDataStyles(previewFrame);

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
      window.uploadImage = (elementId) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const element = document.getElementById(elementId);
              if (element) {
                element.style.backgroundImage = `url(${evt.target.result})`;
                element.style.backgroundSize = 'cover';
                element.style.backgroundPosition = 'center';
                element.style.backgroundRepeat = 'no-repeat';
                element.innerHTML = '';
                if (elementId === 'hero-image') {
                  const overlay = document.createElement('div');
                  overlay.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);pointer-events:none;`;
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
        if (self.currentPreviewPage !== 'home' && !self.currentWorksFilter) {
          sideContainer.innerHTML = '<div style="color:#666; padding:8px 0;">Choose a year/theme from Works to start selecting artworks.</div>';
          return;
        }
        sideContainer.innerHTML = '<div style="color:#666;">Loading your gallery...</div>';
        const token = localStorage.getItem('token');
        fetch('/api/artworks/user', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-auth-token': token || '' },
          credentials: 'include'
        })
          .then(response => {
            if (!response.ok) throw new Error('Failed to fetch user artworks');
            return response.json();
          })
          .then(artworks => {
            console.log('User artworks fetched:', artworks);
            window.renderSideGallery(artworks);
          })
          .catch(error => {
            console.error('Error fetching user artworks:', error);
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
        const folderKey = self.currentWorksFilter;
        const isHome = self.currentPreviewPage === 'home';
        const selectedArr = isHome
          ? (Array.isArray(self.surveyData.homeSelections) ? self.surveyData.homeSelections : [])
          : ((self.surveyData.worksSelections && self.surveyData.worksSelections[folderKey]) || []);
        const selectedIds = new Set((selectedArr || []).map(a => a && a._id));

        // Build legacy-style header + description + responsive grid
        sideContainer.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="color:#555; font-weight:600;">Your TART gallery</div>
            <div style="color:#999; font-size:0.9rem;">Layout: <span id="works-side-layout-label">${(self.surveyData.layouts && self.surveyData.layouts.works) === 'single' ? 'single focus' : 'grid'}</span></div>
          </div>
          <div style="color:#666; font-size:12px; margin-bottom:10px;">Select works for this subpage from your TART gallery. Click tiles to add/remove.</div>
          <div class="side-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:12px;"></div>
        `;
        const grid = sideContainer.querySelector('.side-grid');
        artworks.forEach(a => {
          const id = a && a._id;
          const isSel = !!(id && selectedIds.has(id));
          const tile = document.createElement('div');
          tile.className = 'side-artwork-tile';
          tile.dataset.id = id || '';
          tile.style.cssText = `position:relative; border:2px solid ${isSel ? '#007bff' : '#eee'}; border-radius:10px; overflow:hidden; cursor:pointer; background:#fff;`;
          tile.innerHTML = `
            <div class="badge" style="position:absolute; top:6px; left:6px; z-index:2; background:${isSel ? '#007bff' : 'rgba(255,255,255,0.9)'}; color:${isSel ? '#fff' : '#333'}; font-size:12px; padding:2px 6px; border-radius:6px;">${isSel ? 'Selected' : 'Select'}</div>
            <div style="width:100%; padding-top:100%; background:#f5f5f5; position:relative;">
              ${a && a.imageUrl ? `<img src="${a.imageUrl}" alt="${((a.title||'Untitled')+'').replace(/"/g,'&quot;')}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">` : `
                <div style=\"position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#999;\">${(a && a.title) || 'Untitled'}</div>
              `}
            </div>
          `;
          grid.appendChild(tile);
        });

        // Delegate click handling with quick UI update
        grid.addEventListener('click', (e) => {
          const tile = e.target.closest('.side-artwork-tile');
          if (!tile) return;
          const id = tile.dataset.id;
          if (!id) return;
          const clicked = artworks.find(x => x && x._id === id);
          if (!clicked) return;

          if (self.currentPreviewPage === 'home') {
            const currentArr = Array.isArray(self.surveyData.homeSelections) ? self.surveyData.homeSelections : [];
            const set = new Set(currentArr.map(x => x && x._id));
            if (set.has(id)) set.delete(id); else set.add(id);
            const ordered = artworks.filter(x => x && x._id && set.has(x._id));
            self.surveyData.homeSelections = ordered;
            self.currentSelectedWorkIndex = 0;
          } else {
            const currentArr = ((self.surveyData.worksSelections && self.surveyData.worksSelections[self.currentWorksFilter]) || []);
            const set = new Set(currentArr.map(x => x && x._id));
            if (set.has(id)) set.delete(id); else set.add(id);
            const ordered = artworks.filter(x => x && x._id && set.has(x._id));
            if (!self.surveyData.worksSelections) self.surveyData.worksSelections = {};
            self.surveyData.worksSelections[self.currentWorksFilter] = ordered;
            self.currentSelectedWorkIndex = 0;
          }

          // Quick badge/border UI update
          const isNowSelected = (self.currentPreviewPage === 'home')
            ? (self.surveyData.homeSelections || []).some(x => x && x._id === id)
            : (((self.surveyData.worksSelections && self.surveyData.worksSelections[self.currentWorksFilter]) || []).some(x => x && x._id === id));
          const badge = tile.querySelector('.badge');
          tile.style.borderColor = isNowSelected ? '#007bff' : '#eee';
          if (badge) {
            badge.textContent = isNowSelected ? 'Selected' : 'Select';
            badge.style.background = isNowSelected ? '#007bff' : 'rgba(255,255,255,0.9)';
            badge.style.color = isNowSelected ? '#fff' : '#333';
          }

          // Refresh preview to reflect selection changes
          if (self.currentPreviewPage === 'home') self.updateHomePreview();
          else self.updateWorksPreview();
        });
      };
    }

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
      if (this.mediumPlaceholders) return this.mediumPlaceholders;
      const homeMap = (window.ExampleContent && window.ExampleContent.home) || {};
      return homeMap[medium] || homeMap['multi-medium'] || {};
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
            const sidePanel = document.getElementById('works-side-panel');
            const homeLayout = (this.surveyData.layouts && this.surveyData.layouts.homepage) || 'grid';
            if (sidePanel) sidePanel.style.display = homeLayout === 'grid' ? 'block' : 'none';
            if (homeLayout === 'grid' && window.loadSideGallery) window.loadSideGallery();
          } else if (page === 'about') {
            previewContent.innerHTML = this.createAboutPreview();
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'none';
          } else if (page === 'works') {
            previewContent.innerHTML = this.createWorksPreview();
            this.setupWorkNavigation();
            this.ensureExternalWorksSidePanel();
            const sidePanel = document.getElementById('works-side-panel');
            if (sidePanel) sidePanel.style.display = 'block';
            if (window.loadSideGallery) window.loadSideGallery();
          } else {
            previewContent.innerHTML = `<div style="text-align: center; padding: 60px 0;"><h2>${page.charAt(0).toUpperCase() + page.slice(1)} Page</h2><p style="color: #666;">Content coming soon.</p></div>`;
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
      // Keep side panel behavior consistent: only show on Home when layout is grid
      const sidePanel = document.getElementById('works-side-panel');
      const homeLayout = (this.surveyData.layouts && this.surveyData.layouts.homepage) || 'grid';
      if (sidePanel) sidePanel.style.display = homeLayout === 'grid' ? 'block' : 'none';
      if (homeLayout === 'grid' && window.loadSideGallery) window.loadSideGallery();
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
      const aboutMap = (window.ExampleContent && window.ExampleContent.about) || {};
      return aboutMap[section] || '<p>Content for this section will be customized based on your information.</p>';
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

