// ══ LMTS ceodash.js — CEO 대시보드 (신규) ══
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

  // 오더 단계 현황
  const colors = { '대기': '#CBD5E1', '패킹중': '#FCE7A8', '배차완료': '#C9B8F0', '운송중': '#93B8E8', '도착완료': '#9EDDB5', '지연': '#F4B6BF' };
  const mx = Math.max(1, ...K.stage.map(s => s[1]));
  el('pipe').innerHTML = K.stage.map(([s, n]) => `<div class="pipe-row"><span>${s}</span><div class="pipe-bar"><i style="width:${n / mx * 100}%;background:${colors[s]}"></i></div><span class="pipe-n">${n}</span></div>`).join('');

  // 진행 중 출하 — 경로 스텝퍼
  const act = S.orders().filter(o => o.status !== '도착완료');
  el('ship-n').textContent = act.length + '건';
  el('ships').innerHTML = act.length ? act.map(o => {
    const ns = DC.nodes(o), p = DC.position(o), ls = DC.legs(o), ov = ls.find(l => l.over);
    const stp = ns.map((n, i) => {
      const cls = p.idx < 0 ? '' : (i < p.idx || (i === p.idx && p.state === 'out') ? 'done' : (i === p.idx ? 'cur' : ''));
      return `<div class="stp ${cls}" title="${DC.esc(n)}"><div class="dot"></div><span>${DC.esc(DC.shortName(n))}</span></div>`;
    }).join('');
    const where = p.state === 'none' ? '출발 전' : p.state === 'off' ? `비지정 거점 ${DC.esc(p.last.hub)}` : `${DC.esc(DC.shortName(ns[p.idx]))} ${p.state === 'at' ? '입고' : '출고'} ${DC.hhmm(p.last.time)}`;
    const dly = o.status === '지연' || ov;
    return `<div class="ship ${dly ? 'hot' : ''}"><div class="ship-top"><span><b>${DC.esc(o.no)}</b> · ${DC.esc(o.customer)} · ${DC.esc(o.product)} (${o.boxes}박스)</span><span class="chip ${o.status === '지연' ? 'red' : 'blue'}">${DC.esc(o.status)}</span></div>
      <div class="steps">${stp}</div><div class="ship-top" style="margin:5px 0 0"><span>📍 ${where}</span>${ov ? `<span class="chip red">표준 +${ov.act - ov.std}분</span>` : ''}</div></div>`;
  }).join('') : '<div class="empty-n">진행 중인 출하오더가 없습니다</div>';

  // 조치 제안
  const ac = DC.actions();
  el('act-n').textContent = ac.length + '건';
  el('acts').innerHTML = ac.length ? ac.map(a => `<div class="al ${a.lv === 0 ? '' : a.lv === 1 ? 'warn' : 'info'}"><b>${DC.esc(a.t)}</b>
    <p>사실: ${DC.esc(a.fact)}<br>원인 후보: ${DC.esc(a.cause)}<br><em>대안: ${DC.esc(a.act)}</em> · <a href="${a.go}">화면 이동</a></p></div>`).join('')
    : '<div class="empty-n">조치가 필요한 항목이 없습니다</div>';

  // 거점 현황
  const ev = S.events(), act2 = new Set();
  S.orders().filter(o => o.status !== '도착완료').forEach(o => { const p = DC.position(o); if (p.state === 'at') act2.add(p.last.hub); });
  el('hub-n').textContent = `체류 ${act2.size} / ${S.hubs().length}`;
  el('hubs').innerHTML = S.hubs().map(h => {
    const l = ev.filter(e => e.hub === h.name).slice().sort((a, b) => a.time.localeCompare(b.time)).pop();
    return `<div class="hubc ${act2.has(h.name) ? 'act' : ''}" title="${DC.esc(h.name)}"><b>${DC.esc(DC.shortName(h.name))}</b><span class="t">${l ? `${l.event} ${l.time.slice(5, 16)}` : '이벤트 없음'}</span></div>`;
  }).join('');

  // 추이
  if (!el('tr-m').options.length) el('tr-m').innerHTML = Object.entries(DC.TREND).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  renderTrend();

  el('asof').textContent = `데이터 기준일 ${DC.anchorDate()}`;
  el('cover').innerHTML = `<b>데이터 확보 현황</b> · 연계 5종(출하오더 ${S.orders().length} · 패킹 ${S.packings().length} · 배차 ${S.dispatches().length} · 거점이벤트 ${S.events().length} · 알람 ${S.alarms().length}) · <b>연계 예정</b> 운송비 · 온도/충격 · 파손 클레임 · 차량 위치`;
}
function renderTrend() {
  const m = el('tr-m').value || 'ev', d = +el('tr-d').value || 14, T = DC.TREND[m];
  el('trend-ttl').textContent = T.name + ' 추이';          // 차트 제목 = KPI명 + " 추이" (동적)
  el('tr-lg').innerHTML = T.dual ? '<span><i style="background:#93B8E8"></i>IN</span><span><i style="background:#F4B6BF"></i>OUT</span>' : '';
  drawTrend(el('tr-host'), DC.trend(m, d), !!T.dual);
}
window.lmtsReady = function () { initNav(); renderCEO(); };
