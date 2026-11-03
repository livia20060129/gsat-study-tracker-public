// Shared by app and static pages; listen before the first pagereveal event.
(function setupPageTransitions() {
  const menuEntryKey = 'study-v11:ui:menu-page-entry';
  const compact = window.matchMedia('(max-width: 1199px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function normalizedPath(url) {
    return url.pathname.replace(/\.html\/?$/, '').replace(/\/$/, '') || '/';
  }

  function consumeMenuEntry() {
    try {
      const raw = sessionStorage.getItem(menuEntryKey);
      if (!raw) return false;
      sessionStorage.removeItem(menuEntryKey);
      const saved = JSON.parse(raw);
      if (typeof saved?.href !== 'string' || typeof saved.at !== 'number') return false;
      const age = Date.now() - saved.at;
      const target = new URL(saved.href);
      const current = new URL(location.href);
      return age >= 0 && age < 60_000 && target.origin === current.origin
        && normalizedPath(target) === normalizedPath(current)
        && target.search === current.search && target.hash === current.hash;
    } catch { return false; }
  }

  let menuEntry = consumeMenuEntry() && compact.matches;
  if (menuEntry && !reducedMotion.matches) document.documentElement.dataset.menuPageEntry = 'pending';
  const source = document.currentScript?.src;
  if (source) {
    document.documentElement.classList.add('site-shell-ready');

    function mountShellFrame() {
      if (!document.body) return false;
      const tools = [
        ['todo.html', '待辦事項', '全部、本月、本週的逾期項目', '📅'],
        ['material.progress.html', '教材進度圖', '檢視範圍與管理教材目錄', '📖'],
        ['vocabulary.review.html', '英文單字複習', '單字、組合與句子', 'Aa'],
        ['gpt.prompt.html', '排程建議prompt', '用於 AI 幫助 Google Calendar 排程', '✧'],
      ];
      const left = document.createElement('aside');
      left.className = 'site-rail site-rail-left';
      left.id = 'siteLeftRail';
      left.setAttribute('aria-label', '日期與每週紀錄');
      left.innerHTML = '<h1 class="site-mobile-section-heading">日期紀錄</h1><div class="site-rail-top"><a class="site-brand" href="./index.html"><span aria-hidden="true">✓</span><span><strong>讀書紀錄卡</strong><small>STUDY LOG</small></span></a></div><div class="site-rail-date"><span data-rail-year></span><strong data-rail-date></strong><span data-rail-weekday></span></div><section class="site-week"><span>本週紀錄</span><strong><b data-rail-days>0</b><small>／7</small></strong><p data-rail-week-description></p><div class="site-week-ticks" aria-label="本週每日紀錄"></div></section><a class="site-summary-link" href="./summary.html">查看週／月總結 <span aria-hidden="true">↗</span></a><div class="site-rail-bottom"><span data-rail-storage>資料儲存於本機</span><p data-rail-account></p></div>';
      const right = document.createElement('aside');
      right.className = 'site-rail site-rail-right';
      right.id = 'siteRightRail';
      right.setAttribute('aria-label', '工具與本週逾期');
      right.innerHTML = `<h1 class="site-mobile-section-heading">功能選單</h1><div class="site-rail-top"><a class="site-workspace-home" href="./index.html"><strong>GSAT Tracker</strong><span>回到主頁 ↗</span></a></div><nav class="site-tools" aria-label="讀書工具">${tools.map(([href, title, caption, icon]) => `<a href="./${href}" aria-label="${title}"><span class="site-tool-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${caption}</small></span><span class="site-tool-arrow" aria-hidden="true">→</span></a>`).join('')}</nav><section class="site-overdue"><header><h2>本週逾期</h2><span data-rail-overdue-count>0 項</span></header><div data-rail-overdue-list></div><a class="site-overdue-all" href="./todo.html?period=all">查看全部待辦 →</a></section>`;
      const bar = document.createElement('div');
      bar.className = 'site-mobile-bar';
      bar.id = 'siteMobileBar';
      const contentTitles = {
        todo: '待辦事項', summary: '週／月總結', 'material.progress': '教材進度圖',
        'vocabulary.review': '英文單字複習', 'vocabulary.sources': '單字資料來源',
        'gpt.prompt': '排程建議prompt', privacy: '隱私權政策', terms: '服務條款', support: '使用者支援',
      };
      const pageName = location.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
      const contentTitle = contentTitles[pageName] || '今日記錄';
      bar.innerHTML = `<a class="site-mobile-home" href="./index.html">GSAT Tracker</a><nav aria-label="手機全頁分區"><button type="button" data-mobile-section="date" aria-controls="siteLeftRail" aria-pressed="false"><span aria-hidden="true">📅</span><span>日期紀錄</span></button><button type="button" data-mobile-section="content" aria-pressed="true"><span aria-hidden="true">📝</span><span>${contentTitle}</span></button><button type="button" data-mobile-section="tools" aria-controls="siteRightRail" aria-pressed="false"><span aria-hidden="true">☰</span><span>功能選單</span></button></nav>`;
      if (!pageName || pageName === 'index') bar.querySelector('.site-mobile-home').setAttribute('aria-current', 'page');
      const today = new Date();
      left.querySelector('[data-rail-year]').textContent = String(today.getFullYear());
      left.querySelector('[data-rail-date]').textContent = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
      left.querySelector('[data-rail-weekday]').textContent = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][today.getDay()];
      document.body.classList.add('has-site-shell');
      document.body.append(left, right, bar);

      const shell = document.createElement('script');
      shell.type = 'module';
      const shellUrl = new URL('./site-shell.js', source);
      shellUrl.search = new URL(source).search;
      shell.src = shellUrl.href;
      shell.addEventListener('error', function restoreOriginalLayout() {
        document.documentElement.classList.remove('site-shell-ready');
        document.body.classList.remove('has-site-shell');
        for (const element of [left, right, bar]) element.remove();
      });
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function hydrateShell() { document.head.append(shell); }, { once: true });
      } else {
        document.head.append(shell);
      }
      return true;
    }

    if (!mountShellFrame()) {
      const observer = new MutationObserver(function waitForBody() {
        if (mountShellFrame()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }
  /** @type {Animation[]} */
  let entryAnimations = [];
  let restoreEntryPositions = [];
  let departureAnimation = null;
  let pendingDestination = null;
  let restoreDeparture = null;

  function restoreEntry() {
    for (const restore of restoreEntryPositions) restore();
    restoreEntryPositions = [];
    delete document.documentElement.dataset.menuPageEntry;
  }

  function cancelEntry() {
    menuEntry = false;
    for (const animation of entryAnimations) animation.cancel();
    entryAnimations = [];
    restoreEntry();
  }

  function animateEntry() {
    const slide = menuEntry && compact.matches;
    menuEntry = false;
    cancelEntry();
    if (reducedMotion.matches || document.visibilityState === 'hidden') return;
    if (!document.body || typeof Element.prototype.animate !== 'function') return;
    for (const content of document.body.children) {
      if (!(content instanceof HTMLElement) || content.matches('.site-rail,.site-mobile-bar,.site-rail-backdrop,script,style,link')) continue;
      if (slide) {
        if (!content.matches('main,header,footer,section') || !content.getClientRects().length) continue;
        if (getComputedStyle(content).position === 'static') {
          const previous = content.style.position;
          const hadStyle = content.hasAttribute('style');
          content.style.position = 'relative';
          restoreEntryPositions.push(function restorePosition() {
            if (content.style.position === 'relative') content.style.position = previous;
            if (!hadStyle && !content.style.length) content.removeAttribute('style');
          });
        }
        document.documentElement.dataset.menuPageEntry = 'animating';
        entryAnimations.push(content.animate([{ left: `${-document.body.getBoundingClientRect().width}px` }, { left: '0px' }], {
          id: 'study-menu-page-in', duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)',
        }));
      } else {
        entryAnimations.push(content.animate([{ opacity: 0 }, { opacity: 1 }], {
          id: 'study-page-entry', duration: 200, easing: 'ease-out',
        }));
      }
    }
    if (slide) {
      const current = entryAnimations;
      Promise.all(current.map(animation => animation.finished)).then(function finishEntry() {
        if (entryAnimations === current) restoreEntry();
      }, function cancelledEntry() {});
    }
  }

  function cancelDeparture() {
    departureAnimation?.cancel();
    departureAnimation = null;
    pendingDestination = null;
    restoreDeparture?.();
    restoreDeparture = null;
    delete document.documentElement.dataset.menuPageDeparture;
  }

  function finishNavigation() {
    if (!pendingDestination) return;
    const destination = pendingDestination;
    pendingDestination = null;
    departureAnimation?.finish();
    try { sessionStorage.setItem(menuEntryKey, JSON.stringify({ href: destination.href, at: Date.now() })); }
    catch { /* The original URL navigation remains available without session storage. */ }
    location.assign(destination.href);
  }

  document.addEventListener('click', function navigateFromMenu(event) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#siteMobileBar button') && document.documentElement.dataset.menuPageEntry) cancelEntry();
    if (departureAnimation && event.target.closest('#siteMobileBar button')) cancelDeparture();
    const link = event.target.closest('#siteRightRail a');
    if (!(link instanceof HTMLAnchorElement) || !compact.matches || document.body?.dataset.mobileSection !== 'tools') return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (link.hasAttribute('download') || (link.target && link.target !== '_self') || reducedMotion.matches) return;
    const destination = new URL(link.href);
    if (destination.origin !== location.origin || !/^https?:$/.test(destination.protocol)) return;
    if (destination.pathname === location.pathname && destination.search === location.search) return;
    event.preventDefault();
    if (pendingDestination) return;
    pendingDestination = destination;
    const panel = document.getElementById('siteRightRail');
    if (!panel || typeof panel.animate !== 'function') { finishNavigation(); return; }
    const pointerEvents = panel.style.pointerEvents;
    const hadStyle = panel.hasAttribute('style');
    panel.style.pointerEvents = 'none';
    restoreDeparture = function restoreMenu() {
      if (panel.style.pointerEvents === 'none') panel.style.pointerEvents = pointerEvents;
      if (!hadStyle && !panel.style.length) panel.removeAttribute('style');
    };
    document.documentElement.dataset.menuPageDeparture = 'animating';
    departureAnimation = panel.animate([{ left: '0px' }, { left: `${document.body.getBoundingClientRect().width}px` }], {
      id: 'study-menu-page-out', duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards',
    });
    departureAnimation.finished.then(finishNavigation, function cancelledDeparture() {});
  }, true);

  document.addEventListener('study-mobile-section-change', function stopPageMotionBeforeSectionChange() {
    cancelEntry();
    cancelDeparture();
  });

  document.addEventListener('keydown', function cancelMenuNavigation(event) {
    if (event.key === 'Escape') cancelDeparture();
  }, true);
  document.addEventListener('visibilitychange', function finishHiddenNavigation() {
    if (document.visibilityState === 'hidden') finishNavigation();
  });
  compact.addEventListener('change', function finishResizedNavigation() {
    cancelEntry();
    finishNavigation();
  });

  const revealEvent = 'onpagereveal' in window ? 'pagereveal' : 'pageshow';
  window.addEventListener(revealEvent, animateEntry);
  window.addEventListener('pageswap', cancelEntry);
  window.addEventListener('pagehide', cancelEntry);
  window.addEventListener('pagehide', cancelDeparture);
  reducedMotion.addEventListener('change', cancelEntry);
  reducedMotion.addEventListener('change', finishNavigation);
})();
