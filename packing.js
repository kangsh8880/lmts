// ══ LMTS packing.js ══

// ─── PACKING ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function fillPackingSelects() {
  fillSel('pk-order', S.orders().filter(o=>o.status==='대기').map(o=>({v:o.no, l:`${o.no} · ${o.customer}`})));
  renderPackingDone();
}
function loadPackingOrder() {
  const no=v('pk-order'), o=S.orders().find(x=>x.no===no);
  if (!o) { el('pk-info').style.display='none'; el('pk-empty').style.display=''; return; }
  el('pk-detail').textContent = `${o.no} | ${o.customer} | ${o.product} | ${o.boxes}박스`;
  el('pk-info').style.display=''; el('pk-empty').style.display='none';
}
function doPacking() {
  const no=v('pk-order'); if(!no) return alert('오더 선택');
  const o=S.orders().find(x=>x.no===no);
  const arr=S.packings();
  arr.push({orderNo:no, customer:o?.customer||'', boxes:o?.boxes||0, doneAt:now(), person:'창고담당'});
  S.set('packings', arr); updateOrderStatus(no,'패킹중');
  alert(`✅ [${no}] Packing 완료`); fillPackingSelects();
}
function renderPackingDone() {
  el('packing-done-body').innerHTML = S.packings().map(p=>
    `<tr><td>${p.orderNo}</td><td>${p.customer}</td><td>${p.boxes}박스</td><td>${p.doneAt}</td><td>${p.person}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="empty">없음</td></tr>';
}

// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillPackingSelects();
};
