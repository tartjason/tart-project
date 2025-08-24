// Shared Site Header module for both preview and production
// Provides: render() to generate header/nav HTML, attachNavigation() to wire events,
// and updateLogoFromUserIfAvailable() to personalize the logo text with logged-in user's name.
// Usage (browser): window.SiteHeader

(function(){
  function render(options) {
    try {
      const opts = options || {};
      const features = opts.features || {};
      const worksOrg = opts.worksOrganization; // 'year' | 'theme' | undefined
      const worksDetails = opts.worksDetails || {};
      const activePage = (opts.activePage || 'home').toLowerCase();
      const logo = opts.logo || null; // { dataUrl }

      const navOrder = [];
      if (features.home) navOrder.push('home');
      if (features.works) navOrder.push('works');
      if (features.about) navOrder.push('about');
      if (navOrder.length === 0) navOrder.push('home');

      const logoHTML = logo && logo.dataUrl
        ? `<img src="${logo.dataUrl}" alt="Logo" style="max-height: 40px;">`
        : '<div id="site-logo-text" style="font-weight: bold;">Your Portfolio</div>';

      function buildNavItem(name, index) {
        const isWorks = name === 'works' && features.works;
        const isActive = activePage === name || (index === 0 && !activePage);
        const baseLink = `<a href="#" class="preview-nav-item ${isActive ? 'active' : ''}" data-page="${name}" style="text-decoration: none; color: ${isActive ? '#007bff' : '#333'}; font-weight: ${isActive ? 'bold' : 'normal'}; border-bottom: ${isActive ? '2px solid #007bff' : 'none'}; padding-bottom: 5px; cursor: pointer;">${name.charAt(0).toUpperCase() + name.slice(1)}</a>`;
        if (!isWorks) return baseLink;
        const orgItems = worksOrg === 'year' ? (worksDetails.years || []) : (worksDetails.themes || []);
        if (!Array.isArray(orgItems) || orgItems.length === 0) return baseLink;
        return `
          <div style="position: relative; display: inline-block;">
            ${baseLink}
            <div class="works-dropdown" style="position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); min-width: 150px; display: none; z-index: 1000;">
              ${orgItems.map(item => `<a href="#" class="works-filter" data-filter="${item}" style="display: block; padding: 10px 15px; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">${item}</a>`).join('')}
            </div>
          </div>
        `;
      }

      const navHTML = navOrder.map((name, index) => buildNavItem(name, index)).join('');

      return `
        <header class="site-nav" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
          ${logoHTML}
          <nav style="display: flex; gap: 20px;">
            ${navHTML}
          </nav>
        </header>
      `;
    } catch (e) {
      console.warn('SiteHeader.render error:', e);
      return '';
    }
  }

  function attachNavigation(root, opts) {
    try {
      const elRoot = root && root.querySelectorAll ? root : document;
      const onNavigate = (opts && typeof opts.onNavigate === 'function') ? opts.onNavigate : null;
      const navItems = elRoot.querySelectorAll('.preview-nav-item');

      // Hover behavior for works dropdown
      const worksNavItem = elRoot.querySelector('.preview-nav-item[data-page="works"]');
      if (worksNavItem) {
        const dropdown = worksNavItem.parentElement && worksNavItem.parentElement.querySelector('.works-dropdown');
        if (dropdown) {
          const parent = worksNavItem.parentElement;
          parent.addEventListener('mouseenter', () => { dropdown.style.display = 'block'; });
          parent.addEventListener('mouseleave', () => { dropdown.style.display = 'none'; });
          dropdown.querySelectorAll('.works-filter').forEach(filterItem => {
            filterItem.addEventListener('click', (e) => {
              e.preventDefault();
              const filter = filterItem.getAttribute('data-filter');
              setActive(worksNavItem, navItems);
              if (onNavigate) onNavigate('works', { filter });
            });
          });
        }
      }

      function setActive(item, all) {
        all.forEach(nav => {
          nav.classList.remove('active');
          nav.style.color = '#333';
          nav.style.fontWeight = 'normal';
          nav.style.borderBottom = 'none';
        });
        item.classList.add('active');
        item.style.color = '#007bff';
        item.style.fontWeight = 'bold';
        item.style.borderBottom = '2px solid #007bff';
      }

      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const page = item.getAttribute('data-page');
          setActive(item, navItems);
          if (onNavigate) onNavigate(page, {});
        });
      });
    } catch (e) {
      console.warn('SiteHeader.attachNavigation error:', e);
    }
  }

  function updateLogoFromUserIfAvailable(root) {
    try {
      const scope = root && root.querySelector ? root : document;
      const hasLogoImg = scope.querySelector('header img[alt="Logo"]');
      if (hasLogoImg) return;
      const el = scope.querySelector('#site-logo-text');
      if (!el) return;
      const token = localStorage.getItem('token');
      if (!token) return;
      fetch('/api/auth/me', { headers: { 'x-auth-token': token } })
        .then(res => res.ok ? res.json() : null)
        .then(user => {
          if (user && user.name && el && el.textContent === 'Your Portfolio') {
            el.textContent = user.name;
          }
        })
        .catch(() => {});
    } catch {}
  }

  window.SiteHeader = {
    render,
    attachNavigation,
    updateLogoFromUserIfAvailable
  };
})();
