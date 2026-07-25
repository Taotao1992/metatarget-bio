/* 元靶科技 MetaTarget bio · 内部知识库
   app.js —— hash 路由、全文搜索、章节进度、返回顶部、折叠块
   纯原生 JS，无外部请求。内容数据来自 assets/js/content/*.js（硬编码）。 */
(function () {
  'use strict';

  var PAGES = window.SITE_PAGES || [];
  var pageById = {};
  PAGES.forEach(function (p) { pageById[p.id] = p; });

  var BADGES = {
    fact:     ['公开事实', 'b-fact'],
    plan:     ['公司规划', 'b-plan'],
    analysis: ['分析判断', 'b-analysis'],
    risk:     ['风险 · 待核验', 'b-risk'],
    demo:     ['示例数据 Demo', 'b-demo']
  };

  var pageRoot = document.getElementById('pageRoot');
  var navList = document.getElementById('navList');
  var progressBar = document.getElementById('progressBar');
  var backTop = document.getElementById('backTop');
  var sidebar = document.getElementById('sidebar');
  var sidebarMask = document.getElementById('sidebarMask');
  var menuToggle = document.getElementById('menuToggle');
  var searchInput = document.getElementById('searchInput');
  var searchResults = document.getElementById('searchResults');

  /* ---------- 导航 ---------- */
  function buildNav() {
    var html = '';
    PAGES.forEach(function (p, i) {
      html += '<li><a href="#/' + p.id + '" data-page="' + p.id + '">' +
        '<span class="nav-num">' + (i + 1) + '</span><span>' + p.nav + '</span></a></li>';
    });
    navList.innerHTML = html;
  }

  function setActiveNav(pageId) {
    var links = navList.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-page') === pageId);
    }
  }

  /* ---------- 徽章 ---------- */
  function badgeHtml(keys) {
    if (!keys || !keys.length) return '';
    var out = '';
    keys.forEach(function (k) {
      var b = BADGES[k];
      if (b) out += '<span class="badge ' + b[1] + '">' + b[0] + '</span>';
    });
    return out;
  }

  /* ---------- 渲染页面 ---------- */
  function renderPage(pageId, sectionId) {
    var page = pageById[pageId] || PAGES[0];
    pageId = page.id;

    var html = '';
    html += '<div class="page-banner">内部参考，请勿外传</div>';
    html += '<div class="page-head">';
    if (page.kicker) html += '<div class="kicker">' + page.kicker + '</div>';
    html += '<h1>' + page.title + '</h1>';
    if (page.lede) html += '<div class="page-lede">' + page.lede + '</div>';
    html += '</div>';

    // 本页目录
    var tocItems = page.sections.filter(function (s) { return s.type !== 'hero' && s.title; });
    if (tocItems.length > 1) {
      html += '<nav class="page-toc" aria-label="本页目录"><span class="toc-label">本页目录</span>';
      tocItems.forEach(function (s, i) {
        if (i > 0) html += '<span class="toc-sep">·</span>';
        html += '<a href="#/' + pageId + '/' + s.id + '" data-sec="' + s.id + '">' + s.title + '</a>';
      });
      html += '</nav>';
    }

    page.sections.forEach(function (s) {
      if (s.type === 'hero') {
        html += '<div class="hero" id="sec-' + s.id + '">' + s.html + '</div>';
        return;
      }
      var open = s.open !== false;
      html += '<section class="block' + (open ? '' : ' collapsed') + '" id="sec-' + s.id + '">';
      html += '<div class="block-head">';
      html += '<button class="collapse-btn" aria-expanded="' + open + '" aria-controls="body-' + s.id + '">' +
        '<span class="caret">▾</span><h2>' + s.title + '</h2></button>';
      html += '<span class="block-badges">' + badgeHtml(s.badges) + '</span>';
      html += '</div>';
      html += '<div class="block-body" id="body-' + s.id + '">' + s.html + '</div>';
      html += '</section>';
    });

    pageRoot.innerHTML = html;
    document.title = page.nav + ' · 元靶科技 MetaTarget bio 内部知识库';

    // 折叠交互
    var btns = pageRoot.querySelectorAll('.collapse-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var block = this.closest('.block');
        var collapsed = block.classList.toggle('collapsed');
        this.setAttribute('aria-expanded', String(!collapsed));
      });
    }

    // 强制所有外链新窗口 + noopener（不显示裸 URL，由内容侧保证）
    var ext = pageRoot.querySelectorAll('a[href^="http"]');
    for (var j = 0; j < ext.length; j++) {
      ext[j].setAttribute('target', '_blank');
      ext[j].setAttribute('rel', 'noopener');
    }

    setActiveNav(pageId);
    if (window.DEMOS && window.DEMOS.mount) window.DEMOS.mount(pageId, pageRoot);

    // 滚动定位
    if (sectionId) {
      var el = document.getElementById('sec-' + sectionId);
      if (el) {
        if (el.classList.contains('block') && el.classList.contains('collapsed')) {
          el.classList.remove('collapsed');
          var b = el.querySelector('.collapse-btn');
          if (b) b.setAttribute('aria-expanded', 'true');
        }
        setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 0);
      }
    } else {
      window.scrollTo(0, 0);
    }
    updateProgress();
  }

  /* ---------- 路由 ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    return { page: parts[0] || 'home', section: parts[1] || '' };
  }

  function route() {
    var r = parseHash();
    var samePage = pageRoot.getAttribute('data-current') === r.page;
    if (!samePage) {
      pageRoot.setAttribute('data-current', r.page);
      renderPage(r.page, r.section);
    } else if (r.section) {
      var el = document.getElementById('sec-' + r.section);
      if (el) el.scrollIntoView({ block: 'start' });
    }
  }

  /* ---------- 阅读进度 + 章节高亮 + 返回顶部 ---------- */
  function updateProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var y = window.scrollY || doc.scrollTop;
    progressBar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
    backTop.hidden = y < 400;

    // 章节进度（scrollspy）
    var tocLinks = pageRoot.querySelectorAll('.page-toc a');
    if (!tocLinks.length) return;
    var current = '';
    for (var i = 0; i < tocLinks.length; i++) {
      var sec = document.getElementById('sec-' + tocLinks[i].getAttribute('data-sec'));
      if (sec && sec.getBoundingClientRect().top <= 120) current = tocLinks[i].getAttribute('data-sec');
    }
    for (var k = 0; k < tocLinks.length; k++) {
      tocLinks[k].classList.toggle('current', tocLinks[k].getAttribute('data-sec') === current);
    }
  }

  /* ---------- 全文搜索（索引由硬编码内容在本地构建，无网络请求） ---------- */
  function stripHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  var searchIndex = [];
  PAGES.forEach(function (p) {
    p.sections.forEach(function (s) {
      var text = stripHtml((s.title || '') + ' ' + s.html + ' ' + (s.keywords || ''));
      searchIndex.push({
        page: p.id, pageTitle: p.nav, sec: s.id,
        secTitle: s.title || p.nav, text: text, lower: text.toLowerCase()
      });
    });
  });

  function snippet(text, q) {
    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text.slice(0, 60) + '…';
    var start = Math.max(0, idx - 24);
    var raw = (start > 0 ? '…' : '') + text.slice(start, idx + q.length + 36) + '…';
    return raw.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), function (m) {
      return '<mark>' + m + '</mark>';
    });
  }

  function doSearch() {
    var q = searchInput.value.trim();
    if (!q) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
    var terms = q.toLowerCase().split(/\s+/);
    var hits = searchIndex.filter(function (it) {
      return terms.every(function (t) { return it.lower.indexOf(t) >= 0; });
    }).slice(0, 12);

    if (!hits.length) {
      searchResults.innerHTML = '<div class="search-empty">没有找到「' + q.replace(/</g, '&lt;') + '」相关内容</div>';
    } else {
      var html = '';
      hits.forEach(function (h) {
        html += '<button class="search-item" data-page="' + h.page + '" data-sec="' + h.sec + '">' +
          '<span class="si-page">' + h.pageTitle + '</span>' +
          '<span class="si-title">' + h.secTitle + '</span>' +
          '<span class="si-snip">' + snippet(h.text, terms[0]) + '</span></button>';
      });
      searchResults.innerHTML = html;
      var items = searchResults.querySelectorAll('.search-item');
      for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('click', function () {
          location.hash = '#/' + this.getAttribute('data-page') + '/' + this.getAttribute('data-sec');
          searchResults.hidden = true;
          searchInput.value = '';
          closeDrawer();
        });
      }
    }
    searchResults.hidden = false;
  }

  /* ---------- 外链离站提示（§0：用户主动点击来源时提示「即将离开内部站」） ---------- */
  var leaveMask = null, leaveHost = null, leaveLabel = null, leaveGo = null, leaveCancel = null, pendingHref = '';

  function ensureLeaveModal() {
    if (leaveMask) return;
    leaveMask = document.createElement('div');
    leaveMask.className = 'leave-mask';
    leaveMask.hidden = true;
    leaveMask.innerHTML =
      '<div class="leave-card" role="dialog" aria-modal="true" aria-labelledby="leaveTitle">' +
      '<div class="leave-title" id="leaveTitle">即将离开内部站</div>' +
      '<p class="leave-body">前往外部来源：<b class="leave-host"></b><br>' +
      '<span class="leave-label"></span></p>' +
      '<p class="leave-note">外部网站内容不受本站控制，请在来源页面核对口径与版本。链接将在新标签页打开。</p>' +
      '<div class="leave-actions">' +
      '<button type="button" class="leave-go">继续前往</button>' +
      '<button type="button" class="leave-cancel">取消</button>' +
      '</div></div>';
    document.body.appendChild(leaveMask);
    leaveHost = leaveMask.querySelector('.leave-host');
    leaveLabel = leaveMask.querySelector('.leave-label');
    leaveGo = leaveMask.querySelector('.leave-go');
    leaveCancel = leaveMask.querySelector('.leave-cancel');
    leaveGo.addEventListener('click', function () {
      window.open(pendingHref, '_blank', 'noopener');
      hideLeave();
    });
    leaveCancel.addEventListener('click', hideLeave);
    leaveMask.addEventListener('click', function (e) { if (e.target === leaveMask) hideLeave(); });
  }

  function hideLeave() { if (leaveMask) leaveMask.hidden = true; pendingHref = ''; }

  function showLeave(href, label) {
    ensureLeaveModal();
    pendingHref = href;
    try { leaveHost.textContent = new URL(href).hostname; } catch (e) { leaveHost.textContent = href; }
    leaveLabel.textContent = label || href;
    leaveMask.hidden = false;
    leaveGo.focus();
  }

  document.addEventListener('click', function (e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href^="http"]') : null;
    if (!a) return;
    e.preventDefault();
    showLeave(a.href, (a.textContent || '').replace(/\s+/g, ' ').trim());
  });

  /* ---------- 移动端抽屉 ---------- */
  function openDrawer() {
    sidebar.classList.add('open');
    sidebarMask.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    sidebar.classList.remove('open');
    sidebarMask.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  /* ---------- 事件 ---------- */
  buildNav();
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  backTop.addEventListener('click', function () { window.scrollTo({ top: 0 }); });
  menuToggle.addEventListener('click', function () {
    if (sidebar.classList.contains('open')) closeDrawer(); else openDrawer();
  });
  sidebarMask.addEventListener('click', closeDrawer);
  navList.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeDrawer();
  });
  searchInput.addEventListener('input', doSearch);
  searchInput.addEventListener('focus', doSearch);
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-box')) searchResults.hidden = true;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { searchResults.hidden = true; closeDrawer(); hideLeave(); }
  });

  route();
})();
