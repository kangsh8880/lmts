// ══ LMTS packing.js ══
// 한 오더에 여러 제품 · 보관 Box를 Split(일부 수량만 꺼내) 담아 Packing
let pkLines = [];   // 현재 오더에 담는 중인 내역 {boxNo, product, qty}

function boxInfo(code){   // '@제품명' = 기준정보에 Box가 없는 제품을 직접 담는 경우
  if (String(code).startsWith('@')) return {code:'미등록', name:String(code).slice(1)};
  return S.products().find(x=>x.code===code) || {code, name:''};
}
function stockOf(code){
  if (String(code).startsWith('@')) return {total:0, left:9e9, unlimited:true};            // 현재고 = 기초재고 + 창고입고 누계 − 출하Packing 누계
  const c=stockCalc(code);
  return {total:c.base+c.inn, left: c.tracked? c.left : 9e9, unlimited: !c.tracked};
}
function pkTaken(code){ const bn=String(code).startsWith('@')?'미등록':code; return pkLines.filter(l=>l.boxNo===bn).reduce((a,l)=>a+l.qty,0); }
function pkNeed(o){
  return ordItems(o).map(i=>{ const got=pkLines.filter(l=>l.product===i.product).reduce((a,l)=>a+l.qty,0); return {product:i.product, need:+i.qty||0, got, left:Math.max(0,(+i.qty||0)-got)}; });
}
function curOrder(){ return S.orders().find(x=>x.no===v('pk-order')); }

function fillPackingSelects() {
  fillSel('pk-order', S.orders().filter(o=>o.status==='대기').map(o=>({v:o.no, l:`${o.no} · ${o.customer}`})));
  renderPackingDone();
  loadPackingOrder();   // 브라우저가 선택값을 복원했거나 목록이 갱신된 경우에도 제품 목록을 바로 표시
}
function loadPackingOrder() {
  pkLines=[]; if(el('pk-way')) el('pk-way').value='';
  const o=curOrder();
  if (!o) { el('pk-info').style.display='none'; el('pk-empty').style.display=''; return; }
  el('pk-detail').textContent = `${o.no} | ${o.customer} | ${ordText(o)}`;
  el('pk-info').style.display=''; el('pk-empty').style.display='none';
  pkRender();
}
function pkRender(){
  const o=curOrder(); if(!o) return;
  const need=pkNeed(o);
  el('pk-need').innerHTML = need.map(n=>`<tr><td>${n.product}</td><td>${n.need}</td><td>${n.got}</td><td style="font-weight:700;color:${n.left?'#c0392b':'#1a4fa0'}">${n.left?n.left:'✔ 완료'}</td></tr>`).join('');
  // 보관 Box 선택지: 남은 수량이 있는 제품의 Box만
  const ps=S.products().filter(p=>need.some(n=>n.product===p.name && n.left>0));
  const cur=v('pk-box');
  const direct=need.filter(n=>n.left>0 && !S.products().some(p=>p.name===n.product));   // 기준정보에 Box 미등록 제품
  el('pk-box').innerHTML = '<option value="">-- 보관 Box 선택 --</option>' + ps.map(p=>{
    const st=stockOf(p.code), left=st.unlimited?'∞':st.left-pkTaken(p.code);
    return `<option value="${p.code}" ${p.code===cur?'selected':''}>${p.code} · ${p.name} (창고 현재고 ${left}${st.unlimited?'':'/'+st.total})</option>`;
  }).join('') + direct.map(n=>`<option value="@${n.product}" ${('@'+n.product)===cur?'selected':''}>(Box 미등록) ${n.product} — 직접 담기</option>`).join('');
  pkBoxChange(true);
  el('pk-lines').innerHTML = pkLines.length ? pkLines.map((l,i)=>`<tr><td>${i+1}</td><td><b>${l.packNo}</b></td><td>${l.boxNo}</td><td>${l.product}</td><td>${l.qty}</td><td>${l.at}</td><td><a href="#" onclick="pkDel(${i});return false" style="color:#c0392b;text-decoration:none">✕</a></td></tr>`).join('') : '<tr><td colspan="7" class="empty">담은 내역 없음</td></tr>';
  const done=need.every(n=>n.left===0), rest=need.reduce((a,n)=>a+n.left,0);
  el('pk-count').textContent = done ? '모두 담았습니다' : `남은 수량 ${rest}`;
  const b=el('pk-done-btn'); b.disabled=!done; b.style.opacity=done?'1':'.45'; b.style.cursor=done?'pointer':'not-allowed';
}
function pkBoxChange(keep){
  const code=v('pk-box'), o=curOrder(); if(!code||!o){ el('pk-stock').textContent=''; return; }
  const p=boxInfo(code), st=stockOf(code);
  const n=pkNeed(o).find(x=>x.product===p.name), avail=st.unlimited?9e9:st.left-pkTaken(code);
  const max=Math.min(n?n.left:0, avail);
  el('pk-stock').textContent = `필요 ${n?n.left:0} · 창고 현재고 ${st.unlimited?'제한없음':avail} → 최대 ${max}개까지 담을 수 있습니다`;
  if (!keep || !v('pk-qty')) el('pk-qty').value = max>0?max:'';
}
function pkAdd(){
  const code=v('pk-box'), qty=parseInt(v('pk-qty'))||0, o=curOrder();
  if(!o) return alert('오더를 먼저 선택하세요');
  if(!code) return alert('보관 Box를 선택하세요');
  if(qty<1) return alert('수량을 입력하세요');
  const p=boxInfo(code), st=stockOf(code);
  const n=pkNeed(o).find(x=>x.product===p.name);
  if(!n || qty>n.left) return alert(`이 제품의 남은 출하 수량(${n?n.left:0})보다 많이 담을 수 없습니다`);
  if(!st.unlimited && qty>st.left-pkTaken(code)) return alert(`창고 현재고(${st.left-pkTaken(code)})가 부족합니다. [📥 창고입고]에서 입고 등록 후 진행하세요`);
  const packNo=(v('pk-pack')||'1').trim();
  pkLines.push({seq:pkLines.length+1, packNo, boxNo:p.code, product:p.name, qty, at:now().slice(11,16)});   // 합치지 않고 담을 때마다 1건씩 이력 기록
  el('pk-qty').value=''; pkRender();
}
function pkDel(i){ pkLines.splice(i,1); pkRender(); }

