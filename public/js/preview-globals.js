//Global Helpers for preview render//

(function(){
  if (!window.PreviewRenderer) return;
  const P = window.PreviewRenderer.prototype;

  P.setupGlobalFunctions = function() {
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
              if (elementId === 'hero-image' || (typeof elementId === 'string' && elementId.indexOf('hero-home-image') === 0)) {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);pointer-events:none;';
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
          try { console.log('User artworks fetched:', artworks); } catch {}
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
            ${a && a.imageUrl ? `<img src="${a.imageUrl}" alt="${(((a.title||'Untitled')+'').replace(/"/g,'&quot;'))}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">` : `
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
          // Mark homeSelections as dirty so user can Save
          if (!self._dirty) self._dirty = {};
          self._dirty['surveyData.homeSelections'] = { type: 'json', value: self.surveyData.homeSelections };
          if (typeof self.updateSaveButtonState === 'function') self.updateSaveButtonState();
        } else {
          const currentArr = ((self.surveyData.worksSelections && self.surveyData.worksSelections[self.currentWorksFilter]) || []);
          const set = new Set(currentArr.map(x => x && x._id));
          if (set.has(id)) set.delete(id); else set.add(id);
          const ordered = artworks.filter(x => x && x._id && set.has(x._id));
          if (!self.surveyData.worksSelections) self.surveyData.worksSelections = {};
          self.surveyData.worksSelections[self.currentWorksFilter] = ordered;
          self.currentSelectedWorkIndex = 0;
          // Mark worksSelections as dirty so user can Save
          if (!self._dirty) self._dirty = {};
          self._dirty['surveyData.worksSelections'] = { type: 'json', value: self.surveyData.worksSelections };
          if (typeof self.updateSaveButtonState === 'function') self.updateSaveButtonState();
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
  };
})();
