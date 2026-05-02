/* RRV — Shell helper. Renderiza sidebar, header, tweaks. */
(function () {
  const NAV = [
    { href: 'index.html',         label: 'Inicio',           ico: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z' },
    { href: 'dashboard.html',     label: 'Dashboard',        ico: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
    { href: 'mapa.html',          label: 'Mapa por ciudad',  ico: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15' },
    { href: 'actas.html',         label: 'Actas recibidas',  ico: 'M5 3h11l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M16 3v4h4 M8 13h8 M8 17h8 M8 9h3' },
    { href: 'departamento.html',  label: 'Detalle dept.',    ico: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z' },
    { href: 'como-funciona.html', label: 'Cómo funciona',    ico: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83' },
    { href: 'transparencia.html', label: 'Transparencia',    ico: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  ];

  function svgIco (d) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  }

  function renderSidebar (active) {
    return `
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="brand-mark">R</div>
          <div class="brand-text">
            <strong>RRV Bolivia</strong>
            <span>Recuento rápido</span>
          </div>
        </div>
        <div class="sidebar__menu">
          ${NAV.map(n => `
            <a href="${n.href}" class="${active === n.href ? 'active' : ''}">
              <span class="ico">${svgIco(n.ico)}</span>
              <span>${n.label}</span>
            </a>`).join('')}
        </div>
        <div style="flex:1"></div>
        <div class="sidebar__status">
          <h4>Estado del sistema</h4>
          <div class="status-row"><span class="status-dot"></span><span>Nodo 1 activo</span></div>
          <div class="status-row"><span class="status-dot"></span><span>Nodo 2 sincronizado</span></div>
          <div class="status-row"><span class="status-dot warn"></span><span>Cola SMS estable</span></div>
          <div class="status-row" style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border); font-family:var(--font-mono); font-size:10.5px; color:var(--text-faint); letter-spacing:.08em;">
            v1.4.2 · BUILD 2026-04-26
          </div>
        </div>
      </aside>
    `;
  }

  function renderHeader ({ title, sub, badges = true, extra = '' }) {
    const time = new Date();
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    return `
      <header class="app-header">
        <div class="app-header__title">
          <h1>${title}</h1>
          ${sub ? `<p>${sub}</p>` : ''}
        </div>
        <div class="header-badges">
          ${badges ? `
            <span class="badge badge--live">EN VIVO</span>
            <span class="badge badge--info" id="lastUpdateBadge">Actualizado · ${hh}:${mm}</span>
          ` : ''}
          ${extra}
          <div class="theme-toggle" id="themeToggle">
            <button data-theme-set="dark" title="Oscuro">●</button>
            <button data-theme-set="light" title="Claro">○</button>
          </div>
          <button class="btn btn--ghost" id="tweaksToggle" title="Tweaks" style="padding:8px 12px;">⚙</button>
        </div>
      </header>
    `;
  }

  function renderTweaks () {
    return `
      <div class="tweaks-panel" id="tweaksPanel">
        <h4>Tweaks</h4>
        <div class="tweaks-row">
          <label>Tema</label>
          <select id="tw-theme">
            <option value="dark">Oscuro</option>
            <option value="light">Claro</option>
          </select>
        </div>
        <div class="tweaks-row">
          <label>Acento</label>
          <select id="tw-accent">
            <option value="#D4A574">Oro editorial</option>
            <option value="#3B82F6">Azul institucional</option>
            <option value="#10B981">Verde lima</option>
            <option value="#F472B6">Rosa</option>
            <option value="#EAB308">Ámbar</option>
          </select>
        </div>
        <div class="tweaks-row">
          <label>Densidad</label>
          <select id="tw-density">
            <option value="comfy">Cómoda</option>
            <option value="compact">Compacta</option>
          </select>
        </div>
        <div class="tweaks-row">
          <label>Animaciones GSAP</label>
          <select id="tw-anim">
            <option value="full">Completas</option>
            <option value="subtle">Sutiles</option>
            <option value="off">Desactivadas</option>
          </select>
        </div>
      </div>
    `;
  }

  // Theme + tweaks logic
  function initShell (active) {
    // Inject sidebar + tweaks if app-shell exists
    const shell = document.querySelector('.app-shell');
    if (shell) {
      const main = shell.querySelector('.main');
      shell.insertAdjacentHTML('afterbegin', renderSidebar(active));
    }

    document.body.insertAdjacentHTML('beforeend', renderTweaks());

    // theme
    const saved = localStorage.getItem('rrv-theme') || 'dark';
    setTheme(saved);

    // accent
    const accent = localStorage.getItem('rrv-accent') || '#D4A574';
    document.documentElement.style.setProperty('--accent', accent);
    const sel = document.getElementById('tw-accent'); if (sel) sel.value = accent;

    // theme toggle clicks
    document.querySelectorAll('[data-theme-set]').forEach(b => {
      b.addEventListener('click', () => setTheme(b.dataset.themeSet));
    });

    // tweaks panel
    const panel = document.getElementById('tweaksPanel');
    const toggle = document.getElementById('tweaksToggle');
    if (toggle) toggle.addEventListener('click', () => panel.classList.toggle('visible'));

    document.getElementById('tw-theme').value = saved;
    document.getElementById('tw-theme').addEventListener('change', (e) => setTheme(e.target.value));
    document.getElementById('tw-accent').addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--accent', e.target.value);
      localStorage.setItem('rrv-accent', e.target.value);
    });

    // Live time refresh
    setInterval(() => {
      const el = document.getElementById('lastUpdateBadge');
      if (!el) return;
      const t = new Date();
      el.textContent = `Actualizado · ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;
    }, 1000);
  }

  function setTheme (name) {
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('rrv-theme', name);
    document.querySelectorAll('[data-theme-set]').forEach(b => {
      b.classList.toggle('active', b.dataset.themeSet === name);
    });
    const sel = document.getElementById('tw-theme'); if (sel) sel.value = name;
  }

  window.RRVShell = { renderSidebar, renderHeader, renderTweaks, initShell, setTheme };
})();
