// ══ LMTS ceodash.js ══

// ─── CEO ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function renderCEO() {
  const orders=S.orders(), events=S.events(), hubs=S.hubs();
  const total=orders.filter(o=>!['도착완료'].includes(o.status)).length;
  const done=orders.filter(o=>o.status==='도착완료').length;
  const delay=orders.filter(o=>o.status==='지연').length;
  const ontime=done>0?Math.round((done/(done+delay))*100):100;
  const avgWp=orders.length?(orders.reduce((s,o)=>s+(o.route?.waypoints?.length||0),0)/orders.length).toFixed(1):'-';
  el('ceo-total').textContent=total; el('ceo-done2').textContent=done; el('ceo-delay2').textContent=delay;
  el('ceo-ontime').textContent=ontime+'%'; el('ceo-ontime-bar').style.width=ontime+'%';
  el('ceo-avgwp').textContent=avgWp+'개소';
  el('ceo-hub-list').innerHTML=hubs.length?hubs.map(h=>{
    const last=events.filter(e=>e.hub===h.name).slice(-1)[0];
    return `<div class="ceo-row"><div class="ceo-row-label">${h.name}</div>
    <div class="ceo-row-val cv-white" style="font-size:10px">${last?last.event+' '+last.time.slice(11,16):'없음'}</div></div>`;
  }).join(''):'<div style="color:rgba(255,255,255,.5);font-size:11px">없음</div>';
  el('ceo-order-list').innerHTML=orders.filter(o=>!['도착완료'].includes(o.status)).slice(0,5).map(o=>{
    const last=events.filter(e=>e.orderNo===o.no).slice(-1)[0];
    const dest=o.route?.destination||'-';
    return `<div class="ceo-order-item">
      <div class="ceo-order-no">${o.no}</div>
      <div class="ceo-order-main">${o.customer} · ${o.product}</div>
      <div class="ceo-order-step">📍 현재: ${last?last.hub:'대기중'} | 🏢 도착지: ${dest}</div>
      <div class="ceo-order-step">${o.status}${last?' | '+last.event+' '+last.time.slice(11,16):''}</div>
    </div>`;
  }).join('')||'<div style="color:rgba(255,255,255,.5);font-size:11px">없음</div>';
  const offRA=S.alarms().filter(a=>a.type==='OFF_ROUTE');
  const delayAl=orders.filter(o=>o.status==='지연');
  let ceoAl='';
  if (offRA.length) ceoAl+=offRA.slice(-3).reverse().map(a=>`<div class="ceo-alarm"><div class="ceo-alarm-title">🚨 비지정거점: ${a.orderNo}</div><div class="ceo-alarm-desc">${a.hub} — 지정경로 외 이벤트 (${a.time.slice(11,16)})</div></div>`).join('');
  if (delayAl.length) ceoAl+=delayAl.map(o=>`<div class="ceo-alarm"><div class="ceo-alarm-title">⚠ 지연: ${o.no}</div><div class="ceo-alarm-desc">${o.customer}</div></div>`).join('');
  el('ceo-alarm-list').innerHTML=ceoAl||'<div style="color:rgba(255,255,255,.5);font-size:11px">✅ 없음</div>';
  el('ceo-kpi-detail').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="text-align:center;padding:14px;background:var(--pale);border-radius:8px"><div style="font-size:28px;font-weight:800;color:var(--dk)">${ontime}%</div><div style="font-size:11px;color:var(--gray)">정시납품율</div></div>
      <div style="text-align:center;padding:14px;background:#E8F5E9;border-radius:8px"><div style="font-size:28px;font-weight:800;color:var(--green)">${done}</div><div style="font-size:11px;color:var(--gray)">완료 오더</div></div>
      <div style="text-align:center;padding:14px;background:#FFF3CD;border-radius:8px"><div style="font-size:28px;font-weight:800;color:var(--orange)">${total}</div><div style="font-size:11px;color:var(--gray)">진행중</div></div>
      <div style="text-align:center;padding:14px;background:#FFEBEE;border-radius:8px"><div style="font-size:28px;font-weight:800;color:var(--red)">${delay}</div><div style="font-size:11px;color:var(--gray)">지연 건</div></div>
    </div>`;
  const pts=[];
  if (delay>0) pts.push(`<div class="alert alert-danger">⚠ 지연 ${delay}건 — 즉각 조치 필요</div>`);
  if (ontime>=95) pts.push(`<div class="alert alert-success">✅ 정시납품율 ${ontime}% — 우수 수준</div>`);
  if (total>0) pts.push(`<div class="alert alert-info">📦 운송중 오더 ${total}건 정상 진행 중</div>`);
  if (total===0&&done===0) pts.push(`<div class="alert alert-info">ℹ️ 진행중인 출하오더 없음</div>`);
  el('ceo-report-point').innerHTML=pts.join('')||'<div class="empty">특이사항 없음</div>';
}


// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  renderCEO();
};
