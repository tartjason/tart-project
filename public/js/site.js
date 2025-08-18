// Minimal production bootstrap to render compiled site JSON using RuntimeRenderer
// Usage:
//   /site.html?site=<artistId>&page=home|about|works
// Optionally set via global window.SITE_CONFIG = { siteId: '...', page: 'home' } or data attributes on #site-root

(function(){
  function qs(name) {
    const m = new URLSearchParams(window.location.search).get(name);
    return m && m.trim() ? m.trim() : null;
  }

  function getSiteId(container) {
    const fromCfg = (window.SITE_CONFIG && window.SITE_CONFIG.siteId) || window.SITE_ID || null;
    const fromAttr = container ? (container.getAttribute('data-site') || container.getAttribute('data-artist')) : null;
    const fromQS = qs('site');
    return fromQS || fromAttr || fromCfg;
  }

  function getPage() {
    const fromCfg = (window.SITE_CONFIG && window.SITE_CONFIG.page) || null;
    const fromQS = qs('page');
    const page = (fromQS || fromCfg || 'home').toLowerCase();
    if (page === 'homepage') return 'home';
    return page;
  }

  function getLayoutFor(page, compiled) {
    const layouts = (compiled && compiled.surveyData && compiled.surveyData.layouts) || {};
    if (page === 'home') return layouts.homepage || 'grid';
    if (page === 'about') return layouts.about || 'split';
    if (page === 'works') return layouts.works || 'grid';
    return 'grid';
  }

  function normalizeArtworks(arr) {
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(item => {
      if (!item) return;
      if (typeof item === 'string') {
        out.push({ _id: item });
      } else if (typeof item === 'object') {
        const a = {};
        if (typeof item._id === 'string') a._id = item._id;
        if (typeof item.title === 'string') a.title = item.title;
        if (typeof item.imageUrl === 'string') a.imageUrl = item.imageUrl;
        out.push(a);
      }
    });
    return out;
  }

  function pickWorksSelection(compiled) {
    const ws = (compiled && compiled.surveyData && compiled.surveyData.worksSelections) || {};
    if (ws && typeof ws === 'object') {
      const keys = Object.keys(ws);
      for (const k of keys) {
        const arr = normalizeArtworks(ws[k]);
        if (arr.length) return arr;
      }
    }
    return [];
  }

  function buildStateFor(page, compiled) {
    if (page === 'home') {
      return { homeSelections: normalizeArtworks(compiled && compiled.surveyData && compiled.surveyData.homeSelections) };
    }
    if (page === 'works') {
      return { worksSelection: pickWorksSelection(compiled), worksIndex: 0 };
    }
    return {};
  }

  function disableEditing(root) {
    try {
      const scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll('[contenteditable]')
        .forEach(el => el.removeAttribute('contenteditable'));
      // Remove uploadImage hooks present in templates (no uploads in production runtime)
      scope.querySelectorAll('[onclick]')
        .forEach(el => {
          const val = String(el.getAttribute('onclick') || '');
          if (val.includes('uploadImage')) el.removeAttribute('onclick');
        });
    } catch (e) {
      console.warn('disableEditing error:', e);
    }
  }

  function attachWorksSingleNav(container, compiled, state, layout, page, renderInto) {
    if (!(page === 'works' && layout === 'single')) return;
    // Support either template classes or legacy IDs
    const prevSel = '#prev-work, .prev-work-btn';
    const nextSel = '#next-work, .next-work-btn';
    let prev = container.querySelector(prevSel);
    let next = container.querySelector(nextSel);

    // Remove existing listeners by cloning
    if (prev) { const c = prev.cloneNode(true); prev.replaceWith(c); prev = c; }
    if (next) { const c = next.cloneNode(true); next.replaceWith(c); next = c; }

    const n = (state.worksSelection || []).length;
    if (prev) prev.disabled = n <= 1;
    if (next) next.disabled = n <= 1;

    function reRender() {
      const html = window.RuntimeRenderer.renderPage(page, layout, compiled, compiled && compiled.surveyData, state);
      renderInto.innerHTML = html;
      window.RuntimeRenderer.applyDataStyles(renderInto);
      window.RuntimeRenderer.applyDataBindings(renderInto, compiled);
      attachWorksSingleNav(container, compiled, state, layout, page, renderInto);
    }
    if (prev && n > 1) prev.addEventListener('click', (e) => { e.preventDefault(); state.worksIndex = (state.worksIndex - 1 + n) % n; reRender(); });
    if (next && n > 1) next.addEventListener('click', (e) => { e.preventDefault(); state.worksIndex = (state.worksIndex + 1) % n; reRender(); });
  }

  async function bootstrap() {
    const root = document.getElementById('site-root') || document.body;
    const siteId = getSiteId(root);
    const page = getPage();

    if (!siteId) {
      root.innerHTML = '<div style="padding:16px; color:#b00;">Missing site id. Provide ?site=&lt;id&gt; in URL or set data-site on #site-root.</div>';
      return;
    }

    const jsonUrl = `/sites/${encodeURIComponent(siteId)}/site.json`;

    try {
      await window.RuntimeRenderer.ensureTemplatesLoaded();
    } catch (e) {
      console.error('Template load failed', e);
    }

    let compiled = null;
    try {
      const res = await fetch(jsonUrl, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Failed to load ${jsonUrl}`);
      compiled = await res.json();
    } catch (err) {
      console.error('Failed to fetch compiled site JSON:', err);
      root.innerHTML = `<div style="padding:16px; color:#b00;">Could not load site.json for site ${siteId}.</div>`;
      return;
    }

    const layout = getLayoutFor(page, compiled);
    const state = buildStateFor(page, compiled);

    const html = window.RuntimeRenderer.renderPage(page, layout, compiled, compiled && compiled.surveyData, state);
    const mount = root;
    mount.innerHTML = html;

    // One-time style + data bindings
    window.RuntimeRenderer.applyDataStyles(mount);
    window.RuntimeRenderer.applyDataBindings(mount, compiled);
    disableEditing(mount);

    // Lightweight interactions
    attachWorksSingleNav(document, compiled, state, layout, page, mount);
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
