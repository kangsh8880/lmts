// ══ LMTS ceomobile.js — CEO 휴대폰 첫 화면: 상태 한 줄 + 문제 건 카드(최대 3) + 상세·연락 ══
// 폭 900px 이하에서만 보임(css/mobile.css). PC 화면에는 영향 없음.
const CM = (() => {
  const lvIc = ['🔴', '🟡', '🟢'], cat = a => /재고 부족/.test(a.t) ? 'stock' : /비지정/.test(a.t) ? 'route' : 'late';
  const rank = { late: 0, stock: 1, route: 2 };
  let list = [], showAll = false;

  function ordOf(a) { const m = (a.t || '').match(/ORD-[\w-]+/); return m ? S.orders().find(o => o.no === m[0]) : null; }
  function whereOf(o) {
    if (!o) return '';
    const p = DC.position(o);
    if (p.state === 'at') return '📍 ' + DC.shortName(p.last.hub) + ' 체류 중';
    if (p.state === 'out') { const ns = DC.nodes(o); return '🚚 ' + DC.shortName(p.last.hub) + ' → ' + DC.shortName(ns[p.idx + 1] || '') + ' 이동 중'; }
    if (p.state === 'off') return '⚠ 지정 경로 외 거점 ' + DC.shortName(p.last.hub);
    return '⏳ 아직 출발 전';
  }
  function phones(o) {
    const out = [];
    if (!o) return out;
    const c = S.customers().find(x => x.name === o.customer);
    if (c && c.phone) out.push({ l: '고객 담당 ' + (c.manager || ''), n: c.phone });
    const d = S.dispatches().filter(x => x.orderNo === o.no && x.dphone).pop();
    if (d) out.push({ l: '기사 ' + (d.driver || ''), n: d.dphone });
    return out;
  }
  function build() {
    list = DC.actions().filter(a => a.lv <= 1).sort((a, b) => a.lv - b.lv || rank[cat(a)] - rank[cat(b)]);
    return list;
  }
  function render() {
    const host = document.getElementById('m-ceo'); if (!host) return;
    const K = DC.kpi(); build();
    const red = list.filter(a => a.lv === 0).length, yel = list.filter(a => a.lv === 1).length;
    const lv = red ? 0 : yel ? 1 : 2;
    const head = lv === 0 ? ['결정 필요', `${red}건 즉시 확인`] : lv === 1 ? ['확인 필요', `${yel}건 점검`] : ['정상', '지연·위험 없음'];
    const nLate = list.filter(a => cat(a) === 'late').length, nStock = list.filter(a => cat(a) === 'stock').length, nRoute = list.filter(a => cat(a) === 'route').length;
    const chips = lv === 2 ? '' : `<div class="mc-chips"><span>납기 <b>${nLate}</b></span><span>재고 <b>${nStock}</b></span><span>경로 <b>${nRoute}</b></span></div>`;
    const shown = showAll ? list : list.slice(0, 3);
    const cards = shown.map((a, i) => {
      const o = ordOf(a);
      return `<div class="mc-card lv${a.lv}" onclick="CM.open(${i})"><div class="mc-ct">${lvIc[a.lv]} ${DC.esc(a.t)}</div>` +
        (o ? `<div class="mc-cs">${DC.esc(o.customer)} · ${DC.esc(whereOf(o))}</div>` : '') +
        `<div class="mc-cf">${DC.esc(a.fact)}</div><div class="mc-go">자세히·조치 ›</div></div>`;
    }).join('');
    const more = list.length > 3 && !showAll ? `<button type="button" class="mc-more" onclick="CM.all()">나머지 ${list.length - 3}건 더 보기</button>` : '';
    host.innerHTML = `<div class="mc-banner lv${lv}"><div class="mc-bi">${lvIc[lv]}</div><div><div class="mc-bt">${head[0]}</div><div class="mc-bs">${head[1]}</div></div></div>` + chips +
      (cards ? `<div class="mc-cards">${cards}</div>${more}` : `<div class="mc-ok">진행 ${K.active}건 · 운송 중 ${K.moving}건 · 정시납품율 ${DC.fmtPct(K.onTime) == null ? '-' : DC.fmtPct(K.onTime) + '%'}<br>지금 결정하실 일은 없습니다.</div>`) +
      (cards ? `<div class="mc-sub">진행 <b>${K.active}</b>건 · 운송 중 <b>${K.moving}</b>건 · 정시납품율 <b>${DC.fmtPct(K.onTime) == null ? '-' : DC.fmtPct(K.onTime) + '%'}</b></div>` : '');
  }
  function open(i) {
    const a = (showAll ? list : list.slice(0, 3))[i]; if (!a) return;
    const o = ordOf(a), ph = phones(o);
    let sh = document.getElementById('m-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'm-sheet'; sh.onclick = e => { if (e.target === sh) close(); }; document.body.appendChild(sh); }
    sh.innerHTML = `<div class="ms-box"><div class="ms-h"><b>${lvIc[a.lv]} ${DC.esc(a.t)}</b><button type="button" onclick="CM.close()">닫기 ✕</button></div>` +
      (o ? `<div class="ms-r"><span>고객</span>${DC.esc(o.customer)}</div><div class="ms-r"><span>현재 위치</span>${DC.esc(whereOf(o))}</div>` : '') +
      `<div class="ms-r"><span>상황</span>${DC.esc(a.fact)}</div><div class="ms-r"><span>추정 원인</span>${DC.esc(a.cause)}</div><div class="ms-r ms-act"><span>권장 조치</span>${DC.esc(a.act)}</div>` +
      `<div class="ms-btns">${ph.map(p => `<a class="btn" href="tel:${DC.esc(p.n)}">📞 ${DC.esc(p.l)}</a>`).join('')}<a class="btn btn-primary" href="${a.go}">화면으로 이동 ›</a></div></div>`;
    sh.classList.add('on');
  }
  function close() { const sh = document.getElementById('m-sheet'); if (sh) sh.classList.remove('on'); }
  return { render, open, close, all() { showAll = true; render(); } };
})();
