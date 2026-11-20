// ══ LMTS master.js ══

// ─── MASTER DATA ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function showMaster(tab, btn) {
  ['customer','product','vehicle','hub'].forEach(t =>
    el('master-' + t).style.display = t === tab ? '' : 'none');
  document.querySelectorAll('#master-tab-btns .btn').forEach(b =>
    b.className = b.className.replace('btn-primary','btn-ghost'));
  if (btn) btn.className = btn.className.replace('btn-ghost','btn-primary');
  renderMasterTable(tab);
}

// ─── 등록 / 수정(공통) ─────────────────────────────────────────
const MST = {
  customer:{arr:'customers', ids:['c-code','c-name','c-manager','c-phone','c-addr','c-confirm'], keys:['code','name','manager','phone','addr','confirm'], btn:'saveCustomer()', req:['c-code','c-name'], msg:'코드와 고객사명 필수'},
  product: {arr:'products',  ids:['p-code','p-name','p-box','p-qty','p-weight'], keys:['code','name','box','qty','weight'], btn:'saveProduct()', req:['p-code','p-name'], msg:'Box No와 제품명 필수'},
  vehicle: {arr:'vehicles',  ids:['v-no','v-type','v-cap','v-driver','v-dphone'], keys:['no','type','cap','driver','dphone'], btn:'saveVehicle()', req:['v-no','v-driver'], msg:'차량번호와 기사명 필수'},
  hub:     {arr:'hubs',      ids:['h-code','h-name','h-type','h-addr','h-mgr','h-lat','h-lng'], keys:['code','name','type','addr','mgr','lat','lng'], btn:'saveHub()', req:['h-code','h-name'], msg:'거점코드와 거점명 필수'}
};
const EDIT = {customer:-1, product:-1, vehicle:-1, hub:-1};
function mstBtn(tab) { return document.querySelector(`#master-${tab} button[onclick="${MST[tab].btn}"]`); }
function mstReset(tab) {
  const M = MST[tab]; EDIT[tab] = -1;
  M.ids.forEach(id => { const e = el(id); if (e && e.tagName !== 'SELECT') e.value = ''; });
  const b = mstBtn(tab); if (b) b.textContent = '+ 등록';
  const c = document.getElementById('mst-cancel-' + tab); if (c) c.remove();
  const ci = el(M.ids[0]); if (ci) ci.readOnly = false;
}
function editMaster(tab, i) {
  const M = MST[tab], it = S.get(M.arr)[i]; if (!it) return;
  EDIT[tab] = i;
  M.ids.forEach((id, k) => { const e = el(id); if (e) e.value = it[M.keys[k]] == null ? '' : it[M.keys[k]]; });
  const b = mstBtn(tab);
  if (b) { b.textContent = '💾 수정 저장'; if (!document.getElementById('mst-cancel-' + tab)) { const c = document.createElement('button'); c.id = 'mst-cancel-' + tab; c.className = 'btn btn-ghost btn-sm'; c.style.marginLeft = '6px'; c.textContent = '취소'; c.onclick = () => mstReset(tab); b.after(c); } }
  const f = el(M.ids[1]); if (f) { f.focus(); f.scrollIntoView({block:'center'}); }
}
// 이름이 바뀌면 오더·이벤트·배차·Packing에 저장된 이름도 함께 바꿔 연결이 끊기지 않게 한다
function cascadeRename(tab, oldN, newN) {
  if (!oldN || oldN === newN) return;
  if (tab === 'hub') {
    const O = S.orders(); O.forEach(o => { const r = o.route; if (!r) return; if (r.origin === oldN) r.origin = newN; if (r.destination === oldN) r.destination = newN; (r.waypoints || []).forEach(w => { if (w.name === oldN) w.name = newN; }); }); S.set('orders', O);
    const E = S.events(); E.forEach(e => { if (e.hub === oldN) e.hub = newN; }); S.set('events', E);
    const D = S.dispatches(); D.forEach(d => { if (d.fromHub === oldN) d.fromHub = newN; if (d.toHub === oldN) d.toHub = newN; }); S.set('dispatches', D);
  } else if (tab === 'customer') {
    const O = S.orders(); O.forEach(o => { if (o.customer === oldN) o.customer = newN; }); S.set('orders', O);
    const P = S.packings(); P.forEach(p => { if (p.customer === oldN) p.customer = newN; }); S.set('packings', P);
    const E = S.events(); E.forEach(e => { if (e.customer === oldN) e.customer = newN; }); S.set('events', E);
    const D = S.dispatches(); D.forEach(d => { if (d.customer === oldN) d.customer = newN; }); S.set('dispatches', D);
  } else if (tab === 'product') {
    const O = S.orders(); O.forEach(o => { (o.items || []).forEach(i => { if (i.product === oldN) i.product = newN; }); o.product = (o.items && o.items.length) ? o.items.map(i => i.product).join(' / ') : (o.product === oldN ? newN : o.product); }); S.set('orders', O);
    const P = S.packings(); P.forEach(p => (p.lines || []).forEach(l => { if (l.product === oldN) l.product = newN; })); S.set('packings', P);
  }
}
function saveMaster(tab) {
  const M = MST[tab];
  if (M.req.some(id => !v(id))) return alert(M.msg);
  const arr = S.get(M.arr), ed = EDIT[tab], obj = {};
  M.ids.forEach((id, k) => { obj[M.keys[k]] = v(id); });
  if (tab === 'hub') {
    const lat = parseFloat(obj.lat), lng = parseFloat(obj.lng), g = HUB_GEO[obj.name];
    obj.lat = isNaN(lat) ? (g ? g[0] : null) : lat; obj.lng = isNaN(lng) ? (g ? g[1] : null) : lng;
  }
  const dup = arr.some((x, i) => i !== ed && x[M.keys[0]] === obj[M.keys[0]]);
  if (dup) return alert('이미 등록된 코드/번호입니다: ' + obj[M.keys[0]]);
  if (ed >= 0) {
    const old = arr[ed], oldName = old.name;
    if (tab !== 'vehicle' && oldName !== obj.name && !confirm(`이름을 "${oldName}" → "${obj.name}"(으)로 바꿉니다.\n기존 오더·이벤트·배차 내역의 이름도 함께 바뀝니다. 계속할까요?`)) return;
    arr[ed] = Object.assign({}, old, obj);
    S.set(M.arr, arr);
    if (tab !== 'vehicle') cascadeRename(tab, oldName, obj.name);
  } else {
    if (tab === 'vehicle') obj.status = '대기';
    arr.push(obj); S.set(M.arr, arr);
  }
  mstReset(tab); renderMasterTable(tab);
}
function saveCustomer() { saveMaster('customer'); }
function saveProduct()  { saveMaster('product'); }
function saveVehicle()  { saveMaster('vehicle'); }
function saveHub()      { saveMaster('hub'); }

