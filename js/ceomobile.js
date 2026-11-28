// ══ LMTS ceomobile.js — CEO 휴대폰 첫 화면: 상태 한 줄 + 문제 건 카드(최대 3) + 상세·연락 ══
// 폭 900px 이하에서만 보임(css/mobile.css). PC 화면에는 영향 없음.
const CM = (() => {
  const lvIc = ['🔴', '🟡', '🟢'], cat = a => /^직접 지시/.test(a.t) ? 'free' : /재고 부족/.test(a.t) ? 'stock' : /비지정/.test(a.t) ? 'route' : /스캔 누락/.test(a.t) ? 'scan' : 'late';
  const rank = { late: 0, stock: 1, route: 2, scan: 3 };
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
  const QUICK = { free: ['현황 파악 후 보고', '고객에게 연락', '우선 처리', '오늘 중 처리'], late: ['원인 파악 후 보고', '고객에게 지연 안내', '대체 차량 재배차', '오늘 중 처리'], stock: ['입고 일정 확인', '입고 등록 즉시', '출하 우선순위 조정', '오늘 중 처리'], route: ['이벤트 정정', '경로 변경 확인', '원인 파악 후 보고', '오늘 중 처리'], scan: ['현재 위치 확인', '스캔 보정 등록', '원인 파악 후 보고', '오늘 중 처리'] };
  const defTo = a => cat(a) === 'stock' ? '입고·재고' : cat(a) === 'late' && /표준시간/.test(a.t) ? '배차' : '운영관제';
  const dirsOf = a => S.directives().filter(d => d.ref === a.t);
  const dirOpen = () => S.directives().filter(d => d.status !== '완료');
  const stIc = { 지시: '📌', 접수: '👀', 처리중: '🛠', 완료: '✅' };
  let sel = { to: '', pr: '오늘', text: '' };
  // ── 내 지시 현황: 새로 완료된 지시 배지 (확인 시각은 이 휴대폰 브라우저에 저장) ──
  const SEEN_KEY = 'lmts-dir-seen';
  const seenAt = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } };
  const recentLim = () => { const d = new Date(Date.now() - 7 * 86400000), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00`; };
  const isNewDone = d => d.status === '완료' && (d.doneTime || '') > (seenAt() || recentLim());
  const newDone = () => S.directives().filter(isNewDone);
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, now()); } catch (e) {} };
  // ── 핵심 문구 강조: 고객·최종 도착지=파랑 굵게, 원인·지연 수치=빨강 굵게, 조치=굵게 ──
  const E2 = t => DC.esc(t || '');
  const hlFact = t => E2(t).replace(/(\(\+[0-9일시간분 ]+\)|\(표준 대비 \+[^)]*\))/g, '<b class="hl-r">$1</b>').replace(/(실적 )([0-9일시간분 ]+)/g, '$1<b class="hl-r">$2</b>').replace(/(\d+ 부족)/g, '<b class="hl-r">$1</b>').replace(/(지연 상태|지정 경로 외 거점)/g, '<b class="hl-r">$1</b>');
  const hlCause = t => { const g = /\(가설\)/.test(t || ''); return (t || '').replace(/\(가설\)/g, '').split(/\s*(?:또는|\/)\s*/).filter(Boolean).map(x => `<b class="hl-r">${E2(x.trim())}</b>`).join(' <span class="hl-g">또는</span> ') + (g ? ' <span class="hl-g">(추정)</span>' : ''); };
  const hlAct = t => (t || '').split(/\s*[,，]\s*/).filter(Boolean).map((x, i) => `<b class="hl-b">${i + 1}. ${E2(x.trim())}</b>`).join('<br>');
  const dest = o => { const ns = o ? DC.nodes(o) : []; let d = ns.length ? DC.shortName(ns[ns.length - 1]) : ''; if (o && d && o.customer && d.indexOf(o.customer) === 0 && d.length > o.customer.length) d = d.slice(o.customer.length).trim(); return d; };
  function build() {
    list = DC.actions().filter(a => a.lv <= 1).sort((a, b) => a.lv - b.lv || rank[cat(a)] - rank[cat(b)]);
    return list;
  }
  function render() {
    const host = document.getElementById('m-ceo'); if (!host) return;
    const K = DC.kpi(); build();
    const red = list.filter(a => a.lv === 0).length, yel = list.filter(a => a.lv === 1).length;
    const lv = red ? 0 : yel ? 1 : 2;
    const sp = (n, w) => `<span>${n}</span><span>건</span> <span>${w}</span>`;
    const head = lv === 0 ? ['결정 필요', sp(red, '즉시 확인')] : lv === 1 ? ['확인 필요', sp(yel, '점검')] : ['정상', '지연·위험 없음'];
    const nScan = list.filter(a => cat(a) === 'scan').length, nLate = list.filter(a => cat(a) === 'late').length, nStock = list.filter(a => cat(a) === 'stock').length, nRoute = list.filter(a => cat(a) === 'route').length;
    const chips = lv === 2 ? '' : `<div class="mc-chips"><span>납기 <b>${nLate}</b></span><span>재고 <b>${nStock}</b></span><span>경로 <b>${nRoute}</b></span>${nScan ? `<span>스캔 <b>${nScan}</b></span>` : ''}</div>`;
    const shown = showAll ? list : list.slice(0, 3);
    const cards = shown.map((a, i) => {
      const o = ordOf(a);
      return `<div class="mc-card lv${a.lv}" onclick="CM.open(${i})"><div class="mc-ct">${lvIc[a.lv]} ${DC.esc(a.t)}</div>` +
        (o ? `<div class="mc-cust"><b class="hl-b">${DC.esc(o.customer)}</b>${dest(o) ? ' <span class="hl-g">→ ' + DC.esc(dest(o)) + '</span>' : ''}</div><div class="mc-cs"><b>${DC.esc(whereOf(o))}</b></div>` : '') +
        `<div class="mc-cf">${hlFact(a.fact)}</div><div class="mc-go">${(() => { const d = dirsOf(a)[0]; return d ? `<span class="mc-dir st-${d.status}">${stIc[d.status]} ${d.status}</span> ` : ''; })()}📌 지시하기 ›</div></div>`;
    }).join('');
    const more = list.length > 3 && !showAll ? `<button type="button" class="mc-more" onclick="CM.all()">나머지 ${list.length - 3}건 더 보기</button>` : '';
    const nd = newDone(), dn = dirOpen().length, tot = S.directives().length;
    const newBtn = `<button type="button" class="mc-dirbtn plain" onclick="CM.newDir()"><span>📌 지시 작성 <small>오더를 골라 직접 지시</small></span><i>›</i></button>`;
    const dirBar = newBtn + (tot ? `<button type="button" class="mc-dirbtn${nd.length ? ' new' : ''}" onclick="CM.dirs()"><span>📌 내 지시 현황 <small>미완료 ${dn}건</small></span>${nd.length ? `<b class="mc-newbadge">✅ 새 완료 ${nd.length}건</b>` : '<i>›</i>'}</button>` : '');
    const doneNote = nd.length ? `<div class="mc-donenote" onclick="CM.dirs()">✅ 지시하신 ${nd.length}건이 완료되었습니다. <b>결과 보기 ›</b></div>` : '';
    host.innerHTML = doneNote + `<div class="mc-banner lv${lv}"><div class="mc-bi">${lvIc[lv]}</div><div><div class="mc-bt">${head[0]}</div><div class="mc-bs">${head[1]}</div></div></div>` + chips + dirBar +
      (cards ? `<div class="mc-cards">${cards}</div>${more}` : `<div class="mc-ok">진행 ${K.active}건 · 운송 중 ${K.moving}건 · 정시납품율 ${DC.fmtPct(K.onTime) == null ? '-' : DC.fmtPct(K.onTime) + '%'}<br>지금 결정하실 일은 없습니다.</div>`) +
      (cards ? `<div class="mc-sub">진행 <b>${K.active}</b>건 · 운송 중 <b>${K.moving}</b>건 · 정시납품율 <b>${DC.fmtPct(K.onTime) == null ? '-' : DC.fmtPct(K.onTime) + '%'}</b></div>` : '');
  }
  function sheet(html) {
    let sh = document.getElementById('m-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'm-sheet'; sh.onclick = e => { if (e.target === sh) close(); }; document.body.appendChild(sh); }
    sh.innerHTML = html; sh.classList.add('on'); return sh;
  }
  const chips = (arr, cur, fn) => arr.map(v => `<button type="button" class="ms-chip${v === cur ? ' on' : ''}" onclick="${fn}('${v}')">${v}</button>`).join('');
  const ctxHtml = d => { const c = d.ctx; if (!c) return `<div class="ms-ctx old">📍 지시 당시 상황: <b>${DC.esc(d.ref || '-')}</b> <small>(이전 지시 — 상세 상황 미기록)</small></div>`;
    return `<div class="ms-ctx"><div class="ms-ctxt">📍 지시 당시 상황 <small>${DC.esc((c.at || d.time || '').slice(5, 16))} 기준</small></div>` +
      `<div><b>${lvIc[c.level] || ''} ${DC.esc(c.alarm || d.ref || '')}</b></div>` +
      (c.customer ? `<div>${DC.esc(c.customer)}${c.dest ? ' → ' + DC.esc(c.dest) : ''}${d.orderNo ? ' · ' + DC.esc(d.orderNo) : ''}</div>` : '') +
      (c.where ? `<div>위치: <b>${DC.esc(c.where)}</b>${c.orderStatus ? ' · 오더 상태 ' + DC.esc(c.orderStatus) : ''}</div>` : '') +
      (c.fact ? `<div>상황: ${hlFact(c.fact)}</div>` : '') + (c.cause ? `<div>추정 원인: ${DC.esc(c.cause)}</div>` : '') + `</div>`; };
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
      (o ? `<div class="ms-r ms-cust"><span>고객 · 최종 도착</span><b class="hl-b big">${DC.esc(o.customer)}</b>${dest(o) ? ' <span class="hl-g">→ ' + DC.esc(dest(o)) + '</span>' : ''}</div><div class="ms-r"><span>현재 위치</span><b>${DC.esc(whereOf(o))}</b></div>` : '') +
      `<div class="ms-r"><span>상황</span>${hlFact(a.fact)}</div>${a.cause ? `<div class="ms-r ms-cause"><span>추정 원인</span>${hlCause(a.cause)}</div>` : ''}${a.act ? `<div class="ms-r ms-act"><span>권장 조치</span>${hlAct(a.act)}</div>` : ''}` +
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
    // 지시 당시 상황 스냅샷 — 나중에 "왜 이 지시를 내렸는지" 알 수 있도록 그 시점의 알람·위치·상태를 함께 저장
    const ctx = { alarm: cur.t, fact: cur.fact || '', cause: cur.cause || '', proposed: cur.act || '', level: cur.lv, where: o ? whereOf(o) : '', orderStatus: o ? o.status : '', customer: o ? o.customer : '', dest: o ? dest(o) : '', at: now() };
    addDirective({ to: sel.to, priority: sel.pr, text: t, ref: cur.t, orderNo: o ? o.no : '', customer: o ? o.customer : '', ctx });
    render(); drawDetail();
    const b = document.querySelector('#m-sheet .ms-form'); if (b) b.insertAdjacentHTML('afterbegin', '<div class="ms-done">✅ 지시를 보냈습니다. 운영관제 화면에 표시됩니다.</div>'); const dn = document.querySelector('#m-sheet .ms-done'); if (dn) dn.scrollIntoView({ block: 'center' });
  }
  function dirs() {
    const L = S.directives().slice().sort((a, b) => (isNewDone(b) - isNewDone(a)) || (b.time || '').localeCompare(a.time || ''));
    const fresh = new Set(L.filter(isNewDone).map(d => d.id));
    sheet(`<div class="ms-box"><div class="ms-h"><b>📌 내 지시 현황</b><button type="button" onclick="CM.close()">닫기 ✕</button></div>` +
      (L.length ? L.slice(0, 30).map(d => `<div class="ms-r"><div class="ms-dir st-${d.status}"><b>${stIc[d.status]} ${d.status}</b>${fresh.has(d.id) ? ' <span class="mc-newbadge">NEW</span>' : ''} · ${DC.esc(d.to)} · ${DC.esc(d.priority)} · ${DC.esc((d.time || '').slice(5, 16))}<br>${ctxHtml(d)}<div class="ms-dtext">📌 내 지시: <b>${DC.esc(d.text)}</b></div>${logHtml(d)}</div></div>`).join('') : '<div class="ms-r">보낸 지시가 없습니다.</div>') + '</div>');
  }
  // 문제 카드 없이 직접 지시 — 오더를 고르면 그 오더의 현재 상황을 '지시 당시 상황'으로 자동 기록
  function newDir() {
    const L = S.orders().filter(o => o.status !== '도착완료');
    sheet(`<div class="ms-box"><div class="ms-h"><b>📌 지시 작성</b><button type="button" onclick="CM.close()">닫기 ✕</button></div>` +
      (L.length ? `<div class="ms-fl">지시할 오더 선택</div><select id="cm-ord" class="ms-sel">${L.map(o => `<option value="${DC.esc(o.no)}">${DC.esc(o.no)} · ${DC.esc(o.customer)} [${DC.esc(o.status)}]</option>`).join('')}</select>` +
        `<button type="button" class="btn btn-primary ms-send" onclick="CM.pickOrd()">다음 ›</button>` : '<div class="ms-r">진행 중인 오더가 없습니다.</div>') + '</div>');
  }
  function pickOrd() {
    const o = S.orders().find(x => x.no === document.getElementById('cm-ord').value); if (!o) return;
    cur = { lv: 2, t: `직접 지시 · ${o.no}`, fact: `${o.customer}${dest(o) ? ' → ' + dest(o) : ''} · 오더 상태 ${o.status} · ${whereOf(o)}`, cause: '', act: '', go: 'order.html' };
    sel = { to: '운영관제', pr: '오늘', text: '' };
    drawDetail();
  }
  function close() { markSeen(); render(); const sh = document.getElementById('m-sheet'); if (sh) sh.classList.remove('on'); }
  return { render, open, close, pickTo, pickPr, addQ, send, dirs, newDir, pickOrd, all() { showAll = true; render(); } };
})();
