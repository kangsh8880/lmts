// ══ LMTS master.js ══

// ─── MASTER DATA ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function showMaster(tab, btn) {
  ['customer','product','vehicle','hub','route'].forEach(t =>
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
    const RT = S.routes(); RT.forEach(r => { if (r.origin === oldN) r.origin = newN; if (r.destination === oldN) r.destination = newN; (r.waypoints || []).forEach(w => { if (w.name === oldN) w.name = newN; }); }); S.set('routes', RT);
  } else if (tab === 'customer') {
    const RT = S.routes(); RT.forEach(r => { if (r.customer === oldN) r.customer = newN; }); S.set('routes', RT);
    const O = S.orders(); O.forEach(o => { if (o.customer === oldN) o.customer = newN; }); S.set('orders', O);
    const P = S.packings(); P.forEach(p => { if (p.customer === oldN) p.customer = newN; }); S.set('packings', P);
    const E = S.events(); E.forEach(e => { if (e.customer === oldN) e.customer = newN; }); S.set('events', E);
    const D = S.dispatches(); D.forEach(d => { if (d.customer === oldN) d.customer = newN; }); S.set('dispatches', D);
  } else if (tab === 'product') {
    const RC = S.receipts(); RC.forEach(r => { if (r.product === oldN) r.product = newN; }); S.set('receipts', RC);
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
    const c = stockCalc(p.code), low = c.tracked && c.left===0;
    const leftCell = !c.tracked ? '<span style="color:#6B7280">제한없음</span>' : low ? `<b style="color:#C0392B">${c.left} (소진)</b>` : `<b>${c.left}</b>`;
    return `<tr><td>${p.code}</td><td>${p.name}</td><td>${p.box||'-'}</td><td>${p.qty||'-'}</td><td>${c.inn}</td><td>${c.out}</td><td>${leftCell}</td><td>${p.weight||'-'}kg</td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('product',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('products',${i})">삭제</button></td></tr>`;}).join('') || empty(9);
  if (tab==='vehicle') el('vehicle-table-body').innerHTML = S.vehicles().map((vv,i)=>
    `<tr><td>${vv.no}</td><td>${vv.type||'-'}</td><td>${vv.cap||'-'}kg</td><td>${vv.driver}</td><td>${vv.dphone||'-'}</td>
    <td><span class="status s-ready">${vv.status}</span></td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('vehicle',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('vehicles',${i})">삭제</button></td></tr>`).join('') || empty(7);
  if (tab==='route') renderRoutes();
  if (tab==='hub') el('hub-table-body').innerHTML = S.hubs().map((h,i)=>
    `<tr><td>${h.code}</td><td><b>${h.name}</b></td><td>${typeTag(h.type)}</td><td>${h.addr||'-'}</td><td>${h.mgr||'-'}</td><td>${h.lat!=null&&h.lat!==''?(+h.lat).toFixed(4)+', '+(+h.lng).toFixed(4):'<span style="color:#c0392b">미입력</span>'}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="editMaster('hub',${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delItem('hubs',${i})">삭제</button></td></tr>`).join('') || empty(7);
}

function delItem(key, idx) {
  const arr = S.get(key), it = arr[idx]; if (!it) return;
  // 참조 무결성: 오더·배차·Packing에서 사용 중인 기준정보는 삭제 불가
  const O = S.orders(), D = S.dispatches();
  let used = 0, what = '';
  if (key==='customers') { used = O.filter(o=>o.customer===it.name).length; what='오더'; if(!used){ used = S.routes().filter(r=>r.customer===it.name).length; what='Route'; } }
  if (key==='products')  { used = O.filter(o=>(o.items||[]).some(i=>i.product===it.name||i.product===it.code)||o.product===it.name).length; what='오더'; if(!used){ used = S.receipts().filter(r=>r.boxNo===it.code&&r.status!=='취소').length; what='창고 입고'; } }
  if (key==='hubs')      { used = O.filter(o=>o.route&&[o.route.origin,o.route.destination,...(o.route.waypoints||[]).map(w=>w.name)].includes(it.name)).length; what='오더 경로'; if(!used){ used = S.routes().filter(r=>[r.origin,r.destination,...(r.waypoints||[]).map(w=>w.name)].includes(it.name)).length; what='Route'; } }
  if (key==='vehicles')  { used = D.filter(d=>d.vehicleNo===it.no||d.vehicle===it.no).length; what='배차'; }
  if (used) return alert('⛔ 삭제할 수 없습니다.\n\n"'+(it.name||it.no||it.code)+'" 은(는) '+used+'건의 '+what+'에서 사용 중입니다.\n사용 중인 기준정보를 지우면 이력이 깨집니다.');
  if (!confirm('삭제하시겠습니까?')) return;
  arr.splice(idx,1); S.set(key, arr);
  const m={customers:'customer',products:'product',vehicles:'vehicle',hubs:'hub'};
  if (m[key] && EDIT[m[key]] >= 0) mstReset(m[key]);
  if (m[key]) renderMasterTable(m[key]);
}

