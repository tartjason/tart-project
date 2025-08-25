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
      input.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        // Client-side size guard (10MB limit to match server)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          try {
            const toast = document.createElement('div');
            toast.textContent = 'Image is too large (max 10MB). Please choose a smaller file.';
            toast.style.cssText = 'position:fixed; top:16px; right:16px; background:#ffefef; color:#a00; border:1px solid #f5c2c7; padding:8px 12px; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.1); z-index:9999; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
            document.body.appendChild(toast);
            setTimeout(() => { try { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); } catch {} }, 2500);
          } catch {}
          return;
        }

        const element = document.getElementById(elementId);
        // Capture previous DOM state to restore on failure
        let prevStyleAttr = '';
        let prevInnerHTML = '';
        let prevSibDisplay = '';
        try {
          if (element) {
            prevStyleAttr = element.getAttribute('style') || '';
            prevInnerHTML = element.innerHTML;
            const sib0 = element.nextElementSibling;
            if (sib0) prevSibDisplay = sib0.style.display || '';
          }
        } catch {}
        // Prepare loading overlay + disable interactions
        let overlay = null;
        let prevPointerEvents = '';
        try {
          if (element) {
            const pos = (element.style.position || '').trim();
            if (!pos || pos === 'static') element.style.position = 'relative';
            overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute; inset:0; background:rgba(255,255,255,0.65); display:flex; align-items:center; justify-content:center; z-index:5; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#333; font-size:14px;';
            overlay.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><div style="width:16px;height:16px;border:2px solid #999;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div><span>Uploading…</span></div>';
            const spinnerStyle = document.createElement('style');
            spinnerStyle.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
            overlay.appendChild(spinnerStyle);
            element.appendChild(overlay);
            prevPointerEvents = element.style.pointerEvents;
            element.style.pointerEvents = 'none';
          }
        } catch {}

        // Immediate local preview while uploading
        try {
          const localReader = new FileReader();
          localReader.onload = (evt) => {
            if (!element) return;
            element.style.backgroundImage = `url(${evt.target.result})`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
            element.style.backgroundRepeat = 'no-repeat';
            element.innerHTML = '';
            // Hide any sibling caption like "Click to upload image/photo"
            try {
              const sib = element.nextElementSibling;
              if (sib && sib.tagName === 'P') sib.style.display = 'none';
            } catch {}
            if (elementId === 'hero-image' || (typeof elementId === 'string' && elementId.indexOf('hero-home-image') === 0)) {
              const overlay = document.createElement('div');
              overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);pointer-events:none;';
              element.appendChild(overlay);
            }
          };
          localReader.readAsDataURL(file);
        } catch {}

        // Upload to backend -> S3
        try {
          const token = localStorage.getItem('token');
          const fd = new FormData();
          fd.append('image', file, file.name || 'image');
          const res = await fetch('/api/uploads/site-image', {
            method: 'POST',
            headers: { 'x-auth-token': token || '' },
            body: fd,
            credentials: 'include'
          });
          if (!res.ok) {
            const raw = await res.text().catch(() => 'Upload failed');
            let serverMsg = '';
            try { const j = JSON.parse(raw); serverMsg = j && (j.msg || j.error) || ''; } catch {}
            const err = new Error(serverMsg || raw || 'Upload failed');
            try { err.status = res.status; } catch {}
            throw err;
          }
          const data = await res.json();
          const url = (data && (data.url || data.imageUrl)) || '';
          if (!url) throw new Error('Upload succeeded but no URL returned');

          // Apply final URL preview (ensures CDN/S3 URL in DOM)
          if (element) {
            element.style.backgroundImage = `url(${url})`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
            element.style.backgroundRepeat = 'no-repeat';
            element.innerHTML = '';
            // Hide any sibling caption like "Click to upload image/photo"
            try {
              const sib = element.nextElementSibling;
              if (sib && sib.tagName === 'P') sib.style.display = 'none';
            } catch {}
            if (elementId === 'hero-image' || (typeof elementId === 'string' && elementId.indexOf('hero-home-image') === 0)) {
              const overlay = document.createElement('div');
              overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);pointer-events:none;';
              element.appendChild(overlay);
            }
          }

          // Persist into compiled + mark dirty and auto-save
          const contentPath = element && element.getAttribute('data-content-path') ? element.getAttribute('data-content-path').trim() : '';
          if (contentPath) {
            try {
              if (!self._compiled) self._compiled = {};
              if (typeof self.setValueAtPath === 'function') self.setValueAtPath(self._compiled, contentPath, url);
              if (!self._dirty) self._dirty = {};
              self._dirty[contentPath] = { type: 'imageUrl', value: url };
              if (typeof self.updateSaveButtonState === 'function') self.updateSaveButtonState();
              if (typeof self.handleSaveClick === 'function') await self.handleSaveClick();
            } catch (persistErr) {
              console.error('Failed to persist image URL to state:', persistErr);
            }
          }
        } catch (err) {
          console.error('Image upload failed:', err);
          // Specific message for oversized file
          const tooLarge = (err && (String(err.message || '').toLowerCase().includes('file too large') || String(err.status || '') === '413'));
          const msg = tooLarge ? 'Image is too large (max 10MB). Please choose a smaller file.' : 'Image upload failed. Please try again.';
          try {
            const toast = document.createElement('div');
            toast.textContent = msg;
            toast.style.cssText = 'position:fixed; top:16px; right:16px; background:#ffefef; color:#a00; border:1px solid #f5c2c7; padding:8px 12px; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.1); z-index:9999; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
            document.body.appendChild(toast);
            setTimeout(() => { try { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); } catch {} }, 2500);
          } catch {}
          // Restore previous state so the old image stays
          try {
            if (element) {
              element.setAttribute('style', prevStyleAttr || '');
              element.innerHTML = prevInnerHTML || '';
              const sib = element.nextElementSibling;
              if (sib) sib.style.display = prevSibDisplay || '';
            }
          } catch {}
        }
        finally {
          try {
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (element) element.style.pointerEvents = prevPointerEvents || '';
          } catch {}
          try {
            // Clean up the temporary input element
            input.value = '';
            if (input && input.parentNode) input.parentNode.removeChild(input);
          } catch {}
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
      const noArtworks = !Array.isArray(artworks) || artworks.length === 0;
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
        <div style="color:#666; font-size:12px; margin-bottom:10px;">${noArtworks ? 'No artworks yet. Click the + tile to upload your first artwork.' : 'Select works for this subpage from your TART gallery. Click tiles to add/remove.'}</div>
        <div class="side-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:12px;"></div>
      `;
      const grid = sideContainer.querySelector('.side-grid');
      (Array.isArray(artworks) ? artworks : []).forEach(a => {
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

      // Append upload tile at the end (does not participate in selection logic)
      const uploadTile = document.createElement('a');
      uploadTile.className = 'side-upload-tile';
      uploadTile.href = '/upload.html?fromPreview=1';
      uploadTile.style.cssText = 'display:block; text-decoration:none; border:2px dashed #ccc; border-radius:10px; background:#fff; color:#666;';
      uploadTile.innerHTML = `
        <div style="width:100%; padding-top:100%; position:relative;">
          <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:6px; color:#999;">
            <div style="font-size:42px; line-height:1;">+</div>
            <div style="font-size:13px;">Upload</div>
          </div>
        </div>
      `;
      uploadTile.addEventListener('mouseenter', () => { uploadTile.style.borderColor = '#999'; });
      uploadTile.addEventListener('mouseleave', () => { uploadTile.style.borderColor = '#ccc'; });
      uploadTile.addEventListener('click', () => {
        try { sessionStorage.setItem('fromPreviewUpload', '1'); } catch (_) {}
      });
      grid.appendChild(uploadTile);

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
