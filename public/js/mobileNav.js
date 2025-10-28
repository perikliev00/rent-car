// Advanced mobile menu: overlay, search filter, submenus, focus, swipe
(function initMobileMenu(){
  function init(){
    // Desktop mega menu click-to-open with one-at-a-time behavior
    const desktopSubmenus = document.querySelectorAll('.desktop-nav .submenu');
    if (desktopSubmenus.length) {
      function closeAll(){ desktopSubmenus.forEach(li => li.classList.remove('open')); }
      function syncScrollLock(){
        const anyOpen = Array.from(desktopSubmenus).some(li => li.classList.contains('open'));
        document.documentElement.style.overflow = anyOpen ? 'hidden' : '';
        document.body.style.overflow = anyOpen ? 'hidden' : '';
      }
      desktopSubmenus.forEach(li => {
        const trigger = li.querySelector(':scope > a');
        const panel = li.querySelector(':scope > .submenu-list');
        if (!trigger || !panel) return;
        trigger.addEventListener('click', (e) => { e.preventDefault(); const isOpen = li.classList.contains('open'); closeAll(); if (!isOpen) li.classList.add('open'); syncScrollLock(); });
        // Toggle via keyboard (Enter/Space)
        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const isOpen = li.classList.contains('open');
            closeAll();
            if (!isOpen) li.classList.add('open');
            syncScrollLock();
          }
        });
      });
      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (!(e.target.closest && e.target.closest('.desktop-nav .submenu'))) {
          closeAll();
          syncScrollLock();
        }
      });
      // Close on Escape
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); syncScrollLock(); } });
      // Recompute header height gap so panel sticks just under header without gap
      function computeHeaderHeight(){
        const announce = document.querySelector('.header-announcement');
        const header = document.querySelector('.header');
        const ah = announce ? announce.getBoundingClientRect().height : 0;
        const hh = header ? header.getBoundingClientRect().height : 0;
        const total = Math.round(ah + hh);
        document.documentElement.style.setProperty('--announcement-height', ah + 'px');
        document.documentElement.style.setProperty('--header-height', hh + 'px');
        document.documentElement.style.setProperty('--header-total', total + 'px');
      }
      computeHeaderHeight();
      window.addEventListener('resize', () => { computeHeaderHeight(); syncScrollLock(); });
    }

    const toggle = document.getElementById('menuToggle');
    const menu = document.getElementById('mobileMenu');
    const closeBtn = document.getElementById('mobileClose');
    const overlay = document.querySelector('.mobile-overlay');
    const search = document.getElementById('mobileSearch');
    if(!toggle || !menu || !overlay) return;

    function open(){
      menu.hidden = false;
      menu.classList.add('open');
      toggle.setAttribute('aria-expanded','true');
      overlay.classList.add('show');
      disableScroll();
      setTimeout(() => { if (search) search.focus(); }, 0);
    }
    function close(){
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
      overlay.classList.remove('show');
      enableScroll();
      // Wait for transition end before hiding
      const onEnd = () => { menu.hidden = true; menu.removeEventListener('transitionend', onEnd); };
      menu.addEventListener('transitionend', onEnd);
    }
    function toggleMenu(){ menu.classList.contains('open') ? close() : open(); }

    toggle.addEventListener('click', toggleMenu);
    // Visually swap burger to X by hiding header button when open
    function updateHeaderButton(){ toggle.style.visibility = menu.classList.contains('open') ? 'hidden' : 'visible'; }
    const observer = new MutationObserver(updateHeaderButton);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
    updateHeaderButton();
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    window.addEventListener('resize', () => { if (window.innerWidth > 768) close(); });

    // Submenu toggles
    menu.querySelectorAll('.submenu-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const controls = btn.getAttribute('aria-controls');
        const list = controls ? document.getElementById(controls) : null;
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        if (list) list.hidden = expanded;
      });
    });

    // Search filter
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        menu.querySelectorAll('.menu-list > li').forEach(item => {
          const label = (item.getAttribute('data-label') || '').toLowerCase();
          const text = item.textContent.toLowerCase();
          const match = !q || label.includes(q) || text.includes(q);
          item.style.display = match ? '' : 'none';
        });
      });
    }

    // Focus trap (simple)
    function trapFocus(e){
      if (!menu.classList.contains('open')) return;
      const focusable = menu.querySelectorAll('a[href], button:not([disabled]), input');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      trapFocus(e);
    });

    // Swipe to close
    let startY = null, currentY = null, dragging = false;
    function onTouchStart(e){ startY = e.touches[0].clientY; dragging = true; }
    function onTouchMove(e){ if(!dragging) return; currentY = e.touches[0].clientY; const delta = currentY - startY; if (delta > 0) menu.style.transform = `translateY(${Math.min(delta, window.innerHeight)}px)`; }
    function onTouchEnd(){ if(!dragging) return; dragging = false; const delta = (currentY ?? startY) - startY; menu.style.transform = ''; if (delta > 80) close(); }
    menu.addEventListener('touchstart', onTouchStart, { passive: true });
    menu.addEventListener('touchmove', onTouchMove, { passive: true });
    menu.addEventListener('touchend', onTouchEnd);

    // Scroll lock
    function disableScroll(){ document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'; }
    function enableScroll(){ document.documentElement.style.overflow=''; document.body.style.overflow=''; }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();