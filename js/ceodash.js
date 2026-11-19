// ══ LMTS ceodash.js — CEO 대시보드 (좌: 거점 현황·상세 / 우: 이동 중 운송) ══
let selHub = null;

function renderCEO() {
  const K = DC.kpi(), tip = {
    act: '진행 오더 = 상태가 도착완료가 아닌 출하오더', mv: '운송중 상태 오더 수',
    al: '지연 상태 오더 + 비지정 거점 이벤트(알람) 건수',
    ot: '정시납품율 = 도착완료 ÷ (도착완료 + 지연) × 100. 집계 대상이 없으면 표시하지 않음',
    pk: '패킹 완료율 = 패킹 기록이 있는 오더 ÷ 전체 오더 × 100',
    dp: '배차 완료율 = 모든 구간(경로 거점 수-1)에 배차가 지정된 오더 ÷ 전체 오더 × 100',
    ov: '표준초과율 = 실적이 표준시간을 넘은 구간 ÷ 표준시간이 있고 실적이 측정된 구간 × 100',
    lg: '평균 구간 소요 = 출발거점 OUT → 다음거점 IN 측정 구간의 평균(분)'
  };
  el('kpis').innerHTML = [
    kbox('c1', '진행 오더', kv(K.active, '건'), `전체 ${K.orders}건 중`, tip.act),
    kbox('c3', '운송 중', kv(K.moving, '건'), '거점 이동 중', tip.mv),
    kbox('c5', '지연 · 알람', kv(K.alarm, '건', K.alarm > 0 ? 'bad' : ''), `지연 ${K.delay} + 비지정 ${K.off}`, tip.al),
    kbox('c2', '정시납품율', kv(DC.fmtPct(K.onTime), '%', K.onTime != null && K.onTime < 95 ? 'bad' : 'good'), K.onTime == null ? '완료·지연 오더 없음' : `완료 ${K.done}건`, tip.ot),
    kbox('c4', '패킹 완료율', kv(DC.fmtPct(K.packRate), '%'), `${K.packed}/${K.orders}건`, tip.pk, 'packing.html'),
    kbox('c1', '배차 완료율', kv(DC.fmtPct(K.dispRate), '%'), `${K.dispatched}/${K.orders}건`, tip.dp, 'dispatch.html'),
    kbox('c6', '구간 표준초과율', kv(DC.fmtPct(K.overRate), '%', K.overRate > 0 ? 'bad' : ''), K.measStd ? `측정 ${K.measStd}구간` : '표준시간·실적 부족', tip.ov),
    kbox('c3', '평균 구간 소요', kv(K.avgLeg, '분'), K.measN ? `측정 ${K.measN}구간` : '실적 부족', tip.lg)
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
function pickHub(name) { selHub = name; renderHubs(); renderHubDetail(); }

// ── 좌측 하단: 거점별 상세현황 ────────────────────────────────
function renderHubDetail() {
  const h = S.hubs().find(x => x.name === selHub);
  if (!h) { el('hub-detail').innerHTML = '<div class="empty-n">거점을 선택하세요</div>'; el('hd-ttl').textContent = '거점별 상세현황'; el('hd-type').textContent = ''; return; }
  const s = DC.hubStats(h.name);
  el('hd-ttl').textContent = `거점별 상세현황 · ${DC.shortName(h.name)}`;
  el('hd-type').textContent = h.type || '';
  const ordChip = (o, cls) => `<span class="chip ${cls}" title="${DC.esc(o.customer)}">${DC.esc(o.no)}</span>`;
  const rows = s.ev.slice().reverse();
  el('hub-detail').innerHTML = `
    <div class="hd-info">${DC.esc(h.code || '')} · ${DC.esc(h.addr || '주소 미등록')} · 담당 ${DC.esc(h.mgr || '-')}</div>
    <div class="mini-grid">
      <div class="mini c3"><span>체류 오더</span><b>${s.stay.length}<u>건</u></b></div>
      <div class="mini c1"><span>입고 예정</span><b>${s.expect.length}<u>건</u></b></div>
      <div class="mini c2"><span>누적 IN</span><b>${s.inN}<u>건</u></b></div>
      <div class="mini c5"><span>누적 OUT</span><b>${s.outN}<u>건</u></b></div>
      <div class="mini c4" title="IN → OUT 측정 ${s.dwN}건 평균"><span>평균 체류</span><b>${s.avgDwell == null ? '<u>데이터 없음</u>' : s.avgDwell + '<u>분</u>'}</b></div>
    </div>
    <div class="ord-chips"><b>체류</b> ${s.stay.length ? s.stay.map(o => ordChip(o, 'ylw')).join('') : '<span class="chip gry">없음</span>'}
      <b style="margin-left:8px">입고 예정</b> ${s.expect.length ? s.expect.map(m => ordChip(m.o, 'blue')).join('') : '<span class="chip gry">없음</span>'}</div>
    ${rows.length ? `<table class="dt"><thead><tr><th>시각</th><th>오더</th><th>고객사</th><th>구분</th><th class="num">체류(분)</th><th>담당</th></tr></thead><tbody>${rows.map(e =>
      `<tr><td>${e.time.slice(5, 16)}</td><td>${DC.esc(e.orderNo)}</td><td>${DC.esc(e.customer)}</td><td><span class="chip ${e.event === 'IN' ? 'blue' : 'red'}">${e.event}</span></td><td class="num">${e.dwell != null && e.dwell >= 0 ? e.dwell : '-'}</td><td>${DC.esc(e.person || '-')}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty-n">이 거점의 IN/OUT 이력이 없습니다</div>'}`;
}

// ── 우측: 이동 중 운송 현황 (차량 · 선박 · 항공) ───────────────
function renderMoving(mv) {
  const live = DC.refNow().live;
  el('mv-chips').innerHTML = ['truck', 'sea', 'air'].map(m => `<span class="chip ${mv.some(x => x.mode === m) ? 'blue' : 'gry'}">${DC.MODE[m][0]} ${DC.MODE[m][1]} ${mv.filter(x => x.mode === m).length}</span>`).join('');
  const detail = x => {
    const d = x.dp; if (!d) return '<span class="chip red">배차 미지정</span>';
    if (x.mode === 'truck') return `🚛 <b>${DC.esc(d.vehicleNo || '-')}</b> · ${DC.esc(d.driver || '-')}${d.dphone ? ' · ' + DC.esc(d.dphone) : ''}`;
    if (x.mode === 'air') return `✈️ <b>${DC.esc(((d.airline || '') + ' ' + (d.flightNo || '')).trim() || '-')}</b> · ${DC.esc(d.depAirport || '')}→${DC.esc(d.arrAirport || '')}`;
    return `🚢 <b>${DC.esc(((d.shippingCo || '') + ' ' + (d.vessel || '')).trim() || '-')}</b> · ${DC.esc(d.depPort || '')}→${DC.esc(d.arrPort || '')}`;
  };
  el('moving').innerHTML = ['truck', 'sea', 'air'].map(m => {
    const list = mv.filter(x => x.mode === m);
    return `<div class="mv-sec ${m}"><span>${DC.MODE[m][0]} ${DC.MODE[m][1]}</span><span>${list.length}건</span></div>` +
      (list.length ? list.map(x => `<div class="mv ${x.over ? 'hot' : ''}">
        <div class="mv-top"><span><b>${DC.esc(x.o.no)}</b> · ${DC.esc(x.o.customer)} · ${DC.esc(x.o.product)} (${x.o.boxes}박스)</span>${x.over ? `<span class="chip red">표준 +${x.elapsed - x.std}분</span>` : `<span class="chip blue">${DC.esc(x.o.status)}</span>`}</div>
        <div class="mv-route"><span>${DC.esc(DC.shortName(x.from))}</span><i>➜</i><span>${DC.esc(DC.shortName(x.to))}</span></div>
        <div class="mv-meta"><span>${detail(x)}</span><span>출고 <b>${DC.hhmm(x.outTime)}</b></span><span>표준 <b>${x.std != null ? x.std + '분' : '미설정'}</b></span><span>예정 도착 <b>${x.eta || '-'}</b></span>${x.elapsed != null ? `<span>경과 <b>${x.elapsed}분</b></span>` : ''}</div></div>`).join('')
        : '<div class="mv-none">이동 중인 운송이 없습니다</div>');
  }).join('') + (live ? '' : `<div class="mv-none">※ 데이터가 최근 48시간 이내가 아니어서 경과 시간은 표시하지 않습니다 (기준일 ${DC.anchorDate()})</div>`);
}
window.lmtsReady = function () { initNav(); renderCEO(); };