function doPacking() {
  const no=v('pk-order'); if(!no) return alert('오더를 먼저 선택하세요');
  const o=curOrder();
  if (S.packings().some(p=>p.orderNo===no)) return alert('이미 Packing 완료된 오더입니다');
  if (!pkNeed(o).every(n=>n.left===0)) return alert('출하 요구 수량을 모두 담아야 완료 처리할 수 있습니다');
  const arr=S.packings();
  arr.push({orderNo:no, customer:o.customer||'', boxes:new Set(pkLines.map(l=>l.packNo)).size, lines:pkLines.map(l=>({...l})), waybill:(v('pk-way')||'').trim(), doneAt:now(), person:'창고담당'});
  S.set('packings', arr); { const _o=S.orders().find(x=>x.no===no); if(!_o || ['대기','패킹완료',undefined,''].includes(_o.status)) updateOrderStatus(no,'패킹완료'); }
  pkLines=[]; fillPackingSelects();
  el('pk-order').value=''; loadPackingOrder();
  const m=el('pk-msg'); if(m){ m.style.color='#1a4fa0'; m.innerHTML=`✅ [${no}] Packing 완료 — 오른쪽 "Packing 완료 현황"에 등록되었습니다 <button type="button" class="btn btn-ghost btn-sm" onclick="LBL.print('${no}')">🏷 라벨 인쇄</button>`; }
  setTimeout(()=>{ const m2=el('pk-msg'); if(m2) m2.textContent=''; }, 20000);
  if(window.EV) setTimeout(()=>EV.ask('Packing 사진 증빙 (선택)',[{orderNo:no,hub:(o.route&&o.route.origin)||'',kind:'PACKING'}],'창고담당'),300);
}
function packSummary(p){
  if (p.forced) return `<span class="chip red">⚠ 강제 처리</span> <b>${(p.forcedReason||'').replace(/</g,'&lt;')}</b><br><span style="color:#555">${(p.forcedDetail||'').replace(/</g,'&lt;')} · 처리자 ${(p.forcedBy||'').replace(/</g,'&lt;')}</span>${(p.stockLines&&p.stockLines.length)?'<br><span style="color:#1a4fa0">재고 차감: '+p.stockLines.map(l=>`${l.boxNo}×${l.qty}`).join(', ')+'</span>':'<br><span style="color:#777">재고 차감 없음</span>'}`;
  const g={}; (p.lines||[]).forEach(l=>{ const k=l.packNo||'-'; (g[k]=g[k]||[]).push(`${l.boxNo}×${l.qty}`); });
  return Object.keys(g).map(k=>`<b>상자 ${k}</b>: ${g[k].join(', ')}`).join('<br>')||'-';
}
// Unpacking 잠금: 강제 처리 기록 / 거점 OUT(출고) 이후는 보존. (배차가 있으면 먼저 배차 취소 필요)
function packLockReason(orderNo){
  if (S.packings().some(p=>p.orderNo===orderNo && p.forced)) return '강제 Packing 처리 기록은 감사 기록이라 삭제할 수 없습니다';
  const o=S.orders().find(x=>x.no===orderNo);
  if (o && !['대기','패킹완료','배차완료'].includes(o.status)) return `오더 상태가 '${o.status}'입니다`;
  if (S.events().some(e=>e.orderNo===orderNo && e.event==='OUT')) return '거점 OUT(출고)이 이미 등록되었습니다';
  return '';
}
// Unpacking = Packing 취소(재고 복구). 수량 조정도 Unpacking 후 재Packing으로 처리. 사유·처리자 필수, 이력 보존
function delPacking(i){
  const arr=S.packings(), p=arr[i]; if(!p) return;
  const why=packLockReason(p.orderNo);
  if (why) return alert(`⛔ Unpacking할 수 없습니다.\n\n[${p.orderNo}] ${why}.\n출고된 오더의 Packing 기록은 보존해야 합니다.`);
  const dps=S.dispatches().filter(d=>d.orderNo===p.orderNo);
  if (dps.length) return alert(`⛔ 먼저 배차를 취소하세요.\n\n[${p.orderNo}] 배차 ${dps.length}건이 등록되어 있습니다.\n[차량 배차] 화면에서 해당 배차의 [취소] 버튼(사유 필수)을 누른 뒤 Unpacking하세요.`);
  askReason({
    title:'📦 Unpacking (Packing 취소)',
    info:`<b>${p.orderNo}</b> · ${p.customer} · ${p.boxes}박스<br>${packSummary(p)}<br><span style="color:#b91c1c">실행하면 꺼낸 Box 수량이 창고 재고로 복구되고, 오더는 '대기'로 돌아갑니다. 수량 조정은 Unpacking 후 다시 Packing하세요.</span>`,
    reasons:['출하 취소(고객 요청)','수량 조정(재Packing)','품목·Box 오류','Packing 오입력','기타'],
    okText:'Unpacking 실행',
    onOk:r=>{
      const cur=S.packings(), k=cur.findIndex(x=>x.orderNo===p.orderNo && x.doneAt===p.doneAt);
      if (k<0) return;
      cur.splice(k,1); S.set('packings', cur);
      const al=S.alarms();
      al.push({ id:'ALM-UP-'+Date.now(), time:now(), type:'UNPACK', orderNo:p.orderNo, customer:p.customer||'',
        message:`[Unpacking] ${p.orderNo} · ${p.boxes}박스 재고 복구 · 사유: ${r.reason}${r.detail?' / '+r.detail:''} · 처리자 ${r.by}`,
        reason:r.reason, detail:r.detail, by:r.by, record:p, read:true });
      S.set('alarms', al);
      reconcileOrderStatus();
      fillPackingSelects(); renderPackingDone();
      alert(`✅ Unpacking 완료(이력 보존). 재고가 복구되었습니다.${/수량/.test(r.reason)?'\n이제 [출하Packing]에서 수량을 맞춰 다시 Packing하세요.':''}`);
    }
  });
}
function renderPackingDone() {
  const all=S.packings();
  el('packing-done-body').innerHTML = all.map((p,i)=>({p,i})).reverse().map(({p,i})=>
    `<tr><td>${p.orderNo}</td><td>${p.customer}</td><td>${p.boxes}</td><td style="font-size:13px">${packSummary(p)}</td><td>${p.doneAt} ${window.EV?EV.badge(p.orderNo,'','PACKING'):''}</td><td>${p.person}</td><td><button type="button" class="btn btn-ghost btn-xs" onclick="LBL.print('${p.orderNo}')" title="포장 상자별 QR 라벨 인쇄">🏷 라벨</button> ${packLockReason(p.orderNo)?'<span class="lock-chip" title="'+packLockReason(p.orderNo)+'">🔒 출고됨</span>':`<button class="btn btn-danger btn-xs" onclick="delPacking(${i})" title="Packing 취소·수량 조정(사유 필수)">Unpacking</button>`}</td></tr>`
  ).join('') || '<tr><td colspan="7" class="empty">없음</td></tr>';
}


