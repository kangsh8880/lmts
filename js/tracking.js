// ══ LMTS tracking.js ══

// ─── TRACKING ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function fillTrackingSelects() {
  const active=S.orders().filter(o=>['운송중','패킹완료','배차완료'].includes(o.status));
  fillSel('tr-order', active.map(o=>({v:o.no, l:`${o.no} · ${o.customer}`})));
  fillSel('tr-track-order', S.orders().map(o=>({v:o.no, l:`${o.no} · ${o.customer} [${o.status}]`})));
  fillSel('tr-hub', S.hubs().map(h=>({v:h.name, l:`${h.name} (${h.type})`})));
  el('tr-time').value = localDT();
  renderTrackingLog();
}
function routeNames(o){
  if(!o||!o.route) return [];
  const {origin, waypoints, destination}=o.route;
  return [origin,...(waypoints||[]).map(w=>typeof w==='string'?w:w.name),destination].filter(Boolean);
}
// 오더의 다음 처리 순서: 출발지 OUT → (거점 IN → OUT)… → 최종지 IN → 도착완료
function nextStep(o){
  const names=routeNames(o), evts=S.events().filter(e=>e.orderNo===o.no), has=(h,e)=>evts.some(x=>x.hub===h&&x.event===e);
  for(let i=0;i<names.length;i++){
    const h=names[i], last=i===names.length-1;
    if(i>0 && !has(h,'IN') && !has(h,'도착완료')) return {hub:h,event:'IN'};
    if(!last && !has(h,'OUT')) return {hub:h,event:'OUT'};
    if(last && !has(h,'도착완료')) return {hub:h,event:'도착완료'};
  }
  return {done:true};
}
function loadOrderHubs() {
  const no=v('tr-order'), o=S.orders().find(x=>x.no===no);
  if (!o||!o.route) { fillSel('tr-hub', S.hubs().map(h=>({v:h.name, l:`${h.name} (${h.type})`}))); el('tr-hub-hint').textContent=''; return; }
  const {origin, waypoints, destination}=o.route;
  const names=[origin,...(waypoints||[]).map(w=>typeof w==='string'?w:w.name),destination].filter(Boolean);
  const hs=S.hubs();
  fillSel('tr-hub', names.map(n=>{const h=hs.find(x=>x.name===n); return {v:n, l:`${n} (${h?.type||''})`};}));
  const nx=nextStep(o);
  if(nx.done){ el('tr-hub-hint').textContent='— 이 오더는 모든 거점 처리가 완료되었습니다'; return; }
  el('tr-hub').value=nx.hub; el('tr-event').value=nx.event;
  el('tr-hub-hint').textContent=`— 다음 처리: ${nx.hub} ${nx.event}`;
}
function saveTracking() {
  const orderNo=v('tr-order'), hub=v('tr-hub'), eventType=v('tr-event');
  if (!orderNo||!hub) return alert('오더와 거점을 선택하세요');
  const o=S.orders().find(x=>x.no===orderNo);
  const rawTime=document.getElementById('tr-time').value;
  const t=normTime(rawTime);
  const events=S.events();
  // ① 동일 오더·거점·이벤트 중복 등록 차단
  const dup=events.find(e=>e.orderNo===orderNo&&e.hub===hub&&e.event===eventType);
  if (dup) return alert(`⛔ 이미 처리된 이벤트입니다.\n\n오더: ${orderNo}\n거점: ${hub}\n이벤트: ${eventType}\n처리: ${dup.time} (${dup.person||'-'})\n\n같은 오더·거점·이벤트는 한 번만 등록할 수 있습니다.`);
  // ② 지정 경로 순서 확인 (경로 외 거점은 아래 비지정 알람으로 처리)
  if (o && o.route && routeNames(o).includes(hub)) {
    const nx=nextStep(o);
    if (nx.done) return alert(`⛔ ${orderNo} 는 모든 거점 처리가 완료된 오더입니다.`);
    if ((nx.hub!==hub||nx.event!==eventType) && !confirm(`처리 순서가 다릅니다.\n\n다음 처리 순서: ${nx.hub} ${nx.event}\n선택한 이벤트: ${hub} ${eventType}\n\n그래도 등록할까요?`)) return;
  }
  const last=events.filter(e=>e.orderNo===orderNo).map(e=>e.time).sort().pop();
  if (last && t < last && !confirm(`입력한 시각(${t})이 이 오더의 마지막 이벤트(${last})보다 과거입니다.\n\n시각이 맞습니까?`)) return;
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

  fillTrackingSelects(); showOrderTrack(); loadOrderHubs();
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
function dupEvents(){   // 같은 오더·거점·이벤트 중 가장 이른 것만 남기고 나머지를 중복으로 본다
  const seen=new Map(), dups=[];
  S.events().slice().sort((a,b)=>a.time.localeCompare(b.time)).forEach(e=>{ const k=[e.orderNo,e.hub,e.event].join('|'); if(seen.has(k)) dups.push(e); else seen.set(k,e); });
  return dups;
}
function cleanDupEvents(){
  const d=dupEvents(); if(!d.length) return;
  if(!confirm(`중복 이벤트 ${d.length}건을 삭제합니다.\n(같은 오더·거점·이벤트 중 가장 이른 1건만 남깁니다)\n\n계속할까요?`)) return;
  const kill=new Set(d); S.set('events', S.events().filter(e=>!kill.has(e)));
  renderTrackingLog(); showOrderTrack(); loadOrderHubs();
}
function renderTrackingLog() {
  const bar=el('tr-dup-bar'), d=dupEvents();
  if(bar) bar.innerHTML = d.length ? `<div class="alert alert-warn" style="margin-bottom:10px;justify-content:space-between;align-items:center"><span>⚠️ 같은 오더·거점·이벤트가 중복 등록된 건이 <b>${d.length}건</b> 있습니다.</span><button class="btn btn-danger btn-sm" onclick="cleanDupEvents()">중복 정리</button></div>` : '';
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
