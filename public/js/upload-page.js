(function () {
  function qs(sel) { return document.querySelector(sel); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function show(el) { if (!el) return; el.hidden = false; el.style.display = ""; }
  function hide(el) { if (!el) return; el.hidden = true; el.style.display = "none"; }

  let poemEditor = null;

  function init() {
    const mediumSelect = qs('#medium-select');
    const uploadSection = qs('#upload-section');
    const poetrySection = qs('#poetry-section');
    const metaSection = qs('#meta-section');
    const ambient = qs('#ambient-bg');
    const fileInput = qs('#artwork-file');
    const overlay = qs('#upload-overlay');
    const poemEditorMount = qs('#poem-editor');
    const publishBtn = qs('#publish-btn');
    const publishActions = qs('#publish-actions');
    const titleInput = qs('#artwork-title');
    const descriptionInput = qs('#artwork-description');
    const countryInput = qs('#artwork-country');
    const cityInput = qs('#artwork-city');
    // Carousel elements
    const carousel = qs('#meta-carousel');
    const slides = carousel ? carousel.querySelector('.slides') : null;
    const dots = qs('#carousel-dots');
    let slideIndex = 0;
    const totalSlides = slides ? slides.children.length : 0;
    // Wheel gesture state for horizontal scrolling (one slide per gesture)
    let wheelAccumX = 0;
    let wheelGestureActive = false;
    let wheelGestureConsumed = false;
    let wheelEndTimer = null;
    const WHEEL_THRESHOLD = 24; // pixels of horizontal gesture before navigating (more responsive)
    const INSTANT_TRIGGER_DX = 14; // if a single event exceeds this, trigger immediately
    const GESTURE_END_MS = 110; // time without wheel events to consider gesture ended
    const HORIZONTAL_EPS = 5; // ignore tiny momentum deltas to let gestures end

    function getVisibleSlides() {
      if (!slides) return [];
      return Array.from(slides.children).filter(s => !s.hidden && getComputedStyle(s).display !== 'none');
    }

    function buildDots() {
      if (!dots || !slides) return;
      const visibleSlides = getVisibleSlides();
      dots.innerHTML = '';
      if (slideIndex > visibleSlides.length - 1) {
        slideIndex = Math.max(0, visibleSlides.length - 1);
      }
      visibleSlides.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === slideIndex ? ' active' : '');
        dot.addEventListener('click', () => goTo(i));
        dots.appendChild(dot);
      });
    }

    function updateCarousel() {
      if (!slides) return;
      slides.style.transform = `translateX(-${slideIndex * 100}%)`;
      // Update dots
      if (dots) {
        Array.from(dots.children).forEach((d, i) => {
          d.classList.toggle('active', i === slideIndex);
        });
      }
      // Buttons removed; navigation via dots and keyboard only
    }

    // Enable/disable Publish button based on required fields
    function updatePublishEnabled() {
      if (!publishBtn) return;
      const medium = mediumSelect ? mediumSelect.value : 'photography';
      const hasTitle = titleInput && titleInput.value.trim().length > 0;
      const hasDesc = descriptionInput && descriptionInput.value.trim().length > 0;
      const hasCountry = countryInput && countryInput.value.trim().length > 0;
      const hasCity = cityInput && cityInput.value.trim().length > 0;
      const hasSource = !!document.querySelector('input[name="ai-generated"]:checked');
      let ready = false;
      if (medium === 'poetry') {
        const hasPoemContent = !!(poemEditor && typeof poemEditor.toJSON === 'function' &&
          poemEditor.toJSON().lines.some(l => {
            const html = String(l.html || '');
            const text = html.replace(/<[^>]*>/g, '').trim();
            return text.length > 0;
          }));
        ready = hasTitle && hasDesc && hasCountry && hasCity && hasSource && hasPoemContent;
      } else {
        const hasImage = !!(uploadSection && uploadSection.classList.contains('has-image'));
        ready = hasTitle && hasDesc && hasCountry && hasCity && hasSource && hasImage;
      }
      publishBtn.disabled = !ready;
    }

    function goTo(i) {
      if (!slides) return;
      const maxIdx = getVisibleSlides().length - 1;
      slideIndex = Math.max(0, Math.min(i, maxIdx));
      updateCarousel();
    }
    function next() { goTo(slideIndex + 1); }
    function prev() { goTo(slideIndex - 1); }

    function resetImageState() {
      if (ambient) {
        ambient.style.backgroundImage = '';
        ambient.classList.remove('on');
      }
      if (uploadSection) {
        uploadSection.classList.remove('has-image');
        const prev = uploadSection.querySelector('#artwork-preview');
        if (prev) prev.remove();
      }
      if (overlay) { overlay.style.opacity = ''; overlay.style.display = ''; }
      if (fileInput) fileInput.value = '';
      // Hide publish actions by default; specific modes will re-show
      hide(publishActions);
    }

    function setMode(medium) {
      // Always reset any previous image and overlay when switching medium
      resetImageState();
      // Toggle poetry-mode class for CSS-based slide visibility control
      if (document && document.body) {
        document.body.classList.toggle('poetry-mode', medium === 'poetry');
      }
      // Toggle metrics slide and variant by medium
      const metricsSlide = carousel ? carousel.querySelector('.slides [data-slide="2"]') : null;
      const aiSlide = carousel ? carousel.querySelector('.slides [data-slide="3"]') : null;
      const metrics2d = qs('#metrics-2d');
      const metrics3d = qs('#metrics-3d');
      if (medium === 'poetry') {
        if (metricsSlide) { metricsSlide.hidden = true; metricsSlide.style.display = 'none'; } // no metrics for poetry
        if (aiSlide) { aiSlide.hidden = false; aiSlide.style.display = ''; }
      } else {
        if (metricsSlide) { metricsSlide.hidden = false; metricsSlide.style.display = ''; }
        if (medium === 'industrial-design') {
          if (metrics2d) hide(metrics2d);
          if (metrics3d) show(metrics3d);
        } else { // photography, painting
          if (metrics3d) hide(metrics3d);
          if (metrics2d) show(metrics2d);
        }
      }
      if (medium === 'poetry') {
        hide(uploadSection);
        show(poetrySection);
        show(metaSection);
        show(publishActions);
        goTo(0);
        if (!poemEditor && window.PoemEditor && poemEditorMount) {
          poemEditor = new window.PoemEditor(poemEditorMount, { useFloatingToolbar: false });
          // Set default text content
          if (poemEditor && typeof poemEditor.loadFromText === 'function') {
            poemEditor.loadFromText('...');
          }
        }
      } else {
        show(uploadSection);
        hide(poetrySection);
        // hide metadata until an image is selected
        hide(metaSection);
        hide(publishActions);
      }
      buildDots();
      updateCarousel();
      updatePublishEnabled();
    }

    function handleImageFile(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const dataUrl = e.target.result;
        if (ambient) {
          ambient.style.backgroundImage = `url(${dataUrl})`;
          ambient.classList.add('on');
        }
        if (uploadSection) {
          uploadSection.classList.add('has-image');
          // Create/replace preview image
          let preview = uploadSection.querySelector('#artwork-preview');
          if (!preview) {
            preview = document.createElement('img');
            preview.id = 'artwork-preview';
            preview.alt = 'Artwork preview';
            uploadSection.appendChild(preview);
          }
          preview.src = dataUrl;
        }
        if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
        show(metaSection);
        buildDots();
        updateCarousel();
        goTo(0);
        show(publishActions);
        updatePublishEnabled();
      };
      reader.readAsDataURL(file);
    }

    // Events
    on(mediumSelect, 'change', () => { setMode(mediumSelect.value); });

    const openPicker = () => {
      if (!fileInput) return;
      // Clear value so selecting the same file again triggers change
      fileInput.value = '';
      fileInput.click();
    };
    on(uploadSection, 'click', (e) => {
      // Don't trigger if they click the actual input (already opens picker)
      if (e.target === fileInput) return;
      openPicker();
    });
    on(fileInput, 'change', (e) => {
      const f = e.target.files && e.target.files[0];
      handleImageFile(f);
      updatePublishEnabled();
    });

    // Title changes affect publish readiness
    on(titleInput, 'input', updatePublishEnabled);
    // Description, Country, City affect readiness
    on(descriptionInput, 'input', updatePublishEnabled);
    on(countryInput, 'input', updatePublishEnabled);
    on(cityInput, 'input', updatePublishEnabled);
    // AI/Human selection affects readiness
    document.querySelectorAll('input[name="ai-generated"]').forEach(r => on(r, 'change', updatePublishEnabled));
    // Poetry editor content affects readiness
    on(poetrySection, 'input', updatePublishEnabled);

    // Publish button
    on(publishBtn, 'click', async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please log in to publish.');
        return;
      }
      const medium = mediumSelect ? mediumSelect.value : 'photography';
      const title = titleInput ? titleInput.value.trim() : '';
      const description = descriptionInput ? descriptionInput.value.trim() : '';
      const locationCountry = countryInput ? countryInput.value.trim() : '';
      const locationCity = cityInput ? cityInput.value.trim() : '';
      const sourceEl = document.querySelector('input[name="ai-generated"]:checked');
      const source = sourceEl ? sourceEl.value : undefined; // 'human' | 'ai'

      publishBtn.disabled = true;
      const originalText = publishBtn.textContent;
      publishBtn.textContent = 'Publishing...';
      try {
        let res;
        if (medium === 'poetry') {
          const poem = poemEditor && typeof poemEditor.toJSON === 'function' ? poemEditor.toJSON() : { lines: [] };
          res = await fetch('/api/artworks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-auth-token': token
            },
            body: JSON.stringify({ title, description, medium, locationCountry, locationCity, source, poem })
          });
        } else {
          const fd = new FormData();
          // file
          const file = (qs('#artwork-file') && qs('#artwork-file').files && qs('#artwork-file').files[0]) || null;
          if (!file) { throw new Error('Please choose an image'); }
          fd.append('artworkImage', file);
          // shared fields
          fd.append('title', title);
          fd.append('description', description);
          fd.append('medium', medium);
          fd.append('locationCountry', locationCountry);
          fd.append('locationCity', locationCity);
          if (source) fd.append('source', source);
          // metrics
          if (medium === 'photography' || medium === 'painting' || medium === 'oil-painting' || medium === 'ink-painting' || medium === 'colored-pencil') {
            const w = qs('#artwork-width')?.value;
            const h = qs('#artwork-height')?.value;
            const u = qs('#artwork-units')?.value;
            if (w) fd.append('width', w);
            if (h) fd.append('height', h);
            if (u) fd.append('units', u);
          } else if (medium === 'industrial-design') {
            const L = qs('#artwork-length')?.value;
            const W = qs('#artwork-width-3d')?.value;
            const H = qs('#artwork-height-3d')?.value;
            const U = qs('#artwork-units-3d')?.value;
            if (L) fd.append('length', L);
            if (W) fd.append('width3d', W);
            if (H) fd.append('height3d', H);
            if (U) fd.append('units3d', U);
          }
          res = await fetch('/api/artworks', {
            method: 'POST',
            headers: { 'x-auth-token': token },
            body: fd
          });
        }

        if (!res.ok) {
          let msg = 'Failed to publish';
          try { const data = await res.json(); if (data && data.msg) msg = data.msg; } catch {}
          throw new Error(msg);
        }
        const saved = await res.json();
        window.location.href = `/artwork.html?id=${encodeURIComponent(saved._id)}`;
      } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to publish');
        publishBtn.disabled = false;
        publishBtn.textContent = originalText;
      }
    });


    // Carousel events
    // Build dots dynamically for slide count
    buildDots();
    // Keyboard navigation when focus is on carousel container
    on(carousel, 'keydown', (e) => {
      const tag = e.target && e.target.tagName;
      // Do not hijack arrows while typing inside inputs/textarea
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    });

    // Trackpad/two-finger horizontal scroll support
    if (carousel) {
      carousel.addEventListener('wheel', (e) => {
        if (!slides) return;
        // Determine horizontal intent primarily from deltaX magnitude.
        // Fall back to Shift+vertical as horizontal as well.
        let dx = 0;
        if (Math.abs(e.deltaX) > HORIZONTAL_EPS) dx = e.deltaX;
        else if (e.shiftKey && Math.abs(e.deltaY) > HORIZONTAL_EPS) dx = e.deltaY;
        if (!dx) return; // let normal vertical scrolls pass through

        // Only act on horizontal gestures
        e.preventDefault();
        e.stopPropagation();
        if (!wheelGestureActive) {
          wheelGestureActive = true;
          wheelGestureConsumed = false;
          wheelAccumX = 0;
        }

        // Instant trigger for strong initial flicks (use current dx sign)
        if (!wheelGestureConsumed && Math.abs(dx) >= INSTANT_TRIGGER_DX) {
          if (dx > 0) { next(); } else { prev(); }
          wheelGestureConsumed = true;
        } else {
          wheelAccumX += dx;
          if (!wheelGestureConsumed && Math.abs(wheelAccumX) >= WHEEL_THRESHOLD) {
            if (wheelAccumX > 0) { next(); } else { prev(); }
            wheelGestureConsumed = true;
          }
        }

        if (wheelEndTimer) clearTimeout(wheelEndTimer);
        wheelEndTimer = setTimeout(() => {
          wheelGestureActive = false;
          wheelGestureConsumed = false;
          wheelAccumX = 0;
        }, GESTURE_END_MS);
      }, { passive: false, capture: true });
    }

    // Initialize carousel UI
    updateCarousel();

    // Initial mode
    setMode(mediumSelect ? mediumSelect.value : 'photography');
    // Initial publish state
    updatePublishEnabled();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
