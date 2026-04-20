// ══ LMTS dashboard.js ══

// ─── DASHBOARD ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function renderDashboard() {
  const orders=S.orders();
  const total=orders.filter(o=>!['도착완료'].includes(o.status)).length;
  const done=orders.filter(o=>o.status==='도착완료').length;
  const moving=orders.filter(o=>o.status==='운송중').length;
  const delay=orders.filter(o=>o.status==='지연').length;
  el('kpi-total').textContent=total; el('kpi-done').textContent=done; el('kpi-moving').textContent=moving;
  const offCount=S.alarms().filter(a=>a.type==='OFF_ROUTE').length;
  el('kpi-delay').textContent=delay+offCount;
  el('kpi-delay-label').textContent=offCount>0?`지연 ${delay}건 + 비지정 ${offCount}건`:'지연 발생 건';

  const stMap={'대기':'s-ready','패킹중':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done','지연':'s-delay'};
  el('dash-order-body').innerHTML = orders.slice(-10).reverse().map(o=>
    `<tr><td><b>${o.no}</b></td><td>${o.customer}</td><td>${o.product}</td>
    <td style="font-size:11px">${getRouteShort(o)}</td>
    <td><span class="status ${stMap[o.status]||''}">${o.status}</span></td></tr>`
  ).join('') || '<tr><td colspan="5" class="empty">출하오더 없음</td></tr>';

  const hubs=S.hubs(), events=S.events();
  el('dash-hub-body').innerHTML = hubs.length ? hubs.map(h=>{
    const last=events.filter(e=>e.hub===h.name).slice(-1)[0];
    const [bg,tc]=TYPE_COL[h.type]||['#eee','#333'];
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:10px;height:10px;border-radius:50%;background:${tc};flex-shrink:0;display:inline-block"></span>
        <div><b style="font-size:12px">${h.name}</b><br>${typeTag(h.type)}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:var(--gray)">${last?last.event+' '+last.time.slice(11,16):'-'}</div>
    </div>`;
  }).join('') : '<div class="empty">거점 정보 없음</div>';

  const delayOrders=orders.filter(o=>o.status==='지연');
  const offRouteAlarms=S.alarms().filter(a=>a.type==='OFF_ROUTE');
  el('alarm-count-badge').textContent=(delayOrders.length+offRouteAlarms.length)+'건';
  let alarmHtml='';
  if (offRouteAlarms.length) alarmHtml+=offRouteAlarms.slice().reverse().map(a=>
    `<div class="alert alert-danger" style="border-left-color:#8B0000;background:#FFF0F0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><b>🚨 비지정 거점 이벤트</b> — ${a.time}<br>오더: <b>${a.orderNo}</b> (${a.customer}) | 거점: <b style="color:#C0392B">${a.hub}</b> | 유형: ${a.event}</div>
        <button class="btn btn-xs" style="background:#C0392B;color:#fff;flex-shrink:0;margin-left:8px" onclick="dismissAlarm('${a.id}')">확인</button>
      </div></div>`).join('');
  if (delayOrders.length) alarmHtml+=delayOrders.map(o=>`<div class="alert alert-danger">⚠ [${o.no}] ${o.customer} — 지연 발생</div>`).join('');
  el('alarm-list').innerHTML=alarmHtml||'<div class="empty">알람 없음 ✅</div>';
}

function dismissAlarm(id) {
  const arr=S.alarms().filter(a=>a.id!==id);
  S.set('alarms', arr); renderDashboard();
}

// ══════════════════════════════════════════════════════════════════


// 대시보드 전용: 알람 확인
function dismissAlarm(id) {
  const arr = S.alarms().filter(a => a.id !== id);
  S.set('alarms', arr); renderDashboard();
}

// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  renderDashboard();
};
