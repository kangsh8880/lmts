// ══ LMTS analytics.js ══

// ─── ANALYTICS (물류 성과 분석 - 글로벌 BM 기반 고도화) ──────────
// ══════════════════════════════════════════════════════════════════

// ── 지연 위험도 스코어 (FedEx Surround® BM) ──────────────────────
// 표준이동시간 대비 실제 경과 비율로 위험도 산출
function calcRiskScore(order) {
  const evts = S.events().filter(e => e.orderNo === order.no)
                          .sort((a,b) => a.time.localeCompare(b.time));
  const route = order.route || {};
  const wps   = route.waypoints || [];

  // 표준시간 합산 (분)
  let totalStd = parseFloat(route.originStdTime || 0);
  wps.forEach(w => { totalStd += parseFloat(typeof w==='object' ? w.stdTime||0 : 0); });

  // 실제 경과시간 (이벤트 첫/마지막 기준)
  let elapsed = 0;
  if (evts.length >= 2) {
    const t0 = new Date(evts[0].time.replace(' ','T'));
    const t1 = new Date(evts[evts.length-1].time.replace(' ','T'));
    elapsed = Math.round((t1 - t0) / 60000);
  }

  const ratio = (totalStd > 0 && elapsed > 0) ? Math.round((elapsed / totalStd) * 100) : 0;

  let level, color, emoji;
  if      (ratio >= 120) { level='high';   color='#C0392B'; emoji='🔴'; }
  else if (ratio >= 90)  { level='medium'; color='#E6A817'; emoji='🟡'; }
  else if (ratio > 0)    { level='normal'; color='#27AE60'; emoji='🟢'; }
  else                   { level='nodata'; color='#9CA3AF'; emoji='⚪'; }

  return { score: ratio, level, color, emoji, elapsed, std: Math.round(totalStd) };
}

// ── 지연 예측 경보 (Maersk Captain Peter BM) ─────────────────────
// OUT 이벤트 이후 표준시간 대비 IN 이벤트 지연 여부로 경보 생성
function generatePredictAlarms() {
  const alarms = [];
  S.orders().filter(o => ['운송중','배차완료'].includes(o.status)).forEach(order => {
    const evts  = S.events().filter(e => e.orderNo === order.no)
                             .sort((a,b) => a.time.localeCompare(b.time));
    const route = order.route || {};
    const wps   = route.waypoints || [];
    const allHubs = [route.origin, ...wps.map(w=>typeof w==='string'?w:w.name), route.destination].filter(Boolean);
    const stdTimes= [parseFloat(route.originStdTime||0), ...wps.map(w=>parseFloat(typeof w==='object'?w.stdTime||0:0))];

    allHubs.forEach((hub, i) => {
      const nextHub = allHubs[i+1];
      if (!nextHub || !stdTimes[i]) return;

      const outEvt = evts.find(e => e.hub === hub && e.event === 'OUT');
      if (!outEvt) return;
      const inEvt  = evts.find(e => e.hub === nextHub && (e.event === 'IN' || e.event === '도착완료'));
      if (inEvt) return; // 이미 도착

      // OUT 이후 얼마나 경과했는지: 다음 이벤트 시간 or 마지막 이벤트 시간과 비교
      const lastEvt = evts[evts.length - 1];
      if (!lastEvt) return;
      const outT    = new Date(outEvt.time.replace(' ','T'));
      const lastT   = new Date(lastEvt.time.replace(' ','T'));
      const elapsedMin = Math.round((lastT - outT) / 60000);
      if (elapsedMin <= 0) return;

      const ratio = Math.round((elapsedMin / stdTimes[i]) * 100);
      if (ratio < 80) return;

      const severity = ratio >= 120 ? '심각' : ratio >= 100 ? '경고' : '주의';
      const sevColor = ratio >= 120 ? '#C0392B' : ratio >= 100 ? '#E6A817' : '#5B8DB8';
      alarms.push({ orderNo:order.no, customer:order.customer,
        fromHub:hub, toHub:nextHub, elapsed:elapsedMin,
        std:stdTimes[i], ratio, severity, sevColor });
    });
  });
  return alarms;
}

