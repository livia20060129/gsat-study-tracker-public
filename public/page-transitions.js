// Shared by app and static pages; listen before the first pagereveal event.
(function setupPageTransitions() {
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
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** @type {Animation[]} */
  let entryAnimations = [];

  function cancelEntry() {
    for (const animation of entryAnimations) animation.cancel();
    entryAnimations = [];
  }

  function animateEntry() {
    cancelEntry();
    if (reducedMotion.matches || document.visibilityState === 'hidden') return;
    if (!document.body || typeof Element.prototype.animate !== 'function') return;
    for (const content of document.body.children) {
      if (!(content instanceof HTMLElement) || content.matches('.site-rail,.site-mobile-bar,.site-rail-backdrop,script,style,link')) continue;
      entryAnimations.push(content.animate([{ opacity: 0 }, { opacity: 1 }], {
        id: 'study-page-entry', duration: 200, easing: 'ease-out',
      }));
    }
  }

  const revealEvent = 'onpagereveal' in window ? 'pagereveal' : 'pageshow';
  window.addEventListener(revealEvent, animateEntry);
  window.addEventListener('pageswap', cancelEntry);
  window.addEventListener('pagehide', cancelEntry);
  reducedMotion.addEventListener('change', cancelEntry);
})();
