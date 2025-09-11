(function(){
  function qs(sel){ return document.querySelector(sel); }
  function show(el){ if(!el) return; el.hidden = false; el.style.display = ""; }
  function hide(el){ if(!el) return; el.hidden = true; el.style.display = "none"; }
  function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }
  function authFetch(url, opts){
    opts = opts || {};
    const headers = opts.headers || {};
    headers['x-auth-token'] = localStorage.getItem('token') || '';
    opts.headers = headers;
    return fetch(url, opts);
  }

  let poemEditor = null;
  let artworkId = null;
  let loadedArtwork = null;
  let selectedBgColor = '#f4f4f4';

  function parseId(){
    const p = new URLSearchParams(window.location.search);
    const id = p.get('id');
    if (!id) throw new Error('Missing artwork id');
    return id;
  }

  function setMode(medium){
    const uploadSection = qs('#upload-section');
    const poetrySection = qs('#poetry-section');
    const metaSection = qs('#meta-section');
    const ambient = qs('#ambient-bg');
    const overlay = qs('#upload-overlay');
    const poetryBgPicker = qs('#poetry-bg-picker');
    const poetryBgColor = qs('#poetry-bg-color');

    if (document && document.body) document.body.classList.toggle('poetry-mode', medium === 'poetry');

    const metrics2d = qs('#metrics-2d');
    const metrics3d = qs('#metrics-3d');
    const metricsSlide = qs('#meta-carousel .slides [data-slide="2"]');

    if (medium === 'poetry') {
      hide(uploadSection);
      show(poetrySection);
      show(metaSection);
      if (ambient) {
        ambient.style.backgroundImage = '';
        ambient.classList.remove('on');
        // Apply selected background color in poetry mode
        ambient.style.backgroundColor = selectedBgColor || '#f4f4f4';
      }
      if (poetryBgPicker) { poetryBgPicker.hidden = false; poetryBgPicker.style.display = ''; }
      if (overlay) { overlay.style.opacity = ''; overlay.style.display = ''; }
      if (!poemEditor && window.PoemEditor && qs('#poem-editor')) {
        poemEditor = new window.PoemEditor(qs('#poem-editor'), { useFloatingToolbar: false });
      }
      if (metricsSlide) metricsSlide.style.display = '';
      if (metrics2d) metrics2d.style.display = 'none';
      if (metrics3d) metrics3d.style.display = 'none';
      // Wire color input (idempotent)
      if (poetryBgColor && !poetryBgColor.__wired) {
        poetryBgColor.__wired = true;
        on(poetryBgColor, 'input', () => {
          const v = String(poetryBgColor.value || '').trim();
          const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
          selectedBgColor = isHex ? v : '#f4f4f4';
          if (ambient) {
            ambient.style.backgroundImage = '';
            ambient.style.backgroundColor = selectedBgColor;
          }
        });
      }
    } else {
      show(uploadSection);
      hide(poetrySection);
      show(metaSection);
      if (poetryBgPicker) { poetryBgPicker.hidden = true; poetryBgPicker.style.display = 'none'; }
      // Toggle metrics variant
      if (metricsSlide) metricsSlide.style.display = '';
      if (["photography","painting","oil-painting","ink-painting","colored-pencil","sketch"].includes(medium)){
        if (metrics2d) { metrics2d.hidden = false; metrics2d.style.display = ''; }
        if (metrics3d) { metrics3d.hidden = true; metrics3d.style.display = 'none'; }
      } else if (["industrial-design","furniture"].includes(medium)){
        if (metrics2d) { metrics2d.hidden = true; metrics2d.style.display = 'none'; }
        if (metrics3d) { metrics3d.hidden = false; metrics3d.style.display = ''; }
      } else {
        if (metrics2d) { metrics2d.hidden = true; metrics2d.style.display = 'none'; }
        if (metrics3d) { metrics3d.hidden = true; metrics3d.style.display = 'none'; }
      }
    }
  }

  function prefillForm(art){
    const title = qs('#artwork-title');
    const desc = qs('#artwork-description');
    const country = qs('#artwork-country');
    const city = qs('#artwork-city');
    const mediumSelect = qs('#medium-select');
    const ambient = qs('#ambient-bg');
    const uploadSection = qs('#upload-section');
    const overlay = qs('#upload-overlay');

    if (title) title.value = art.title || '';
    if (desc) desc.value = art.description || '';
    if (country) country.value = art.locationCountry || '';
    if (city) city.value = art.locationCity || '';

    if (mediumSelect) {
      mediumSelect.value = art.medium || 'photography';
      setMode(mediumSelect.value);
    }

    if (art.medium !== 'poetry') {
      if (art.imageUrl) {
        if (ambient) { ambient.style.backgroundImage = `url(${art.imageUrl})`; ambient.classList.add('on'); }
        if (uploadSection) {
          uploadSection.classList.add('has-image');
          let preview = uploadSection.querySelector('#artwork-preview');
          if (!preview) {
            preview = document.createElement('img');
            preview.id = 'artwork-preview';
            preview.alt = 'Artwork preview';
            uploadSection.appendChild(preview);
          }
          preview.src = art.imageUrl;
        }
        if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
      }
      // Prefill metrics
      if (art.metrics2d) {
        const w = qs('#artwork-width');
        const h = qs('#artwork-height');
        const u = qs('#artwork-units');
        if (w) w.value = art.metrics2d.width ?? '';
        if (h) h.value = art.metrics2d.height ?? '';
        if (u) u.value = art.metrics2d.units || 'cm';
      }
      if (art.metrics3d) {
        const L = qs('#artwork-length');
        const W = qs('#artwork-width-3d');
        const H = qs('#artwork-height-3d');
        const U = qs('#artwork-units-3d');
        if (L) L.value = art.metrics3d.length ?? '';
        if (W) W.value = art.metrics3d.width ?? '';
        if (H) H.value = art.metrics3d.height ?? '';
        if (U) U.value = art.metrics3d.units || 'cm';
      }
    } else {
      // Prefill poem
      if (art.poem && Array.isArray(art.poem.lines)) {
        if (!poemEditor && window.PoemEditor && qs('#poem-editor')) {
          poemEditor = new window.PoemEditor(qs('#poem-editor'), { useFloatingToolbar: false });
        }
        if (poemEditor) {
          if (typeof poemEditor.loadFromJson === 'function') {
            poemEditor.loadFromJson(art.poem);
          } else if (typeof poemEditor.setLines === 'function') {
            poemEditor.setLines(art.poem.lines);
          } else if (typeof poemEditor.loadFromText === 'function') {
            const plain = art.poem.lines.map(l => (l && l.html) ? l.html.replace(/<[^>]+>/g,'') : '').join('\n');
            poemEditor.loadFromText(plain);
          }
        }
      }
      // Prefill poetry background color and apply to ambient
      const poetryBgPicker = qs('#poetry-bg-picker');
      const poetryBgColor = qs('#poetry-bg-color');
      selectedBgColor = art.backgroundColor || '#f4f4f4';
      if (poetryBgColor) poetryBgColor.value = selectedBgColor;
      if (poetryBgPicker) { poetryBgPicker.hidden = false; poetryBgPicker.style.display = ''; }
      if (ambient) {
        ambient.style.backgroundImage = '';
        ambient.style.backgroundColor = selectedBgColor;
      }
    }

    // Source
    const aiHuman = qs('#ai-human');
    const aiAI = qs('#ai-ai');
    if (aiHuman && aiAI) {
      if (art.source === 'ai') aiAI.checked = true; else aiHuman.checked = true;
    }
  }

  function collectCommonForm(){
    const title = qs('#artwork-title')?.value?.trim() || '';
    const description = qs('#artwork-description')?.value?.trim() || '';
    const medium = qs('#medium-select')?.value || '';
    const locationCountry = qs('#artwork-country')?.value?.trim() || '';
    const locationCity = qs('#artwork-city')?.value?.trim() || '';
    const aiHuman = qs('#ai-human');
    const aiAI = qs('#ai-ai');
    const source = aiAI && aiAI.checked ? 'ai' : 'human';
    return { title, description, medium, locationCountry, locationCity, source };
  }

  async function save(){
    const saveBtn = qs('#save-btn');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const common = collectCommonForm();
      if (!common.title) { throw new Error('Title is required'); }
      if (!common.medium) { throw new Error('Medium is required'); }

      if (common.medium === 'poetry') {
        // Build JSON body with poem
        let lines = [];
        if (poemEditor) {
          if (typeof poemEditor.getLines === 'function') lines = poemEditor.getLines();
          else if (typeof poemEditor.exportLines === 'function') lines = poemEditor.exportLines();
          else if (typeof poemEditor.getText === 'function') {
            const t = poemEditor.getText();
            lines = String(t || '').split(/\n/).map(s => ({ html: s }));
          }
        }
        const body = Object.assign({}, common, { poem: { lines }, backgroundColor: selectedBgColor });
        const res = await authFetch(`/api/artworks/${encodeURIComponent(artworkId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const err = await res.json().catch(()=>({ msg: 'Failed to update artwork' }));
          throw new Error(err.msg || err.message || 'Failed to update artwork');
        }
      } else {
        // Non-poetry: optionally with image file
        const file = qs('#artwork-file')?.files?.[0];
        if (file) {
          const fd = new FormData();
          fd.append('title', common.title);
          fd.append('description', common.description);
          fd.append('medium', common.medium);
          fd.append('locationCountry', common.locationCountry);
          fd.append('locationCity', common.locationCity);
          fd.append('source', common.source);
          // metrics
          if (["photography","painting","oil-painting","ink-painting","colored-pencil","sketch"].includes(common.medium)){
            const w = qs('#artwork-width')?.value;
            const h = qs('#artwork-height')?.value;
            const u = qs('#artwork-units')?.value;
            if (w) fd.append('width', w);
            if (h) fd.append('height', h);
            if (u) fd.append('units', u);
          } else if (["industrial-design","furniture"].includes(common.medium)){
            const L = qs('#artwork-length')?.value;
            const W = qs('#artwork-width-3d')?.value;
            const H = qs('#artwork-height-3d')?.value;
            const U = qs('#artwork-units-3d')?.value;
            if (L) fd.append('length', L);
            if (W) fd.append('width3d', W);
            if (H) fd.append('height3d', H);
            if (U) fd.append('units3d', U);
          }
          fd.append('artworkImage', file);
          const res = await authFetch(`/api/artworks/${encodeURIComponent(artworkId)}`, {
            method: 'PUT',
            body: fd
          });
          if (!res.ok) {
            const err = await res.json().catch(()=>({ msg: 'Failed to update artwork' }));
            throw new Error(err.msg || err.message || 'Failed to update artwork');
          }
        } else {
          // No new image: send JSON
          const body = { title: common.title, description: common.description, medium: common.medium, locationCountry: common.locationCountry, locationCity: common.locationCity, source: common.source };
          // metrics optional
          if (["photography","painting","oil-painting","ink-painting","colored-pencil","sketch"].includes(common.medium)){
            body.width = qs('#artwork-width')?.value || undefined;
            body.height = qs('#artwork-height')?.value || undefined;
            body.units = qs('#artwork-units')?.value || undefined;
          } else if (["industrial-design","furniture"].includes(common.medium)){
            body.length = qs('#artwork-length')?.value || undefined;
            body.width3d = qs('#artwork-width-3d')?.value || undefined;
            body.height3d = qs('#artwork-height-3d')?.value || undefined;
            body.units3d = qs('#artwork-units-3d')?.value || undefined;
          }
          const res = await authFetch(`/api/artworks/${encodeURIComponent(artworkId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (!res.ok) {
            const err = await res.json().catch(()=>({ msg: 'Failed to update artwork' }));
            throw new Error(err.msg || err.message || 'Failed to update artwork');
          }
        }
      }
      alert('Artwork updated successfully');
      window.location.href = '/account.html';
    } catch (e) {
      alert(e.message || 'Failed to update artwork');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function wireEvents(){
    const mediumSelect = qs('#medium-select');
    on(mediumSelect, 'change', () => setMode(mediumSelect.value));

    const fileInput = qs('#artwork-file');
    on(fileInput, 'change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) { alert('Please select an image file'); return; }
      const reader = new FileReader();
      reader.onload = function (e) {
        const dataUrl = e.target.result;
        const ambient = qs('#ambient-bg');
        const uploadSection = qs('#upload-section');
        const overlay = qs('#upload-overlay');
        if (ambient) { ambient.style.backgroundImage = `url(${dataUrl})`; ambient.classList.add('on'); }
        if (uploadSection) {
          uploadSection.classList.add('has-image');
          let preview = uploadSection.querySelector('#artwork-preview');
          if (!preview) { preview = document.createElement('img'); preview.id = 'artwork-preview'; preview.alt = 'Artwork preview'; uploadSection.appendChild(preview); }
          preview.src = dataUrl;
        }
        if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
      };
      reader.readAsDataURL(file);
    });

    const saveBtn = qs('#save-btn');
    on(saveBtn, 'click', save);
  }

  async function init(){
    artworkId = parseId();
    wireEvents();
    // Fetch artwork (must be authenticated so hidden/private artworks owned by the user can load)
    const res = await authFetch(`/api/artworks/${encodeURIComponent(artworkId)}`);
    if (!res.ok) { alert('Artwork not found'); return; }
    const art = await res.json();
    loadedArtwork = art;
    prefillForm(art);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