// ── 구간별 TAT 분석 (DHL Resilience360 BM) ──────────────────────
function calcTATAnalysis() {
  const result = [];
  S.orders().forEach(order => {
    const evts  = S.events().filter(e => e.orderNo === order.no)
                             .sort((a,b) => a.time.localeCompare(b.time));
    const route = order.route || {};
    const wps   = route.waypoints || [];
    const allHubs = [route.origin, ...wps.map(w=>typeof w==='string'?w:w.name), route.destination].filter(Boolean);
    const stdTimes= [parseFloat(route.originStdTime||0), ...wps.map(w=>parseFloat(typeof w==='object'?w.stdTime||0:0))];

    allHubs.forEach((hub, i) => {
      const nextHub = allHubs[i+1];
      if (!nextHub) return;
      const outEvt = evts.find(e => e.hub === hub && e.event === 'OUT');
      const inEvt  = evts.find(e => e.hub === nextHub && (e.event === 'IN' || e.event === '도착완료'));
      if (!outEvt || !inEvt) return;

      const actual = Math.round((new Date(inEvt.time.replace(' ','T')) - new Date(outEvt.time.replace(' ','T'))) / 60000);
      if (actual <= 0) return;
      const std  = stdTimes[i] || 0;
      const ratio= std > 0 ? Math.round((actual / std) * 100) : null;
      result.push({
        orderNo:order.no, customer:order.customer,
        fromHub:hub, toHub:nextHub, actual, std, ratio,
        status: ratio ? (ratio > 120 ? 'over' : ratio > 100 ? 'warn' : 'ok') : 'na'
      });
    });
  });
  return result;
}

// ── 디지털 POD 기록 (Amazon BM) ─────────────────────────────────
function getPODRecords() {
  return S.events().filter(e => e.event === '도착완료').map(e => {
    const order = S.orders().find(o => o.no === e.orderNo);
    const cust  = S.customers().find(c => c.name === order?.customer);
    return { ...e, product: order?.product||'-', confirm: cust?.confirm || '서명' };
  }).reverse();
}

