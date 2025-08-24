// Shared runtime renderer for both preview and production
// Provides: template loading, token rendering, data bindings/styles, and pure page renderers
// Usage (browser): window.RuntimeRenderer

(function(){
  // Configurable options (can be overridden by consumers)
  const config = {
    emptyArtworksMessage: 'No artworks selected.'
  };
  const TPL_URLS = [
    { key: ['home','grid'], url: '/templates/home/grid.html' },
    { key: ['home','split'], url: '/templates/home/split.html' },
    { key: ['home','hero'], url: '/templates/home/hero.html' },
    { key: ['works','grid'], url: '/templates/works/grid.html' },
    { key: ['works','single'], url: '/templates/works/single.html' },
    { key: ['about','split'], url: '/templates/about/split.html' },
    { key: ['about','vertical'], url: '/templates/about/vertical.html' }
  ];

  const templates = {
    home: { grid: '', split: '', hero: '' },
    works: { grid: '', single: '' },
    about: { split: '', vertical: '' }
  };

  let _templatesLoaded = false;
  let _templatesPromise = null;

  async function loadTemplates() {
    if (_templatesPromise) return _templatesPromise;
    _templatesPromise = Promise.all(TPL_URLS.map(async f => {
      try {
        const res = await fetch(f.url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Failed to load ${f.url}`);
        const txt = await res.text();
        templates[f.key[0]][f.key[1]] = txt;
      } catch (e) {
        console.error('Template load error:', e);
        templates[f.key[0]][f.key[1]] = '';
      }
    })).then(() => { _templatesLoaded = true; }).finally(() => { _templatesPromise = null; });
    return _templatesPromise;
  }

  function ensureTemplatesLoaded() {
    if (_templatesLoaded) return Promise.resolve();
    return loadTemplates();
  }

  // Simple token renderer: replaces {{ key }} with provided values
  function renderTemplate(template, data) {
    if (!template) return '';
    let out = template;
    Object.entries(data || {}).forEach(([k, v]) => {
      const re = new RegExp(`{{\s*${k}\s*}}`, 'g');
      out = out.replace(re, v == null ? '' : String(v));
    });
    return out;
  }

  // Safe getter using dotted/bracket path
  function getValueAtPath(obj, path) {
    try {
      if (!obj || !path) return undefined;
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

  // Apply inline data-style attributes into style attribute (one-time)
  function applyDataStyles(root) {
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

  // Populate elements with data-content-path from compiled JSON
  // Accepts explicit compiled root to remain pure/decoupled from preview state
  function applyDataBindings(root, compiledRoot) {
    try {
      const scope = root && root.querySelectorAll ? root : document;
      const elements = scope.querySelectorAll('[data-content-path]');
      if (!elements || elements.length === 0) return;

      const dataRoot = compiledRoot || {};

      elements.forEach(el => {
        const path = el.getAttribute('data-content-path');
        if (!path) return;
        const rawType = el.getAttribute('data-type') || el.getAttribute('data-content-type') || 'text';
        const type = (rawType || 'text').toLowerCase();
        const value = getValueAtPath(dataRoot, path);

        if (value == null) {
          // Clear appropriately
          if (type === 'html') el.innerHTML = '';
          else if (type === 'imageurl') el.style.backgroundImage = '';
          else el.textContent = '';
          return;
        }

        if (type === 'html') {
          el.innerHTML = String(value);
        } else if (type === 'imageurl') {
          const url = String(value);
          if (url) {
            const current = el.getAttribute('style') || '';
            const separator = current && !current.trim().endsWith(';') ? '; ' : '';
            const imgStyle = `background-image: url('${url}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
            el.setAttribute('style', current + separator + imgStyle);
            // Remove any placeholder text/content inside the image container
            try { el.innerHTML = ''; } catch {}
            // Hide adjacent helper caption paragraph, if present
            try {
              const sib = el.nextElementSibling;
              if (sib && sib.tagName === 'P') sib.style.display = 'none';
            } catch {}
          } else {
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

  // About section selection logic mirrors PreviewRenderer.getSelectedAboutSections()
  function getSelectedAboutSections(compiled, surveyData) {
    const compiledAbout = compiled && compiled.aboutContent;
    // Exclude non-section fields like title, bio, and imageUrl
    const compiledKeys = (compiledAbout && typeof compiledAbout === 'object')
      ? Object.keys(compiledAbout).filter(k => k !== 'title' && k !== 'bio' && k !== 'imageUrl' && compiledAbout[k])
      : [];
    const aboutSections = (surveyData && surveyData.aboutSections) || {};
    const surveyKeys = Object.keys(aboutSections).filter(section => aboutSections[section]);
    const orderedUnion = [];
    const seen = new Set();
    compiledKeys.forEach(k => { if (!seen.has(k)) { seen.add(k); orderedUnion.push(k); } });
    surveyKeys.forEach(k => { if (!seen.has(k)) { seen.add(k); orderedUnion.push(k); } });
    return orderedUnion;
  }

  // Renderers
  function renderHomeGrid(compiled, state) {
    const tpl = templates.home.grid;
    const selection = (state && Array.isArray(state.homeSelections))
      ? state.homeSelections
      : [];

    const hasSelection = selection.length > 0;
    const gridItems = selection.map(a => {
      const linkHref = `/artwork.html?id=${encodeURIComponent((a && a._id) ? a._id : '')}`;
      const title = (a && a.title) || 'Untitled';
      const safeTitle = title.replace(/"/g,'&quot;');
      const img = a && a.imageUrl
        ? `<img src="${a.imageUrl}" alt="${safeTitle}" style="display:block; width:100%; height:auto;">`
        : `<div style="height: 180px; background: #f0f0f0; display:flex; align-items:center; justify-content:center; color:#999;">${safeTitle}</div>`;
      return `
        <a href="${linkHref}" style="display:block; text-decoration:none; color:inherit;">
          <div style="background:#fff;">
            ${img}
            <div style="padding:6px 4px; font-size:0.9rem; text-align:center; color:#999; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
          </div>
        </a>
      `;
    }).join('');
    const emptyMsg = `<div style="grid-column: 1 / -1; text-align:center; color:#999; padding-top:40px;">${config.emptyArtworksMessage}</div>`;
    return renderTemplate(tpl, { works_grid_items: hasSelection ? gridItems : emptyMsg });
  }

  function renderHomeSplit(compiled) {
    const tpl = templates.home.split;
    const home = (compiled && compiled.homeContent) || {};
    const imgUrl = home.imageUrl;
    const splitStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
    return renderTemplate(tpl, {
      title: home.title || '',
      description: home.description || '',
      explore_text: home.explore_text || '',
      split_feature_style: splitStyle
    });
  }

  function renderHomeHero(compiled) {
    const tpl = templates.home.hero;
    const home = (compiled && compiled.homeContent) || {};
    const imgUrl = home.imageUrl;
    const heroStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
    return renderTemplate(tpl, {
      title: home.title || '',
      subtitle: home.subtitle || '',
      hero_description: home.description || '',
      hero_style: heroStyle
    });
  }

  function renderWorksGrid(state) {
    const tpl = templates.works.grid;
    const selection = (state && Array.isArray(state.worksSelection)) ? state.worksSelection : [];
    const hasSelection = selection.length > 0;
    const gridItems = selection.map(a => {
      const linkHref = `/artwork.html?id=${encodeURIComponent((a && a._id) ? a._id : '')}`;
      return `
      <a href="${linkHref}" style="display:block; text-decoration:none; color:inherit;">
        <div style="background:#fff;">
          ${a && a.imageUrl ? `<img src="${a.imageUrl}" alt="${((a && a.title)||'Untitled').replace(/"/g,'&quot;')}" style="display:block; width:100%; height:auto;">` : `
            <div style=\"height: 180px; background: #f0f0f0; display:flex; align-items:center; justify-content:center; color:#999;\">${(a && a.title)||'Untitled'}</div>
          `}
          <div style="padding:6px 4px; font-size:0.9rem; text-align:center; color:#999; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(a && a.title) || 'Untitled'}</div>
        </div>
      </a>
    `;
    }).join('');
    const emptyMsg = `<div style="grid-column: 1 / -1; text-align:center; color:#999; padding-top:40px;">${config.emptyArtworksMessage}</div>`;
    return renderTemplate(tpl, { works_grid_items: hasSelection ? gridItems : emptyMsg });
  }

  function renderWorksSingle(state) {
    const tpl = templates.works.single;
    const selection = (state && Array.isArray(state.worksSelection)) ? state.worksSelection : [];
    const n = selection.length;
    const idx = state && typeof state.worksIndex === 'number' && n > 0 ? ((state.worksIndex % n) + n) % n : 0;
    const a = selection[idx];

    // Provide content as <img> to preserve original aspect ratio; fall back to text when absent
    const linkHref = a && a._id ? `/artwork.html?id=${encodeURIComponent(a._id)}` : null;
    const baseImgHtml = a && a.imageUrl
      ? `<img src="${a.imageUrl}" alt="${((a && a.title) || 'Untitled').replace(/"/g,'&quot;')}" style="display:block; max-width: 100%; max-height: 75vh; width:auto; height:auto; margin:0 auto 16px;" />`
      : (a
          ? `<div style=\"text-align:center; color:#888; margin:0 auto 16px;\">${(a.title||'Untitled')}</div>`
          : `<div style=\"text-align:center; color:#888; margin:0 auto 16px;\">${config.emptyArtworksMessage}</div>`);
    const contentHtml = linkHref
      ? `<a href="${linkHref}" style="display:block; text-decoration:none; color:inherit;">${baseImgHtml}</a>`
      : baseImgHtml;

    return renderTemplate(tpl, {
      single_work_style: '',
      single_work_content: contentHtml,
      single_title: (function(){
        const t = (a && a.title) ? a.title : 'Untitled';
        return linkHref ? `<a href="${linkHref}" style="text-decoration:none; color:inherit;">${t}</a>` : t;
      })(),
      single_index: String(n > 0 ? idx + 1 : 0),
      single_total: String(n)
    });
  }

  function renderAbout(layout, compiled, surveyData) {
    const about = (compiled && compiled.aboutContent) || {};
    const imgUrl = about.imageUrl;
    const photoStyle = imgUrl ? `background-image: url('${imgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : '';
    const aboutTitle = about.title || '';
    const aboutBio = about.bio || '';

    const selectedSections = getSelectedAboutSections(compiled, surveyData);
    const aboutSectionsHTML = selectedSections.map(section => {
      const title = section.replace(/([A-Z])/g, ' $1').trim();
      const sectionHtml = about && about[section] ? String(about[section]) : '';
      return `
        <div style="margin-bottom: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">
          <h3 style=\"font-size: 1.4rem; margin-bottom: 20px; color: #333; font-weight: 400; text-transform: capitalize;\">${title}</h3>
          <div data-content-path="aboutContent.${section}" data-type="html">${sectionHtml}</div>
        </div>
      `;
    }).join('');

    if (layout === 'vertical') {
      const tpl = templates.about.vertical;
      return renderTemplate(tpl, {
        about_title: aboutTitle,
        about_bio: aboutBio,
        about_sections_html: aboutSectionsHTML,
        about_photo_style: photoStyle
      });
    }
    // default: split
    const tpl = templates.about.split;
    return renderTemplate(tpl, {
      about_title: aboutTitle,
      about_bio: aboutBio,
      about_sections_html: aboutSectionsHTML,
      about_photo_style: photoStyle
    });
  }

  function renderHome(layout, compiled, state) {
    if (layout === 'grid') return renderHomeGrid(compiled, state);
    if (layout === 'hero') return renderHomeHero(compiled);
    return renderHomeSplit(compiled);
  }

  function renderWorks(layout, compiled, state) {
    if (layout === 'single') return renderWorksSingle(state);
    return renderWorksGrid(state);
  }

  function renderPage(page, layout, compiled, surveyData, state) {
    // returns HTML string only; caller can inject then call applyDataStyles/Bindings
    if (page === 'home') return renderHome(layout, compiled, state);
    if (page === 'works') return renderWorks(layout, compiled, state);
    if (page === 'about') return renderAbout(layout, compiled, surveyData);
    return '';
  }

  window.RuntimeRenderer = {
    // templates
    templates,
    // configuration
    config,
    loadTemplates,
    ensureTemplatesLoaded,

    // utils
    renderTemplate,
    applyDataStyles,
    applyDataBindings,
    getValueAtPath,

    // about helpers
    getSelectedAboutSections,

    // pure renderers
    renderHome,
    renderWorks,
    renderAbout,
    renderPage,

    // lower-level variants (optional external usage)
    renderHomeGrid,
    renderHomeSplit,
    renderHomeHero,
    renderWorksGrid,
    renderWorksSingle
  };
})();
