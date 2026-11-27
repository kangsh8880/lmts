// ══ LMTS theme.js — 다크모드 토글 + 뉴스바 (모든 페이지 공통) ══
(function () {
  const KEY = 'lmts_theme';
  const get = () => { try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; } };
  const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
  const apply = v => { document.documentElement.setAttribute('data-theme', v); const b = document.getElementById('theme-btn'); if (b) b.textContent = v === 'dark' ? '☀️' : '🌙'; if (b) b.title = v === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'; };
  apply(get());                                   // 깜빡임 방지: 즉시 적용

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function buildNews() {
    const items = [];
    try {
      const O = S.orders(), E = S.events(), A = S.alarms();
      O.filter(o => o.status === '지연').forEach(o => items.push({ c: 'red', h: `🔴 <b>지연</b> ${esc(o.no)} · ${esc(o.customer)}` }));
      A.filter(a => a.type === 'OFF_ROUTE').forEach(a => items.push({ c: 'red', h: `⚠️ <b>비지정 거점</b> ${esc(a.orderNo)} · ${esc(a.hub)} ${esc(a.event)}` }));
      try { if (typeof DC !== 'undefined') { const K = DC.kpi(); K.etaWarnList.forEach(f => items.push({ c: 'red', h: `⏱ <b>${f.lv === 0 ? '지연 진행' : '지연 예상'}</b> ${esc(f.o.no)} · 예상 도착 ${esc(f.eta)}${f.delta > 0 ? ` (+${DC.fmtDur(f.delta)})` : ''}` })); K.scanMissList.forEach(g => items.push({ c: 'red', h: `🔍 <b>스캔 누락 의심</b> ${esc(g.o.no)} · ${DC.fmtDur(g.el)}째 ${g.kind === 'arrive' ? '도착 IN 없음' : 'OUT 없음'}` })); } } catch (e) {}
      { const dn = S.directives().filter(d => d.status !== '완료'); if (dn.length) items.push({ c: dn.some(d => d.priority === '긴급') ? 'red' : '', h: `📌 <b>CEO 지시</b> 미완료 ${dn.length}건${dn.some(d => d.priority === '긴급') ? ' (긴급 포함)' : ''}` }); }
      stockShort().forEach(x => items.push({ c: 'red', h: `📉 <b>재고 부족</b> ${esc(x.name)} · 현재고 ${x.left} / 오더 필요 ${x.need}` }));
      E.slice().sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 15).forEach(e => {
        const arr = e.event === '도착완료';
        items.push({ c: arr ? 'blue' : '', h: `${arr ? '✅' : e.event === 'IN' ? '⬇️' : '⬆️'} <span class="tm">${esc(String(e.time).slice(5, 16))}</span> <b>${esc(e.orderNo)}</b> · ${esc(e.hub)} ${esc(e.event)}` });
      });
      const act = O.filter(o => o.status !== '도착완료').length;
      items.unshift({ c: '', h: `📦 진행 오더 <b>${act}</b>건 / 전체 <b>${O.length}</b>건 · 거점 이벤트 <b>${E.length}</b>건` });
    } catch (e) {}
    return items;
  }
  function renderNews() {
    const bar = document.getElementById('newsbar'); if (!bar) return;
    const items = buildNews(), v = bar.querySelector('.nb-view');
    if (!items.length) { v.innerHTML = '<div class="nb-item">표시할 소식이 없습니다</div>'; return; }
    const one = items.map(i => `<span class="nb-item ${i.c}">${i.h}</span>`).join('');
    v.innerHTML = `<div class="nb-track" style="--nb-dur:${Math.max(40, Math.round(one.replace(/<[^>]+>/g, '').length * 0.22))}s">${one}${one}</div>`;   // 2회 반복 → 끊김 없는 순환
  }
  window.lmtsNewsRefresh = renderNews;

  function mount() {
    const nav = document.querySelector('nav.nav, .nav');
    if (!nav || document.getElementById('newsbar')) return;
    const btn = document.createElement('button');
    btn.id = 'theme-btn'; btn.className = 'theme-btn tool-ic'; btn.type = 'button'; btn.title = '라이트 / 다크 모드 전환';
    btn.onclick = () => { const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; set(n); apply(n); };
    const nb = document.createElement('button');   // 뉴스바 보이기/숨기기 (선택 기억)
    nb.id = 'news-btn'; nb.className = 'theme-btn tool-ic nb-tg'; nb.type = 'button'; nb.textContent = '📰'; nb.title = '뉴스바 보이기 / 숨기기';
    // 우측 도구 묶음: [뉴스][테마][GitHub 상태] — 항상 오른쪽 끝에 고정
    const st = nav.querySelector('.nav-status'), tools = document.createElement('div'); tools.className = 'nav-tools';
    const mb = document.createElement('a');   // 사용 설명서(PDF) 열기 — 새 탭
    mb.id = 'manual-btn'; mb.className = 'theme-btn tool-ic'; mb.href = 'docs/LMTS_manual.pdf'; mb.target = '_blank'; mb.rel = 'noopener'; mb.textContent = '📖'; mb.title = '사용 설명서 보기 (PDF)'; mb.setAttribute('aria-label', '사용 설명서');
    // 언어별 설명서: 영어 = 한국어·영어판, 한국어·베트남어 = 한국어·베트남어판 (언어를 바꾸면 즉시 반영)
    const manualFor = L => L === 'en' ? 'docs/LMTS_manual_en.pdf' : 'docs/LMTS_manual.pdf';
    const setManual = () => { mb.href = manualFor(window.LMTS_I18N ? window.LMTS_I18N.lang() : 'ko'); };
    setManual(); document.addEventListener('lmts-lang', setManual);
    if (window.LMTS_I18N) tools.append(window.LMTS_I18N.makeSelect());
    tools.append(mb, nb, btn); if (st) tools.append(st); nav.appendChild(tools);
    // 탭 그룹 구분선: 대시보드 | 업무 | 분석
    const tabs = nav.querySelector('.nav-tabs');
    if (tabs) { const sep = () => { const e = document.createElement('i'); e.className = 'nav-sep'; return e; };
      ['master.html', 'analytics.html'].forEach(pg => { const t = tabs.querySelector(`.nav-tab[data-page="${pg}"]`); if (t) tabs.insertBefore(sep(), t); }); }
    // 모바일: ☰ 메뉴 버튼 + 현재 화면 이름 (CSS는 900px 이하에서만 표시)
    const lg = nav.querySelector('.nav-logo');
    if (lg && tabs && !nav.querySelector('.nav-burger')) {
      const bg = document.createElement('button'); bg.type = 'button'; bg.className = 'nav-burger'; bg.setAttribute('aria-label', '메뉴'); bg.innerHTML = '☰';
      const cur = document.createElement('span'); cur.className = 'nav-cur';
      const act = tabs.querySelector('.nav-tab.active') || tabs.querySelector('.nav-tab[href="' + (location.pathname.split('/').pop() || 'ceodash.html') + '"]');
      cur.textContent = act ? act.textContent.trim() : '';
      lg.after(bg); bg.after(cur);
      const tg = () => { const o = nav.classList.toggle('open'); bg.innerHTML = o ? '✕' : '☰'; };
      bg.onclick = tg; cur.onclick = tg;
      document.addEventListener('click', e => { if (nav.classList.contains('open') && !nav.contains(e.target)) { nav.classList.remove('open'); bg.innerHTML = '☰'; } });
    }
    // 모바일: 하단 탭바(자주 쓰는 4개 + 전체 메뉴) — CSS는 900px 이하에서만 표시
    if (tabs && !document.querySelector('.m-tabbar')) {
      const here = location.pathname.split('/').pop() || 'ceodash.html';
      const tb = document.createElement('nav'); tb.className = 'm-tabbar';
      ['ops.html', 'order.html', 'packing.html', 'tracking.html'].forEach(h => {
        const t = tabs.querySelector('.nav-tab[href="' + h + '"]'); if (!t) return;
        const ic = t.querySelector('.ti'), icT = ic ? ic.textContent.trim() : '';
        const a = document.createElement('a'); a.href = h; a.className = 'm-tab' + (h === here ? ' on' : '');
        const i1 = document.createElement('span'); i1.className = 'mi'; i1.textContent = icT;
        const l1 = document.createElement('span'); l1.className = 'ml'; l1.textContent = t.textContent.replace(icT, '').trim();
        a.appendChild(i1); a.appendChild(l1); tb.appendChild(a);
      });
      const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'm-tab';
      mb.innerHTML = '<span class="mi">☰</span><span class="ml">전체</span>';
      mb.onclick = ev => { ev.stopPropagation(); window.scrollTo(0, 0); nav.classList.add('open'); const b2 = nav.querySelector('.nav-burger'); if (b2) b2.innerHTML = '✕'; };
      tb.appendChild(mb); document.body.appendChild(tb);
    }
    // 모바일: 카드 머리글을 눌러 접기/펼치기 (표·내역 카드는 처음에 접음)
    (function () {
      const mq = window.matchMedia('(max-width:900px)'); if (!mq.matches) return;
      const init = () => document.querySelectorAll('.page .card, .op-page .card').forEach(c => {
        if (c.dataset.mf) return; const h = c.querySelector(':scope > .card-head'), b = c.querySelector(':scope > .card-body');
        if (!h || !b) return; c.dataset.mf = '1'; c.classList.add('m-fold-ok');
        if (b.querySelector('.tbl-wrap') && !c.closest('.modal, .pop')) c.classList.add('m-fold');
      });
      init(); setTimeout(init, 1500);
      document.addEventListener('click', e => {
        const h = e.target.closest('.m-fold-ok > .card-head'); if (!h || e.target.closest('button,a,select,input,label')) return;
        h.parentElement.classList.toggle('m-fold');
      });
    })();
    const bar = document.createElement('div'); bar.id = 'newsbar'; bar.className = 'newsbar';
    bar.innerHTML = '<div class="nb-label">📰 뉴스</div><div class="nb-view"></div><button class="nb-x" title="뉴스바 닫기" onclick="lmtsNews(false)">✕</button>';
    nav.after(bar); apply(get()); renderNews();
    const nget = () => { try { return localStorage.getItem('lmts_news') !== 'off'; } catch (e) { return true; } };
    window.lmtsNews = on => { bar.classList.toggle('off', !on); nb.style.opacity = on ? 1 : .55; try { localStorage.setItem('lmts_news', on ? 'on' : 'off'); } catch (e) {} };
    nb.onclick = () => lmtsNews(bar.classList.contains('off'));
    lmtsNews(nget());
    setInterval(renderNews, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  // 데이터 로딩 완료(lmtsReady) 후 뉴스 갱신
  let _f = null;
  try {
    Object.defineProperty(window, 'lmtsReady', { configurable: true, set(f) { _f = f; }, get() { return function () { if (_f) _f.apply(this, arguments); renderNews(); }; } });
  } catch (e) {}

  // ── 보조창(모달) 공통: 제목줄 드래그 이동 + 모서리 크기 조절 + 크기 기억 ──
  (function () {
    const SZ = 'lmts_popsize';
    const rd = () => { try { return JSON.parse(localStorage.getItem(SZ) || '{}'); } catch (e) { return {}; } };
    const wr = (k, v) => { try { const o = rd(); o[k] = v; localStorage.setItem(SZ, JSON.stringify(o)); } catch (e) {} };
    const key = bg => bg.id || 'modal';
    function place(bg) {
      const m = bg.querySelector('.modal'); if (!m) return;
      const sv = rd()[key(bg)];
      if (!m.dataset.mw) m.dataset.mw = parseFloat(getComputedStyle(m).maxWidth) || 800;   // 원래 최대폭을 기본 폭으로 사용
      m.style.position = 'fixed'; m.style.transform = 'none'; m.style.margin = '0'; m.style.maxWidth = '96vw'; m.style.maxHeight = '94vh';
      m.style.width = (sv ? Math.min(sv.w, innerWidth * .96) : Math.min(+m.dataset.mw, innerWidth * .94)) + 'px'; m.style.height = sv ? Math.min(sv.h, innerHeight * .94) + 'px' : '';
      const r = m.getBoundingClientRect();
      m.style.left = Math.max(8, (innerWidth - r.width) / 2) + 'px';
      m.style.top = Math.max(8, (innerHeight - r.height) / 2) + 'px';
    }
    new MutationObserver(ms => ms.forEach(x => { const t = x.target; if (t.classList && t.classList.contains('modal-bg') && !t.classList.contains('hidden')) place(t); }))
      .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
    // 이동
    document.addEventListener('pointerdown', e => {
      const ttl = e.target.closest && e.target.closest('.modal-bg .modal-title'); if (!ttl || e.target.closest('button,a,input,select')) return;
      const m = ttl.closest('.modal'), r = m.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { m.style.left = Math.min(Math.max(-r.width + 80, ev.clientX - dx), innerWidth - 80) + 'px'; m.style.top = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40) + 'px'; };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); e.preventDefault();
    });
    // 크기 조절 후 크기 저장
    document.addEventListener('pointerup', e => {
      const bg = document.querySelector('.modal-bg:not(.hidden)'); if (!bg) return; const m = bg.querySelector('.modal'); if (!m) return;
      const r = m.getBoundingClientRect(); if (m.style.width || m.style.height) wr(key(bg), { w: Math.round(r.width), h: Math.round(r.height) });
    });
    window.addEventListener('resize', () => { const bg = document.querySelector('.modal-bg:not(.hidden)'); if (bg) place(bg); });
  })();
})();
