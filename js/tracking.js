// ══ LMTS tracking.js ══

// ─── TRACKING ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function fillTrackingSelects() {
  const act=['운송중','패킹완료','배차완료'], all=S.orders();
  const rank=o=>act.includes(o.status)?0:1;
  const sorted=all.slice().sort((x,y)=>rank(x)-rank(y)||String(x.no).localeCompare(String(y.no),undefined,{numeric:true}));
  fillSel('tr-order', sorted.map(o=>({v:o.no, l:`${o.no} · ${o.customer} [${o.status}]`})));
  const cur=el('tr-order').value; if(!cur){ const f=sorted.find(o=>act.includes(o.status)); if(f) el('tr-order').value=f.no; }
  fillSel('tr-hub', S.hubs().map(h=>({v:h.name, l:`${h.name} (${h.type})`})));
  el('tr-time').value = localDT();
  renderTrackingLog();
}
// 출하오더 선택 → 거점·다음 처리 자동 세팅 + 오더 추적 현황 자동 연동
function onOrderPick(){ loadOrderHubs(); showOrderTrack(); }
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
  else reconcileOrderStatus();   // 출발 OUT 등록 시 오더 상태를 운송중으로 반영

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

  fillTrackingSelects(); onOrderPick();
}
function showOrderTrack() {
  const no=v('tr-order'), o=S.orders().find(x=>x.no===no);
  if (!no||!o) { el('order-track-display').innerHTML='<div class="empty">출하오더를 선택하세요</div>'; renderRecent(); return; }
  const evts=S.events().filter(e=>e.orderNo===no).sort((a,b)=>a.time.localeCompare(b.time));
  const ps=S.products();
  let html=buildTrackerCard(o, ps);
  html+='<div class="trk-log-t">📋 이벤트 이력</div><table class="trk-log"><thead><tr><th>일시</th><th>이벤트</th><th>거점</th><th>처리자</th><th>비고</th></tr></thead><tbody>';
  evts.forEach(e=>{ html+=`<tr><td>${e.time.replace('T',' ')}</td><td><span class="trk-ev ${e.event}">${e.event}</span></td><td>${e.hub}</td><td>${e.person||'-'}</td><td>${e.note||''}</td></tr>`; });
  if (!evts.length) html+='<tr><td colspan="5" style="text-align:center;color:var(--gray)">이벤트 없음</td></tr>';
  html+='</tbody></table>';
  el('order-track-display').innerHTML=html;
  renderRecent();
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
  renderTrackingLog(); onOrderPick();
}
const evCls=e=>e==='IN'?'s-in':e==='OUT'?'s-out':'s-done';
function renderRecent(){
  const t=el('tr-recent'); if(!t) return;
  const r=S.events().slice().reverse().slice(0,5);
  t.innerHTML=r.map(e=>`<tr><td>${String(e.time).slice(5,16)}</td><td><b>${e.orderNo}</b></td><td>${e.hub}</td><td><span class="trk-ev ${e.event}">${e.event}</span></td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--gray)">등록된 이벤트 없음</td></tr>';
}
function fillLogFilters(){
  const ev=S.events(), keep=id=>el(id).value;
  const o=keep('lg-order'), h=keep('lg-hub');
  const uniq=a=>[...new Set(a)].sort((x,y)=>String(x).localeCompare(String(y),undefined,{numeric:true}));
  el('lg-order').innerHTML='<option value="">전체</option>'+uniq(ev.map(e=>e.orderNo)).map(x=>`<option${x===o?' selected':''}>${x}</option>`).join('');
  el('lg-hub').innerHTML='<option value="">전체</option>'+uniq(ev.map(e=>e.hub)).map(x=>`<option${x===h?' selected':''}>${x}</option>`).join('');
}
function resetLogFilter(){ ['lg-order','lg-hub','lg-ev','lg-from','lg-to'].forEach(i=>el(i).value=''); renderTrackingLog(); }
function renderTrackingLog() {
  const d=dupEvents(), all=S.events();
  // 탭 버튼 배지
  el('lg-n').textContent=`(${all.length})`;
  const bd=el('lg-dup'); bd.textContent=`⚠ 중복 ${d.length}`; bd.classList.toggle('hidden',!d.length);
  renderRecent(); fillLogFilters();
  const bar=el('tr-dup-bar');
  if(bar) bar.innerHTML = d.length ? `<div class="alert alert-warn" style="margin-bottom:10px;justify-content:space-between;align-items:center"><span>⚠️ 같은 오더·거점·이벤트가 중복 등록된 건이 <b>${d.length}건</b> 있습니다.</span><button class="btn btn-danger btn-sm" onclick="cleanDupEvents()">중복 정리</button></div>` : '';
  const fo=v('lg-order'), fh=v('lg-hub'), fe=v('lg-ev'), ff=v('lg-from'), ft=v('lg-to');
  const rows=all.slice().reverse().filter(e=>(!fo||e.orderNo===fo)&&(!fh||e.hub===fh)&&(!fe||e.event===fe)&&(!ff||String(e.time).slice(0,10)>=ff)&&(!ft||String(e.time).slice(0,10)<=ft));
  el('lg-count').textContent=`${rows.length}건 / 전체 ${all.length}건`;
  el('tracking-log-body').innerHTML = rows.map(e=>`<tr class="lg-row" data-o="${e.orderNo}"><td>${e.time}</td><td><b>${e.orderNo}</b></td><td>${e.customer}</td><td>${e.hub}</td>
    <td><span class="status ${evCls(e.event)}">${e.event}</span></td><td>${e.person||'-'}</td><td>${e.note||'-'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">이벤트 없음</td></tr>';
}
function openLog(){ renderTrackingLog(); el('log-modal').classList.remove('hidden'); }
function closeLog(){ el('log-modal').classList.add('hidden'); }
function exportLog(){ exportTableXlsx(el('lg-table'),'이벤트 로그 전체'); }
// 행 클릭 → 해당 오더 선택(등록·추적 화면과 연동), 바깥 클릭·Esc로 닫기
document.addEventListener('click',e=>{
  const tr=e.target.closest&&e.target.closest('#tracking-log-body tr.lg-row'); if(!tr) return;
  const no=tr.dataset.o, sel=el('tr-order'); if(![...sel.options].some(o=>o.value===no)) return;
  sel.value=no; onOrderPick(); closeLog();
});
(function(){ let down=null; const bg=()=>document.getElementById('log-modal');
  document.addEventListener('mousedown',e=>{ down=e.target; });
  document.addEventListener('mouseup',e=>{ const b=bg(); if(b&&!b.classList.contains('hidden')&&e.target===b&&down===b) closeLog(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeLog(); });
})();

// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillTrackingSelects(); onOrderPick();
};
