/* ==========================================================================
 * 紫微斗数静态版 · engine.js  【纯逻辑层】
 * 设计系统：Apple（工具化转译版 / Apple HIG · Utility Profile）
 *
 * 职责：封装 iztro 排盘、输入校验、数据规范化、运限（大限/流年）视图构建、
 *       14 主星 + 四化的通用名词释义字典。
 * 硬约束：不触碰 document / DOM / localStorage / 网络；不引用任何全局 UI 状态。
 *         本文件可在 Node 中以浏览器全局方式独立加载并测试。
 * 挂载：window.ZW.engine（普通 <script>，无 ES module，无 fetch/XHR）
 * ========================================================================== */
(function (root) {
  'use strict';

  var ZW = root.ZW || (root.ZW = {});

  /* ── 常量表 ─────────────────────────────────────────────── */
  /* 时辰地支索引 0..11（0=早子，1=丑，2=寅 … 11=亥），不是 0-23 小时 */
  var TIME_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var TIME_RANGES = [
    '23:00–01:00', '01:00–03:00', '03:00–05:00', '05:00–07:00',
    '07:00–09:00', '09:00–11:00', '11:00–13:00', '13:00–15:00',
    '15:00–17:00', '17:00–19:00', '19:00–21:00', '21:00–23:00'
  ];

  /* palaces[i].index（0=寅）→ CSS grid-area 名，来自 _design-tokens.md §4.1 */
  var GRID_AREAS = [
    'yin',  /* 0 寅 4,1 */ 'mao',  /* 1 卯 3,1 */ 'chen', /* 2 辰 2,1 */
    'si',   /* 3 巳 1,1 */ 'wu',   /* 4 午 1,2 */ 'wei',  /* 5 未 1,3 */
    'shen', /* 6 申 1,4 */ 'you',  /* 7 酉 2,4 */ 'xu',   /* 8 戌 3,4 */
    'hai',  /* 9 亥 4,4 */ 'zi',   /* 10 子 4,3 */ 'chou' /* 11 丑 4,2 */
  ];

  /* horoscope().mutagen[4] 顺序固定为 [禄, 权, 科, 忌]，值是【星名】 */
  var MUTAGEN_LABELS = ['禄', '权', '科', '忌'];
  var MUTAGEN_KEYS = ['lu', 'quan', 'ke', 'ji'];

  var BRIGHTNESS_STRONG = ['庙', '旺', '得', '利'];
  var BRIGHTNESS_WEAK = ['不', '闲', '陷'];

  /* 示例盘：全部走真实 bySolar 排盘，绝无占位数据 */
  var EXAMPLES = [
    { label: '2000 · 寅时 · 男', date: '2000-8-16', timeIndex: 2, gender: '男', name: '示例盘' },
    { label: '1990 · 午时 · 女', date: '1990-5-20', timeIndex: 6, gender: '女', name: '示例盘' },
    { label: '1988 · 子时 · 男', date: '1988-12-8', timeIndex: 0, gender: '男', name: '示例盘' }
  ];

  /* ── 星曜白话释义（仅通用名词解释，不构成任何命理断语 / 运势结论） ── */
  var GLOSSARY = {
    '紫微': '帝星 · 统御 · 格局',
    '天机': '智慧 · 谋划 · 机变',
    '太阳': '光明 · 外显 · 付出',
    '武曲': '刚毅 · 财星 · 执行',
    '天同': '平和 · 情绪 · 感受',
    '廉贞': '才艺 · 交际 · 感情',
    '天府': '库星 · 稳重 · 包容',
    '太阴': '月亮 · 细腻 · 内敛',
    '贪狼': '多才 · 欲望 · 喜好',
    '巨门': '口才 · 思辨 · 沟通',
    '天相': '辅佐 · 印星 · 协调',
    '天梁': '荫星 · 庇护 · 原则',
    '七杀': '将星 · 果决 · 独立',
    '破军': '开创 · 变动 · 破立'
  };
  var MUTAGEN_GLOSSARY = {
    '禄': '化禄：增益、顺遂的意象',
    '权': '化权：权柄、主导的意象',
    '科': '化科：名声、文饰的意象',
    '忌': '化忌：收敛、牵挂的意象'
  };

  /* ── 小工具 ─────────────────────────────────────────────── */
  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  function errMsg(e) {
    if (!e) return '未知错误';
    return e.message ? String(e.message) : String(e);
  }

  function brightnessLevel(b) {
    if (!b) return '';
    if (BRIGHTNESS_STRONG.indexOf(b) >= 0) return 'strong';
    if (BRIGHTNESS_WEAK.indexOf(b) >= 0) return 'weak';
    if (b === '平') return 'mid';
    return 'mid';
  }

  function mutagenKey(label) {
    var i = MUTAGEN_LABELS.indexOf(label);
    return i >= 0 ? MUTAGEN_KEYS[i] : '';
  }

  /* 把 input[type=date] 的 YYYY-MM-DD 规范化为引擎契约要求的 YYYY-M-D */
  function normalizeDate(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
    if (!m) return null;
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (y < 1900 || y > 2100) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + '-' + mo + '-' + d;
  }

  /* ── 输入校验 ───────────────────────────────────────────── */
  function validate(input) {
    input = input || {};
    var errors = {};
    var value = {};

    var date = normalizeDate(input.date);
    if (!date) errors.date = '请输入 1900–2100 年之间的有效公历日期';
    else value.date = date;

    var t = Number(input.timeIndex !== undefined ? input.timeIndex : input.time);
    if (input.timeIndex === undefined && input.time === undefined) t = NaN;
    if (!isFinite(t) || Math.floor(t) !== t || t < 0 || t > 11) {
      errors.time = '请选择出生时辰';
    } else {
      value.timeIndex = t;
    }

    var g = input.gender;
    if (g !== '男' && g !== '女') errors.gender = '请选择性别';
    else value.gender = g;

    var name = (input.name === undefined || input.name === null) ? '' : String(input.name).trim();
    value.name = name.slice(0, 20);
    if (name.length > 20) errors.name = '姓名最多 20 个字';

    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  /* ── 星曜 / 宫位规范化 ──────────────────────────────────── */
  function normStar(s) {
    s = s || {};
    var b = s.brightness || '';
    var name = s.name || '';
    return {
      name: name,
      type: s.type || '',
      scope: s.scope || 'origin',
      brightness: b,
      mutagen: s.mutagen || '',
      brightnessLevel: brightnessLevel(b),
      gloss: GLOSSARY[name] || '',
      mutagens: []          /* 由 buildView 填充：{label, key, kind} */
    };
  }

  function normPalace(p, i) {
    p = p || {};
    var major = (p.majorStars || []).map(normStar);
    return {
      index: i,
      gridArea: GRID_AREAS[i],
      branch: p.earthlyBranch || '',
      stem: p.heavenlyStem || '',
      stemBranch: (p.heavenlyStem || '') + (p.earthlyBranch || ''),
      name: p.name || '',
      isBodyPalace: !!p.isBodyPalace,
      decadalRange: (p.decadal && p.decadal.range) ? p.decadal.range.slice(0, 2) : [],
      ages: (p.ages || []).slice(),
      changsheng12: p.changsheng12 || '',
      boshi12: p.boshi12 || '',
      jiangqian12: p.jiangqian12 || '',
      suiqian12: p.suiqian12 || '',
      majorStars: major,
      minorStars: (p.minorStars || []).map(normStar),
      adjectiveStars: (p.adjectiveStars || []).map(normStar),
      oppositeIndex: (i + 6) % 12,
      isEmpty: major.length === 0
    };
  }

  function normalize(a, input) {
    var palaces = (a.palaces || []).map(normPalace);

    /* 命宫索引：优先按命宫地支定位，回退按宫名 */
    var soulIndex = -1;
    if (a.earthlyBranchOfSoulPalace) {
      for (var i = 0; i < palaces.length; i++) {
        if (palaces[i].branch === a.earthlyBranchOfSoulPalace) { soulIndex = i; break; }
      }
    }
    if (soulIndex < 0) {
      for (var j = 0; j < palaces.length; j++) {
        if (palaces[j].name === '命宫') { soulIndex = j; break; }
      }
    }

    return {
      input: {
        date: input.date,
        timeIndex: input.timeIndex,
        gender: input.gender,
        name: input.name
      },
      meta: {
        name: input.name,
        solarDate: a.solarDate || input.date,
        lunarDate: a.lunarDate || '',
        chineseDate: a.chineseDate || '',
        chineseDateParts: (a.rawDates && a.rawDates.chineseDate) || null,
        time: a.time || (TIME_BRANCHES[input.timeIndex] + '时'),
        timeRange: a.timeRange || TIME_RANGES[input.timeIndex] || '',
        sign: a.sign || '',
        zodiac: a.zodiac || '',
        soul: a.soul || '',
        body: a.body || '',
        fiveElementsClass: a.fiveElementsClass || '',
        gender: a.gender || input.gender,
        soulBranch: a.earthlyBranchOfSoulPalace || '',
        bodyBranch: a.earthlyBranchOfBodyPalace || ''
      },
      palaces: palaces,
      soulIndex: soulIndex
    };
  }

  /* ── 运限读取（全部 try/catch 容错，不阻塞本命盘） ───────── */
  function normHoroscopeLayer(layer, scope) {
    if (!layer) return null;
    var names = Array.isArray(layer.palaceNames) ? layer.palaceNames.slice(0, 12) : [];
    var mut = Array.isArray(layer.mutagen) ? layer.mutagen.slice(0, 4) : [];
    var stars = [];
    var raw = Array.isArray(layer.stars) ? layer.stars : [];
    for (var i = 0; i < 12; i++) {
      var list = Array.isArray(raw[i]) ? raw[i] : [];
      stars.push(list.map(normStar));
    }
    return {
      scope: scope,
      name: layer.name || (scope === 'decadal' ? '大限' : '流年'),
      stem: layer.heavenlyStem || '',
      branch: layer.earthlyBranch || '',
      index: (typeof layer.index === 'number' && layer.index >= 0 && layer.index < 12) ? layer.index : -1,
      palaceNames: names,
      mutagen: mut,      /* [禄,权,科,忌] 对应的星名数组 */
      stars: stars       /* 12 组运限流曜，按 palaces 索引对齐 */
    };
  }

  function readHoroscope(astrolabe, dateStr) {
    var out = {
      ok: false, reason: '', date: dateStr || '',
      nominalAge: null, decadal: null, yearly: null
    };
    if (!astrolabe || typeof astrolabe.horoscope !== 'function') {
      out.reason = '当前盘不支持运限计算';
      return out;
    }
    var h;
    try {
      h = astrolabe.horoscope(dateStr);
    } catch (e) {
      out.reason = '运限计算失败：' + errMsg(e);
      return out;
    }
    if (!h) { out.reason = '运限结果为空'; return out; }
    try {
      out.nominalAge = (h.age && typeof h.age.nominalAge === 'number') ? h.age.nominalAge : null;
      out.decadal = normHoroscopeLayer(h.decadal, 'decadal');
      out.yearly = normHoroscopeLayer(h.yearly, 'yearly');
      out.ok = !!(out.decadal || out.yearly);
      if (!out.ok) out.reason = '未取得大限 / 流年数据';
    } catch (e2) {
      out.reason = '运限数据解析失败：' + errMsg(e2);
    }
    return out;
  }

  /* ── 排盘主入口 ─────────────────────────────────────────── */
  var configured = false;
  function ensureConfig() {
    if (configured) return;
    configured = true;                      /* config 是全局副作用，只调一次 */
    try {
      if (root.iztro && root.iztro.astro && typeof root.iztro.astro.config === 'function') {
        root.iztro.astro.config({ yearDivide: 'normal' });   /* 正月初一换年 */
      }
    } catch (e) { /* 配置失败不阻塞排盘 */ }
  }

  function isAvailable() {
    return !!(root.iztro && root.iztro.astro && typeof root.iztro.astro.bySolar === 'function');
  }

  function cast(input) {
    var v = validate(input);
    if (!v.ok) return { ok: false, errors: v.errors };

    if (!isAvailable()) {
      return { ok: false, errors: { engine: '排盘引擎未加载：请确认 vendor/iztro.min.js 存在且已正确引入' } };
    }

    var a;
    try {
      ensureConfig();
      a = root.iztro.astro.bySolar(v.value.date, v.value.timeIndex, v.value.gender, true, 'zh-CN');
    } catch (e) {
      return { ok: false, errors: { engine: '排盘失败：' + errMsg(e) } };
    }
    if (!a || !a.palaces || a.palaces.length !== 12) {
      return { ok: false, errors: { engine: '排盘结果异常：未返回完整的 12 宫' } };
    }

    var data;
    try {
      data = normalize(a, v.value);
    } catch (e2) {
      return { ok: false, errors: { engine: '排盘数据解析失败：' + errMsg(e2) } };
    }

    /* horoscope 取数器单独返回：data 保持纯数据（可 JSON 序列化，不含函数） */
    var hFn = function (dateStr) { return readHoroscope(a, dateStr); };
    return { ok: true, data: data, horoscope: hFn, errors: {} };
  }

  /* ── 三态视图构建（纯逻辑，chart.js 只负责把结果画出来） ─── */
  function resolveActiveIndex(layer, hs, data, mode) {
    if (layer.index >= 0 && layer.index < 12) return layer.index;
    /* 回退 1：运限宫名中的「命宫」即运限命宫所在格 */
    var k = layer.palaceNames.indexOf('命宫');
    if (k >= 0) return k;
    /* 回退 2（大限）：用 palace.decadal.range 与 age.nominalAge 匹配 */
    if (mode === 'decadal' && hs && typeof hs.nominalAge === 'number') {
      var age = hs.nominalAge;
      for (var i = 0; i < data.palaces.length; i++) {
        var r = data.palaces[i].decadalRange;
        if (r && r.length === 2 && age >= r[0] && age <= r[1]) return i;
      }
    }
    return -1;
  }

  function buildView(data, mode, hs) {
    mode = (mode === 'decadal' || mode === 'yearly') ? mode : 'natal';
    var layer = null;
    if (mode === 'decadal') layer = (hs && hs.ok) ? hs.decadal : null;
    if (mode === 'yearly') layer = (hs && hs.ok) ? hs.yearly : null;
    /* 运限层不可用 → 静默降级为本命，绝不报错 */
    var effectiveMode = (mode !== 'natal' && !layer) ? 'natal' : mode;
    if (effectiveMode === 'natal') layer = null;

    /* 运限四化：星名 → [{label,key,kind}]，同名可叠加多化 */
    var horoMutagenMap = {};
    var horoMutagenList = [];
    if (layer && layer.mutagen.length) {
      for (var j = 0; j < layer.mutagen.length && j < 4; j++) {
        var starName = layer.mutagen[j];
        if (!starName) continue;
        var item = {
          label: MUTAGEN_LABELS[j], key: MUTAGEN_KEYS[j],
          star: starName, kind: 'horoscope'
        };
        horoMutagenList.push(item);
        if (!horoMutagenMap[starName]) horoMutagenMap[starName] = [];
        horoMutagenMap[starName].push(item);
      }
    }

    function withMutagens(s) {
      var list = [];
      if (s.mutagen) {
        list.push({ label: s.mutagen, key: mutagenKey(s.mutagen), kind: 'natal', star: s.name });
      }
      var extras = horoMutagenMap[s.name];
      if (extras) list = list.concat(extras);
      return extend({}, s, { mutagens: list });
    }

    var palaces = data.palaces.map(function (p) {
      var displayName = p.name;
      if (layer && layer.palaceNames[p.index]) displayName = layer.palaceNames[p.index];
      var horoStars = (layer && layer.stars[p.index]) ? layer.stars[p.index].map(withMutagens) : [];
      return extend({}, p, {
        displayName: displayName,
        majorStars: p.majorStars.map(withMutagens),
        minorStars: p.minorStars.map(withMutagens),
        adjectiveStars: p.adjectiveStars.map(withMutagens),
        horoscopeStars: horoStars
      });
    });

    var activeIndex = -1;
    if (layer) activeIndex = resolveActiveIndex(layer, hs, data, effectiveMode);

    return {
      mode: effectiveMode,
      requestedMode: mode,
      layer: layer ? {
        name: layer.name, stem: layer.stem, branch: layer.branch, index: layer.index
      } : null,
      activeIndex: activeIndex,
      mutagenList: horoMutagenList,        /* 运限四化总览（含落在辅星上的四化） */
      nominalAge: (hs && hs.ok) ? hs.nominalAge : null,
      horoscopeDate: hs ? hs.date : '',
      horoscopeOk: !!(hs && hs.ok),
      horoscopeReason: hs ? (hs.reason || '') : '',
      palaces: palaces,
      meta: data.meta,
      soulIndex: data.soulIndex,
      horoscopeData: hs || null
    };
  }

  /* ── 释义查询 ───────────────────────────────────────────── */
  function glossaryOf(name) { return GLOSSARY[name] || ''; }
  function mutagenGloss(label) { return MUTAGEN_GLOSSARY[label] || ''; }

  /* ── 导出 ───────────────────────────────────────────────── */
  ZW.engine = {
    TIME_BRANCHES: TIME_BRANCHES,
    TIME_RANGES: TIME_RANGES,
    GRID_AREAS: GRID_AREAS,
    MUTAGEN_LABELS: MUTAGEN_LABELS,
    MUTAGEN_KEYS: MUTAGEN_KEYS,
    EXAMPLES: EXAMPLES,
    GLOSSARY: GLOSSARY,
    isAvailable: isAvailable,
    validate: validate,
    normalizeDate: normalizeDate,
    cast: cast,
    readHoroscope: readHoroscope,
    buildView: buildView,
    brightnessLevel: brightnessLevel,
    mutagenKey: mutagenKey,
    glossaryOf: glossaryOf,
    mutagenGloss: mutagenGloss
  };

})(
  typeof window !== 'undefined' ? window :
  (typeof self !== 'undefined' ? self : this)
);
