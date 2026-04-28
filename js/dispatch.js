// ══ LMTS dispatch.js ══

// 운송수단 아이콘·레이블 (dispatch.js 자체 정의)
const TRANSPORT_ICON  = { truck:'🚛', air:'✈️', sea:'🚢' };
const TRANSPORT_LABEL = { truck:'차량', air:'항공', sea:'선박' };

// ─── DISPATCH (구간별 배차) ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

// 운송수단 아이콘 (기존 상수 재사용: TRANSPORT_ICON, TRANSPORT_LABEL)


// 해당 구간 통과 완료 여부 (OUT@from + IN/도착완료@to 둘다 있으면 통과)
function isLegPassed(orderNo, leg) {
  const evts = S.events().filter(e => e.orderNo === orderNo);
  const outAtFrom = evts.some(e => e.hub === leg.fromHub && e.event === 'OUT');
  const inAtTo    = evts.some(e => e.hub === leg.toHub && (e.event === 'IN' || e.event === '도착완료'));
  return outAtFrom && inAtTo;
}
// 현재 운송 중 구간 (OUT됐지만 IN 미등록)
function isLegInTransit(orderNo, leg) {
  const evts = S.events().filter(e => e.orderNo === orderNo);
  const outAtFrom = evts.some(e => e.hub === leg.fromHub && e.event === 'OUT');
  const inAtTo    = evts.some(e => e.hub === leg.toHub && (e.event === 'IN' || e.event === '도착완료'));
  return outAtFrom && !inAtTo;
}

// 오더의 구간(leg) 목록 반환
// leg[i] = {fromHub, toHub, legIdx}
function getOrderLegs(o) {
  if (!o?.route) return [];
  const {origin, waypoints, destination} = o.route;
  const hubs = [origin, ...(waypoints||[]).map(w => typeof w==='string'?w:w.name), destination].filter(Boolean);
  return hubs.slice(0,-1).map((h,i) => ({fromHub:h, toHub:hubs[i+1], legIdx:i}));
}

// 특정 오더·구간의 배차 기록 조회
function getLegDispatch(orderNo, legIdx) {
  return S.dispatches().find(d => d.orderNo===orderNo && d.legIdx===legIdx) || null;
}

// 배차 페이지 진입 시 셀렉트 채우기
function fillDispatchSelects() {
  // 패킹중·운송중·배차완료 + 대기도 포함 (초기 배차 가능)
  const orders = S.orders().filter(o => !['도착완료'].includes(o.status));
  fillSel('dp-order', orders.map(o => ({v:o.no, l:`${o.no} · ${o.customer} [${o.status}]`})));
  renderDispatch();
  loadDispatchOrder(); // ← 선택된 오더의 구간 카드 항상 최신 경로로 갱신
}

