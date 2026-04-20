// ══ LMTS tracking.js ══

// ─── TRACKING ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function fillTrackingSelects() {
  const active=S.orders().filter(o=>['운송중','패킹중','배차완료'].includes(o.status));
  fillSel('tr-order', active.map(o=>({v:o.no, l:`${o.no} · ${o.customer}`})));
  fillSel('tr-track-order', S.orders().map(o=>({v:o.no, l:`${o.no} · ${o.customer} [${o.status}]`})));
  fillSel('tr-hub', S.hubs().map(h=>({v:h.name, l:`${h.name} (${h.type})`})));
  el('tr-time').value = localDT();
  renderTrackingLog();
}
function loadOrderHubs() {
  const no=v('tr-order'), o=S.orders().find(x=>x.no===no);
  if (!o||!o.route) { fillSel('tr-hub', S.hubs().map(h=>({v:h.name, l:`${h.name} (${h.type})`}))); el('tr-hub-hint').textContent=''; return; }
  const {origin, waypoints, destination}=o.route;
  const names=[origin,...(waypoints||[]).map(w=>typeof w==='string'?w:w.name),destination].filter(Boolean);
  const hs=S.hubs();
  fillSel('tr-hub', names.map(n=>{const h=hs.find(x=>x.name===n); return {v:n, l:`${n} (${h?.type||''})`};}));
  el('tr-hub-hint').textContent=`— 이 오더 경로 ${names.length}개 거점만 표시`;
}
function saveTracking() {
  const orderNo=v('tr-order'), hub=v('tr-hub'), eventType=v('tr-event');
  if (!orderNo||!hub) return alert('오더와 거점을 선택하세요');
  const o=S.orders().find(x=>x.no===orderNo);
  const rawTime=document.getElementById('tr-time').value;
  const t=normTime(rawTime);
  const events=S.events();
  events.push({time:t, orderNo, customer:o?.customer||'', hub, event:eventType, person:v('tr-person'), note:v('tr-note')});
  S.set('events', events);
  if (eventType==='도착완료') updateOrderStatus(orderNo,'도착완료');

  // 비지정 거점 알람
  if (o&&o.route) {
    const {origin, waypoints, destination}=o.route;
    const routeHubs=new Set([origin,...(waypoints||[]).map(w=>typeof w==='string'?w:w.name),destination].filter(Boolean));
    if (!routeHubs.has(hub)) {
      const alarms=S.alarms();
      const alarmId=`ALM-${Date.now()}`;
      alarms.push({id:alarmId, time:t, type:'OFF_ROUTE', orderNo, customer:o.customer||'', hub, event:eventType,
        message:`[비지정 거점] 오더 ${orderNo}(${o.customer})의 지정경로 외 거점 "${hub}"에서 ${eventType} 이벤트 발생`, read:false});
      S.set('alarms', alarms);
      alert(`🚨 경고: 비지정 거점 이벤트 감지!\n\n오더: ${orderNo} (${o.customer})\n발생 거점: "${hub}"\n이 거점은 해당 오더의 지정 경로에 없습니다.`);
    } else { alert(`✅ [${orderNo}] ${hub} ${eventType}`); }
  } else { alert(`✅ [${orderNo}] ${hub} ${eventType}`); }

  fillTrackingSelects(); showOrderTrack();
}
function showOrderTrack() {
  const no=v('tr-track-order'), o=S.orders().find(x=>x.no===no);
  if (!no) { el('order-track-display').innerHTML='<div class="empty">오더를 선택하세요</div>'; return; }
  const evts=S.events().filter(e=>e.orderNo===no).sort((a,b)=>a.time.localeCompare(b.time));
  const ps=S.products();
  let html=buildTrackerCard(o, ps);
  html+='<ul class="timeline" style="margin-top:12px">';
  evts.forEach(e=>{ html+=`<li class="tl-item ${e.event==='도착완료'?'done':''}">
    <div class="tl-time">${e.time}</div><div class="tl-text">[${e.event}] ${e.hub}</div>
    <div class="tl-sub">처리자: ${e.person||'-'}${e.note?' | '+e.note:''}</div></li>`; });
  if (!evts.length) html+='<li class="tl-item"><div class="tl-text" style="color:var(--gray)">이벤트 없음</div></li>';
  html+='</ul>';
  el('order-track-display').innerHTML=html;
}
function renderTrackingLog() {
  el('tracking-log-body').innerHTML = S.events().slice().reverse().map(e=>{
    const cls=e.event==='IN'?'s-in':e.event==='OUT'?'s-out':'s-done';
    return `<tr><td>${e.time}</td><td><b>${e.orderNo}</b></td><td>${e.customer}</td><td>${e.hub}</td>
    <td><span class="status ${cls}">${e.event}</span></td><td>${e.person||'-'}</td><td>${e.note||'-'}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">이벤트 없음</td></tr>';
}

// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillTrackingSelects(); renderTrackingLog();
};
