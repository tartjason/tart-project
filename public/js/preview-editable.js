//Editable + Save integration

(function(){
  if (!window.PreviewRenderer) return;
  const P = window.PreviewRenderer.prototype;


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
    const hasDirty = Object.keys(this._dirty || {}).length > 0;
    if (this._saveBtn) {
      this._saveBtn.disabled = !hasDirty || this._isSaving;
      this._saveBtn.style.cursor = (!hasDirty || this._isSaving) ? 'not-allowed' : 'pointer';
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
      const elements = scope.querySelectorAll('[contenteditable][data-content-path]');
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
      const m = seg.match(/([^\[]+)(\[(\d+)\])?/);
      if (!m) return parts.push(seg);
      parts.push(m[1]);
      if (m[3] != null) parts.push(Number(m[3]));
    });
    let cursor = obj;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const last = i === parts.length - 1;
      if (last) {
        if (typeof key === 'number') return; // we do not support arrays yet
        cursor[key] = value;
      } else {
        const nextKey = parts[i + 1];
        if (typeof key === 'number') return; // arrays not supported in step 1
        if (cursor[key] == null || typeof cursor[key] !== 'object') {
          cursor[key] = typeof nextKey === 'number' ? [] : {};
        }
        cursor = cursor[key];
      }
    }
  };

  P.handleSaveClick = async function() {
    if (this._isSaving) return;
    const updates = Object.entries(this._dirty || {}).map(([path, { type, value }]) => ({ path, type, value }));
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
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Save failed');
      }
      const data = await res.json();
      if (data && data.compiled) this._compiled = data.compiled;
      if (typeof data.version === 'number') this._version = data.version;
      if (this.survey && data.compiledJsonPath) this.survey.compiledJsonPath = data.compiledJsonPath;
      // Clear dirty and re-render current page
      this._dirty = {};
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
    } catch (err) {
      console.error('Save failed:', err);
      if (this._saveStatus) this._saveStatus.textContent = 'Save failed. Try again';
    } finally {
      this._isSaving = false;
      this.updateSaveButtonState();
    }
  };
})();
