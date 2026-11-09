// Lucide ISC icons, pinned source: 53fab88ff9d1b48f4704b5b5b560d6b4d560bf4c.
// Copyright (c) 2026 Lucide Icons and Contributors. See LUCIDE_LICENSE.txt.
(function initializeStudyIcons() {
  if (typeof MutationObserver !== 'function' || typeof Element !== 'function') return;
  const paths = {"book-open-check":"<path d=\"M12 5v16\" />\n  <path d=\"m16 12 2 2 4-4\" />\n  <path d=\"M22 6V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2h4.001A2 2 0 0022 17v-1.344\" />\n","book-open":"<path d=\"M12 5v16\" />\n  <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" />\n","calendar-clock":"<path d=\"M16 14v2.2l1.6 1\" />\n  <path d=\"M16 2v3\" />\n  <path d=\"M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338\" />\n  <path d=\"M3 9h5.859\" />\n  <path d=\"M8 2v3\" />\n  <circle cx=\"16\" cy=\"16\" r=\"6\" />\n","calendar-days":"<path d=\"M8 2v3\" />\n  <path d=\"M16 2v3\" />\n  <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" />\n  <path d=\"M3 9h18\" />\n  <path d=\"M8 13h.01\" />\n  <path d=\"M12 13h.01\" />\n  <path d=\"M16 13h.01\" />\n  <path d=\"M8 17h.01\" />\n  <path d=\"M12 17h.01\" />\n  <path d=\"M16 17h.01\" />\n","chart-no-axes-combined":"<path d=\"M12 16v5\" />\n  <path d=\"M16 14.639V21\" />\n  <path d=\"M20 10.656V21\" />\n  <path d=\"m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15\" />\n  <path d=\"M4 18.463V21\" />\n  <path d=\"M8 14.656V21\" />\n","chevron-down":"<path d=\"m6 9 6 6 6-6\" />\n","clipboard-list":"<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" />\n  <path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" />\n  <path d=\"M12 11h4\" />\n  <path d=\"M12 16h4\" />\n  <path d=\"M8 11h.01\" />\n  <path d=\"M8 16h.01\" />\n","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 6v6l4 2\" />\n","download":"<path d=\"M12 15V3\" />\n  <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" />\n  <path d=\"m7 10 5 5 5-5\" />\n","eye-off":"<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" />\n  <path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" />\n  <path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" />\n  <path d=\"m2 2 20 20\" />\n","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" />\n  <circle cx=\"12\" cy=\"12\" r=\"3\" />\n","flag":"<path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528\" />\n","heart-pulse":"<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />\n  <path d=\"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\" />\n","house":"<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" />\n  <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />\n","info":"<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 16v-4\" />\n  <path d=\"M12 8h.01\" />\n","list-todo":"<path d=\"M13 5h8\" />\n  <path d=\"M13 12h8\" />\n  <path d=\"M13 19h8\" />\n  <path d=\"m3 17 2 2 4-4\" />\n  <rect x=\"3\" y=\"4\" width=\"6\" height=\"6\" rx=\"1\" />\n","menu":"<path d=\"M4 5h16\" />\n  <path d=\"M4 12h16\" />\n  <path d=\"M4 19h16\" />\n","notebook-pen":"<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\" />\n  <path d=\"M2 6h4\" />\n  <path d=\"M2 10h4\" />\n  <path d=\"M2 14h4\" />\n  <path d=\"M2 18h4\" />\n  <path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\" />\n","pencil":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" />\n  <path d=\"m15 5 4 4\" />\n","plus":"<path d=\"M5 12h14\" />\n  <path d=\"M12 5v14\" />\n","save":"<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" />\n  <path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" />\n  <path d=\"M7 3v4a1 1 0 0 0 1 1h7\" />\n","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\" />\n  <circle cx=\"12\" cy=\"12\" r=\"3\" />\n","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />\n","trash":"<path d=\"M10 11v6\" />\n  <path d=\"M14 11v6\" />\n  <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" />\n  <path d=\"M3 6h18\" />\n  <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" />\n","volume-2":"<path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\" />\n  <path d=\"M16 9a5 5 0 0 1 0 6\" />\n  <path d=\"M19.364 18.364a9 9 0 0 0 0-12.728\" />\n","cloud-upload":"<path d=\"M12 13v8\" />\n  <path d=\"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242\" />\n  <path d=\"m8 17 4-4 4 4\" />","cloud-exclamation-point":"<path d=\"M12 12v4\" />\n  <path d=\"M12 20h.01\" />\n  <path d=\"M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642\" />","cloud-check":"<path d=\"m17 15-5.5 5.5L9 18\" />\n  <path d=\"M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327\" />","save-check":"<path d=\"M12.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4v4.35\" />\n  <path d=\"m16 19 2 2 4-4\" />\n  <path d=\"M17 15.13V14a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" />\n  <path d=\"M7 3v4a1 1 0 0 0 1 1h7\" />","triangle-exclamation-point":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" />\n  <path d=\"M12 9v4\" />\n  <path d=\"M12 17h.01\" />","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" />\n  <path d=\"M2 12h20\" />","globe-off":"<path d=\"M10.114 4.462A14.5 14.5 0 0 1 12 2a10 10 0 0 1 9.313 13.643\" />\n  <path d=\"M15.557 15.556A14.5 14.5 0 0 1 12 22 10 10 0 0 1 4.929 4.929\" />\n  <path d=\"M15.892 10.234A14.5 14.5 0 0 0 12 2a10 10 0 0 0-3.643.687\" />\n  <path d=\"M17.656 12H22\" />\n  <path d=\"M19.071 19.071A10 10 0 0 1 12 22 14.5 14.5 0 0 1 8.44 8.45\" />\n  <path d=\"M2 12h10\" />\n  <path d=\"m2 2 20 20\" />","globe-x":"<path d=\"m16 3 5 5\" />\n  <path d=\"M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10\" />\n  <path d=\"m21 3-5 5\" />","globe-check":"<path d=\"m15 6 2 2 4-4\" />\n  <path d=\"M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10\" />"};
  const namespace = 'http://www.w3.org/2000/svg';
  const visitedSurfaces = new WeakSet();
  function hydrateIcon(node) {
    const name = node.getAttribute('data-ui-icon');
    if (!Object.hasOwn(paths, name) || node.getAttribute('data-ui-icon-ready') === name) return;
    const svg = node.localName === 'svg' ? node : document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false'); svg.classList.add('ui-icon');
    svg.innerHTML = paths[name];
    if (svg !== node) node.replaceChildren(svg);
    node.setAttribute('data-ui-icon-ready', name);
  }
  function decorateButton(button) {
    if (button.querySelector('[data-ui-icon],[data-home-icon]')) return;
    const label = button.textContent.trim();
    let name = '', only = false;
    if (button.id === 'toggleVocabularyTranslations') { name = label === '隱藏中文' ? 'eye-off' : 'eye'; only = true; }
    else if (label === '編輯') { name = 'pencil'; only = true; }
    else if (button.matches('.delete,[data-action="delete-item"],[data-action="mag-delete"],[data-action="word-delete"]')) { name = 'trash'; only = true; }
    else if (/^新增/.test(label)) name = 'plus';
    else if (button.hasAttribute('data-export-vocabulary')) name = 'download';
    else if (/^[▾▴▼▲]$/.test(label)) { name = 'chevron-down'; only = true; }
    if (!name) {
      button.classList.remove('ui-icon-only');
      if (button.dataset.uiGeneratedLabel && button.getAttribute('aria-label') === button.dataset.uiGeneratedLabel) {
        button.removeAttribute('aria-label'); button.removeAttribute('title'); delete button.dataset.uiGeneratedLabel;
      }
      return;
    }
    const icon = document.createElement('span'); icon.dataset.uiIcon = name; icon.setAttribute('aria-hidden', 'true');
    if (only) {
      if (!button.hasAttribute('aria-label')) { button.setAttribute('aria-label', label); button.dataset.uiGeneratedLabel=label; }
      button.title = button.getAttribute('aria-label'); button.classList.add('ui-icon-only');
      button.replaceChildren(icon);
    } else button.prepend(icon, document.createTextNode(' '));
    hydrateIcon(icon);
  }
  function visit(root) {
    if (!(root instanceof Element)) root = root.parentElement;
    if (!root || root.closest('script,style')) return;
    // Mobile slides move the original main/rail nodes. Their descendants have
    // already been hydrated; newly rendered children are observed separately.
    if (root.matches('main,.site-rail')) {
      if (visitedSurfaces.has(root)) return;
      visitedSurfaces.add(root);
    }
    const nodes = root.matches('[data-ui-icon],button,summary') ? [root] : [];
    nodes.push(...root.querySelectorAll('[data-ui-icon],button,summary'));
    for (const node of nodes) {
      if (node.hasAttribute('data-ui-icon')) hydrateIcon(node);
      else if (node.localName === 'button') decorateButton(node);
      else if (node.localName === 'summary' && !node.matches('.connection-status-bar') && !node.querySelector('.ui-disclosure-chevron')) {
        node.classList.add('ui-disclosure-summary');
        const icon = document.createElementNS(namespace,'svg');
        icon.dataset.uiIcon = 'chevron-down'; icon.classList.add('ui-disclosure-chevron');
        node.append(icon); hydrateIcon(icon);
      }
    }
  }
  new MutationObserver(records => {
    const roots = new Set();
    for (const record of records) {
      if (record.type === 'attributes') roots.add(record.target);
      else {
        if (record.target instanceof Element && record.target.matches('button')) roots.add(record.target);
        for (const node of record.addedNodes) if (node instanceof Element) roots.add(node);
      }
    }
    for (const root of roots) visit(root);
  }).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['data-ui-icon'] });
  window.StudyIcons = { hydrate:visit };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>visit(document.documentElement),{once:true});
  else visit(document.documentElement);
})();

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
        ['todo.html', '待辦事項', '全部、本月、本週的逾期項目', '<svg data-ui-icon="list-todo" aria-hidden="true"></svg>'],
        ['material.progress.html', '教材進度圖', '檢視範圍與管理教材目錄', '<svg data-ui-icon="book-open-check" aria-hidden="true"></svg>'],
        ['vocabulary.review.html', '英文單字複習', '單字、組合與句子', '<svg data-ui-icon="book-open" aria-hidden="true"></svg>'],
        ['gpt.prompt.html', '排程建議prompt', '用於 AI 幫助 Google Calendar 排程', '<svg data-ui-icon="calendar-clock" aria-hidden="true"></svg>'],
      ];
      const left = document.createElement('aside');
      left.className = 'site-rail site-rail-left';
      left.id = 'siteLeftRail';
      left.setAttribute('aria-label', '日期與每週紀錄');
      left.innerHTML = '<h1 class="site-mobile-section-heading">日期紀錄</h1><div class="site-rail-top"><a class="site-brand" href="./index.html"><span aria-hidden="true">✓</span><span><strong>讀書紀錄卡</strong><small>STUDY LOG</small></span></a></div><div class="site-rail-date"><span data-rail-year></span><strong data-rail-date></strong><span data-rail-weekday></span></div><section class="site-week"><span>本週紀錄</span><strong><b data-rail-days>0</b><small>／7</small></strong><p data-rail-week-description></p><div class="site-week-ticks" aria-label="本週每日紀錄"></div></section><a class="site-summary-link" href="./summary.html"><svg data-ui-icon="chart-no-axes-combined" aria-hidden="true"></svg>查看週／月總結 <span aria-hidden="true">↗</span></a><div class="site-rail-bottom"><span data-rail-storage>資料儲存於本機</span><p data-rail-account></p></div>';
      const right = document.createElement('aside');
      right.className = 'site-rail site-rail-right';
      right.id = 'siteRightRail';
      right.setAttribute('aria-label', '工具與本週逾期');
      right.innerHTML = `<h1 class="site-mobile-section-heading">功能選單</h1><div class="site-rail-top"><a class="site-workspace-home" href="./index.html"><strong>GSAT Tracker</strong><span><svg data-ui-icon="house" aria-hidden="true"></svg>首頁</span></a></div><nav class="site-tools" aria-label="讀書工具">${tools.map(([href, title, caption, icon]) => `<a href="./${href}" aria-label="${title}"><span class="site-tool-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${caption}</small></span><span class="site-tool-arrow" aria-hidden="true">→</span></a>`).join('')}</nav><section class="site-overdue"><header><h2>本週逾期</h2><span data-rail-overdue-count>0 項</span></header><div data-rail-overdue-list></div><a class="site-overdue-all" href="./todo.html?period=all">查看全部待辦 →</a></section>`;
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
      bar.innerHTML = `<a class="site-mobile-home" href="./index.html">GSAT Tracker</a><nav aria-label="手機全頁分區"><button type="button" data-mobile-section="date" aria-controls="siteLeftRail" aria-pressed="false"><span aria-hidden="true" data-ui-icon="calendar-days"></span><span>日期紀錄</span></button><button type="button" data-mobile-section="content" aria-pressed="true"><span aria-hidden="true" data-ui-icon="notebook-pen"></span><span>${contentTitle}</span></button><button type="button" data-mobile-section="tools" aria-controls="siteRightRail" aria-pressed="false"><span aria-hidden="true" data-ui-icon="menu"></span><span>功能選單</span></button></nav>`;
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