// ══════════════════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════════════════
// Route 기준정보 — 자주 쓰는 출하 경로(자사창고 → 경유지 → 고객사)를 미리 등록
// ══════════════════════════════════════════════════════════════════
const RT_ICON = {truck:'🚛', air:'✈️', sea:'🚢'};
let rtWp = [], rtEdit = -1;
function rtFill() {
  const hs = S.hubs(), cur = ['rt-origin','rt-wp-add','rt-dest','rt-customer'].reduce((m,id)=>{ m[id]=v(id); return m; }, {});
  const opt = (arr, ph) => `<option value="">${ph}</option>` + arr.map(n=>`<option value="${n}">${n}</option>`).join('');
  el('rt-origin').innerHTML = opt(hs.filter(h=>h.type==='출발(자사창고)').map(h=>h.name), '-- 출발 거점 --');
  el('rt-wp-add').innerHTML = opt(hs.filter(h=>h.type==='경유지').map(h=>h.name), '-- 경유지 선택 --');
  el('rt-dest').innerHTML = opt(hs.filter(h=>h.type==='도착(고객사)').map(h=>h.name), '-- 도착 거점 --');
  el('rt-customer').innerHTML = opt(S.customers().map(c=>c.name), '-- 공통 --');
  Object.keys(cur).forEach(id => { if (cur[id]) el(id).value = cur[id]; });
  const o = hs.filter(h=>h.type==='출발(자사창고)'); if (o.length===1 && !v('rt-origin')) el('rt-origin').value = o[0].name;
}
function rtChips(r) {
  const p = [];
  if (r.origin) p.push(`<span class="r-chip r-chip-origin">🏭 ${r.origin}</span>`);
  if (r.originStdTime) p.push(`<span class="r-chip r-chip-time">⏱ ${fmtMin(r.originStdTime)}</span>`);
  (r.waypoints||[]).forEach((w,i) => {
    p.push(`<span class="r-arrow">${w.transport?RT_ICON[w.transport]:'→'}</span><span class="r-chip r-chip-wp">📍 ${i+1}. ${w.name}</span>`);
    if (w.stdTime) p.push(`<span class="r-chip r-chip-time">⏱ ${fmtMin(w.stdTime)}</span>`);
  });
  if (r.destination) p.push(`<span class="r-arrow">→</span><span class="r-chip r-chip-dest">🏢 ${r.destination}</span>`);
  return p.length ? `<div class="route-chips">${p.join('')}</div>` : '<span style="color:var(--gray);font-size:13px">출발지와 도착지를 선택하세요</span>';
}
function rtCur() { return {origin:v('rt-origin'), originStdTime:v('rt-origin-std')||'', waypoints:rtWp.map(w=>({...w})), destination:v('rt-dest')}; }
function rtPreview() { el('rt-chips').innerHTML = rtChips(rtCur()); }
function rtRenderWp() {
  const c = el('rt-wp-list');
  c.innerHTML = rtWp.length ? rtWp.map((w,i)=>`<div class="wp-item" style="gap:5px">
    <div class="wp-seq">${i+1}</div><div class="wp-name" style="flex:1;font-size:14.5px;font-weight:700">${w.name}</div>
    <select onchange="rtWp[${i}].transport=this.value;rtPreview()" style="font-size:12px;padding:3px 6px;height:26px;width:130px;flex:0 0 130px">
      <option value="">이전 구간 유지</option><option value="truck" ${w.transport==='truck'?'selected':''}>🚛 차량</option><option value="air" ${w.transport==='air'?'selected':''}>✈️ 항공편</option><option value="sea" ${w.transport==='sea'?'selected':''}>🚢 선박</option></select>
    <span style="font-size:11px;color:var(--gray);white-space:nowrap">→표준</span><input class="wp-time-input" type="number" min="0" placeholder="분" value="${w.stdTime||''}" oninput="rtWp[${i}].stdTime=this.value;rtPreview()" style="width:58px;flex:0 0 58px"><span style="font-size:11px;color:var(--gray)">분</span>
    <button class="wp-btn wp-up ${i===0?'wp-disabled':''}" onclick="rtMove(${i},-1)" ${i===0?'disabled':''}>↑</button>
    <button class="wp-btn wp-down ${i===rtWp.length-1?'wp-disabled':''}" onclick="rtMove(${i},1)" ${i===rtWp.length-1?'disabled':''}>↓</button>
    <button class="wp-btn wp-del" onclick="rtWp.splice(${i},1);rtRenderWp();rtPreview()">✕</button></div>`).join('')
    : '<div style="font-size:13px;color:var(--gray);padding:6px 0 4px 38px">경유지 없음 — 직배송</div>';
}
function rtMove(i, d) { const n = i + d; if (n<0 || n>=rtWp.length) return; [rtWp[i], rtWp[n]] = [rtWp[n], rtWp[i]]; rtRenderWp(); rtPreview(); }
function rtAddWp() {
  const name = v('rt-wp-add'); if (!name) return alert('경유지를 선택하세요');
  if (rtWp.find(w=>w.name===name)) return alert('이미 추가된 경유지입니다');
  rtWp.push({name, stdTime:v('rt-wp-std')||'', transport:v('rt-wp-tr')||'', transportNo:'', destChange:''});
  el('rt-wp-std').value=''; el('rt-wp-add').value=''; rtRenderWp(); rtPreview();
}
function rtNextCode() { const n = S.routes().reduce((m,r)=>{ const x = parseInt(String(r.code||'').replace(/\D/g,''),10); return isNaN(x)?m:Math.max(m,x); }, 0); return 'RT-' + String(n+1).padStart(3,'0'); }
function rtReset() {
  rtEdit = -1; rtWp = [];
  ['rt-name','rt-note','rt-origin-std','rt-wp-std'].forEach(id=>el(id).value='');
  el('rt-customer').value=''; el('rt-dest').value=''; el('rt-wp-add').value=''; el('rt-code').readOnly=false; el('rt-code').value=rtNextCode();
  el('rt-save').textContent='+ Route 등록'; const c=document.getElementById('rt-cancel'); if (c) c.remove();
  rtFill(); rtRenderWp(); rtPreview();
}
function saveRoute() {
  const code = v('rt-code').trim(), name = v('rt-name').trim(), cur = rtCur();
  if (!code || !name) return alert('Route 코드와 Route 명은 필수입니다');
  if (!cur.origin) return alert('출발 거점을 선택하세요');
  if (!cur.destination) return alert('도착 거점을 선택하세요');
  const arr = S.routes();
  if (arr.some((r,i)=>i!==rtEdit && r.code===code)) return alert('이미 등록된 Route 코드입니다: '+code);
  const obj = Object.assign({code, name, customer:v('rt-customer'), note:v('rt-note').trim()}, cur);
  if (rtEdit >= 0) arr[rtEdit] = Object.assign({}, arr[rtEdit], obj); else arr.push(obj);
  S.set('routes', arr); rtReset(); renderRoutes();
}
function editRoute(i) {
  const r = S.routes()[i]; if (!r) return;
  rtEdit = i; rtFill();
  el('rt-code').value=r.code; el('rt-code').readOnly=true; el('rt-name').value=r.name||''; el('rt-note').value=r.note||'';
  el('rt-customer').value=r.customer||''; el('rt-origin').value=r.origin||''; el('rt-origin-std').value=r.originStdTime||''; el('rt-dest').value=r.destination||'';
  rtWp = (r.waypoints||[]).map(w=>({name:w.name, stdTime:w.stdTime||'', transport:w.transport||'', transportNo:'', destChange:''}));
  el('rt-save').textContent='💾 수정 저장';
  if (!document.getElementById('rt-cancel')) { const c=document.createElement('button'); c.id='rt-cancel'; c.className='btn btn-ghost btn-sm'; c.textContent='취소'; c.onclick=rtReset; el('rt-save').after(c); }
  rtRenderWp(); rtPreview(); el('rt-name').scrollIntoView({block:'center'});
}
function delRoute(i) {
  const arr = S.routes(), r = arr[i]; if (!r) return;
  if (!confirm(`Route [${r.code}] ${r.name} 을(를) 삭제할까요?\n이미 만든 오더의 경로에는 영향이 없습니다.`)) return;
  arr.splice(i,1); S.set('routes', arr); if (rtEdit===i) rtReset(); renderRoutes();
}
function renderRoutes() {
  const O = S.orders(), sg = x => [x.origin,(x.waypoints||[]).map(w=>w.name+'/'+(w.transport||'')).join('>'),x.destination].join('|');
  el('route-list').innerHTML = S.routes().map((r,i)=>{
    const rs = sg(r), n = O.filter(o=>o.routeCode===r.code || (o.route && sg(o.route)===rs)).length;
    return `<div class="rt-item"><div class="rt-h"><b class="rt-cd">${r.code}</b><span class="rt-nm" title="${r.name}">${r.name}</span>
      <span class="rt-tag">${r.customer||'공통'}</span><span class="rt-use">사용 ${n}건</span>
      <span class="rt-btn"><button class="btn btn-ghost btn-xs" onclick="editRoute(${i})">수정</button> <button class="btn btn-danger btn-xs" onclick="delRoute(${i})">삭제</button></span></div>
      ${rtChips(r)}${r.note?`<div class="rt-note">${r.note}</div>`:''}</div>`;
  }).join('') || '<div class="empty-n" style="padding:20px;text-align:center;color:var(--gray)">등록된 Route 없음 — 왼쪽에서 등록하거나 [기존 오더에서 Route 자동 생성]을 누르세요</div>';
}
// 기존 오더의 경로를 (출발·경유·도착·운송수단) 기준으로 중복 없이 Route 후보로 만든다
function rtFromOrders() {
  const arr = S.routes(), sig = r => [r.origin, (r.waypoints||[]).map(w=>w.name+'/'+(w.transport||'')).join('>'), r.destination].join('|');
  const have = new Set(arr.map(sig)); let add = 0;
  S.orders().forEach(o => {
    const r = o.route; if (!r || !r.origin || !r.destination) return;
    const cand = {origin:r.origin, originStdTime:r.originStdTime||'', waypoints:(r.waypoints||[]).map(w=>({name:w.name, stdTime:w.stdTime||'', transport:w.transport||'', transportNo:'', destChange:''})), destination:r.destination};
    const k = sig(cand); if (have.has(k)) return; have.add(k);
    const code = rtNextCode(), via = cand.waypoints.length;
    arr.push(Object.assign({code, name:`${(o.customer && !cand.destination.startsWith(o.customer)) ? o.customer+' · ' : ''}${cand.destination}${via?' ('+via+'곳 경유)':' 직송'}`.trim(), customer:o.customer||'', note:'기존 오더에서 자동 생성'}, cand)); add++;
  });
  if (!add) return alert('새로 만들 Route가 없습니다. (이미 모두 등록되었거나 경로가 있는 오더가 없습니다)');
  S.set('routes', arr); rtReset(); renderRoutes(); alert(`✅ Route ${add}건을 만들었습니다.\n이름·고객사·비고는 목록에서 [수정]으로 다듬을 수 있습니다.`);
}

// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  rtReset();
  showMaster('customer', document.querySelector('#master-tab-btns .btn'));
};
