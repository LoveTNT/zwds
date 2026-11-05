/* ==========================================================================
 * 紫微斗数静态版 · chart.js  【DOM 渲染层】
 * 设计系统：Apple（工具化转译版 / Apple HIG · Utility Profile）
 *
 * 职责：把 engine.buildView() 产出的纯数据渲染为 12 宫格 + 中宫 + 宫位详情浮层。
 *       不含任何排盘逻辑，不碰 localStorage / URL / 主题。
 * 依赖：engine.js（先加载）→ window.ZW.engine
 * 挂载：window.ZW.chart
 * ========================================================================== */
(function (root) {
  'use strict';

  var ZW = root.ZW || (root.ZW = {});
  var doc = root.document;
  var engine = ZW.engine;

  var MAX_MINOR = 6;   /* 宫格内辅星 + 杂曜 + 运限流曜合计超过此数折叠「+N」 */

  var SCOPE_LABEL = {
    origin: '本命', decadal: '大限', yearly: '流年',
    monthly: '流月', daily: '流日', hourly: '流时'
  };
  var TYPE_LABEL = {
    major: '主星', soft: '辅星', tough: '煞星', tianma: '天马',
    lucun: '禄存', flower: '桃花', helper: '助星', adjective: '杂曜'
  };

  var chartEl = null, overlayEl = null, popEl = null;
  var popTitle = null, popSub = null, popBody = null, popClose = null, pageEl = null;
  var currentView = null;
  var lastFocus = null;

  /* ── 工具 ───────────────────────────────────────────────── */
  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function scopeLabel(s) { return SCOPE_LABEL[s] || s || '本命'; }
  function typeLabel(s) { return TYPE_LABEL[s] || '星曜'; }

  function badgeBrightness(s) {
    if (!s.brightness) return '';
    return '<sup class="badge badge--brightness" data-level="' + esc(s.brightnessLevel) + '">' +
           esc(s.brightness) + '</sup>';
  }

  function badgeMutagen(m) {
    return '<sup class="badge badge--mutagen" data-m="' + esc(m.key) +
           '" data-kind="' + esc(m.kind) + '" title="' + esc(engine.mutagenGloss(m.label)) +
           '">' + esc(m.label) + '</sup>';
  }

  function starBadges(s, includeNatal) {
    var html = '';
    var list = s.mutagens || [];
    for (var i = 0; i < list.length; i++) {
      if (!includeNatal && list[i].kind !== 'horoscope') continue;
      html += badgeMutagen(list[i]);
    }
    return html;
  }

  function closestCell(node) {
    while (node && node !== chartEl) {
      if (node.nodeType === 1 && node.getAttribute && node.getAttribute('data-index') !== null &&
          node.classList && node.classList.contains('cell')) return node;
      node = node.parentNode;
    }
    return null;
  }

  /* ── 宫格 HTML ──────────────────────────────────────────── */
  function majorStarLi(s) {
    /* 仅主星在宫格内显示亮度徽标；四化含本命（实心）与运限（描边） */
    return '<li class="star"><span class="star__name">' + esc(s.name) + '</span>' +
           badgeBrightness(s) + starBadges(s, true) + '</li>';
  }

  function minorStarLi(s) {
    /* 辅星 / 杂曜：本命四化与亮度不进宫格；运限四化用描边徽标叠加（P0-6） */
    var cls = 'star star--minor' + (s.scope !== 'origin' ? ' star--horo' : '');
    return '<li class="' + cls + '"><span class="star__name">' + esc(s.name) + '</span>' +
           starBadges(s, false) + '</li>';
  }

  function cellHtml(p, view) {
    var isSoul = (p.index === view.soulIndex);
    var isActive = (view.mode !== 'natal' && p.index === view.activeIndex);
    var opp = view.palaces[p.oppositeIndex];
    var majorNames = p.majorStars.map(function (s) { return s.name; }).join('、') || '空宫';

    var aria = p.displayName + '，' + p.stemBranch + '，主星：' + majorNames +
      (isSoul ? '，命宫' : '') + (p.isBodyPalace ? '，身宫' : '') +
      (isActive ? '，当前' + (view.mode === 'decadal' ? '大限' : '流年') + '宫' : '') +
      '，按回车查看完整星曜';

    var html = '<div class="cell" role="gridcell" tabindex="0" data-index="' + p.index +
      '" data-area="' + esc(p.gridArea) +
      '" data-soul="' + (isSoul ? 'true' : 'false') +
      '" data-active="' + (isActive ? 'true' : 'false') +
      '" aria-label="' + esc(aria) + '">';

    /* 宫名区 */
    html += '<header class="cell__head">' +
      '<span class="cell__name">' + esc(p.displayName) + '</span>' +
      '<span class="cell__stem">' + esc(p.stemBranch) + '</span>' +
      (isSoul ? '<span class="badge badge--soul">命</span>' : '') +
      (p.isBodyPalace ? '<span class="badge badge--body">身</span>' : '') +
      '</header>';

    /* 主星区（空宫用「—」占位，footer 给「借对宫」提示） */
    if (p.majorStars.length) {
      html += '<ul class="cell__stars cell__stars--major">' +
        p.majorStars.map(majorStarLi).join('') + '</ul>';
    } else {
      html += '<ul class="cell__stars cell__stars--major"><li class="cell__empty">— 空宫</li></ul>';
    }

    /* 辅星 + 杂曜 + 运限流曜，超 6 个折叠「+N」 */
    var minors = p.minorStars.concat(p.adjectiveStars, p.horoscopeStars);
    if (minors.length) {
      html += '<div class="cell__divider"></div>';
      var shown = minors.slice(0, MAX_MINOR);
      var rest = minors.length - shown.length;
      html += '<ul class="cell__stars cell__stars--minor">' + shown.map(minorStarLi).join('') +
        (rest > 0 ? '<li class="badge badge--more">+' + rest + '</li>' : '') + '</ul>';
    }

    /* footer：大限虚岁区间 + 空宫借对宫 */
    var decadal = (p.decadalRange.length === 2)
      ? (p.decadalRange[0] + '–' + p.decadalRange[1]) : '';
    html += '<footer class="cell__foot">' +
      '<span class="cell__decadal">' + esc(decadal) + '</span>' +
      (p.isEmpty ? '<span class="cell__hint">借对宫 · ' + esc(opp.branch) + '</span>' : '') +
      '</footer>';

    html += '</div>';
    return html;
  }

  /* ── 中宫 HTML ──────────────────────────────────────────── */
  function centerHtml(m) {
    var kv = [
      ['四柱', m.chineseDate],
      ['五行局', m.fiveElementsClass],
      ['命主 / 身主', (m.soul || '—') + ' / ' + (m.body || '—')],
      ['生肖 / 星座', (m.zodiac || '—') + ' · ' + (m.sign || '—')],
      ['农历', m.lunarDate],
      ['命宫 / 身宫', (m.soulBranch || '—') + ' / ' + (m.bodyBranch || '—')]
    ];
    var rows = kv.map(function (pair) {
      return '<div><dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1] || '—') + '</dd></div>';
    }).join('');

    return '<div class="cell cell--center" data-area="center" role="note" aria-label="命盘基本信息">' +
      '<div class="center__head">' +
        '<p class="center__name">' + esc(m.name || '—') +
          '<span class="center__gender">' + esc(m.gender) + '</span></p>' +
        '<p class="center__date">' + esc(m.solarDate) + ' · ' + esc(m.time) + '</p>' +
      '</div>' +
      '<dl class="center__grid">' + rows + '</dl>' +
      '<p class="center__foot">' + esc(m.timeRange) + ' · 正月初一换年</p>' +
    '</div>';
  }

  /* ── 渲染命盘 ───────────────────────────────────────────── */
  function render(view) {
    if (!chartEl || !view) return;
    currentView = view;
    var html = '';
    for (var i = 0; i < view.palaces.length; i++) html += cellHtml(view.palaces[i], view);
    html += centerHtml(view.meta);
    chartEl.innerHTML = html;
  }

  /* ── 详情浮层：单颗星卡 ─────────────────────────────────── */
  function popStarHtml(s) {
    var badges = badgeBrightness(s) + starBadges(s, true);
    var meta = typeLabel(s.type) + ' · ' + scopeLabel(s.scope);
    var gloss = s.gloss ? '<div class="pop__star-gloss">' + esc(s.gloss) + '</div>' : '';
    var mutGloss = '';
    var list = s.mutagens || [];
    for (var i = 0; i < list.length; i++) {
      mutGloss += '<div class="pop__star-gloss">' + esc(engine.mutagenGloss(list[i].label)) + '</div>';
    }
    return '<div class="pop__star">' +
      '<div class="pop__star-top"><span class="pop__star-name">' + esc(s.name) + '</span>' + badges + '</div>' +
      '<div class="pop__star-meta">' + esc(meta) + '</div>' + gloss + mutGloss +
    '</div>';
  }

  function popStarSection(title, stars) {
    if (!stars || !stars.length) return '';
    return '<section class="pop__section"><h3 class="pop__heading">' + esc(title) + '</h3>' +
      '<div class="pop__stars">' + stars.map(popStarHtml).join('') + '</div></section>';
  }

  /* ── 详情浮层：完整内容 ─────────────────────────────────── */
  function detailHtml(view, index) {
    var p = view.palaces[index];
    var opp = view.palaces[p.oppositeIndex];
    var html = '';

    /* 1. 宫位元信息 */
    var kv = [
      ['宫干支', p.stemBranch],
      ['本命宫名', p.name],
      ['当前盘宫名', p.displayName],
      ['大限虚岁', (p.decadalRange.length === 2) ? (p.decadalRange[0] + '–' + p.decadalRange[1] + ' 岁') : '—'],
      ['长生十二神', p.changsheng12],
      ['博士十二神', p.boshi12],
      ['将前十二神', p.jiangqian12],
      ['岁前十二神', p.suiqian12],
      ['小限岁数', p.ages.length ? p.ages.join('、') : '—'],
      ['对宫', opp.stemBranch + ' · ' + opp.displayName]
    ];
    html += '<section class="pop__section"><h3 class="pop__heading">宫位信息</h3><dl class="pop__kv">' +
      kv.map(function (pair) {
        return '<div><dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1] || '—') + '</dd></div>';
      }).join('') + '</dl></section>';

    /* 2. 本命主星（空宫显示占位说明） */
    html += p.majorStars.length
      ? popStarSection('主星 · ' + p.majorStars.length + ' 颗', p.majorStars)
      : '<section class="pop__section"><h3 class="pop__heading">主星</h3>' +
        '<p class="pop__none">本宫无主星（空宫）。传统上参考对宫星曜，见下方「对宫借星」。</p></section>';

    /* 3. 辅星 / 杂曜 / 运限流曜：亮度、四化、scope、释义在此完整呈现 */
    html += popStarSection('辅星 · ' + p.minorStars.length + ' 颗', p.minorStars);
    html += popStarSection('杂曜 · ' + p.adjectiveStars.length + ' 颗', p.adjectiveStars);
    html += popStarSection('运限流曜 · ' + p.horoscopeStars.length + ' 颗', p.horoscopeStars);

    /* 4. 运限四化总览（含落在辅星/杂曜上的四化，保证信息不丢） */
    if (view.mode !== 'natal' && view.mutagenList && view.mutagenList.length) {
      var items = view.mutagenList.map(function (m) {
        return '<span class="pop__mutagen-item">' + badgeMutagen(m) +
          '<span>' + esc(m.star) + '</span></span>';
      }).join('');
      html += '<section class="pop__section"><h3 class="pop__heading">' +
        esc(view.mode === 'decadal' ? '大限' : '流年') + '四化</h3>' +
        '<div class="pop__mutagens"><span class="pop__mutagen-label">禄权科忌</span>' + items +
        '</div></section>';
    }

    /* 5. 空宫借对宫（对宫 = (index + 6) % 12） */
    if (p.isEmpty) {
      var borrowed = opp.majorStars.length
        ? '<div class="pop__stars">' + opp.majorStars.map(popStarHtml).join('') + '</div>'
        : '<p class="pop__none">对宫亦无主星。</p>';
      html += '<section class="pop__section"><h3 class="pop__heading">对宫借星 · ' +
        esc(opp.stemBranch) + ' ' + esc(opp.displayName) + '</h3>' + borrowed + '</section>';
    }

    /* 6. 边界声明 */
    html += '<p class="pop__note">星曜文字为通用名词释义，仅用于理解术语，不构成任何命理断语或运势结论。' +
      '全部数据由 iztro 在浏览器本地排盘生成，未上传任何信息。</p>';

    return html;
  }

  /* ── 浮层开关与焦点管理 ─────────────────────────────────── */
  function trapFocus(e) {
    var nodes = popEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openDetail(index) {
    if (!currentView || !overlayEl) return;
    var p = currentView.palaces[index];
    if (!p) return;

    popBody.innerHTML = detailHtml(currentView, index);
    popTitle.textContent = p.displayName + ' · ' + p.stemBranch;

    var modeLabel = currentView.mode === 'natal' ? '本命盘'
      : (currentView.mode === 'decadal' ? '大限盘' : '流年盘');
    var sub = modeLabel + ' · ' + p.stemBranch;
    if (currentView.layer) {
      sub += ' · ' + (currentView.layer.stem || '') + (currentView.layer.branch || '') + '宫';
    }
    if (p.decadalRange.length === 2) {
      sub += ' · 大限 ' + p.decadalRange[0] + '–' + p.decadalRange[1] + ' 岁';
    }
    if (currentView.mode !== 'natal' && currentView.nominalAge !== null) {
      sub += ' · 虚岁 ' + currentView.nominalAge;
    }
    popSub.textContent = sub;

    lastFocus = doc.activeElement;
    overlayEl.hidden = false;
    void overlayEl.offsetWidth;              /* 强制 reflow，保证入场过渡生效 */
    overlayEl.classList.add('is-open');
    if (pageEl) pageEl.setAttribute('inert', '');
    doc.body.style.overflow = 'hidden';
    popClose.focus();
  }

  function closeDetail() {
    if (!overlayEl || overlayEl.hidden) return;
    overlayEl.classList.remove('is-open');
    overlayEl.hidden = true;
    if (pageEl) pageEl.removeAttribute('inert');
    doc.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  /* ── 初始化：事件委托只绑一次 ───────────────────────────── */
  function init(chartNode, overlayNode) {
    chartEl = chartNode;
    overlayEl = overlayNode;
    if (!chartEl || !overlayEl) return;

    popEl = overlayEl.querySelector('.pop');
    popTitle = doc.getElementById('pop-title');
    popSub = doc.getElementById('pop-sub');
    popBody = doc.getElementById('pop-body');
    popClose = overlayEl.querySelector('.pop__close');
    pageEl = doc.querySelector('.page');

    chartEl.addEventListener('click', function (e) {
      var cell = closestCell(e.target);
      if (cell) openDetail(Number(cell.getAttribute('data-index')));
    });
    chartEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var cell = closestCell(e.target);
      if (cell) { e.preventDefault(); openDetail(Number(cell.getAttribute('data-index'))); }
    });

    overlayEl.addEventListener('click', function (e) {
      /* 关闭按钮内是内联 SVG，需向上遍历，不能只看 e.target */
      var node = e.target;
      while (node && node !== overlayEl) {
        if (node.getAttribute && node.getAttribute('data-close') !== null) {
          closeDetail();
          return;
        }
        node = node.parentNode;
      }
    });
    doc.addEventListener('keydown', function (e) {
      if (overlayEl.hidden) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeDetail(); }
      else if (e.key === 'Tab') trapFocus(e);
    });
  }

  ZW.chart = {
    init: init,
    render: render,
    openDetail: openDetail,
    close: closeDetail,
    MAX_MINOR: MAX_MINOR
  };

})(
  typeof window !== 'undefined' ? window :
  (typeof self !== 'undefined' ? self : this)
);