// ── 분석 페이지 메인 렌더 ─────────────────────────────────────────
function renderAnalytics() {
  const orders  = S.orders();
  const events  = S.events();
  const hubs    = S.hubs();
  const done    = orders.filter(o => o.status === '도착완료');
  const delayed = orders.filter(o => o.status === '지연');
  const active  = orders.filter(o => ['운송중','배차완료','패킹중'].includes(o.status));

  // ── KPI 계산 ──
  const total  = done.length + delayed.length;
  const ontime = total > 0 ? Math.round((done.length / total) * 100) : (orders.length > 0 ? 100 : 0);
  const tatList= calcTATAnalysis();
  const avgTAT = tatList.length > 0
    ? Math.round(tatList.reduce((s,t) => s + t.actual, 0) / tatList.length) : 0;
  const riskOrders = orders.filter(o => {
    const r = calcRiskScore(o); return r.level === 'high' || r.level === 'medium';
  });
  const predAlarms = generatePredictAlarms();

  el('ana-kpi-ontime').textContent = orders.length > 0 ? ontime + '%' : '--%';
  el('ana-kpi-tat').textContent    = avgTAT > 0 ? (avgTAT >= 60 ? Math.round(avgTAT/60) + 'h' : avgTAT + 'm') : '--';
  el('ana-kpi-risk').textContent   = riskOrders.length;
  el('ana-kpi-delay').textContent  = predAlarms.length + '건';

  // ── 오더별 위험도 스코어 ──────────────────────────────────────
  const riskDiv = el('ana-risk-list');
  if (!orders.length) {
    riskDiv.innerHTML = '<div class="empty">출하오더 없음 — 오더 생성 후 확인하세요</div>';
  } else {
    const stMap = {'대기':'s-ready','패킹중':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done','지연':'s-delay'};
    riskDiv.innerHTML = orders.slice(-10).reverse().map(o => {
      const r   = calcRiskScore(o);
      const evc = events.filter(e => e.orderNo === o.no).length;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #EEF2F7;flex-wrap:wrap">
        <span style="font-size:20px;flex-shrink:0">${r.emoji}</span>
        <div style="flex:1;min-width:140px">
          <div style="font-size:12px;font-weight:700;color:var(--dk)">${o.no}</div>
          <div style="font-size:10px;color:var(--gray)">${o.customer} · ${o.product||''}</div>
          <div style="font-size:9px;color:var(--gray);margin-top:1px">이벤트 ${evc}건 | 경로: ${(o.route?.waypoints?.length||0)+1}구간</div>
        </div>
        <div style="text-align:right;flex-shrink:0;min-width:90px">
          ${r.score > 0
            ? `<div style="font-size:18px;font-weight:800;color:${r.color}">${r.score}%</div>
               <div style="font-size:9px;color:var(--gray)">실제 ${r.elapsed}분 / 표준 ${r.std}분</div>`
            : `<div style="font-size:10px;color:var(--gray)">${r.std > 0 ? '이벤트 수집 중' : '표준시간 미설정'}</div>`}
        </div>
        <span class="status ${stMap[o.status]||'s-ready'}" style="flex-shrink:0">${o.status}</span>
      </div>`;
    }).join('');
  }

  // ── 예측 경보 ────────────────────────────────────────────────
  const predDiv = el('ana-predict-list');
  if (!active.length) {
    predDiv.innerHTML = '<div class="alert alert-info" style="margin:0">ℹ️ 운송중·배차완료 오더가 없습니다</div>';
  } else if (!predAlarms.length) {
    predDiv.innerHTML = '<div class="alert alert-success" style="margin:0">✅ 현재 지연 예측 경보 없음 — 모든 구간 정상</div>';
  } else {
    predDiv.innerHTML = predAlarms.map(a => `
      <div style="background:${a.sevColor}15;border:1px solid ${a.sevColor}60;border-radius:6px;padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <div>
            <span style="font-size:11px;font-weight:800;color:#fff;background:${a.sevColor};padding:2px 8px;border-radius:8px">${a.severity}</span>
            <span style="font-size:11px;font-weight:700;color:var(--dk);margin-left:8px">${a.orderNo}</span>
            <span style="font-size:10px;color:var(--gray)"> · ${a.customer}</span>
          </div>
          <div style="font-size:16px;font-weight:800;color:${a.sevColor}">${a.ratio}%</div>
        </div>
        <div style="font-size:11px;color:var(--gray);margin-top:5px">📍 ${a.fromHub} → ${a.toHub}</div>
        <div style="font-size:10px;color:var(--gray);margin-top:2px">⏱ 경과 ${a.elapsed}분 / 표준 ${a.std}분 (표준대비 ${a.ratio}%)</div>
      </div>`).join('');
  }

  // ── TAT 분석 테이블 ──────────────────────────────────────────
  const tatDiv = el('ana-tat-table');
  if (!tatList.length) {
    // 이벤트 없으면 표준시간 기반 이론 테이블 표시
    const stdRows = [];
    orders.forEach(o => {
      const route = o.route || {};
      const wps   = route.waypoints || [];
      const allH  = [route.origin, ...wps.map(w=>typeof w==='string'?w:w.name), route.destination].filter(Boolean);
      const stds  = [parseFloat(route.originStdTime||0), ...wps.map(w=>parseFloat(typeof w==='object'?w.stdTime||0:0))];
      allH.forEach((hub,i) => {
        if (!allH[i+1] || !stds[i]) return;
        stdRows.push({ orderNo:o.no, customer:o.customer, fromHub:hub, toHub:allH[i+1], std:stds[i], actual:'-', ratio:null, status:'na' });
      });
    });
    if (!stdRows.length) {
      tatDiv.innerHTML = '<div class="empty">구간 이벤트 없음 — 거점 In/Out 탭에서 이벤트를 등록하면 TAT가 자동 계산됩니다</div>';
    } else {
      tatDiv.innerHTML = `
        <div class="alert alert-info" style="margin-bottom:10px">ℹ️ 아직 완료된 구간이 없습니다. 아래는 표준시간 기준 예상 TAT입니다.</div>
        <div class="tbl-wrap"><table>
        <thead><tr><th>오더번호</th><th>고객사</th><th>구간</th><th>표준(분)</th><th>실제(분)</th><th>달성률</th></tr></thead>
        <tbody>${stdRows.map(t=>`<tr>
          <td><b>${t.orderNo}</b></td><td>${t.customer}</td>
          <td style="font-size:11px">${t.fromHub} → ${t.toHub}</td>
          <td style="text-align:center">${t.std||'-'}</td>
          <td style="text-align:center;color:var(--gray)">미완료</td>
          <td style="text-align:center;color:var(--gray)">-</td>
        </tr>`).join('')}</tbody></table></div>`;
    }
  } else {
    const cMap2 = { ok:'#27AE60', warn:'#E6A817', over:'#C0392B', na:'var(--gray)' };
    const icn   = { ok:'✅', warn:'⚠️', over:'🚨', na:'-' };
    tatDiv.innerHTML = `<div class="tbl-wrap"><table>
      <thead><tr><th>오더번호</th><th>고객사</th><th>구간</th><th>표준(분)</th><th>실제(분)</th><th>달성률</th><th>평가</th></tr></thead>
      <tbody>
      ${tatList.map(t=>`<tr>
        <td><b>${t.orderNo}</b></td><td>${t.customer}</td>
        <td style="font-size:11px">${t.fromHub} → ${t.toHub}</td>
        <td style="text-align:center">${t.std||'-'}</td>
        <td style="text-align:center;font-weight:700">${t.actual}</td>
        <td style="text-align:center">
          ${t.ratio!==null?`<span style="color:${cMap2[t.status]};font-weight:700">${t.ratio}%</span>`:'-'}
        </td>
        <td style="text-align:center">${icn[t.status]}</td>
      </tr>`).join('')}
      </tbody></table></div>
    <div style="margin-top:8px;font-size:10px;color:var(--gray);display:flex;gap:14px">
      <span>✅ 정상 (100%↓)</span><span>⚠️ 주의 (100~120%)</span><span>🚨 지연 (120%↑)</span>
    </div>`;
  }

  // ── 거점별 성과 ──────────────────────────────────────────────
  const hubPerf = el('ana-hub-perf');
  if (!hubs.length) {
    hubPerf.innerHTML = '<div class="empty">거점 없음 — 기준정보에서 거점을 등록하세요</div>';
  } else {
    const TC = {'출발(자사창고)':['#D6E4F0','#365C89'],'경유지':['#FFF3CD','#7B4F00'],'도착(고객사)':['#E8F5E9','#1B5E20']};
    const ordCnt = {};
    orders.forEach(o => {
      const route = o.route || {};
      const allH  = [route.origin, ...(route.waypoints||[]).map(w=>typeof w==='string'?w:w.name), route.destination].filter(Boolean);
      allH.forEach(h => { ordCnt[h] = (ordCnt[h]||0) + 1; });
    });
    hubPerf.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px">
    ${hubs.map(h => {
      const inC  = events.filter(e=>e.hub===h.name&&e.event==='IN').length;
      const outC = events.filter(e=>e.hub===h.name&&e.event==='OUT').length;
      const podC = events.filter(e=>e.hub===h.name&&e.event==='도착완료').length;
      const relOrds = ordCnt[h.name] || 0;
      const [bg,tc] = TC[h.type]||['#eee','#333'];
      const intensity = Math.min((inC+outC+podC)*20, 100);
      return `<div style="border:1px solid ${tc}60;border-radius:8px;padding:10px 12px;min-width:150px;background:${bg}">
        <div style="font-size:11px;font-weight:700;color:${tc};margin-bottom:4px">${h.name}</div>
        <div style="font-size:9px;color:var(--gray);margin-bottom:6px">${h.type}</div>
        <div style="display:flex;gap:6px;font-size:11px;flex-wrap:wrap">
          <span style="color:#0D47A1">IN: <b>${inC}</b></span>
          <span style="color:#E65100">OUT: <b>${outC}</b></span>
          ${podC?`<span style="color:#1B5E20">✅:<b>${podC}</b></span>`:''}
        </div>
        ${relOrds>0?`<div style="font-size:9px;color:var(--gray);margin-top:3px">관련 오더 ${relOrds}건</div>`:''}
        <div style="height:4px;background:#ddd;border-radius:2px;margin-top:6px">
          <div style="width:${intensity}%;height:4px;background:${tc};border-radius:2px;min-width:${intensity>0?'4px':'0'}"></div>
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }

  // ── 디지털 POD ───────────────────────────────────────────────
  const podDiv = el('ana-pod-list');
  const pods   = getPODRecords();
  if (!pods.length) {
    podDiv.innerHTML = `<div class="alert alert-info" style="margin:0">
      ℹ️ 아직 도착완료 기록이 없습니다. 거점 In/Out 탭에서 이벤트 유형을 <b>도착완료</b>로 등록하면 여기에 표시됩니다.
    </div>`;
  } else {
    podDiv.innerHTML = `<div class="tbl-wrap"><table>
      <thead><tr><th>완료일시</th><th>오더번호</th><th>고객사</th><th>거점</th><th>제품</th><th>확인방식</th><th>처리자</th><th>비고</th></tr></thead>
      <tbody>${pods.map(p=>`<tr>
        <td style="font-size:11px">${p.time}</td>
        <td><b>${p.orderNo}</b></td><td>${p.customer}</td><td>${p.hub}</td>
        <td style="font-size:11px">${p.product}</td>
        <td><span style="font-size:10px;background:#E8F5E9;color:#1B5E20;padding:2px 6px;border-radius:8px;font-weight:700">${p.confirm}</span></td>
        <td>${p.person||'-'}</td><td style="font-size:11px">${p.note||'-'}</td>
      </tr>`).join('')}
      </tbody></table></div>`;
  }
}



// ── saveTracking 패치: POD 시 확인방식 자동 기록 ────────────────
const _origSaveTracking = saveTracking;
saveTracking = function() {
  // 도착완료 이벤트 시 확인방식 자동 비고에 추가
  const orderNo   = v('tr-order');
  const eventType = v('tr-event');
  if (eventType === '도착완료') {
    const order  = S.orders().find(x => x.no === orderNo);
    const cust   = S.customers().find(c => c.name === order?.customer);
    const confirm = cust?.confirm || '서명';
    const noteEl = el('tr-note');
    if (noteEl && !noteEl.value) noteEl.value = `[${confirm}] 인수확인`;
  }
  _origSaveTracking();
};

// ══════════════════════════════════════════════════════════════════


// Analytics 패치: saveTracking 없으므로 POD 기록은 analytics에서 직접 읽음


// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  renderAnalytics();
};
