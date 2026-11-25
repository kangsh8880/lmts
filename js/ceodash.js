// ══ LMTS ceodash.js — CEO 대시보드 (좌: 거점 현황·상세 / 우: 이동 중 운송) ══
let selHub = null;

function renderCEO() {
  const K = DC.kpi(), tip = {
    act: '진행 오더 = 상태가 도착완료가 아닌 출하오더', mv: '운송 중 = 거점 이벤트 기준, 출발 거점 OUT 후 다음 거점 IN 전인 오더 수 (우측 이동 중 운송 현황과 동일 기준). 오더 상태값과 다를 수 있음',
    al: '지연 상태 오더 + 비지정 거점 이벤트(알람) 건수',
    ot: '(클릭: 목록) 정시납품율 = 도착완료 ÷ (도착완료 + 지연) × 100. 집계 대상이 없으면 표시하지 않음',
    pk: '패킹 미완료 = 진행 오더(도착완료 제외) 중 패킹 기록이 없는 오더 건수. 클릭하면 목록',
    dp: '배차 필요 = 진행 오더 중 아직 이동하지 않은 구간에 배차(차량·선박·항공)가 지정되지 않은 오더 건수. 클릭하면 목록',
    st: '재고 부족 = 창고 현재고가 Packing 전(대기) 오더의 필요 수량보다 적은 제품 수. 클릭하면 목록',
    ov: '표준초과율 = 실적이 표준시간을 넘은 구간 ÷ 표준시간이 있고 실적이 측정된 구간 × 100',
    lg: '평균 구간 소요 = 출발거점 OUT → 다음거점 IN 측정 구간의 평균(분)'
  };
  el('kpis').innerHTML = [
    kbox('c2', '정시납품율', kv(DC.fmtPct(K.onTime), '%', K.onTime != null && K.onTime < 95 ? 'bad' : 'good'), K.onTime == null ? '완료·지연 오더 없음' : `완료 ${K.done}건 · 지연 ${K.delay}건`, tip.ot, 'js:openKpi(\'ot\')'),
    kbox('c1', '진행 오더', kv(K.active, '건'), `전체 ${K.orders}건 중`, tip.act, 'js:openKpi(\'act\')'),
    kbox('c3', '운송 중', kv(K.moving, '건'), 'OUT 후 다음 거점 IN 전', tip.mv, 'js:openKpi(\'mv\')'),
    kbox('c5', '지연 · 알람', kv(K.alarm, '건', K.alarm > 0 ? 'bad' : ''), `지연 ${K.delay} + 비지정 ${K.off}`, tip.al, 'js:openKpi(\'al\')'),
    kbox('c4', '패킹 미완료', kv(K.packPend, '건', K.packPend > 0 ? 'bad' : ''), `진행 ${K.active}건 중 패킹 기록 없음`, tip.pk, 'js:openKpi(\'pk\')'),
    kbox('c1', '배차 필요', kv(K.dispNeed, '건', K.dispNeed > 0 ? 'bad' : ''), `미배차 구간 ${K.dispNeedLegs}개`, tip.dp, 'js:openKpi(\'dp\')'),
    kbox('c4', '재고 부족', kv(K.stockShort, '품목', K.stockShort > 0 ? 'bad' : ''), K.stockShort ? '입고 등록 필요' : '대기 오더 충족', tip.st, 'js:openKpi(\'st\')'),
    kbox('c6', '구간 표준초과율', kv(DC.fmtPct(K.overRate), '%', K.overRate > 0 ? 'bad' : ''), K.measStd ? `측정 ${K.measStd}구간` : '표준시간·실적 부족', tip.ov, 'js:openKpi(\'ov\')')
  ].join('');

  const hubs = S.hubs(), mv = DC.moving();
  // 첫 진입 시 자동 선택: 체류 오더가 있는 거점 → 이동 도착 예정 거점 → 최근 이벤트 거점 → 첫 거점
  if (!selHub || !hubs.some(h => h.name === selHub)) {
    const pick = hubs.find(h => DC.hubStats(h.name).stay.length) || hubs.find(h => mv.some(m => m.to === h.name))
      || hubs.slice().sort((a, b) => (DC.hubStats(b.name).last?.time || '').localeCompare(DC.hubStats(a.name).last?.time || ''))[0];
    selHub = pick ? pick.name : null;
  }
  renderHubs(); renderHubDetail(); renderMoving(mv);
  el('asof').textContent = `데이터 기준일 ${DC.anchorDate()}`;
  const ac = DC.actions().length;
  el('foot-act').innerHTML = ac ? `조치 필요 <b>${ac}건</b> · <a href="ops.html">운영관제에서 확인</a>` : '조치 필요 항목 없음';
  el('cover').innerHTML = `<b>데이터 확보 현황</b> · 연계 5종(출하오더 ${S.orders().length} · 패킹 ${S.packings().length} · 배차 ${S.dispatches().length} · 거점이벤트 ${S.events().length} · 알람 ${S.alarms().length}) · <b>연계 예정</b> 운송비 · 온도/충격 · 파손 클레임 · 차량 위치`;
}

