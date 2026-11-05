/* ==========================================================================
 * 紫微斗数静态版 · app.js  【应用编排层】
 * 设计系统：Apple（工具化转译版 / Apple HIG · Utility Profile）
 *
 * 职责：表单与校验、应用状态、本命/大限/流年三态、亮暗主题、localStorage、
 *       URL hash 复现、示例盘、复制分享链接、错误态与空态、toast。
 * 依赖：engine.js → chart.js → app.js（普通 <script> 顺序加载，file:// 可跑）
 * 挂载：window.ZW.app，并在 DOM 就绪后自动启动
 * ========================================================================== */
(function (root) {
  'use strict';

  var ZW = root.ZW || (root.ZW = {});
  var doc = root.document;
  var engine = ZW.engine;
  var chart = ZW.chart;

  var KEY_THEME = 'zw.theme';
  var KEY_LAST = 'zw.last';

  var state = {
    result: null,        /* engine.cast() 结果：{ ok, data, horoscope } */
    hs: null,            /* horoscope(today) 结果（纯数据） */
    mode: 'natal',
    horoscopeDate: todayStr()
  };

  var el = {};         /* DOM 引用，init 时填充 */
  var toastTimer = null;

  /* ── 小工具 ─────────────────────────────────────────────── */
  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* input[type=date].value 必须是 YYYY-MM-DD；引擎/存储用 YYYY-M-D */
  function toInputDate(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || ''));
    if (!m) return '';
    function p(v) { return (v.length < 2 ? '0' : '') + v; }
    return m[1] + '-' + p(m[2]) + '-' + p(m[3]);
  }

  function safeGet(key) {
    try { return root.localStorage ? root.localStorage.getItem(key) : null; }
    catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { if (root.localStorage) root.localStorage.setItem(key, val); }
    catch (e) { /* 隐私模式 / file:// 限制：静默降级，不影响排盘 */ }
  }

  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.classList.add('is-open');
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () {
      el.toast.classList.remove('is-open');
      el.toast.hidden = true;
    }, 2000);
  }

  function showMsg(msg, kind) {
    if (!el.formMsg) return;
    el.formMsg.textContent = msg || '';
    if (kind) el.formMsg.setAttribute('data-kind', kind);
    else el.formMsg.removeAttribute('data-kind');
  }

  function showEmpty(msg, kind) {
    el.chart.hidden = true;
    el.empty.hidden = false;
    el.empty.textContent = msg;
    if (kind) el.empty.setAttribute('data-kind', kind);
    else el.empty.removeAttribute('data-kind');
  }

  /* ── 主题 ───────────────────────────────────────────────── */
  function currentTheme() {
    return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(t, persist) {
    t = (t === 'dark') ? 'dark' : 'light';
    doc.documentElement.setAttribute('data-theme', t);
    if (persist !== false) safeSet(KEY_THEME, t);
    if (el.themeBtn) {
      el.themeBtn.setAttribute('aria-label', t === 'dark' ? '切换到浅色主题' : '切换到深色主题');
      el.themeBtn.setAttribute('title', t === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
  }

  function initTheme() {
    /* 优先级：localStorage > 已有 data-theme（head 内联脚本已按系统偏好设置） */
    var saved = safeGet(KEY_THEME);
    var t = (saved === 'dark' || saved === 'light') ? saved : null;
    if (!t) {
      var attr = doc.documentElement.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') t = attr;
    }
    if (!t) {
      t = (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    applyTheme(t, false);
  }

  /* ── 表单校验反馈 ───────────────────────────────────────── */
  function clearErrors() {
    var nodes = el.form.querySelectorAll('[data-err]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = '';
    var fields = el.form.querySelectorAll('.field');
    for (var j = 0; j < fields.length; j++) fields[j].classList.remove('has-error');
  }

  function showErrors(errors) {
    clearErrors();
    var keys = Object.keys(errors || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var slot = el.form.querySelector('[data-err="' + k + '"]');
      if (slot) {
        slot.textContent = errors[k];
        var field = slot.parentNode;
        if (field && field.classList) field.classList.add('has-error');
      }
    }
    var msg = errors && errors.engine ? errors.engine : '请检查标红的输入项';
    showMsg(msg, 'error');
  }

  function readForm() {
    var tv = el.time.value;
    return {
      date: el.date.value,
      timeIndex: (tv === '' ? undefined : Number(tv)),
      gender: el.gender.value,
      name: el.name.value
    };
  }

  function fillForm(v) {
    if (!v) return;
    if (v.date) el.date.value = toInputDate(v.date);
    if (v.timeIndex !== undefined && v.timeIndex !== null && v.timeIndex !== '') {
      el.time.value = String(v.timeIndex);
    }
    if (v.gender) el.gender.value = v.gender;
    el.name.value = v.name || '';
  }

  /* ── 排盘主流程 ─────────────────────────────────────────── */
  function doCast(input) {
    clearErrors();
    showMsg('');

    var res = engine.cast(input);   /* 真实 bySolar，绝不造数据 */
    if (!res.ok) {
      showErrors(res.errors);
      if (!state.result) {
        showEmpty('暂时无法生成命盘：' + (res.errors.engine || '请检查出生信息后重试'), 'error');
      }
      return false;
    }

    state.result = res;

    /* 运限取数：engine 内部已 try/catch，这里再兜一层，保证三态切换不报错 */
    try {
      state.hs = res.horoscope(state.horoscopeDate);
    } catch (e) {
      state.hs = {
        ok: false, reason: '运限计算异常：' + (e && e.message ? e.message : String(e)),
        date: state.horoscopeDate, nominalAge: null, decadal: null, yearly: null
      };
    }

    /* 只持久化输入参数，绝不序列化含函数的 astrolabe */
    safeSet(KEY_LAST, JSON.stringify(res.data.input));

    chart.close();
    renderAll();
    showMsg('排盘完成 · 数据由 iztro 在本地生成', 'success');
    return true;
  }

  function renderAll() {
    if (!state.result) return;
    var view = engine.buildView(state.result.data, state.mode, state.hs);
    chart.render(view);
    el.chart.hidden = false;
    el.empty.hidden = true;
    updateSegmented(view);
    state.mode = view.mode;
    updateNote(view);
  }

  function updateSegmented(view) {
    var idx = view.mode === 'natal' ? 0 : (view.mode === 'decadal' ? 1 : 2);
    el.seg.setAttribute('data-active', String(idx));
    for (var i = 0; i < el.segItems.length; i++) {
      el.segItems[i].setAttribute('aria-pressed', i === idx ? 'true' : 'false');
      if (i === idx) el.segItems[i].classList.add('is-active');
      else el.segItems[i].classList.remove('is-active');
    }
  }

  function updateNote(view) {
    var parts = [];
    if (view.mode === 'natal') {
      parts.push('本命盘');
      if (view.soulIndex >= 0) parts.push('命宫在 ' + view.palaces[view.soulIndex].branch + ' 宫');
      parts.push(view.meta.fiveElementsClass || '—');
      parts.push(view.meta.chineseDate || '');
    } else {
      parts.push(view.mode === 'decadal' ? '大限' : '流年');
      if (view.layer) parts.push((view.layer.stem || '') + (view.layer.branch || '') + ' 宫');
      if (view.nominalAge !== null) parts.push('虚岁 ' + view.nominalAge);
      if (view.mutagenList && view.mutagenList.length) {
        parts.push('四化 ' + view.mutagenList.map(function (m) {
          return m.label + '·' + m.star;
        }).join('  '));
      }
      parts.push('运限日 ' + view.horoscopeDate);
    }
    if (view.requestedMode !== view.mode) {
      parts.push('运限数据不可用，已回退本命盘' +
        (view.horoscopeReason ? '（' + view.horoscopeReason + '）' : ''));
    }
    el.note.textContent = parts.filter(Boolean).join('  ·  ');
  }

  /* ── URL hash ───────────────────────────────────────────── */
  function parseHash() {
    var h = String(root.location.hash || '').replace(/^#/, '');
    if (!h) return null;
    var params = {};
    var segs = h.split('&');
    for (var i = 0; i < segs.length; i++) {
      var pos = segs[i].indexOf('=');
      if (pos < 0) continue;
      var k = segs[i].slice(0, pos);
      var v = segs[i].slice(pos + 1).replace(/\+/g, ' ');
      try { params[k] = decodeURIComponent(v); } catch (e) { params[k] = v; }
    }
    if (!params.d) return null;
    return {
      date: params.d,
      timeIndex: (params.t === undefined || params.t === '') ? undefined : Number(params.t),
      gender: params.g === 'f' ? '女' : (params.g === 'm' ? '男' : undefined),
      name: params.n || ''
    };
  }

  function buildHash(input) {
    return '#d=' + encodeURIComponent(input.date) +
      '&t=' + input.timeIndex +
      '&g=' + (input.gender === '女' ? 'f' : 'm') +
      '&n=' + encodeURIComponent(input.name || '');
  }

  function shareUrl(input) {
    return String(root.location.href).split('#')[0] + buildHash(input);
  }

  function fallbackShare(url) {
    el.shareBox.hidden = false;
    el.shareInput.value = url;
    el.shareInput.focus();
    el.shareInput.select();
    var copied = false;
    try { copied = doc.execCommand && doc.execCommand('copy'); } catch (e) { copied = false; }
    toast(copied ? '链接已复制，可直接粘贴分享' : '请手动复制下方选中的链接');
  }

  function copyShare() {
    var input = state.result ? state.result.data.input : readForm();
    var v = engine.validate(input);
    if (!v.ok) { toast('请先完成排盘，再复制分享链接'); return; }

    var url = shareUrl(v.value);
    el.shareInput.value = url;
    var clip = root.navigator && root.navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      try {
        clip.writeText(url).then(function () {
          toast('分享链接已复制');
        }, function () {
          fallbackShare(url);
        });
      } catch (e) { fallbackShare(url); }
    } else {
      fallbackShare(url);
    }
  }

  /* ── 事件绑定 ───────────────────────────────────────────── */
  function bind() {
    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      doCast(readForm());
    });

    /* 输入时清掉该字段的旧错误 */
    el.form.addEventListener('input', function (e) {
      var node = e.target;
      var field = node && node.parentNode;
      if (field && field.classList) {
        field.classList.remove('has-error');
        var slot = field.querySelector('[data-err]');
        if (slot) slot.textContent = '';
      }
    });

    el.seg.addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== el.seg) {
        if (node.getAttribute && node.getAttribute('data-mode')) break;
        node = node.parentNode;
      }
      if (!node || node === el.seg) return;
      if (!state.result) { toast('请先排盘，再切换盘面'); return; }
      var mode = node.getAttribute('data-mode');
      if (mode === state.mode) return;
      chart.close();
      state.mode = mode;
      renderAll();
    });

    el.examples.addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== el.examples) {
        if (node.getAttribute && node.getAttribute('data-example') !== null) break;
        node = node.parentNode;
      }
      if (!node || node === el.examples) return;
      var idx = Number(node.getAttribute('data-example'));
      var ex = engine.EXAMPLES[idx];
      if (!ex) return;
      fillForm(ex);
      doCast(ex);                      /* 与手动输入走同一套 bySolar 真实排盘 */
    });

    el.themeBtn.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    el.shareBtn.addEventListener('click', copyShare);

    /* 用户手动修改 hash / 打开分享链接（同页）时复现 */
    root.addEventListener('hashchange', function () {
      var h = parseHash();
      if (h && h.date) { fillForm(h); doCast(h); }
    });
  }

  /* ── 启动 ───────────────────────────────────────────────── */
  function collectDom() {
    el.form = doc.getElementById('birth-form');
    el.date = doc.getElementById('f-date');
    el.time = doc.getElementById('f-time');
    el.gender = doc.getElementById('f-gender');
    el.name = doc.getElementById('f-name');
    el.formMsg = doc.getElementById('form-msg');
    el.castBtn = doc.getElementById('btn-cast');
    el.shareBtn = doc.getElementById('btn-share');
    el.examples = doc.getElementById('examples');
    el.shareBox = doc.getElementById('share-box');
    el.shareInput = doc.getElementById('share-url');
    el.themeBtn = doc.getElementById('theme-toggle');
    el.seg = doc.getElementById('mode-seg');
    el.segItems = el.seg.querySelectorAll('.segmented__item');
    el.note = doc.getElementById('chart-note');
    el.chart = doc.getElementById('chart');
    el.empty = doc.getElementById('chart-empty');
    el.toast = doc.getElementById('toast');
  }

  function init() {
    collectDom();
    initTheme();
    chart.init(el.chart, doc.getElementById('detail'));
    bind();

    if (!engine.isAvailable()) {
      showMsg('排盘引擎未加载：请确认 vendor/iztro.min.js 与 index.html 在同一目录', 'error');
      el.castBtn.disabled = true;
      showEmpty('排盘引擎未加载，无法生成命盘。请确认 vendor/iztro.min.js 已随项目一起保存。', 'error');
      return;
    }

    /* 优先 URL hash，其次 localStorage 最近一次输入（自动回填并自动重新排盘） */
    var initial = parseHash();
    if (!initial || !initial.date) initial = null;
    if (!initial) {
      var last = safeGet(KEY_LAST);
      if (last) {
        try { initial = JSON.parse(last); } catch (e) { initial = null; }
      }
    }

    if (initial && initial.date) {
      fillForm(initial);
      doCast(initial);
    } else {
      el.chart.hidden = true;
      el.empty.hidden = false;
    }
  }

  ZW.app = {
    init: init,
    cast: doCast,
    getState: function () { return state; },
    shareUrl: function (input) { return shareUrl(input || readForm()); }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

})(
  typeof window !== 'undefined' ? window :
  (typeof self !== 'undefined' ? self : this)
);
