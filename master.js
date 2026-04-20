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

function saveCustomer() {
  const code=v('c-code'), name=v('c-name');
  if (!code||!name) return alert('코드와 고객사명 필수');
  const arr = S.customers();
  arr.push({code, name, manager:v('c-manager'), phone:v('c-phone'), addr:v('c-addr'), confirm:v('c-confirm')});
  S.set('customers', arr);
  ['c-code','c-name','c-manager','c-phone','c-addr'].forEach(id => el(id).value='');
  renderMasterTable('customer');
}
function saveProduct() {
  const code=v('p-code'), name=v('p-name');
  if (!code||!name) return alert('코드와 제품명 필수');
  const arr = S.products();
  arr.push({code, name, box:v('p-box'), qty:v('p-qty'), weight:v('p-weight')});
  S.set('products', arr);
  ['p-code','p-name','p-box','p-qty','p-weight'].forEach(id => el(id).value='');
  renderMasterTable('product');
}
function saveVehicle() {
  const no=v('v-no'), driver=v('v-driver');
  if (!no||!driver) return alert('차량번호와 기사명 필수');
  const arr = S.vehicles();
  arr.push({no, type:v('v-type'), cap:v('v-cap'), driver, dphone:v('v-dphone'), status:'대기'});
  S.set('vehicles', arr);
  ['v-no','v-type','v-cap','v-driver','v-dphone'].forEach(id => el(id).value='');
  renderMasterTable('vehicle');
}
function saveHub() {
  const code=v('h-code'), name=v('h-name');
  if (!code||!name) return alert('거점코드와 거점명 필수');
  const arr = S.hubs();
  arr.push({code, name, type:v('h-type'), addr:v('h-addr'), mgr:v('h-mgr')});
  S.set('hubs', arr);
  ['h-code','h-name','h-addr','h-mgr'].forEach(id => el(id).value='');
  renderMasterTable('hub');
}

const TYPE_COL = {'출발(자사창고)':['#D6E4F0','#365C89'],'경유지':['#FFF3CD','#7B4F00'],'도착(고객사)':['#E8F5E9','#1B5E20']};
function typeTag(t){ const c=TYPE_COL[t]||['#eee','#333']; return `<span class="type-tag" style="background:${c[0]};color:${c[1]}">${t}</span>`; }

function renderMasterTable(tab) {
  const empty = c => `<tr><td colspan="${c}" class="empty">등록된 데이터 없음</td></tr>`;
  if (tab==='customer') el('customer-table-body').innerHTML = S.customers().map((c,i)=>
    `<tr><td>${c.code}</td><td>${c.name}</td><td>${c.manager||'-'}</td><td>${c.phone||'-'}</td><td>${c.addr||'-'}</td><td>${c.confirm}</td>
    <td><button class="btn btn-danger btn-xs" onclick="delItem('customers',${i})">삭제</button></td></tr>`).join('') || empty(7);
  if (tab==='product') el('product-table-body').innerHTML = S.products().map((p,i)=>
    `<tr><td>${p.code}</td><td>${p.name}</td><td>${p.box||'-'}</td><td>${p.qty||'-'}</td><td>${p.weight||'-'}kg</td>
    <td><button class="btn btn-danger btn-xs" onclick="delItem('products',${i})">삭제</button></td></tr>`).join('') || empty(6);
  if (tab==='vehicle') el('vehicle-table-body').innerHTML = S.vehicles().map((vv,i)=>
    `<tr><td>${vv.no}</td><td>${vv.type||'-'}</td><td>${vv.cap||'-'}kg</td><td>${vv.driver}</td><td>${vv.dphone||'-'}</td>
    <td><span class="status s-ready">${vv.status}</span></td>
    <td><button class="btn btn-danger btn-xs" onclick="delItem('vehicles',${i})">삭제</button></td></tr>`).join('') || empty(7);
  if (tab==='hub') el('hub-table-body').innerHTML = S.hubs().map((h,i)=>
    `<tr><td>${h.code}</td><td><b>${h.name}</b></td><td>${typeTag(h.type)}</td><td>${h.addr||'-'}</td><td>${h.mgr||'-'}</td>
    <td><button class="btn btn-danger btn-xs" onclick="delItem('hubs',${i})">삭제</button></td></tr>`).join('') || empty(6);
}

function delItem(key, idx) {
  if (!confirm('삭제하시겠습니까?')) return;
  const arr = S.get(key); arr.splice(idx,1); S.set(key, arr);
  const m={customers:'customer',products:'product',vehicles:'vehicle',hubs:'hub'};
  if (m[key]) renderMasterTable(m[key]);
}

// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  showMaster('customer', document.querySelector('#master-tab-btns .btn'));
};