// ── 좌측 상단: 거점별 현황 ────────────────────────────────────
function renderHubs() {
  const hubs = S.hubs(), mv = DC.moving();
  const st = Object.fromEntries(hubs.map(h => [h.name, DC.hubStats(h.name)]));
  const nStay = hubs.filter(h => st[h.name].stay.length).length;
  el('hub-n').textContent = `체류 ${nStay} / ${hubs.length}`;
  el('hubs').innerHTML = hubs.map(h => {
    const s = st[h.name], l = s.last, exp = mv.some(m => m.to === h.name);
    const tag = (h.type || '').replace(/\(.*\)/, '');
    return `<div class="hubc ${s.stay.length ? 'act' : ''} ${exp ? 'exp' : ''} ${h.name === selHub ? 'on' : ''}" data-h="${DC.esc(h.name)}" onclick="pickHub(this.dataset.h)" title="${DC.esc(h.name)}">
      <div class="hn1"><span>${DC.HUBMODE_ICON[DC.hubMode(h.name)]}</span><b>${DC.esc(DC.shortName(h.name))}</b></div>
      <span class="t">${DC.esc(tag)} · 체류 <b>${s.stay.length}</b>${exp ? ' · 입고예정 <b>' + mv.filter(m => m.to === h.name).length + '</b>' : ''}</span><br>
      <span class="t">${l ? `${l.event} ${l.time.slice(5, 16)}` : '이벤트 없음'}</span></div>`;
  }).join('') || '<div class="empty-n">등록된 거점이 없습니다</div>';
}

