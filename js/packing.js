// ══ LMTS packing.js ══
// 한 오더에 여러 제품 · 보관 Box를 Split(일부 수량만 꺼내) 담아 Packing
let pkLines = [];   // 현재 오더에 담는 중인 내역 {boxNo, product, qty}

function stockOf(code){            // 보관 Box 잔량 = 총수량 − 이미 Packing 완료로 꺼낸 수량
  const p=S.products().find(x=>x.code===code); const tot=parseInt(p?.qty)||0;
  const used=S.packings().reduce((a,pk)=>a+(pk.lines||[]).filter(l=>l.boxNo===code).reduce((s,l)=>s+(+l.qty||0),0),0);
  return {total:tot, left: tot? Math.max(0,tot-used) : 9e9, unlimited: !tot};
}
function pkTaken(code){ return pkLines.filter(l=>l.boxNo===code).reduce((a,l)=>a+l.qty,0); }
function pkNeed(o){
  return ordItems(o).map(i=>{ const got=pkLines.filter(l=>l.product===i.product).reduce((a,l)=>a+l.qty,0); return {product:i.product, need:+i.qty||0, got, left:Math.max(0,(+i.qty||0)-got)}; });
}
function curOrder(){ return S.orders().find(x=>x.no===v('pk-order')); }

function fillPackingSelects() {
  fillSel('pk-order', S.orders().filter(o=>o.status==='대기').map(o=>({v:o.no, l:`${o.no} · ${o.customer}`})));
  renderPackingDone();
}
function loadPackingOrder() {
  pkLines=[];
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
  el('pk-box').innerHTML = '<option value="">-- 보관 Box 선택 --</option>' + ps.map(p=>{
    const st=stockOf(p.code), left=st.unlimited?'∞':st.left-pkTaken(p.code);
    return `<option value="${p.code}" ${p.code===cur?'selected':''}>${p.code} · ${p.name} (보관 잔량 ${left}${st.unlimited?'':'/'+st.total})</option>`;
  }).join('');
  pkBoxChange(true);
  el('pk-lines').innerHTML = pkLines.length ? pkLines.map((l,i)=>`<tr><td><b>${l.boxNo}</b></td><td>${l.product}</td><td>${l.qty}</td><td><a href="#" onclick="pkDel(${i});return false" style="color:#c0392b;text-decoration:none">✕</a></td></tr>`).join('') : '<tr><td colspan="4" class="empty">담은 내역 없음</td></tr>';
  const done=need.every(n=>n.left===0), rest=need.reduce((a,n)=>a+n.left,0);
  el('pk-count').textContent = done ? '모두 담았습니다' : `남은 수량 ${rest}`;
  const b=el('pk-done-btn'); b.disabled=!done; b.style.opacity=done?'1':'.45'; b.style.cursor=done?'pointer':'not-allowed';
}
function pkBoxChange(keep){
  const code=v('pk-box'), o=curOrder(); if(!code||!o){ el('pk-stock').textContent=''; return; }
  const p=S.products().find(x=>x.code===code), st=stockOf(code);
  const n=pkNeed(o).find(x=>x.product===p.name), avail=st.unlimited?9e9:st.left-pkTaken(code);
  const max=Math.min(n?n.left:0, avail);
  el('pk-stock').textContent = `필요 ${n?n.left:0} · 보관 잔량 ${st.unlimited?'제한없음':avail} → 최대 ${max}개까지 담을 수 있습니다`;
  if (!keep || !v('pk-qty')) el('pk-qty').value = max>0?max:'';
}
function pkAdd(){
  const code=v('pk-box'), qty=parseInt(v('pk-qty'))||0, o=curOrder();
  if(!o) return alert('오더를 먼저 선택하세요');
  if(!code) return alert('보관 Box를 선택하세요');
  if(qty<1) return alert('수량을 입력하세요');
  const p=S.products().find(x=>x.code===code), st=stockOf(code);
  const n=pkNeed(o).find(x=>x.product===p.name);
  if(!n || qty>n.left) return alert(`이 제품의 남은 출하 수량(${n?n.left:0})보다 많이 담을 수 없습니다`);
  if(!st.unlimited && qty>st.left-pkTaken(code)) return alert(`보관 Box 잔량(${st.left-pkTaken(code)})이 부족합니다`);
  const ex=pkLines.find(l=>l.boxNo===code);
  if(ex) ex.qty+=qty; else pkLines.push({boxNo:code, product:p.name, qty});
  el('pk-qty').value=''; pkRender();
}
function pkDel(i){ pkLines.splice(i,1); pkRender(); }

function doPacking() {
  const no=v('pk-order'); if(!no) return alert('오더를 먼저 선택하세요');
  const o=curOrder();
  if (S.packings().some(p=>p.orderNo===no)) return alert('이미 Packing 완료된 오더입니다');
  if (!pkNeed(o).every(n=>n.left===0)) return alert('출하 요구 수량을 모두 담아야 완료 처리할 수 있습니다');
  const arr=S.packings();
  arr.push({orderNo:no, customer:o.customer||'', boxes:pkLines.length, lines:pkLines.map(l=>({...l})), doneAt:now(), person:'창고담당'});
  S.set('packings', arr); updateOrderStatus(no,'패킹중');
  pkLines=[]; fillPackingSelects();
  el('pk-order').value=''; loadPackingOrder();
  const m=el('pk-msg'); if(m){ m.style.color='#1a4fa0'; m.textContent=`✅ [${no}] Packing 완료 — 오른쪽 "Packing 완료 현황"에 등록되었습니다`; }
  setTimeout(()=>{ const m2=el('pk-msg'); if(m2) m2.textContent=''; }, 6000);
}
function renderPackingDone() {
  el('packing-done-body').innerHTML = S.packings().slice().reverse().map(p=>
    `<tr><td>${p.orderNo}</td><td>${p.customer}</td><td>${p.boxes}</td><td style="font-size:11px">${(p.lines||[]).map(l=>`${l.boxNo}×${l.qty}`).join(', ')||'-'}</td><td>${p.doneAt}</td><td>${p.person}</td></tr>`
  ).join('') || '<tr><td colspan="6" class="empty">없음</td></tr>';
}

// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillPackingSelects();
};