const TYPE_COL = {'출발(자사창고)':['#D6E4F0','#365C89'],'경유지':['#FFF3CD','#7B4F00'],'도착(고객사)':['#E8F5E9','#1B5E20']};
function typeTag(t){ const c=TYPE_COL[t]||['#eee','#333']; return `<span class="type-tag" style="background:${c[0]};color:${c[1]}">${t}</span>`; }

function renderMasterTable(tab) {
  const empty = c => `<tr><td colspan="${c}" class="empty">등록된 데이터 없음</td></tr>`;
  if (tab==='customer') el('customer-table-body').innerHTML = S.customers().map((c,i)=>
    `<tr><td>${c.code}</td><td>${c.name}</td><td>${c.manager||'-'}</td><td>${c.phone||'-'}</td><td>${c.addr||'-'}</td><td>${c.confirm}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('customer',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('customers',${i})">삭제</button></td></tr>`).join('') || empty(7);
  if (tab==='product') el('product-table-body').innerHTML = S.products().map((p,i)=>{
    const tot = parseInt(p.qty)||0, used = S.packings().reduce((a,pk)=>a+(pk.lines||[]).filter(l=>l.boxNo===p.code).reduce((s2,l)=>s2+(+l.qty||0),0),0);
    const left = Math.max(0, tot-used), low = tot>0 && left===0;
    const leftCell = !tot ? '<span style="color:#6B7280">제한없음</span>' : low ? `<b style="color:#C0392B">${left} (소진)</b>` : `<b>${left}</b>`;
    return `<tr><td>${p.code}</td><td>${p.name}</td><td>${p.box||'-'}</td><td>${p.qty||'-'}</td><td>${tot?used:'-'}</td><td>${leftCell}</td><td>${p.weight||'-'}kg</td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('product',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('products',${i})">삭제</button></td></tr>`;}).join('') || empty(8);
  if (tab==='vehicle') el('vehicle-table-body').innerHTML = S.vehicles().map((vv,i)=>
    `<tr><td>${vv.no}</td><td>${vv.type||'-'}</td><td>${vv.cap||'-'}kg</td><td>${vv.driver}</td><td>${vv.dphone||'-'}</td>
    <td><span class="status s-ready">${vv.status}</span></td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('vehicle',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('vehicles',${i})">삭제</button></td></tr>`).join('') || empty(7);
  if (tab==='hub') el('hub-table-body').innerHTML = S.hubs().map((h,i)=>
    `<tr><td>${h.code}</td><td><b>${h.name}</b></td><td>${typeTag(h.type)}</td><td>${h.addr||'-'}</td><td>${h.mgr||'-'}</td><td>${h.lat!=null&&h.lat!==''?(+h.lat).toFixed(4)+', '+(+h.lng).toFixed(4):'<span style="color:#c0392b">미입력</span>'}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('hub',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('hubs',${i})">삭제</button></td></tr>`).join('') || empty(7);
}

function delItem(key, idx) {
  const arr = S.get(key), it = arr[idx]; if (!it) return;
  // 참조 무결성: 오더·배차·Packing에서 사용 중인 기준정보는 삭제 불가
  const O = S.orders(), D = S.dispatches();
  let used = 0, what = '';
  if (key==='customers') { used = O.filter(o=>o.customer===it.name).length; what='오더'; }
  if (key==='products')  { used = O.filter(o=>(o.items||[]).some(i=>i.product===it.name||i.product===it.code)||o.product===it.name).length; what='오더'; }
  if (key==='hubs')      { used = O.filter(o=>o.route&&[o.route.origin,o.route.destination,...(o.route.waypoints||[]).map(w=>w.name)].includes(it.name)).length; what='오더 경로'; }
  if (key==='vehicles')  { used = D.filter(d=>d.vehicleNo===it.no||d.vehicle===it.no).length; what='배차'; }
  if (used) return alert('⛔ 삭제할 수 없습니다.\n\n"'+(it.name||it.no||it.code)+'" 은(는) '+used+'건의 '+what+'에서 사용 중입니다.\n사용 중인 기준정보를 지우면 이력이 깨집니다.');
  if (!confirm('삭제하시겠습니까?')) return;
  arr.splice(idx,1); S.set(key, arr);
  const m={customers:'customer',products:'product',vehicles:'vehicle',hubs:'hub'};
  if (m[key] && EDIT[m[key]] >= 0) mstReset(m[key]);
  if (m[key]) renderMasterTable(m[key]);
}

// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  showMaster('customer', document.querySelector('#master-tab-btns .btn'));
};