// ── 좌측 하단: 거점별 상세현황 (KPI 박스 클릭 → 해당 리스트) ─────
let hdTab = null;
function pickHub(name) { selHub = name; hdTab = null; renderHubs(); renderHubDetail(); }
function pickHd(t) { hdTab = (hdTab === t) ? 'all' : t; renderHubDetail(); }
function renderHubDetail() {
  const h = S.hubs().find(x => x.name === selHub);
  if (!h) { el('hub-detail').innerHTML = '<div class="empty-n">거점을 선택하세요</div>'; el('hd-ttl').textContent = '거점별 상세현황'; el('hd-type').textContent = ''; return; }
  const s = DC.hubStats(h.name);
  el('hd-ttl').textContent = `거점별 상세현황 · ${DC.shortName(h.name)}`;
  el('hd-type').textContent = h.type || '';
  const evs = s.ev.slice().reverse();
  const L = {
    stay: s.stay, exp: s.expect, arr: evs.filter(e => e.event === '도착완료'),
    in: evs.filter(e => e.event === 'IN'), out: evs.filter(e => e.event === 'OUT'),
    dwell: evs.filter(e => e.dwell != null && e.dwell >= 0), all: evs
  };
  if (!hdTab) hdTab = s.expect.length ? 'exp' : s.stay.length ? 'stay' : 'all';
  const T = {
    stay: '🏭 체류 오더', exp: '📥 입고 예정', arr: '✅ 도착완료 이력', in: '⬇️ 누적 IN 이력', out: '⬆️ 누적 OUT 이력', dwell: '⏱ 평균 체류 산출 이력 (IN→OUT)', all: '🔁 전체 IN/OUT 이력'
  };
  const box = (t, cls, name, val, unit, tip) => `<div class="mini ${cls} ${hdTab === t ? 'on' : ''}" onclick="pickHd('${t}')" title="${tip}"><span>${name}</span><b>${val}<u>${unit}</u></b></div>`;
  const evTable = rows => `<table class="dt"><thead><tr><th>시각</th><th>오더</th><th>고객사</th><th>구분</th><th class="num">체류(분)</th><th>담당</th></tr></thead><tbody>${rows.map(e =>
    `<tr><td>${e.time.slice(5, 16)}</td><td>${DC.esc(e.orderNo)}</td><td>${DC.esc(e.customer)}</td><td><span class="chip ${e.event === 'IN' ? 'blue' : e.event === 'OUT' ? 'red' : 'grn'}">${e.event}</span></td><td class="num">${e.dwell != null && e.dwell >= 0 ? e.dwell : '-'}</td><td>${DC.esc(e.person || '-')}</td></tr>`).join('')}</tbody></table>`;
  let list;
  const rows = L[hdTab];
  if (!rows.length) list = '<div class="empty-n">해당 내역이 없습니다</div>';
  else if (hdTab === 'stay') list = `<table class="dt"><thead><tr><th>오더</th><th>고객사</th><th>제품(박스)</th><th>상태</th><th>최근 이벤트</th></tr></thead><tbody>${rows.map(o => {
    const last = s.ev.filter(e => e.orderNo === o.no).slice(-1)[0];
    return `<tr><td><b>${DC.esc(o.no)}</b></td><td>${DC.esc(o.customer)}</td><td>${DC.esc(o.product)} (${ordQty(o)})</td><td><span class="chip blue">${DC.esc(o.status)}</span></td><td>${last ? last.event + ' ' + last.time.slice(5, 16) : '-'}</td></tr>`; }).join('')}</tbody></table>`;
  else if (hdTab === 'exp') list = `<table class="dt"><thead><tr><th>오더</th><th>고객사</th><th>출발 거점</th><th>수단</th><th>출고</th><th>예정 도착</th><th>상태</th></tr></thead><tbody>${rows.map(m =>
    `<tr><td><b>${DC.esc(m.o.no)}</b></td><td>${DC.esc(m.o.customer)}</td><td>${DC.esc(DC.shortName(m.from))}</td><td>${DC.MODE[m.mode][0]} ${DC.MODE[m.mode][1]}</td><td>${DC.hhmm(m.outTime)}</td><td>${m.eta || '-'}</td><td>${m.over ? `<span class="chip red">표준 +${m.elapsed - m.std}분</span>` : `<span class="chip blue">${DC.esc(m.o.status)}</span>`}</td></tr>`).join('')}</tbody></table>`;
  else list = evTable(rows);
  el('hub-detail').innerHTML = `
    <div class="hd-info">${DC.esc(h.code || '')} · ${DC.esc(h.addr || '주소 미등록')} · 담당 ${DC.esc(h.mgr || '-')}</div>
    <div class="mini-grid">
      ${box('stay', 'c3', '체류 오더', s.stay.length, '건', '클릭: 체류 오더 리스트')}
      ${box('exp', 'c1', '입고 예정', s.expect.length, '건', '클릭: 입고 예정 리스트')}
      ${box('arr', 'c6', '도착완료', s.arrN, '건', '클릭: 도착완료 이력')}
      ${box('in', 'c2', '누적 IN', s.inN, '건', '클릭: IN 이력')}
      ${box('out', 'c5', '누적 OUT', s.outN, '건', '클릭: OUT 이력')}
      ${box('dwell', 'c4', '평균 체류', s.avgDwell == null ? '<small>데이터 없음</small>' : s.avgDwell, s.avgDwell == null ? '' : '분', `IN → OUT 측정 ${s.dwN}건 평균 · 클릭: 산출 이력`)}
    </div>
    <div class="sub-ttl">${T[hdTab]} <b>${rows.length}건</b> <small class="hint">· 같은 박스를 다시 누르면 전체 이력</small></div>
    ${list}`;
}