// ══ 자사물류창고 입고(창고입고) ══
function pkView(v2, btn){
  el('pk-view-in').style.display = v2==='in' ? '' : 'none';
  el('pk-view-out').style.display = v2==='out' ? '' : 'none';
  document.querySelectorAll('#pk-tabs .btn').forEach(b=>b.className=b.className.replace('btn-primary','btn-ghost'));
  if (btn) btn.className = btn.className.replace('btn-ghost','btn-primary');
  try{ sessionStorage.setItem('lmts_pk_view', v2); }catch(e){}
  if (v2==='in') rcRender(); else fillPackingSelects();
}
function rcNeed(){ return needByProduct(); }
function rcRender(){
  const nowLocal=()=>{ const d=new Date(); return localDateStr(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
  if (!v('rc-time')) el('rc-time').value=nowLocal();
  if (!v('rc-src')) el('rc-src').value='UTI VINA 생산라인';
  const cur=v('rc-box');
  fillSel('rc-box', S.products().map(p=>({v:p.code, l:`${p.code} · ${p.name}`}))); el('rc-box').value=cur;
  const need=rcNeed();
  el('rc-stock-body').innerHTML = S.products().map(p=>{
    const c=stockCalc(p.code), nd=need[p.name]||0, av=c.left-nd;
    const avCell = !c.tracked ? '<span style="color:#6B7280">제한없음</span>' : av<0 ? `<b style="color:#C0392B">${av} (부족)</b>` : `<b>${av}</b>`;
    return `<tr><td>${p.code}</td><td>${p.name}</td><td>${c.base}</td><td>${c.inn}</td><td>${c.out}</td><td><b>${c.tracked?c.left:'-'}</b></td><td>${nd}</td><td>${avCell}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">기준정보 > 제품에 Box를 먼저 등록하세요</td></tr>';
  const R=S.receipts();
  el('rc-body').innerHTML = R.map((r,i)=>({r,i})).reverse().map(({r,i})=>{
    const cancelled=r.status==='취소';
    return `<tr style="${cancelled?'color:#9CA3AF;text-decoration:line-through':''}"><td>${r.no}</td><td>${r.time}</td><td>${r.srcType||'-'}</td><td>${r.src||'-'}</td><td>${r.product}</td><td><b>${r.qty}</b></td><td>${r.lot||'-'}</td><td>${r.loc||'-'}</td><td>${r.person||'-'}</td><td>${r.note||''}</td><td>${cancelled?'-':`<button class="btn btn-ghost btn-xs" onclick="rcLabel('${r.no}')">🏷 라벨</button>`}</td><td>${cancelled?'취소됨':`<button class="btn btn-danger btn-xs" onclick="rcCancel(${i})">취소</button>`}</td></tr>`;
  }).join('') || '<tr><td colspan="12" class="empty">입고 내역 없음</td></tr>';
}
function rcAdd(){
  const code=v('rc-box'), qty=parseInt(v('rc-qty'))||0, time=(v('rc-time')||'').replace('T',' ');
  if(!time) return alert('입고 일시를 입력하세요');
  if(!code) return alert('입고 제품(Box)을 선택하세요');
  if(qty<1) return alert('입고 수량을 입력하세요');
  if(!v('rc-src').trim()) return alert('출처(공장·업체명)를 입력하세요');
  const p=S.products().find(x=>x.code===code);
  const arr=S.receipts(), no=nextReceiptNo();
  arr.push({no, time, boxNo:code, product:p?p.name:'', qty, lot:v('rc-lot').trim(), srcType:v('rc-type'), src:v('rc-src').trim(), loc:v('rc-loc').trim(), person:v('rc-person').trim()||'창고담당', note:v('rc-note').trim(), status:'입고완료'});
  S.set('receipts', arr);
  ['rc-qty','rc-lot','rc-note'].forEach(id=>el(id).value=''); el('rc-time').value='';
  rcRender();
  const c=stockCalc(code), m=el('rc-msg'); m.style.color='#1a4fa0'; m.innerHTML=`✅ [${no}] ${p?p.name:code} +${qty} 입고 — 현재고 ${c.left} <button type="button" class="btn btn-ghost btn-sm" onclick="rcLabel('${no}')">🏷 입고 라벨 인쇄</button>`;
  setTimeout(()=>{ if(el('rc-msg')) el('rc-msg').textContent=''; },30000);
}
function rcLabel(no){
  const n=prompt('인쇄할 라벨 수(입고한 박스 수)를 입력하세요', '1'); if(n===null) return;
  LBL.printRcv(no, n);
}
function rcCancel(i){
  const arr=S.receipts(), r=arr[i]; if(!r||r.status==='취소') return;
  const c=stockCalc(r.boxNo);
  if (c.left - r.qty < 0 && c.out>0) return alert(`⛔ 취소할 수 없습니다.\n\n이 입고분(${r.qty})을 취소하면 현재고가 음수가 됩니다. 이미 Packing으로 출고된 수량이 있습니다.`);
  if(!confirm(`[${r.no}] ${r.product} ${r.qty}개 입고를 취소할까요?\n취소하면 현재고에서 차감됩니다.`)) return;
  r.status='취소'; S.set('receipts', arr); rcRender();
}

// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillPackingSelects();
  let vw='out'; try{ vw=sessionStorage.getItem('lmts_pk_view')||'out'; }catch(e){}
  const bs=document.querySelectorAll('#pk-tabs .btn'); pkView(vw, bs[vw==='in'?0:1]);
};


// ══ 강제 Packing 처리 — 정상 Packing을 못 하고 출하된 경우의 예외 처리. 사유·처리자 필수, 감사 기록(삭제 불가)·알람 자동 생성 ══
function forcePackOpen(){
  const have = new Set(S.packings().map(p => p.orderNo));
  const L = S.orders().filter(o => !have.has(o.no));
  if (!L.length) return alert('Packing 기록이 없는 오더가 없습니다.');
  let m = document.getElementById('fp-modal');
  if (!m) { m = document.createElement('div'); m.id = 'fp-modal'; m.className = 'modal-bg hidden'; document.body.appendChild(m); }
  const cur = (typeof v === 'function' ? v('pk-order') : '') || '';
  const grp = (t, arr) => arr.length ? `<optgroup label="${t} · ${arr.length}건">${arr.map(o => `<option value="${o.no}" ${o.no === cur ? 'selected' : ''}>${o.no} · ${o.customer} [${o.status}]</option>`).join('')}</optgroup>` : '';
  m.innerHTML = `<div class="modal" style="max-width:640px;width:94vw;position:relative">
    <button type="button" id="fp-x" style="position:absolute;top:12px;right:14px;width:36px;height:36px;border:1.5px solid #64748b;border-radius:50%;background:#fff;font-size:20px;font-weight:700;cursor:pointer" onclick="forcePackClose()" title="닫기">✕</button>
    <div class="modal-title" style="padding-right:46px">⚠️ 강제 Packing 처리</div>
    <div class="alert alert-warn" style="margin-bottom:12px;color:#7a1f1f;font-weight:600;line-height:1.6"><div>정상 절차는 Packing 기록 후 출하입니다. 부득이하게 Packing 기록 없이 출하·운송된 경우에만 사용하세요.<br>처리 내용은 <b>감사 기록(삭제 불가)</b>으로 남고 알람이 생성됩니다.</div></div>
    <div class="form-group"><label>① 오더 (Packing 기록이 없는 오더) *</label>
      <select id="fp-order" onchange="forcePackFill()">${grp('진행 오더 — 대시보드 \'패킹 미완료\'와 동일', L.filter(o => o.status !== '도착완료'))}${grp('도착완료 오더 — 사후 기록용(대시보드 패킹 미완료에는 미포함)', L.filter(o => o.status === '도착완료'))}</select></div>
    <div class="form-group"><label>② 상자 수 <small style="color:#555">(오더의 박스 수로 자동 설정 — 수정 불가)</small></label>
      <input id="fp-boxes" type="number" min="1" readonly tabindex="-1" style="width:120px;background:#eef0f3;color:#111;font-weight:700;cursor:not-allowed" title="강제 처리는 오더 등록 박스 수 그대로 기록됩니다"></div>
    <div class="form-group"><label>③ 재고 차감 품목 <small style="color:#555">(선택 — 입력한 수량만큼 창고 재고에서 차감, 비우면 차감 없음)</small></label>
      <div id="fp-stock" style="border:1.5px solid #9ca3af;border-radius:6px;padding:8px;background:#fafafa"></div></div>
    <div class="form-group"><label>④ 사유 구분 *</label>
      <select id="fp-reason"><option value="">-- 선택 --</option><option>긴급 출하(시간 부족)</option><option>Packing 기록 누락(사후 등록)</option><option>시스템·단말 장애</option><option>현장 사정(고객 요청 등)</option><option>기타</option></select></div>
    <div class="form-group"><label>⑤ 상세 사유 * <small style="color:#555">(5자 이상)</small></label>
      <textarea id="fp-detail" rows="2" style="width:100%" placeholder="예: 고객 긴급 요청으로 기사 대기 중이라 포장 후 출하, 시스템 등록 누락"></textarea></div>
    <div class="form-group"><label>⑥ 처리자 *</label><input id="fp-by" type="text" style="width:200px" placeholder="이름"></div>
    <div id="fp-msg" style="min-height:20px;color:#b91c1c;font-weight:700;margin-bottom:6px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick="forcePackClose()">취소</button><button type="button" class="btn" style="background:#b91c1c;color:#fff" onclick="forcePackSave()">강제 Packing 처리 실행</button></div></div>`;
  m.classList.remove('hidden'); m.style.display = 'flex'; forcePackFill();
}
function forcePackClose(){ const m = document.getElementById('fp-modal'); if (m) { m.style.display = 'none'; m.classList.add('hidden'); } }
function forcePackFill(){
  const o = S.orders().find(x => x.no === document.getElementById('fp-order').value); document.getElementById('fp-boxes').value = o ? (o.boxes || 1) : 1;
  const box = document.getElementById('fp-stock'); if (!box) return;
  const rows = o ? ordItems(o).map((i, k) => {
    const ps = S.products().filter(p => p.name === i.product);
    if (!ps.length) return `<div style="padding:4px 0;color:#777">${i.product} ${i.qty}개 — 보관 Box 미등록 제품(재고관리 대상 아님)</div>`;
    return `<div style="display:flex;gap:6px;align-items:center;padding:4px 0;flex-wrap:wrap"><b style="min-width:110px">${i.product}</b><span>주문 ${i.qty}</span>
      <select id="fps-box-${k}" style="min-width:150px">${ps.map(p => { const c = stockCalc(p.code); return `<option value="${p.code}">${p.code} (현재고 ${c.tracked ? c.left : '제한없음'})</option>`; }).join('')}</select>
      <input id="fps-qty-${k}" data-prod="${i.product.replace(/"/g, '&quot;')}" type="number" min="0" placeholder="차감 수량" style="width:100px"><button type="button" class="btn btn-ghost btn-xs" onclick="document.getElementById('fps-qty-${k}').value=${+i.qty || 0}">주문수량 전체</button></div>`;
  }).join('') : '';
  box.innerHTML = rows || '<span style="color:#777">차감할 품목이 없습니다</span>';
}
function forcePackSave(){
  const g = id => (document.getElementById(id).value || '').trim(), msg = t => { document.getElementById('fp-msg').textContent = t; };
  const no = g('fp-order'); let boxes = 0; const reason = g('fp-reason'), detail = g('fp-detail'), by = g('fp-by');
  const o = S.orders().find(x => x.no === no); if (!o) return msg('오더를 선택하세요');
  if (S.packings().some(p => p.orderNo === no)) return msg('이미 Packing 기록이 있는 오더입니다');
  boxes = o.boxes || 1;
  if (boxes < 1) return msg('상자 수를 입력하세요');
  if (!reason) return msg('사유 구분을 선택하세요');
  if (detail.length < 5) return msg('상세 사유를 5자 이상 입력하세요');
  if (!by) return msg('처리자를 입력하세요');
  const stockLines = [], need = {};
  for (const inp of document.querySelectorAll('#fp-stock input[id^="fps-qty-"]')) {
    const q = parseInt(inp.value) || 0; if (q < 1) continue;
    const code = document.getElementById(inp.id.replace('qty', 'box')).value, c = stockCalc(code);
    need[code] = (need[code] || 0) + q;
    if (c.tracked && need[code] > c.left) return msg(`창고 현재고(${c.left})보다 많이 차감할 수 없습니다 (${code}). [📥 창고입고]에서 입고 등록 후 진행하세요`);
    stockLines.push({ boxNo: code, product: inp.dataset.prod, qty: q });
  }
  const stTxt = stockLines.length ? stockLines.map(l => `${l.boxNo}×${l.qty}`).join(', ') : '차감 없음';
  if (!confirm(`[${no}] 강제 Packing 처리합니다.\n\n사유: ${reason}\n상세: ${detail}\n처리자: ${by}\n재고 차감: ${stTxt}\n\n이 기록은 삭제할 수 없습니다. 진행할까요?`)) return;
  const t = now(), arr = S.packings();
  arr.push({ orderNo: no, customer: o.customer || '', boxes, lines: [], stockLines, waybill: '', doneAt: t, person: by, forced: true, forcedReason: reason, forcedDetail: detail, forcedBy: by, forcedAt: t });
  S.set('packings', arr);
  const al = S.alarms(); al.push({ id: 'ALM-FP-' + Date.now(), time: t, type: 'FORCED_PACK', orderNo: no, customer: o.customer || '', message: `[강제 Packing 처리] ${no} · ${reason} · ${detail} · 처리자 ${by} · 재고 ${stTxt}`, read: false });
  S.set('alarms', al);
  if (['대기', '', undefined].includes(o.status)) updateOrderStatus(no, '패킹완료'); else reconcileOrderStatus();
  forcePackClose(); fillPackingSelects(); alert(`✅ [${no}] 강제 Packing 처리했습니다.\n감사 기록과 알람이 남았습니다.`);
}
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('pk-order'); if (!sel || document.getElementById('fp-btn')) return;
  const b = document.createElement('button'); b.id = 'fp-btn'; b.type = 'button'; b.className = 'btn btn-ghost btn-sm'; b.style.cssText = 'margin-top:8px;border-color:#b91c1c;color:#b91c1c;font-weight:700';
  b.textContent = '⚠️ 강제 Packing 처리 (예외)'; b.onclick = forcePackOpen; sel.parentNode.appendChild(b);
});
