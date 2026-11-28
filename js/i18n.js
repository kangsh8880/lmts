/* LMTS 다국어(한국어 · English · Tiếng Việt)
 * 화면의 한국어 문구를 사전(i18n-dict.js)으로 바꿔 표시한다. 원문은 한국어이며, 동적으로 다시 그려지는 화면도 자동 변환된다.
 * 선택한 언어는 이 브라우저에 기억된다(localStorage 불가 시 한국어). */
(function () {
  'use strict';
  const LS = 'lmts_lang', LANGS = { ko: '한국어', en: 'English', vi: 'Tiếng Việt' };
  let lang = 'ko';
  try { const v = localStorage.getItem(LS); if (LANGS[v]) lang = v; } catch (e) {}
  const IDX = { en: 0, vi: 1 };
  const D = window.LMTS_DICT || {};
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = Object.keys(D).sort((a, b) => b.length - a.length);
  // 1~2자 짧은 단어는 앞뒤가 한글이면 바꾸지 않는다(예: '항공' ⊄ '대한항공')
  const RE = new RegExp(keys.map(k => /^[가-힣]{1,2}$/.test(k) ? '(?<![가-힣])' + esc(k) + '(?![가-힣])' : esc(k)).join('|'), 'g');
  const WEEK = { '일': ['Sun', 'CN'], '월': ['Mon', 'T2'], '화': ['Tue', 'T3'], '수': ['Wed', 'T4'], '목': ['Thu', 'T5'], '금': ['Fri', 'T6'], '토': ['Sat', 'T7'] };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const HAN = /[가-힣]/;
  const NAV = { en: { 'CEO대시보드': 'CEO', '운영관제': 'Operations', '기준정보': 'Master Data', '출하오더': 'Orders', '박스Packing': 'Packing', '입고/출하Packing': 'In/Out·Pack', '차량배차': 'Dispatch', '거점In/Out': 'Hub In/Out', '위치추적': 'Tracking', '물류분석': 'Analysis' },
    vi: { 'CEO대시보드': 'CEO', '운영관제': 'Vận hành', '기준정보': 'Dữ liệu gốc', '출하오더': 'Đơn xuất', '박스Packing': 'Packing', '입고/출하Packing': 'Nhập/Xuất·Pack', '차량배차': 'Điều xe', '거점In/Out': 'IN/OUT điểm', '위치추적': 'Vị trí', '물류분석': 'Phân tích' } };

  function tr(s, L) {
    L = L || lang;
    if (L === 'ko' || typeof s !== 'string' || !HAN.test(s)) return s;
    const i = IDX[L];
    const t = s.trim();
    if (WEEK[t]) return s.replace(t, WEEK[t][i]);                       // 요일 한 글자 칸
    let o = s;
    // 날짜·시간 패턴
    o = o.replace(/(\d{4})\s*년\s*(\d{1,2})\s*월/g, (m, y, mo) => i === 0 ? MON[mo - 1] + ' ' + y : 'Tháng ' + mo + '/' + y);
    o = o.replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, (m, mo, d) => i === 0 ? MON[mo - 1] + ' ' + d : d + '/' + mo);
    o = o.replace(/(\d+)\s*시간/g, (m, h) => i === 0 ? h + 'h' : h + ' giờ');
    o = o.replace(/(\d+)\s*일(?![가-힣])/g, (m, d) => i === 0 ? d + 'd' : d + ' ngày');
    o = o.replace(/(\d+)\s*년(?![가-힣])/g, (m, y) => i === 0 ? y : y);
    if (!HAN.test(o)) return o;
    return o.replace(RE, (m, off, str) => { const v = D[m]; if (!v) return m; const r = v[i]; return (off > 0 && /\d/.test(str[off - 1]) && /^[A-Za-zÀ-ỹ]/.test(r)) ? ' ' + r : r; });
  }

  // ── 텍스트 노드 · 속성 변환(원문 기억 → 언어 바꿈/재그리기에 모두 대응) ──
  const NODE = new WeakMap(), ATTR = new WeakMap();
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  const skipEl = e => !!(e && (SKIP[e.nodeName] || (e.closest && e.closest('[data-i18n-skip],.notranslate'))));

  function doNode(n) {
    const cur = n.nodeValue; if (cur == null) return;
    const rec = NODE.get(n);
    const src = rec && cur === rec.out ? rec.src : cur;
    if (!rec && lang === 'ko') return;
    let out = lang === 'ko' ? src : tr(src);
    if (lang !== 'ko' && n.parentElement && n.parentElement.closest('.nav-tab')) { const k = src.trim(), v = NAV[lang][k]; if (v) out = src.replace(k, v); }
    if (out !== cur) n.nodeValue = out;
    NODE.set(n, { src, out });
  }
  function doAttr(e, a) {
    const cur = e.getAttribute(a); if (cur == null) return;
    let m = ATTR.get(e); if (!m) { m = {}; ATTR.set(e, m); }
    const rec = m[a];
    const src = rec && cur === rec.out ? rec.src : cur;
    if (!rec && lang === 'ko') return;
    const out = lang === 'ko' ? src : tr(src);
    if (out !== cur) e.setAttribute(a, out);
    m[a] = { src, out };
  }
  function doEl(e) {
    if (skipEl(e)) return;
    ATTRS.forEach(a => { if (e.hasAttribute && e.hasAttribute(a)) doAttr(e, a); });
    if (e.nodeName === 'INPUT' && /^(button|submit|reset)$/.test(e.type) && e.hasAttribute('value')) doAttr(e, 'value');
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipEl(root.parentNode)) doNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skipEl(root)) return; doEl(root); }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeType === 1 && skipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) doNode(n); else doEl(n); }
  }
  function all() { walk(document.documentElement); doTitle(); }
  function doTitle() { const t = document.querySelector('title'); if (t && t.firstChild) doNode(t.firstChild); }

  let obs = null;
  function start() {
    if (obs) return;
    obs = new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') { if (!skipEl(m.target.parentNode)) doNode(m.target); }
        else if (m.type === 'attributes') { if (ATTRS.includes(m.attributeName) || m.attributeName === 'value') doEl(m.target); }
        else m.addedNodes.forEach(n => walk(n));
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat('value') });
  }

  // ── 브라우저 기본 대화상자(alert / confirm / prompt)도 변환 ──
  ['alert', 'confirm', 'prompt'].forEach(f => { const o = window[f]; window[f] = function (m, d) { return o.call(window, tr(String(m == null ? '' : m)), d); }; });

  function setLang(L) {
    if (!LANGS[L]) return; lang = L;
    try { localStorage.setItem(LS, L); } catch (e) {}
    document.documentElement.lang = L;
    all();
    const s = document.getElementById('lang-sel'); if (s) s.value = L;
    document.dispatchEvent(new CustomEvent('lmts-lang', { detail: L }));
  }
  function makeSelect() {
    const s = document.createElement('select'); s.id = 'lang-sel'; s.className = 'lang-sel'; s.setAttribute('data-i18n-skip', ''); s.title = 'Language';
    Object.keys(LANGS).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = LANGS[k]; s.appendChild(o); });
    s.value = lang; s.onchange = () => setLang(s.value); return s;
  }
  window.LMTS_I18N = { t: tr, lang: () => lang, set: setLang, makeSelect, langs: LANGS };

  document.documentElement.lang = lang;
  function boot() { all(); start(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // 스크립트가 DOM 준비 전에 호출돼도 안전하도록 즉시 감시 시작(변경분만 처리)
  if (document.documentElement) start();
})();
