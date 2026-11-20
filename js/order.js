// ══ LMTS order.js ══

// ─── ORDER / ROUTE BUILDER ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
let wpList = [];

function fillOrderSelects() {
  const cs=S.customers(), ps=S.products(), hs=S.hubs();
  fillSel('o-customer', cs.map(c=>({v:c.name, l:c.name})));
  fillSel('o-product', ps.map(p=>({v:p.name, l:`${p.name} (${p.code})`})));
  const origins = hs.filter(h=>h.type==='출발(자사창고)');
  fillSel('o-origin', origins.map(h=>({v:h.name, l:h.name})));
  if (origins.length===1) el('o-origin').value = origins[0].name;
  fillSel('o-wp-add', hs.filter(h=>h.type==='경유지').map(h=>({v:h.name, l:h.name})));
  fillSel('o-dest', hs.filter(h=>h.type==='도착(고객사)').map(h=>({v:h.name, l:h.name})));
  el('o-no').value = nextOrderNo();
  el('o-date').value = localDateStr();
  wpList = []; renderWpList(); updateRoutePreview();
}

// 오더번호 규칙: ORD-YYMMDD-NNNN (생성일 기준, 일자별 0001부터 순번, 4자리)
function localDateStr(d) { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function nextOrderNo() {
  const ymd = localDateStr().slice(2).replace(/-/g,''), pre = `ORD-${ymd}-`;
  const max = S.orders().reduce((m, o) => {   // 같은 일자의 기존 번호(3자리·4자리 모두) 중 최대 순번
    const x = String(o.no||'');
    if (!x.startsWith(pre)) return m;
    const n = parseInt(x.slice(pre.length), 10); return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return pre + String(max + 1).padStart(4, '0');
}

function onOriginChange() { updateRoutePreview(); }
function addWaypoint() {
  const name=v('o-wp-add'); if(!name) return alert('경유지를 선택하세요');
  if (wpList.find(w=>w.name===name)) return alert('이미 추가된 경유지');
  wpList.push({name, stdTime: v('o-wp-std')||'', transport:'', transportNo:'', destChange:''});
  el('o-wp-std').value=''; renderWpList(); updateRoutePreview();
}
function removeWp(idx) { wpList.splice(idx,1); renderWpList(); updateRoutePreview(); }
function moveWp(idx, dir) {
  const ni=idx+dir;
  if (ni<0||ni>=wpList.length) return;
  [wpList[idx],wpList[ni]]=[wpList[ni],wpList[idx]];
  renderWpList(); updateRoutePreview();
}
function updateWpTime(idx, val) { wpList[idx].stdTime=val; updateRoutePreview(); }
function updateWpTransport(idx, val) { wpList[idx].transport=val; if(!val) wpList[idx].transportNo=''; renderWpList(); updateRoutePreview(); }
function updateWpTransportNo(idx, val) { wpList[idx].transportNo=val; updateRoutePreview(); }
function toggleWpDestChange(idx, checked) { wpList[idx].destChange=checked?'__pending__':''; renderWpList(); updateRoutePreview(); }
function updateWpDestChange(idx, val) { wpList[idx].destChange=val; updateRoutePreview(); }

const TRANSPORT_ICON = {truck:'🚛', air:'✈️', sea:'🚢'};
const TRANSPORT_LABEL = {truck:'차량', air:'항공', sea:'선박'};

function renderWpList() {
  const c=el('waypoint-list');
  if (!wpList.length) { c.innerHTML='<div style="font-size:13px;color:var(--gray);padding:6px 0 4px 38px">경유지 없음 — 직배송</div>'; return; }
  const destHubs = S.hubs().filter(h=>h.type==='도착(고객사)');
  c.innerHTML = wpList.map((w,i)=>{
    const hasTransport = w.transport && w.transport!=='';
    const hasDestChange = w.destChange && w.destChange!=='';
    const destChangeActive = w.destChange !== '' && w.destChange !== undefined;
    return `
    <div class="wp-item" style="flex-direction:column;align-items:stretch;gap:0;padding:8px 10px;">
      <!-- 1행: 기본 정보 -->
      <div style="display:flex;align-items:center;gap:5px;">
        <div class="wp-seq" style="flex-shrink:0">${i+1}</div>
        <div class="wp-name" style="flex:1;font-size:14.5px;font-weight:700;">${w.name}</div>
        <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
          <span style="font-size:11px;color:var(--gray);white-space:nowrap">→표준</span>
          <input class="wp-time-input" type="number" min="0" placeholder="분" value="${w.stdTime||''}" oninput="updateWpTime(${i},this.value)">
          <span style="font-size:11px;color:var(--gray)">분</span>
        </div>
        <button class="wp-btn wp-up ${i===0?'wp-disabled':''}" onclick="moveWp(${i},-1)" ${i===0?'disabled':''}>↑</button>
        <button class="wp-btn wp-down ${i===wpList.length-1?'wp-disabled':''}" onclick="moveWp(${i},1)" ${i===wpList.length-1?'disabled':''}>↓</button>
        <button class="wp-btn wp-del" onclick="removeWp(${i})">✕</button>
      </div>
      <!-- 2행: 운송수단 변경 -->
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-left:28px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--gray);font-weight:600;flex-shrink:0;">출발 운송수단</span>
        <select onchange="updateWpTransport(${i},this.value)" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:#fff;height:24px;">
          <option value="" ${!w.transport?'selected':''}>-- 이전 구간 유지 --</option>
          <option value="truck" ${w.transport==='truck'?'selected':''}>🚛 차량</option>
          <option value="air" ${w.transport==='air'?'selected':''}>✈️ 항공편</option>
          <option value="sea" ${w.transport==='sea'?'selected':''}>🚢 선박</option>
        </select>
        ${hasTransport?`<input type="text" placeholder="${TRANSPORT_LABEL[w.transport]||'식별번호'}" value="${w.transportNo||''}" oninput="updateWpTransportNo(${i},this.value)" style="font-size:12px;padding:2px 7px;width:110px;border:1px solid var(--border);border-radius:4px;height:24px;">
        ${w.transportNo?`<span style="font-size:12px;font-weight:600;color:var(--dk)">${TRANSPORT_ICON[w.transport]} ${w.transportNo}</span>`:''}`:
        ''}
      </div>
      <!-- 3행: 도착지 변경 -->
      <div style="display:flex;align-items:center;gap:6px;margin-top:5px;padding-left:28px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;font-weight:600;color:var(--gray);">
          <input type="checkbox" ${destChangeActive?'checked':''} onchange="toggleWpDestChange(${i},this.checked)" style="width:auto;margin:0;">
          <span>이후 도착지 변경</span>
        </label>
        ${destChangeActive?`
        <select onchange="updateWpDestChange(${i},this.value)" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:#fff;height:24px;">
          <option value="__pending__" ${!hasDestChange?'selected':''}>-- 새 도착지 선택 --</option>
          ${destHubs.map(h=>`<option value="${h.name}" ${w.destChange===h.name?'selected':''}>${h.name}</option>`).join('')}
        </select>
        ${hasDestChange&&w.destChange!=='__pending__'?`<span style="font-size:12px;font-weight:700;color:var(--green)">🏢→ ${w.destChange}</span>`:''}
        `:''}
      </div>
    </div>`;
  }).join('');
}

function updateRoutePreview() {
  const origin=v('o-origin'), dest=v('o-dest'), stdOrigin=v('o-origin-std');
  const parts=[];
  if (origin) {
    parts.push(`<span class="r-chip r-chip-origin">🏭 ${origin}</span>`);
    if (stdOrigin) parts.push(`<span class="r-chip r-chip-time">⏱ ${stdOrigin}분</span>`);
  }
  wpList.forEach((w,i)=>{
    const tIcon = w.transport ? TRANSPORT_ICON[w.transport] : '→';
    const tNo = w.transportNo ? ` (${w.transportNo})` : '';
    parts.push(`<span class="r-arrow">${tIcon}</span><span class="r-chip r-chip-wp">📍 ${i+1}. ${w.name}${tNo}</span>`);
    if (w.stdTime) parts.push(`<span class="r-chip r-chip-time">⏱ ${w.stdTime}분</span>`);
    if (w.destChange && w.destChange !== '__pending__') {
      parts.push(`<span class="r-chip" style="background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;font-size:12px;">🔀→🏢 ${w.destChange}</span>`);
    }
  });
  // 최종 도착지: 마지막 destChange 또는 기본 dest
  const lastDestChange = [...wpList].reverse().find(w=>w.destChange && w.destChange!=='__pending__');
  const finalDest = lastDestChange ? lastDestChange.destChange : dest;
  if (finalDest) parts.push(`<span class="r-arrow">→</span><span class="r-chip r-chip-dest">🏢 ${finalDest}</span>`);
  el('route-chips').innerHTML = parts.length ? parts.join('') : '<span style="font-size:13px;color:var(--gray)">출발지와 도착지를 선택하세요</span>';
}

let oItems = [];
function renderOrderItems() {
  el('o-items').innerHTML = oItems.length ? oItems.map((it,i)=>`<span style="display:inline-flex;gap:6px;align-items:center;border:1px solid #888;border-radius:14px;padding:3px 10px;background:#eef3fb;font-size:14.5px"><b>${it.product}</b> × ${it.qty}<a href="#" onclick="delOrderItem(${i});return false" style="color:#c0392b;text-decoration:none">✕</a></span>`).join('') : '<span style="font-size:13px;color:var(--gray)">제품과 수량을 넣고 "+ 제품 추가"를 누르세요</span>';
}
function addOrderItem() {
  const product=v('o-product'), qty=parseInt(v('o-boxes'))||0;
  if (!product) return alert('제품을 선택하세요');
  if (qty<1) return alert('수량을 입력하세요');
  const ex=oItems.find(i=>i.product===product);
  if (ex) ex.qty+=qty; else oItems.push({product, qty});
  el('o-product').value=''; el('o-boxes').value='';
  renderOrderItems();
}
function delOrderItem(i){ oItems.splice(i,1); renderOrderItems(); }

function createOrder() {
  const no=v('o-no'), date=v('o-date'), customer=v('o-customer');
  if (v('o-product') && (parseInt(v('o-boxes'))||0)>0) addOrderItem();   // 선택만 하고 추가를 안 누른 경우 자동 포함

  const origin=v('o-origin'), dest=v('o-dest');
  if (!no) return alert('오더번호를 입력하세요');
  if (S.orders().some(x=>x.no===no)) return alert('⛔ 이미 등록된 오더번호입니다: '+no+'\n다른 번호를 사용하세요.');
  if (!date) return alert('출하예정일을 입력하세요');
  if (!customer) return alert('고객사를 선택하세요');
  if (!oItems.length) return alert('출하 제품과 수량을 추가하세요');
  if (!origin) return alert('출발 거점을 선택하세요');
  if (!dest)   return alert('도착 거점을 선택하세요');

  // 드롭다운에 선택된 채 "경유지 추가" 버튼을 누르지 않은 경유지 자동 포함
  const pendingWp = v('o-wp-add');
  if (pendingWp && !wpList.find(w => w.name === pendingWp)) {
    wpList.push({name: pendingWp, stdTime: v('o-wp-std') || '', transport:'', transportNo:'', destChange:''});
    renderWpList();
  }

  // 최종 도착지: 마지막 destChange가 있으면 해당 값 사용
  const lastDestChange = [...wpList].reverse().find(w=>w.destChange && w.destChange!=='__pending__');
  const finalDest = lastDestChange ? lastDestChange.destChange : dest;

  const arr = S.orders();
  const items=oItems.map(i=>({...i}));
  arr.push({no, date, customer, items, product:items.map(i=>i.product).join(' / '), boxes:items.reduce((a,i)=>a+i.qty,0), note:v('o-note'), status:'대기', created:now(),
    route:{
      origin, originStdTime:v('o-origin-std')||'',
      waypoints: wpList.map(w=>({
        name: w.name,
        stdTime: w.stdTime||'',
        transport: w.transport||'',
        transportNo: w.transportNo||'',
        destChange: (w.destChange && w.destChange!=='__pending__') ? w.destChange : ''
      })),
      destination: finalDest
    }
  });
  S.set('orders', arr);
  oItems=[]; renderOrderItems();
  fillOrderSelects(); renderOrders();
  alert(`✅ 오더 [${no}] 생성 완료`);
}

function renderOrders() {
  const filter=v('o-filter-status');
  const rows=S.orders().filter(o=>!filter||o.status===filter);
  const stMap={'대기':'s-ready','패킹완료':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done','지연':'s-delay'};
  el('order-table-body').innerHTML = rows.length ? rows.map(o=>{
    const gi=S.orders().findIndex(x=>x.no===o.no);
    const canEdit = ['대기','패킹완료'].includes(o.status);
    return `<tr><td><b>${o.no}</b></td><td>${o.date}</td><td>${o.customer}</td><td>${ordText(o)}</td><td>${ordQty(o)}</td>
    <td style="min-width:200px">${buildRouteChips(o)}</td>
    <td><span class="status ${stMap[o.status]||'s-ready'}">${o.status}</span></td>
    <td>${o.note||'-'}</td>
    <td><button class="btn btn-xs" style="background:#EBF5FF;color:var(--accent);border:1px solid var(--border);" onclick="openRouteEdit('${o.no}')" title="경로 수정">✏️</button></td>
    <td><button class="btn btn-danger btn-xs" onclick="delOrder(${gi})">삭제</button></td></tr>`;
  }).join('') : '<tr><td colspan="10" class="empty">출하오더 없음</td></tr>';
}

function buildRouteChips(o, small=true) {
  if (!o||!o.route) return '<span style="color:var(--gray);font-size:13px">-</span>';
  const {origin, waypoints, destination}=o.route;
  const fs=small?'font-size:11px;':'';
  const TI={truck:'🚛',air:'✈️',sea:'🚢'};
  let html=`<span class="r-chip r-chip-origin" style="${fs}">🏭 ${origin||'?'}</span>`;
  if (waypoints?.length) waypoints.forEach((w,i)=>{
    const wn=typeof w==='string'?w:w.name;
    const wt=typeof w==='object'?w.transport:'';
    const wno=typeof w==='object'?w.transportNo:'';
    const wdc=typeof w==='object'?w.destChange:'';
    const tIcon = wt ? TI[wt]||'→' : '→';
    const tLabel = wno ? ` (${wno})` : '';
    html+=`<span class="r-arrow" style="${fs}">${tIcon}</span><span class="r-chip r-chip-wp" style="${fs}">📍${i+1}.${wn}${tLabel}</span>`;
    if (wdc) html+=`<span class="r-chip" style="${fs}background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;">🔀🏢${wdc}</span>`;
  });
  if (destination) html+=`<span class="r-arrow" style="${fs}">→</span><span class="r-chip r-chip-dest" style="${fs}">🏢 ${destination}</span>`;
  return `<div class="route-chips">${html}</div>`;
}

function getRouteShort(o) {
  if (!o||!o.route) return '-';
  const {origin, waypoints, destination}=o.route;
  const mid=waypoints?.length?` →(${waypoints.length}경유) `:' → ';
  return `${origin||'?'}${mid}${destination||'?'}`;
}

function delOrder(idx) {
  const arr=S.orders(), o=arr[idx]; if (!o) return;
  if (!['대기','패킹완료'].includes(o.status)) return alert('⛔ 삭제할 수 없습니다.\n\n상태가 "'+o.status+'"인 오더는 배차·운송 이력이 있어 삭제할 수 없습니다.\n(대기/패킹완료 상태의 오더만 삭제 가능)');
  if (!confirm('오더 '+o.no+' 를 삭제하시겠습니까?'+(o.status==='패킹완료'?'\n※ 이 오더의 Packing 내역도 함께 삭제되며, 제품 보관 잔량이 복원됩니다.':''))) return;
  arr.splice(idx,1); S.set('orders',arr);
  S.set('packings', S.packings().filter(x=>x.orderNo!==o.no));
  S.set('dispatches', S.dispatches().filter(x=>x.orderNo!==o.no));
  renderOrders();
}

// ══════════════════════════════════════════════════════════════════
// ─── 경로 수정 모달 ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
let reWpList = [];   // 수정 모달 전용 경유지 배열
let reOrderNo = '';  // 수정 중인 오더번호

function openRouteEdit(orderNo) {
  const o = S.orders().find(x => x.no === orderNo);
  if (!o) return alert('오더를 찾을 수 없습니다');

  reOrderNo = orderNo;
  el('re-order-no').textContent = o.no;
  el('re-customer').textContent = o.customer;

  // 상태 뱃지
  const stMap = {'대기':'s-ready','패킹완료':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done','지연':'s-delay'};
  el('re-status-badge').innerHTML = `<span class="status ${stMap[o.status]||'s-ready'}">${o.status}</span>`;

  // 운송중/도착완료 경고
  const warn = el('re-status-warn');
  if (['운송중','도착완료'].includes(o.status)) {
    warn.textContent = `⚠️ 현재 "${o.status}" 상태입니다. 경로 변경 시 기존 추적 이벤트와 불일치가 발생할 수 있습니다.`;
    warn.style.display = '';
  } else {
    warn.style.display = 'none';
  }

  // 거점 셀렉트 초기화
  const hs = S.hubs();
  const origins = hs.filter(h => h.type === '출발(자사창고)');
  const wayHubs = hs.filter(h => h.type === '경유지');
  const dests   = hs.filter(h => h.type === '도착(고객사)');

  fillSel('re-origin', origins.map(h => ({v: h.name, l: h.name})));
  fillSel('re-wp-add', wayHubs.map(h => ({v: h.name, l: h.name})));
  fillSel('re-dest',   dests.map(h => ({v: h.name, l: h.name})));

  // 현재 경로 값 세팅
  const route = o.route || {};
  el('re-origin').value = route.origin || (origins[0]?.name || '');
  el('re-origin-std').value = route.originStdTime || '';
  el('re-dest').value = route.destination || '';

  // 경유지 배열 복사
  reWpList = (route.waypoints || []).map(w =>
    typeof w === 'string' ? {name: w, stdTime: ''} : {name: w.name || w, stdTime: w.stdTime || ''}
  );

  reRenderWpList();
  reUpdatePreview();
  el('route-edit-modal').classList.remove('hidden');
}

function closeRouteEditModal() {
  el('route-edit-modal').classList.add('hidden');
  reWpList = [];
  reOrderNo = '';
}

function reAddWaypoint() {
  const name = el('re-wp-add').value;
  if (!name) return alert('경유지를 선택하세요');
  if (reWpList.find(w => w.name === name)) return alert('이미 추가된 경유지');
  reWpList.push({name, stdTime: el('re-wp-std').value || ''});
  el('re-wp-std').value = '';
  reRenderWpList();
  reUpdatePreview();
}

function reRemoveWp(idx) { reWpList.splice(idx, 1); reRenderWpList(); reUpdatePreview(); }

function reMoveWp(idx, dir) {
  const ni = idx + dir;
  if (ni < 0 || ni >= reWpList.length) return;
  [reWpList[idx], reWpList[ni]] = [reWpList[ni], reWpList[idx]];
  reRenderWpList(); reUpdatePreview();
}

function reUpdateWpTime(idx, val) { reWpList[idx].stdTime = val; reUpdatePreview(); }

function reRenderWpList() {
  const c = el('re-wp-list');
  if (!reWpList.length) {
    c.innerHTML = '<div style="font-size:13px;color:var(--gray);padding:6px 4px">경유지 없음 — 직배송</div>';
    return;
  }
  c.innerHTML = reWpList.map((w, i) => `
    <div class="wp-item">
      <div class="wp-seq">${i+1}</div>
      <div class="wp-name">${w.name}</div>
      <div class="wp-time-wrap">
        <span class="wp-time-label">→표준</span>
        <input class="wp-time-input" type="number" min="0" placeholder="분" value="${w.stdTime||''}" oninput="reUpdateWpTime(${i},this.value)">
        <span style="font-size:11px;color:var(--gray)">분</span>
      </div>
      <button class="wp-btn wp-up ${i===0?'wp-disabled':''}" onclick="reMoveWp(${i},-1)" ${i===0?'disabled':''}>↑</button>
      <button class="wp-btn wp-down ${i===reWpList.length-1?'wp-disabled':''}" onclick="reMoveWp(${i},1)" ${i===reWpList.length-1?'disabled':''}>↓</button>
      <button class="wp-btn wp-del" onclick="reRemoveWp(${i})">✕</button>
    </div>`).join('');
}

function reUpdatePreview() {
  const origin = el('re-origin').value;
  const dest   = el('re-dest').value;
  const stdOrigin = el('re-origin-std').value;
  const parts = [];
  if (origin) {
    parts.push(`<span class="r-chip r-chip-origin">🏭 ${origin}</span>`);
    if (stdOrigin) parts.push(`<span class="r-chip r-chip-time">⏱ ${stdOrigin}분</span>`);
  }
  reWpList.forEach((w, i) => {
    parts.push(`<span class="r-arrow">→</span><span class="r-chip r-chip-wp">📍 ${i+1}. ${w.name}</span>`);
    if (w.stdTime) parts.push(`<span class="r-chip r-chip-time">⏱ ${w.stdTime}분</span>`);
  });
  if (dest) parts.push(`<span class="r-arrow">→</span><span class="r-chip r-chip-dest">🏢 ${dest}</span>`);
  el('re-route-preview').innerHTML = parts.length ? parts.join('') : '<span style="font-size:13px;color:var(--gray)">출발지와 도착지를 선택하세요</span>';
}

function saveRouteEdit() {
  const origin = el('re-origin').value;
  const dest   = el('re-dest').value;
  const originStd = el('re-origin-std').value;

  if (!origin) return alert('출발 거점을 선택하세요');
  if (!dest)   return alert('도착 거점을 선택하세요');

  // 드롭다운에 선택된 채 추가 안 한 경유지 자동 포함
  const pendingWp = el('re-wp-add').value;
  if (pendingWp && !reWpList.find(w => w.name === pendingWp)) {
    reWpList.push({name: pendingWp, stdTime: el('re-wp-std').value || ''});
  }

  const arr = S.orders();
  const idx = arr.findIndex(o => o.no === reOrderNo);
  if (idx < 0) return alert('오더를 찾을 수 없습니다');

  arr[idx].route = {
    origin,
    originStdTime: originStd || '',
    waypoints: reWpList.map(w => ({name: w.name, stdTime: w.stdTime || ''})),
    destination: dest
  };

  S.set('orders', arr);
  const staleDp = cleanStaleDispatches(reOrderNo);   // 경로가 바뀐 구간의 기존 배차는 무효 처리
  closeRouteEditModal();
  renderOrders();
  if (staleDp.length) alert(`ℹ️ 경로가 변경되어 아래 구간의 기존 배차 ${staleDp.length}건을 삭제했습니다.\n[차량배차] 화면에서 새 경로 기준으로 다시 등록하세요.\n\n` + staleDp.map(d=>`· 구간 ${d.legIdx+1}: ${d.fromHub} → ${d.toHub}`).join('\n'));

  // 대시보드 갱신

  // 배차 페이지가 활성화 상태면 구간 카드도 즉시 갱신
  if (el('page-dispatch')?.classList.contains('active')) {
    // dp-order에 현재 수정한 오더가 선택돼 있으면 구간 카드 갱신
    if (v('dp-order') === reOrderNo) {
      loadDispatchOrder();
    } else {
      // 해당 오더를 자동 선택하고 구간 카드 표시
      const dpSel = el('dp-order');
      if ([...dpSel.options].some(opt => opt.value === reOrderNo)) {
        dpSel.value = reOrderNo;
      }
      loadDispatchOrder();
    }
  }

  alert(`✅ [${reOrderNo}] 경로 수정 완료`);
}

// updateOrderStatus 는 common.js 로 이동 (여러 화면 공용)

// ══════════════════════════════════════════════════════════════════



// ── 페이지 초기화 ───────────────────────────────────────────────
window.lmtsReady = function() {
  initNav();
  fillOrderSelects(); renderOrders();
};
