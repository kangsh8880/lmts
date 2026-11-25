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
  const TO = ['운영관제', '배차', '입고·재고', '고객응대'];
  const QUICK = { late: ['원인 파악 후 보고', '고객에게 지연 안내', '대체 차량 재배차', '오늘 중 처리'], stock: ['입고 일정 확인', '입고 등록 즉시', '출하 우선순위 조정', '오늘 중 처리'], route: ['이벤트 정정', '경로 변경 확인', '원인 파악 후 보고', '오늘 중 처리'] };
  const defTo = a => cat(a) === 'stock' ? '입고·재고' : cat(a) === 'late' && /표준시간/.test(a.t) ? '배차' : '운영관제';
  const dirsOf = a => S.directives().filter(d => d.ref === a.t);
  const dirOpen = () => S.directives().filter(d => d.status !== '완료');
  const stIc = { 지시: '📌', 접수: '👀', 처리중: '🛠', 완료: '✅' };
  let sel = { to: '', pr: '오늘', text: '' };
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
        `<div class="mc-cf">${DC.esc(a.fact)}</div><div class="mc-go">${(() => { const d = dirsOf(a)[0]; return d ? `<span class="mc-dir st-${d.status}">${stIc[d.status]} ${d.status}</span> ` : ''; })()}자세히·조치 ›</div></div>`;
    }).join('');
    const more = list.length > 3 && !showAll ? `<button type="button" class="mc-more" onclick="CM.all()">나머지 ${list.length - 3}건 더 보기</button>` : '';
    host.innerHTML = `<div class="mc-banner lv${lv}"><div class="mc-bi">${lvIc[lv]}</div><div><div class="mc-bt">${head[0]}</div><div class="mc-bs">${head[1]}</div></div></div>` + chips +
      (cards ? `<div class="mc-cards">${cards}</div>${more}` : `<div class="mc-ok">진행 ${K.active}건 · 운송 중 ${K.moving}건 · 정시납품율 ${DC.fmtPct(K.onTime) == null ? '-' : DC.fmtPct(K.onTime) + '%'}<br>지금 결정하실 일은 없습니다.</div>`) +
      (cards ? `<div class="mc-sub">진행 <b>${K.active}</b>건 · 운송 중 <b>${K.moving}</b>건 · 정시납품율 <b>${DC.fmtPct(K.onTime) == null ? '-' : DC.fmtPct(K.onTime) + '%'}</b></div>` : '');
  }
  function sheet(html) {
    let sh = document.getElementById('m-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'm-sheet'; sh.onclick = e => { if (e.target === sh) close(); }; document.body.appendChild(sh); }
    sh.innerHTML = html; sh.classList.add('on'); return sh;
  }
  const chips = (arr, cur, fn) => arr.map(v => `<button type="button" class="ms-chip${v === cur ? ' on' : ''}" onclick="${fn}('${v}')">${v}</button>`).join('');
  const logHtml = d => (d.log || []).map(l => `<div class="ms-log">${stIc[l.status] || ''} <b>${DC.esc(l.status)}</b> · ${DC.esc((l.time || '').slice(5, 16))} · ${DC.esc(l.who || '')}${l.memo ? '<br>' + DC.esc(l.memo) : ''}</div>`).join('');
  function open(i) {
    const a = (showAll ? list : list.slice(0, 3))[i]; if (!a) return;
    cur = a; sel = { to: defTo(a), pr: a.lv === 0 ? '긴급' : '오늘', text: '' };
    drawDetail();
  }
  let cur = null;
  function drawDetail() {
    const a = cur, o = ordOf(a), ph = phones(o), ds = dirsOf(a);
    sheet(`<div class="ms-box"><div class="ms-h"><b>${lvIc[a.lv]} ${DC.esc(a.t)}</b><button type="button" onclick="CM.close()">닫기 ✕</button></div>` +
      (o ? `<div class="ms-r"><span>고객</span>${DC.esc(o.customer)}</div><div class="ms-r"><span>현재 위치</span>${DC.esc(whereOf(o))}</div>` : '') +
      `<div class="ms-r"><span>상황</span>${DC.esc(a.fact)}</div><div class="ms-r"><span>추정 원인</span>${DC.esc(a.cause)}</div><div class="ms-r ms-act"><span>권장 조치</span>${DC.esc(a.act)}</div>` +
      (ds.length ? `<div class="ms-r"><span>보낸 지시</span>${ds.map(d => `<div class="ms-dir st-${d.status}"><b>${stIc[d.status]} ${d.status}</b> · ${DC.esc(d.to)} · ${DC.esc(d.priority)}<br>${DC.esc(d.text)}${logHtml(d)}</div>`).join('')}</div>` : '') +
      `<div class="ms-form"><div class="ms-ft">📌 조치 지시 보내기</div>` +
      `<div class="ms-fl">누구에게</div><div class="ms-chips" id="cm-to">${chips(TO, sel.to, 'CM.pickTo')}</div>` +
      `<div class="ms-fl">기한</div><div class="ms-chips" id="cm-pr">${chips(['긴급', '오늘', '이번주'], sel.pr, 'CM.pickPr')}</div>` +
      `<div class="ms-fl">지시 내용 (눌러서 추가)</div><div class="ms-chips">${(QUICK[cat(a)] || []).map(q => `<button type="button" class="ms-chip q" onclick="CM.addQ(this)">${q}</button>`).join('')}</div>` +
      `<textarea id="cm-text" rows="3" placeholder="직접 입력해도 됩니다"></textarea>` +
      `<button type="button" class="btn btn-primary ms-send" onclick="CM.send()">📌 지시 보내기</button></div>` +
      `<div class="ms-btns">${ph.map(p => `<a class="btn" href="tel:${DC.esc(p.n)}">📞 ${DC.esc(p.l)}</a>`).join('')}<a class="btn" href="${a.go}">화면으로 이동 ›</a></div></div>`);
  }
  function keep() { const t = document.getElementById('cm-text'); if (t) sel.text = t.value; }
  function pickTo(v) { keep(); sel.to = v; drawDetail(); document.getElementById('cm-text').value = sel.text; }
  function pickPr(v) { keep(); sel.pr = v; drawDetail(); document.getElementById('cm-text').value = sel.text; }
  function addQ(b) { const t = document.getElementById('cm-text'); t.value = (t.value ? t.value + ' / ' : '') + b.textContent; }
  function send() {
    keep(); const t = (document.getElementById('cm-text').value || '').trim();
    if (!t) { document.getElementById('cm-text').focus(); document.getElementById('cm-text').placeholder = '지시 내용을 입력하거나 위 문구를 눌러 주세요'; return; }
    const o = ordOf(cur);
    addDirective({ to: sel.to, priority: sel.pr, text: t, ref: cur.t, orderNo: o ? o.no : '', customer: o ? o.customer : '' });
    render(); drawDetail();
    const b = document.querySelector('#m-sheet .ms-form'); if (b) b.insertAdjacentHTML('afterbegin', '<div class="ms-done">✅ 지시를 보냈습니다. 운영관제 화면에 표시됩니다.</div>'); const dn = document.querySelector('#m-sheet .ms-done'); if (dn) dn.scrollIntoView({ block: 'center' });
  }
  function dirs() {
    const L = S.directives();
    sheet(`<div class="ms-box"><div class="ms-h"><b>📌 내 지시 현황</b><button type="button" onclick="CM.close()">닫기 ✕</button></div>` +
      (L.length ? L.slice(0, 30).map(d => `<div class="ms-r"><div class="ms-dir st-${d.status}"><b>${stIc[d.status]} ${d.status}</b> · ${DC.esc(d.to)} · ${DC.esc(d.priority)} · ${DC.esc((d.time || '').slice(5, 16))}<br><b>${DC.esc(d.ref || '')}</b><br>${DC.esc(d.text)}${logHtml(d)}</div></div>`).join('') : '<div class="ms-r">보낸 지시가 없습니다.</div>') + '</div>');
  }
  function close() { const sh = document.getElementById('m-sheet'); if (sh) sh.classList.remove('on'); }
  return { render, open, close, pickTo, pickPr, addQ, send, dirs, all() { showAll = true; render(); } };
})();