// ── 우측: 이동 중 운송 현황 (차량 · 선박 · 항공 KPI 박스 클릭 → 상세) ──
let mvSel = null;
function pickMv(m) { mvSel = m; renderMoving(DC.moving()); }
function renderMoving(mv) {
  const live = DC.refNow().live, modes = ['truck', 'sea', 'air'];
  el('mv-chips').innerHTML = '';
  if (!mvSel) mvSel = modes.find(m => mv.some(x => x.mode === m)) || 'truck';
  const cls = { truck: 'c3', sea: 'c1', air: 'c4' };
  const detail = x => {
    const d = x.dp; if (!d) return '<span class="chip red">배차 미지정</span>';
    if (x.mode === 'truck') return `🚛 <b>${DC.esc(d.vehicleNo || '-')}</b> · ${DC.esc(d.driver || '-')}${d.dphone ? ' · ' + DC.esc(d.dphone) : ''}`;
    if (x.mode === 'air') return `✈️ <b>${DC.esc(((d.airline || '') + ' ' + (d.flightNo || '')).trim() || '-')}</b> · ${DC.esc(d.depAirport || '')}→${DC.esc(d.arrAirport || '')}`;
    return `🚢 <b>${DC.esc(((d.shippingCo || '') + ' ' + (d.vessel || '')).trim() || '-')}</b> · ${DC.esc(d.depPort || '')}→${DC.esc(d.arrPort || '')}`;
  };
  const list = mv.filter(x => x.mode === mvSel);
  const kp = modes.map(m => `<div class="mk ${cls[m]} ${mvSel === m ? 'on' : ''}" onclick="pickMv('${m}')" title="클릭: ${DC.MODE[m][1]} 이동 중 상세"><span>${DC.MODE[m][0]} ${DC.MODE[m][1]}</span><b>${mv.filter(x => x.mode === m).length}<u>건</u></b></div>`).join('');
  el('moving').innerHTML = `<div class="mk-grid">${kp}</div>
    <div class="sub-ttl">${DC.MODE[mvSel][0]} ${DC.MODE[mvSel][1]} 이동 중 상세 <b>${list.length}건</b></div>` +
    (list.length ? list.map(x => `<div class="mv ${x.over ? 'hot' : ''}">
        <div class="mv-top"><span><b>${DC.esc(x.o.no)}</b> · ${DC.esc(x.o.customer)} · ${DC.esc(x.o.product)} (수량 ${ordQty(x.o)})</span><span style="display:flex;gap:6px;align-items:center;white-space:nowrap">${x.over ? `<span class="chip red">표준 +${x.elapsed - x.std}분</span>` : `<span class="chip blue">${DC.esc(x.o.status)}</span>`}<a class="btn btn-primary btn-sm" href="map.html?order=${encodeURIComponent(x.o.no)}">🗺️ 위치추적</a></span></div>
        <div class="mv-route"><span>${DC.esc(DC.shortName(x.from))}</span><i>➜</i><span>${DC.esc(DC.shortName(x.to))}</span></div>
        <div class="mv-meta"><span>${detail(x)}</span><span>출고 <b>${DC.hhmm(x.outTime)}</b></span><span>표준 <b>${x.std != null ? x.std + '분' : '미설정'}</b></span><span>예정 도착 <b>${x.eta || '-'}</b></span>${x.elapsed != null ? `<span>경과 <b>${x.elapsed}분</b></span>` : ''}</div></div>`).join('')
      : '<div class="mv-none">이동 중인 운송이 없습니다</div>') +
    (live ? '' : `<div class="mv-none">※ 데이터가 최근 48시간 이내가 아니어서 경과 시간은 표시하지 않습니다 (기준일 ${DC.anchorDate()})</div>`);
}
// ── KPI 클릭 → 상세 팝업 ─────────────────────────────────────
function openPop(title, sub, html, go, goLabel) {
  el('kpi-pop-ttl').textContent = title; el('kpi-pop-sub').innerHTML = sub || '';
  el('kpi-pop-body').innerHTML = html;
  el('kpi-pop-go').innerHTML = `<span class="pop-hint">제목줄을 끌어 이동 · 우측 아래 모서리를 끌어 크기 조절</span>` + (go ? `<a class="btn btn-primary" href="${go}">${goLabel} 열기 ›</a>` : '');
  el('kpi-pop').classList.remove('hidden');
}
function closePop() { el('kpi-pop').classList.add('hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
function openKpi(k) {
  const K = DC.kpi(), O = S.orders(), E = DC.esc;
  const tb = (heads, rows) => rows.length ? `<table class="dt"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty-n">해당 내역이 없습니다</div>';
  const st = o => `<span class="chip ${o.status === '지연' ? 'red' : o.status === '도착완료' ? 'grn' : 'blue'}">${E(o.status)}</span>`;
  const base = o => [`<b>${E(o.no)}</b>`, E(o.customer), `${E(o.product)} (${ordQty(o)})`, st(o)];
  const where = o => { const p = DC.position(o); return p.last ? `${E(DC.shortName(p.last.hub))} ${p.last.event} ${p.last.time.slice(5, 16)}` : '이벤트 없음'; };
  if (k === 'ot') {
    const L = O.filter(o => o.status === '도착완료' || o.status === '지연');
    openPop('정시납품율 상세', `정시납품율 = 도착완료 ÷ (도착완료 + 지연) × 100 · 완료 <b>${K.done}</b>건 · 지연 <b>${K.delay}</b>건`,
      tb(['오더', '고객사', '제품(박스)', '상태', '출하예정일'], L.map(o => [...base(o), E(o.date || '-')])), 'order.html', '출하오더');
  } else if (k === 'act') {
    const L = O.filter(o => o.status !== '도착완료');
    openPop('진행 오더 상세', `도착완료가 아닌 출하오더 <b>${L.length}</b>건`, tb(['오더', '고객사', '제품(박스)', '상태', '현재 위치'], L.map(o => [...base(o), where(o)])), 'order.html', '출하오더');
  } else if (k === 'mv') {
    const L = DC.moving();
    openPop('운송 중 상세', `거점 간 이동 중인 오더 <b>${L.length}</b>건`, tb(['오더', '고객사', '구간', '수단', '출고', '예정 도착', '배차'], L.map(m => [`<b>${E(m.o.no)}</b>`, E(m.o.customer), `${E(DC.shortName(m.from))} ➜ ${E(DC.shortName(m.to))}`, `${DC.MODE[m.mode][0]} ${DC.MODE[m.mode][1]}`, DC.hhmm(m.outTime), m.eta || '-', m.dp ? '지정' : '<span class="chip red">미지정</span>'])), 'tracking.html', '거점In/Out');
  } else if (k === 'al') {
    const dl = O.filter(o => o.status === '지연'), al = S.alarms().filter(a => a.type === 'OFF_ROUTE');
    openPop('지연 · 알람 상세', `지연 오더 <b>${dl.length}</b>건 + 비지정 거점 이벤트 <b>${al.length}</b>건`,
      tb(['구분', '오더', '내용', '현재 위치'], [...dl.map(o => ['<span class="chip red">지연</span>', `<b>${E(o.no)}</b>`, `${E(o.customer)} · ${E(o.product)}`, where(o)]), ...al.map(a => ['<span class="chip ylw">비지정 거점</span>', `<b>${E(a.orderNo)}</b>`, `${E(a.hub)} ${E(a.event)} (${DC.hhmm(a.time)}) — 경로 외 거점`, E(a.hub)])]), 'order.html', '출하오더');
  } else if (k === 'st') {
    const L = K.stockShortList;
    openPop('재고 부족 상세', `창고 현재고가 대기 오더 필요 수량보다 적은 제품 <b>${L.length}</b>품목`, tb(['Box No', '제품', '현재고', '오더 필요', '부족'], L.map(x => [E(x.code), `<b>${E(x.name)}</b>`, x.left, x.need, `<b style="color:#C0392B">${x.short}</b>`])), 'packing.html', '입고Packing');
  } else if (k === 'pk') {
    openPop('패킹 미완료 상세', `진행 오더 중 패킹 기록이 없는 오더 <b>${K.packPend}</b>건`, tb(['오더', '고객사', '제품(박스)', '상태', '출하예정일'], K.packPendList.map(o => [...base(o), E(o.date || '-')])), 'packing.html', '입고Packing');
  } else if (k === 'dp') {
    openPop('배차 필요 상세', `아직 이동하지 않은 구간에 배차가 없는 오더 <b>${K.dispNeed}</b>건 · 미배차 구간 <b>${K.dispNeedLegs}</b>개`,
      tb(['오더', '고객사', '상태', '배차 현황', '배차 필요 구간'], K.dispNeedList.map(x => [`<b>${E(x.o.no)}</b>`, E(x.o.customer), st(x.o), `${x.got}/${x.total}구간`, x.miss.map(l => `<span class="chip red">${E(DC.shortName(l.from))} ➜ ${E(DC.shortName(l.to))}</span>`).join(' ')])), 'dispatch.html', '차량배차');
  } else if (k === 'ov') {
    const L = O.flatMap(o => DC.legs(o).filter(l => l.over).map(l => ({ o, l })));
    openPop('구간 표준초과 상세', `표준초과율 = 표준시간 초과 구간 ÷ (표준시간 있고 실적 측정된 구간) × 100 · 측정 <b>${K.measStd}</b>구간 중 초과 <b>${L.length}</b>구간`,
      tb(['오더', '고객사', '구간', '표준(분)', '실적(분)', '초과(분)'], L.map(({ o, l }) => [`<b>${E(o.no)}</b>`, E(o.customer), `${E(DC.shortName(l.from))} ➜ ${E(DC.shortName(l.to))}`, l.std, l.act, `<b style="color:#C0392B">+${l.act - l.std}</b>`])), 'dispatch.html', '차량배차');
  }
}
window.lmtsReady = function () { initNav(); renderCEO(); if (typeof CM !== 'undefined') CM.render(); };
