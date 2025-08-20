// public/js/site.js
// Resolves /s/:slug to an artistId via /api/public/site and boots the runtime renderer
(function(){
  function qs(name) {
    const m = new URLSearchParams(window.location.search).get(name);
    return m && m.trim() ? m.trim() : null;
  }

  function getSlug() {
    try {
      const pathname = window.location.pathname || '/';
      // /s/:slug
      const mS = pathname.match(/^\/s\/([^\/?#]+)/);
      if (mS && mS[1]) return decodeURIComponent(mS[1]);
      // Root-level :slug (e.g., /jasonlin), ignoring reserved segments and files with dots
      const mRoot = pathname.match(/^\/([^\/?#]+)/);
      if (mRoot && mRoot[1]) {
        const seg = decodeURIComponent(mRoot[1]);
        const reserved = new Set(['', 'api','sites','js','css','uploads','static','assets','images','img','fonts','favicon.ico','robots.txt','s','site.html','index.html']);
        if (!reserved.has(seg) && !seg.includes('.')) return seg;
      }
    } catch {}
    const fromQS = qs('slug');
    return fromQS || null;
  }

  async function resolveAndBoot() {
    const root = document.getElementById('site-root') || document.body;
    // If a direct site id is provided via query (e.g., /site.html?site=<id>&page=about),
    // bypass slug resolution and boot immediately. This is used for local testing and parity.
    const directSiteId = qs('site');
    if (directSiteId) {
      try {
        window.SITE_CONFIG = window.SITE_CONFIG || {};
        window.SITE_CONFIG.siteId = directSiteId;
        const page = (qs('page') || '').toLowerCase();
        if (page) window.SITE_CONFIG.page = page;
        try { document.title = `Tart — ${directSiteId}`; } catch {}
        if (window.SiteBootstrap && typeof window.SiteBootstrap.run === 'function') {
          await window.SiteBootstrap.run();
        } else {
          console.error('SiteBootstrap not available');
        }
      } catch (e) {
        console.error('Direct site boot error:', e);
        root.innerHTML = '<div style="padding:16px; color:#b00;">Could not load site.</div>';
      }
      return;
    }

    const slug = getSlug();
    if (!slug) {
      root.innerHTML = '<div style="padding:16px; color:#b00;">Missing slug. Provide /s/:slug or use ?site=<id>.</div>';
      return;
    }

    try {
      const res = await fetch(`/api/public/site?slug=${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('resolve failed');
      const data = await res.json();
      if (!data || !data.artistId) throw new Error('no artist');

      // Provide SITE_CONFIG for runtime bootstrap
      window.SITE_CONFIG = window.SITE_CONFIG || {};
      window.SITE_CONFIG.siteId = data.artistId;
      const page = (qs('page') || '').toLowerCase();
      if (page) window.SITE_CONFIG.page = page;

      // Update title
      try { document.title = `Tart — ${slug}`; } catch {}

      if (window.SiteBootstrap && typeof window.SiteBootstrap.run === 'function') {
        await window.SiteBootstrap.run();
      } else {
        console.error('SiteBootstrap not available');
      }
    } catch (e) {
      console.error('Public site resolve error:', e);
      root.innerHTML = '<div style="padding:16px; color:#b00;">Site not found.</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resolveAndBoot);
  } else {
    resolveAndBoot();
  }
})();
