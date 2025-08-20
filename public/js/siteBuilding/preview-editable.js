//Editable + Save integration

(function(){
  if (!window.PreviewRenderer) return;
  const P = window.PreviewRenderer.prototype;

  // Lightweight toast helper for success/error messages
  function showToast(msg, opts) {
    try {
      const existing = document.querySelector('.preview-toast');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      const toast = document.createElement('div');
      toast.className = 'preview-toast';
      const isError = opts && opts.type === 'error';
      toast.textContent = msg || '';
      toast.style.cssText = `position:fixed; top:16px; right:16px; background:${isError ? '#ffefef' : '#eef9f1'}; color:${isError ? '#a00' : '#245c2f'}; border:1px solid ${isError ? '#f5c2c7' : '#cde7d8'}; padding:8px 12px; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.1); z-index:9999; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;`;
      document.body.appendChild(toast);
      setTimeout(() => { try { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); } catch {} }, (opts && opts.durationMs) || 1600);
    } catch {}
  }


  P.setupSaveControls = function() {
    this._saveBtn = document.getElementById('preview-save-btn');
    this._saveStatus = document.getElementById('preview-save-status');
    if (!this._saveBtn) return;
    this._saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.handleSaveClick();
    });
    this.updateSaveButtonState();
  };

  P.updateSaveButtonState = function() {
    const dirtyCount = Object.keys(this._dirty || {}).length;
    const hasDirty = dirtyCount > 0;
    if (this._saveBtn) {
      this._saveBtn.disabled = !hasDirty || this._isSaving;
      this._saveBtn.style.cursor = (!hasDirty || this._isSaving) ? 'not-allowed' : 'pointer';
      try {
        if (this._isSaving) this._saveBtn.textContent = 'Saving…';
        else if (hasDirty) this._saveBtn.textContent = `Save (${dirtyCount})`;
        else this._saveBtn.textContent = 'Save';
      } catch {}
    }
    if (this._saveStatus) {
      if (this._isSaving) this._saveStatus.textContent = 'Saving...';
      else if (hasDirty) this._saveStatus.textContent = 'Unsaved changes';
      else this._saveStatus.textContent = 'All changes saved';
    }
  };

  P.attachEditableListeners = function(root) {
    try {
      const scope = root && root.querySelectorAll ? root : document;
      // Make any element with data-content-path editable, except imageUrl types
      const candidates = scope.querySelectorAll('[data-content-path]');
      const elements = Array.from(candidates).filter((el) => {
        const rawType = el.getAttribute('data-type') || el.getAttribute('data-content-type') || 'text';
        const type = String(rawType).toLowerCase();
        if (type === 'imageurl') return false;
        if (!el.hasAttribute('contenteditable')) el.setAttribute('contenteditable', 'true');
        return true;
      });
      if (!elements || elements.length === 0) return;
      elements.forEach((el) => {
        const onChange = () => {
          const path = el.getAttribute('data-content-path');
          if (!path) return;
          const rawType = el.getAttribute('data-type') || el.getAttribute('data-content-type') || 'text';
          const type = String(rawType).toLowerCase();
          const value = type === 'html' ? el.innerHTML : el.textContent;
          // Update local compiled for instant preview
          if (!this._compiled) this._compiled = {};
          this.setValueAtPath(this._compiled, path, value);
          // Track dirty
          this._dirty[path] = { type, value };
          this.updateSaveButtonState();
        };
        el.removeEventListener('input', el.__editableInputHandler);
        el.removeEventListener('blur', el.__editableBlurHandler);
        el.__editableInputHandler = onChange;
        el.__editableBlurHandler = onChange;
        el.addEventListener('input', onChange);
        el.addEventListener('blur', onChange);
      });
    } catch (err) {
      console.error('attachEditableListeners error:', err);
    }
  };

  P.setValueAtPath = function(obj, path, value) {
    if (!obj || !path) return;
    const parts = [];
    path.split('.').forEach((seg) => {
      // Support bracket indices like workExperience[0]
      const re = /([^\[]+)(\[(\d+)\])?/g;
      let m;
      while ((m = re.exec(seg)) !== null) {
        const prop = m[1];
        if (prop) parts.push(prop);
        if (m[3] != null) parts.push(Number(m[3]));
      }
    });
    let cursor = obj;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const isLast = i === parts.length - 1;
      if (typeof key === 'number') {
        // Ensure current cursor is an array
        if (!Array.isArray(cursor)) return; // invalid structure; bail
        if (isLast) {
          cursor[key] = value;
          return;
        } else {
          const nextKey = parts[i + 1];
          if (cursor[key] == null) cursor[key] = (typeof nextKey === 'number') ? [] : {};
          cursor = cursor[key];
        }
      } else {
        if (isLast) {
          cursor[key] = value;
          return;
        } else {
          const nextKey = parts[i + 1];
          if (cursor[key] == null || typeof cursor[key] !== 'object') {
            cursor[key] = (typeof nextKey === 'number') ? [] : {};
          }
          cursor = cursor[key];
        }
      }
    }
  };

  P.handleSaveClick = async function() {
    if (this._isSaving) return;
    // Snapshot dirty at click time to avoid losing edits made during the save
    const dirtySnapshot = { ...(this._dirty || {}) };
    const updates = Object.entries(dirtySnapshot).map(([path, { type, value }]) => ({ path, type, value }));
    if (updates.length === 0) return;
    this._isSaving = true;
    this.updateSaveButtonState();

    try {
      const token = localStorage.getItem('token');
      const payload = this._version > 0 ? { version: this._version, updates } : { updates };
      const res = await fetch('/api/website-state/update-content-batch?compile=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        // Handle version conflict explicitly
        if (res.status === 409) {
          let body = {};
          try { body = await res.json(); } catch {}
          if (typeof body.serverVersion === 'number') {
            this._version = body.serverVersion;
          }
          if (this._saveStatus) this._saveStatus.textContent = 'Version conflict. Review and Save again';
          showToast('Version conflict. Please review and Save again.', { type: 'error', durationMs: 2200 });
          return; // keep dirty so user can retry
        }
        let msg = 'Save failed';
        try {
          const txt = await res.text();
          msg = (txt && txt.trim()) || msg;
        } catch {}
        throw new Error(msg || 'Save failed');
      }
      const data = await res.json();
      if (data && data.compiled) this._compiled = data.compiled;
      if (typeof data.version === 'number') this._version = data.version;
      if (this.survey && data.compiledJsonPath) this.survey.compiledJsonPath = data.compiledJsonPath;
      // Clear only the entries we sent that still match current values
      const sentPaths = Object.keys(dirtySnapshot);
      sentPaths.forEach((p) => {
        const snap = dirtySnapshot[p];
        const cur = this._dirty && this._dirty[p];
        if (cur && snap && cur.type === snap.type && cur.value === snap.value) {
          delete this._dirty[p];
        }
      });
      const page = this.currentPreviewPage || 'home';
      if (page === 'home') this.updateHomePreview();
      else if (page === 'about') this.updateAboutPreview();
      else if (page === 'works') this.updateWorksPreview();
      else {
        // default to re-applying bindings to whatever is there
        const previewContent = document.getElementById('preview-content');
        if (previewContent) {
          this.applyDataStyles(previewContent);
          this.applyDataBindings(previewContent);
          this.attachEditableListeners(previewContent);
        }
      }
      // Indicate success briefly
      if (this._saveStatus) {
        this._saveStatus.textContent = 'Saved';
        try {
          setTimeout(() => {
            if (Object.keys(this._dirty || {}).length === 0 && !this._isSaving) {
              this._saveStatus.textContent = 'All changes saved';
            } else {
              this._saveStatus.textContent = 'Unsaved changes';
            }
          }, 1200);
        } catch {}
      }
      if (this._saveBtn) {
        try {
          this._saveBtn.textContent = 'Saved';
          setTimeout(() => { this.updateSaveButtonState(); }, 800);
        } catch {}
      }
      showToast('Saved', { type: 'success', durationMs: 1200 });
    } catch (err) {
      console.error('Save failed:', err);
      const emsg = (err && err.message) ? String(err.message) : 'Save failed. Try again';
      if (this._saveStatus) this._saveStatus.textContent = emsg;
      showToast(emsg, { type: 'error', durationMs: 2400 });
    } finally {
      this._isSaving = false;
      this.updateSaveButtonState();
    }
  };
})();
