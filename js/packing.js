// ══ LMTS packing.js ══
// 한 오더에 여러 제품 · 보관 Box를 Split(일부 수량만 꺼내) 담아 Packing
let pkLines = [];   // 현재 오더에 담는 중인 내역 {boxNo, product, qty}

function boxInfo(code){   // '@제품명' = 기준정보에 Box가 없는 제품을 직접 담는 경우
  if (String(code).startsWith('@')) return {code:'미등록', name:String(code).slice(1)};
  return S.products().find(x=>x.code===code) || {code, name:''};
}
function stockOf(code){
  if (String(code).startsWith('@')) return {total:0, left:9e9, unlimited:true};            // 현재고 = 기초재고 + 창고 입고 누계 − Packing 출고 누계
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
  if(!st.unlimited && qty>st.left-pkTaken(code)) return alert(`창고 현재고(${st.left-pkTaken(code)})가 부족합니다. [📥 창고 입고]에서 입고 등록 후 진행하세요`);
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
  const g={}; (p.lines||[]).forEach(l=>{ const k=l.packNo||'-'; (g[k]=g[k]||[]).push(`${l.boxNo}×${l.qty}`); });
  return Object.keys(g).map(k=>`<b>상자 ${k}</b>: ${g[k].join(', ')}`).join('<br>')||'-';
}
// 출고(자사물류창고 OUT)·배차가 이루어진 오더의 Packing은 삭제 불가
function packLockReason(orderNo){
  const o=S.orders().find(x=>x.no===orderNo);
  if (o && !['대기','패킹완료'].includes(o.status)) return `오더 상태가 '${o.status}'입니다`;
  if (S.events().some(e=>e.orderNo===orderNo && e.event==='OUT')) return '거점 OUT(출고)이 이미 등록되었습니다';
  if (S.dispatches().some(d=>d.orderNo===orderNo)) return '차량 배차가 이미 등록되었습니다';
  return '';
}
function delPacking(i){
  const arr=S.packings(), p=arr[i]; if(!p) return;
  const why=packLockReason(p.orderNo);
  if (why) return alert(`⛔ 삭제할 수 없습니다.\n\n[${p.orderNo}] ${why}.\n출고된 오더의 Packing 기록은 보존해야 합니다.`);
  if(!confirm(`[${p.orderNo}] Packing 완료 기록을 삭제할까요?\n삭제하면 꺼낸 보관 Box 수량이 복구되고, 다른 완료 기록이 없으면 오더가 '대기'로 돌아갑니다.`)) return;
  arr.splice(i,1); S.set('packings', arr);
  const o=S.orders().find(x=>x.no===p.orderNo);
  if (o && o.status==='패킹완료' && !arr.some(x=>x.orderNo===p.orderNo)) updateOrderStatus(p.orderNo,'대기');
  fillPackingSelects();
}
function renderPackingDone() {
  const all=S.packings();
  el('packing-done-body').innerHTML = all.map((p,i)=>({p,i})).reverse().map(({p,i})=>
    `<tr><td>${p.orderNo}</td><td>${p.customer}</td><td>${p.boxes}</td><td style="font-size:13px">${packSummary(p)}</td><td>${p.doneAt} ${window.EV?EV.badge(p.orderNo,'','PACKING'):''}</td><td>${p.person}</td><td><button type="button" class="btn btn-ghost btn-xs" onclick="LBL.print('${p.orderNo}')" title="포장 상자별 QR 라벨 인쇄">🏷 라벨</button> ${packLockReason(p.orderNo)?'<span class="lock-chip" title="'+packLockReason(p.orderNo)+'">🔒 출고됨</span>':`<button class="btn btn-danger btn-xs" onclick="delPacking(${i})">삭제</button>`}</td></tr>`
  ).join('') || '<tr><td colspan="7" class="empty">없음</td></tr>';
}


// ══ 자사물류창고 입고 ══
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