// 오더 선택 시 구간 카드 렌더
function loadDispatchOrder() {
  const no = v('dp-order');
  const legsDiv = el('dp-order-legs');
  if (!no) { legsDiv.innerHTML = ''; return; }
  const o = S.orders().find(x => x.no === no);
  if (!o) { legsDiv.innerHTML = ''; return; }

  const legs = getOrderLegs(o);
  if (!legs.length) {
    legsDiv.innerHTML = '<div class="alert alert-warn">경로 정보가 없습니다. 출하오더에서 경로를 먼저 설정하세요.</div>';
    return;
  }

  const stMap = {'대기':'s-ready','패킹중':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done'};

  let html = `<div style="font-size:11px;color:var(--gray);margin-bottom:10px">
    <b style="color:var(--dk)">${o.no}</b> | ${o.customer} | ${o.product} | ${o.boxes}박스 |
    상태: <span class="status ${stMap[o.status]||'s-ready'}">${o.status}</span>
  </div>`;

  html += '<div style="display:flex;flex-direction:column;gap:8px">';

  legs.forEach((leg, i) => {
    const d = getLegDispatch(no, i);
    const isFirst = i === 0;
    const tIcon  = d ? (TRANSPORT_ICON[d.transportType]||'🚛') : '';
    const tLabel = d ? (TRANSPORT_LABEL[d.transportType]||'차량') : '';

    // 운송수단 요약
    let transportSummary = '';
    if (d) {
      if (d.transportType === 'truck') {
        transportSummary = `${d.vehicleNo||'-'} · ${d.driver||'-'}`;
      } else if (d.transportType === 'air') {
        transportSummary = `${d.airline||''} ${d.flightNo||''}`;
      } else if (d.transportType === 'sea') {
        transportSummary = `${d.shippingCo||''} ${d.vessel||''}`;
      }
    }

    const statusBadge = d
      ? `<span class="status s-dispatch" style="background:#E8F5E9;color:#2E7D32">${tIcon} ${tLabel} 배차완료</span>`
      : `<span class="status s-ready">미배차</span>`;

    html += `
    <div style="background:#fff;border:1px solid ${d?'var(--green)':'var(--border)'};border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:${isFirst?'var(--dk)':'var(--yellow)'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">
        ${i+1}
      </div>
      <div style="flex:1;min-width:180px">
        <div style="font-size:12px;font-weight:700;color:var(--dk)">
          구간 ${i+1}: ${leg.fromHub} → ${leg.toHub}
        </div>
        ${d ? `<div style="font-size:11px;color:var(--gray);margin-top:3px">
          ${tIcon} ${transportSummary}
          ${d.departPlan ? ` | 출발예정: ${d.departPlan.replace('T',' ')}` : ''}
          ${d.eta ? ` | ETA: ${d.eta.replace('T',' ')}` : ''}
        </div>` : '<div style="font-size:11px;color:#999;margin-top:2px">배차 미등록</div>'}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${statusBadge}
        <button class="btn btn-sm" style="background:${d?'#EBF5FF':'var(--dk)'};color:${d?'var(--accent)':'#fff'};border:1px solid ${d?'var(--border)':'var(--dk)'};"
          onclick="openLegDispatch('${no}',${i})">
          ${d ? '✏️ 수정' : '+ 배차등록'}
        </button>
      </div>
    </div>`;
  });

  html += '</div>';
  legsDiv.innerHTML = html;
}

// ─── 구간 배차 모달 ───────────────────────────────────────────
let ldOrderNo = '', ldLegIdx = -1, ldTransport = 'truck';

function openLegDispatch(orderNo, legIdx) {
  const o = S.orders().find(x => x.no === orderNo);
  if (!o) return;
  const legs = getOrderLegs(o);
  const leg  = legs[legIdx];
  if (!leg) return;

  // 통과 완료 구간 — 모달 열기 차단
  if (isLegPassed(orderNo, leg)) {
    alert('🔒 구간 ' + (legIdx+1) + ' (' + leg.fromHub + ' → ' + leg.toHub + ')\n이미 통과 완료된 구간은 배차 변경이 불가합니다.');
    return;
  }

  ldOrderNo  = orderNo;
  ldLegIdx   = legIdx;
  ldTransport = 'truck';

  // 모달 헤더
  el('ld-order-no').textContent  = orderNo;
  el('ld-customer').textContent  = o.customer;
  el('ld-from-chip').textContent = '🏭 ' + leg.fromHub;
  el('ld-to-chip').textContent   = '🏢 ' + leg.toHub;

  // 차량 목록
  fillSel('ld-vehicle', S.vehicles().map(vv => ({v:vv.no, l:`${vv.no} · ${vv.driver} (${vv.type||''})`})));

  // 기존 배차 데이터 로드
  const d = getLegDispatch(orderNo, legIdx);
  if (d) {
    ldTransport = d.transportType || 'truck';
    el('ld-vehicle').value  = d.vehicleNo || '';
    el('ld-driver').value   = d.driver || '';
    el('ld-dphone').value   = d.dphone || '';
    el('ld-airline').value  = d.airline || '';
    el('ld-flightno').value = d.flightNo || '';
    el('ld-dep-airport').value = d.depAirport || '';
    el('ld-arr-airport').value = d.arrAirport || '';
    el('ld-shippingco').value  = d.shippingCo || '';
    el('ld-vessel').value      = d.vessel || '';
    el('ld-dep-port').value    = d.depPort || '';
    el('ld-arr-port').value    = d.arrPort || '';
    el('ld-depart-plan').value = d.departPlan || '';
    el('ld-eta').value         = d.eta || '';
    el('ld-note').value        = d.note || '';
  } else {
    // 초기화
    ['ld-vehicle','ld-driver','ld-dphone','ld-airline','ld-flightno',
     'ld-dep-airport','ld-arr-airport','ld-shippingco','ld-vessel',
     'ld-dep-port','ld-arr-port','ld-depart-plan','ld-eta','ld-note'].forEach(id => {
      const e = el(id); if (e) e.value = '';
    });
    // 차량 자동 선택: 이전 구간 차량 유지
    if (ldLegIdx > 0) {
      const prevD = getLegDispatch(orderNo, ldLegIdx - 1);
      if (prevD?.vehicleNo) el('ld-vehicle').value = prevD.vehicleNo;
    }
  }

  ldSelectTransport(ldTransport);
  el('leg-dispatch-modal').classList.remove('hidden');
}

function ldSelectTransport(type) {
  ldTransport = type;
  ['truck','air','sea'].forEach(t => {
    const tab  = el(`ld-tab-${t}`);
    const form = el(`ld-form-${t}`);
    if (t === type) {
      tab.className  = 'btn btn-primary btn-sm';
      form.style.display = '';
    } else {
      tab.className  = 'btn btn-ghost btn-sm';
      form.style.display = 'none';
    }
  });

  // 차량 선택 시 기사·연락처 자동 채우기
  if (type === 'truck') {
    const vno = el('ld-vehicle').value;
    if (vno) ldAutoFillDriver();
  }
}

function ldAutoFillDriver() {
  const vno = el('ld-vehicle').value;
  const vv  = S.vehicles().find(x => x.no === vno);
  if (vv) {
    el('ld-driver').value = vv.driver || '';
    el('ld-dphone').value = vv.dphone || '';
  }
}

function closeLegDispatchModal() {
  el('leg-dispatch-modal').classList.add('hidden');
  ldOrderNo = ''; ldLegIdx = -1;
}

function saveLegDispatch() {
  if (!ldOrderNo || ldLegIdx < 0) return;
  const o    = S.orders().find(x => x.no === ldOrderNo);
  const legs = getOrderLegs(o);
  const leg  = legs[ldLegIdx];

  // 입력값 수집
  const base = {
    orderNo:       ldOrderNo,
    legIdx:        ldLegIdx,
    fromHub:       leg.fromHub,
    toHub:         leg.toHub,
    transportType: ldTransport,
    departPlan:    el('ld-depart-plan').value,
    eta:           el('ld-eta').value,
    savedAt:       now(),
    note:          el('ld-note').value,
    status:        '배차완료'
  };

  if (ldTransport === 'truck') {
    const vno = el('ld-vehicle').value;
    if (!vno) return alert('차량을 선택하세요');
    const vv = S.vehicles().find(x => x.no === vno);
    Object.assign(base, {
      vehicleNo: vno,
      driver:    el('ld-driver').value || vv?.driver || '-',
      dphone:    el('ld-dphone').value || vv?.dphone || '-'
    });
  } else if (ldTransport === 'air') {
    if (!el('ld-airline').value && !el('ld-flightno').value) return alert('항공사 또는 편명을 입력하세요');
    Object.assign(base, {
      airline:    el('ld-airline').value,
      flightNo:   el('ld-flightno').value,
      depAirport: el('ld-dep-airport').value,
      arrAirport: el('ld-arr-airport').value
    });
  } else if (ldTransport === 'sea') {
    if (!el('ld-vessel').value) return alert('선박명을 입력하세요');
    Object.assign(base, {
      shippingCo: el('ld-shippingco').value,
      vessel:     el('ld-vessel').value,
      depPort:    el('ld-dep-port').value,
      arrPort:    el('ld-arr-port').value
    });
  }

  // 저장 (기존 기록 있으면 교체, 없으면 추가)
  const arr = S.dispatches();
  const existIdx = arr.findIndex(d => d.orderNo === ldOrderNo && d.legIdx === ldLegIdx);
  if (existIdx >= 0) arr[existIdx] = base;
  else arr.push(base);
  S.set('dispatches', arr);

  // 최초 배차(구간 0)이면 오더 상태 → 운송중, OUT 이벤트 추가
  if (ldLegIdx === 0 && !['운송중','배차완료'].includes(o?.status)) {
    updateOrderStatus(ldOrderNo, '운송중');
    const events = S.events();
    events.push({
      time: now(), orderNo: ldOrderNo, customer: o?.customer||'',
      hub: leg.fromHub, event: 'OUT', person: '배차담당',
      note: `${TRANSPORT_LABEL[ldTransport]} 출발`
    });
    S.set('events', events);
  }

  closeLegDispatchModal();
  renderDispatch();
  loadDispatchOrder(); // 구간 카드 갱신
  alert(`✅ 구간 ${ldLegIdx+1} 배차 저장 완료\n${leg.fromHub} → ${leg.toHub}`);
}

function renderDispatch() {
  const STAT_CLS = {배차완료:'s-dispatch', 운송중:'s-moving', 도착완료:'s-done'};
  el('dispatch-table-body').innerHTML = S.dispatches().map(d => {
    const o = S.orders().find(x => x.no === d.orderNo);
    const tIcon  = TRANSPORT_ICON[d.transportType] || '🚛';
    const tLabel = TRANSPORT_LABEL[d.transportType] || '차량';

    let detail = '-';
    if (d.transportType === 'truck') detail = `${d.vehicleNo||'-'}`;
    else if (d.transportType === 'air') detail = `${d.airline||''} ${d.flightNo||''}`.trim() || '-';
    else if (d.transportType === 'sea') detail = `${d.shippingCo||''} ${d.vessel||''}`.trim() || '-';

    let person = '-';
    if (d.transportType === 'truck') person = d.driver || '-';
    else if (d.transportType === 'air') person = `${d.depAirport||''}→${d.arrAirport||''}`.replace('→','→') || '-';
    else if (d.transportType === 'sea') person = `${d.depPort||''}→${d.arrPort||''}` || '-';

    return `<tr>
      <td><b>${d.orderNo}</b></td>
      <td>${o?.customer||'-'}</td>
      <td style="font-size:11px;white-space:nowrap">${d.fromHub||'-'} → ${d.toHub||'-'}</td>
      <td>${tIcon} ${tLabel}</td>
      <td style="font-size:11px">${detail}</td>
      <td style="font-size:11px">${person}</td>
      <td style="font-size:11px">${(d.departPlan||'-').replace('T',' ')}</td>
      <td style="font-size:11px">${(d.eta||'-').replace('T',' ')}</td>
      <td><span class="status ${STAT_CLS[d.status]||'s-dispatch'}">${d.status||'배차완료'}</span></td>
      <td>${ (()=>{ const _l=getOrderLegs(o); const _g=_l&&_l[d.legIdx]; const _p=_g&&isLegPassed(d.orderNo,_g); return _p ? '<button class="btn btn-xs" disabled style="background:#F5F5F5;color:#BDBDBD;border:1px solid #E0E0E0;cursor:not-allowed;" title="통과완료">🔒</button>' : '<button class="btn btn-xs" style="background:#EBF5FF;color:var(--accent);border:1px solid var(--border);" onclick=\'openLegDispatch(\'' + d.orderNo + '\',' + d.legIdx + ')\'>✏️</button>'; })() }</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="empty">배차 이력 없음</td></tr>';
}


// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillDispatchSelects(); renderDispatch();
};
