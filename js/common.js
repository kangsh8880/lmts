// (2026-11-19) 우클릭·텍스트 선택 차단 코드 제거 — 화면 글자 복사가 가능해야 함

// ══ LMTS common.js ─ 공통 코드 ══

// ══════════════════════════════════════════════════════════════════
// ─── GITHUB API 레이어 ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const GH = {
  REPO: 'kangsh8880/lmts',
  DATA_PATH: 'data/lmts_data.json',
  API: 'https://api.github.com',
  _sha: null,
  _saveTimer: null,
  _saving: false,
  _connected: false,
  _synced: false,   // 서버 최신 데이터를 정상 로드한 뒤에만 true — 오래된 캐시로 서버를 덮어쓰는 사고 방지
  _again: false,

  token() { return localStorage.getItem('lmts_gh_token') || ''; },
  saveToken(t) { localStorage.setItem('lmts_gh_token', t); },

  headers() {
    return {
      'Authorization': `token ${this.token()}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    };
  },

  // 데이터 파일 읽기
  async load() {
    const res = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}`, {
      headers: this.headers()
    });
    if (res.status === 404) return null;  // 파일 없음 (최초)
    if (res.status === 401) throw new Error('TOKEN_INVALID');
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const file = await res.json();
    this._sha = file.sha;
    // 데이터 파일이 1MB를 넘으면 content가 비어 오므로 raw 방식으로 다시 읽음
    if (!file.content || file.encoding === 'none') {
      const r2 = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}`, { headers: { ...this.headers(), 'Accept': 'application/vnd.github.raw' } });
      if (!r2.ok) throw new Error(`GitHub API ${r2.status}`);
      return JSON.parse(await r2.text());
    }
    // base64 → UTF-8 디코딩
    const binary = atob(file.content.replace(/\n/g, ''));
    const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)));
    const text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text);
  },

  // 데이터 파일 저장 (Create or Update)
  async save(dataObj) {
    if (!this._synced) { setSyncStatus('err', '저장 보류: 서버 데이터를 아직 읽지 못했습니다. 새로고침(Ctrl+Shift+R) 후 다시 시도하세요. (서버 데이터 덮어쓰기 방지)'); return; }
    if (this._saving) { this._again = true; return; }   // 저장 중 추가 변경 → 끝난 뒤 한 번 더 저장
    this._saving = true;
    setSyncStatus('sync', '저장 중...');
    try {
      // UTF-8 → base64 인코딩
      const json = JSON.stringify(dataObj, null, 2);
      const bytes = new TextEncoder().encode(json);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      const content = btoa(binary);

      // 저장 직전에 항상 최신 SHA 확보 (SHA 누락·오래됨 → 422/409 방지)
      if (!this._sha) await this._refreshSha();
      const body = {
        message: `LMTS data update ${now()}`,
        content,
        ...(this._sha ? { sha: this._sha } : {})
      };
      const res = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}`, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(body)
      });
      if (res.status === 409 || res.status === 422) {
        // 다른 사용자가 먼저 저장함 → 서버 최신본을 읽어 내 변경과 병합한 뒤 재시도 (남의 변경을 덮어쓰지 않음)
        try {
          const remote = await this.load();
          if (remote) { const n = mergeRemote(remote); if (n) setSyncStatus('warn', `다른 사용자의 변경 ${n}건을 병합했습니다`); }
        } catch(e) { await this._refreshSha(); }
        const j2 = JSON.stringify(DB, null, 2), b2 = new TextEncoder().encode(j2); let bin2 = ''; b2.forEach(b => bin2 += String.fromCharCode(b));
        body.content = btoa(bin2);
        body.sha = this._sha;
        const res2 = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}`, {
          method: 'PUT', headers: this.headers(), body: JSON.stringify(body)
        });
        if (!res2.ok) throw new Error(`Save failed: ${res2.status} ${await this._errMsg(res2)} [sha:${this._sha?this._sha.slice(0,7):'없음'}]`);
        const r2 = await res2.json();
        this._sha = r2.content.sha;
      } else if (!res.ok) {
        throw new Error(`Save failed: ${res.status} ${await this._errMsg(res)}`);
      } else {
        const r = await res.json();
        this._sha = r.content.sha;
      }
      setSyncStatus('ok', `저장완료 ${now().slice(11,16)}`);
      try { sessionStorage.setItem('lmts_synced','1'); } catch(e) {}
    } catch(e) {
      setSyncStatus('err', `저장실패: ${e.message}`);
      console.error('GH save error:', e);
    } finally {
      this._saving = false;
      if (this._again) { this._again = false; this.scheduleSave(); }
    }
  },

  async _errMsg(res) {
    try { const j = await res.clone().json(); console.error('GH error body:', j); return (j.message || '') + (j.errors ? ' ' + JSON.stringify(j.errors) : ''); }
    catch(e) { return ''; }
  },

  async _refreshSha() {
    const res = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}?t=${Date.now()}`, {headers: this.headers(), cache: 'no-store'});
    if (res.ok) { const f = await res.json(); this._sha = f.sha; }
    else if (res.status === 404) { this._sha = null; }   // 파일 없음 → 신규 생성
  },

  // 1초 디바운스 자동저장
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => GH.save(DB), 1000);
  },

  // 연결 테스트
  async testConnection(token) {
    const res = await fetch(`${this.API}/repos/${this.REPO}`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.status === 401) throw new Error('토큰이 유효하지 않습니다');
    if (res.status === 404) throw new Error('저장소를 찾을 수 없습니다 (접근 권한 없음)');
    if (!res.ok) throw new Error(`API 오류: ${res.status}`);
    return await res.json();
  }
};

// ══════════════════════════════════════════════════════════════════

// ─── IN-MEMORY DB (GitHub와 동기화) ───────────────────────────
// ══════════════════════════════════════════════════════════════════
const DB = {
  customers:[], products:[], vehicles:[], hubs:[],
  orders:[], packings:[], dispatches:[], events:[], alarms:[], scans:[],
  lastUpdated: ''
};

// ── 입력값 정제: 화면(innerHTML·onclick)에 그대로 들어가도 코드로 실행되지 않도록 특수문자를 안전한 문자로 치환 ──
const _SAFE = {'<':'＜','>':'＞','"':'”',"'":'’','`':'’','\\':'＼'};
function cleanStr(x){ return String(x).replace(/[<>"'`\\]/g, c=>_SAFE[c]); }
function cleanDeep(o){
  if (typeof o === 'string') return cleanStr(o);
  if (Array.isArray(o)) { for (let i=0;i<o.length;i++) o[i] = cleanDeep(o[i]); return o; }
  if (o && typeof o === 'object') { for (const k in o) o[k] = cleanDeep(o[k]); return o; }
  return o;
}
// 컬렉션별 식별 키 — 동시 저장 병합·삭제 추적용
const KEYFN = {
  customers:r=>r.code, products:r=>r.code, vehicles:r=>r.no, hubs:r=>r.code||r.name, orders:r=>r.no, packings:r=>r.orderNo,
  dispatches:r=>r.orderNo+'#'+r.legIdx, events:r=>[r.time,r.orderNo,r.hub,r.event].join('|'), alarms:r=>r.id, scans:r=>[r.time,r.code,r.hub,r.event].join('|')
};
const _KS = {}, _DEL = {};     // 마지막 확인 시점의 키 목록 / 이 세션에서 지운 키
function snapKeys(){ Object.keys(KEYFN).forEach(k=>{ _KS[k] = new Set((DB[k]||[]).map(KEYFN[k])); _DEL[k] = _DEL[k] || new Set(); }); }
function mergeRemote(remote){     // 서버에만 있고 내가 지우지 않은 항목을 가져와 합침, 같은 항목은 내 값 우선
  let added = 0;
  Object.keys(KEYFN).forEach(k=>{
    const have = new Set((DB[k]||[]).map(KEYFN[k]));
    (remote[k]||[]).forEach(r=>{ const key = KEYFN[k](r); if (!have.has(key) && !(_DEL[k] && _DEL[k].has(key))) { DB[k].push(cleanDeep(r)); have.add(key); added++; } });
  });
  snapKeys(); saveSessionCache(); return added;
}

// ── 오더 제품 내역 공용 (한 오더에 여러 제품 가능, 구버전 오더는 제품 1개로 간주) ──
function ordItems(o){ return (o.items && o.items.length) ? o.items : [{product:o.product, qty:parseInt(o.boxes)||0}]; }
function ordQty(o){ return ordItems(o).reduce((a,i)=>a+(+i.qty||0),0); }
function ordText(o){ return ordItems(o).map(i=>`${i.product} ${i.qty}`).join(' / '); }
function ordCodes(o, ps){ return ordItems(o).map(i=>(ps.find(p=>p.name===i.product)||{}).code||'').filter(Boolean); }

// 오더 상태 변경 — Packing·배차·거점 In/Out 화면 공용
function updateOrderStatus(no, status) {
  const arr=S.orders(), idx=arr.findIndex(o=>o.no===no);
  if (idx>=0) { arr[idx].status=status; S.set('orders',arr); }
}

function saveSessionCache() {
  try { sessionStorage.setItem('lmts_session_db', JSON.stringify(DB)); sessionStorage.setItem('lmts_session_ts', String(Date.now())); } catch(e) {}
}

const S = {
  get: k => DB[k] || [],
  set(k, v) {
    cleanDeep(v);
    if (KEYFN[k]) { const cur = new Set((v||[]).map(KEYFN[k])); (_KS[k]||new Set()).forEach(x=>{ if (!cur.has(x)) { (_DEL[k] = _DEL[k] || new Set()).add(x); } }); _KS[k] = cur; }
    DB[k] = v;
    DB.lastUpdated = now();
    GH.scheduleSave();  // GitHub에 자동 저장
    // localStorage에도 캐시 (오프라인 폴백)
    try { localStorage.setItem('lmts_' + k, JSON.stringify(v)); } catch(e) {}
    saveSessionCache();   // 페이지 이동·새로고침 시 방금 입력한 내용이 사라지지 않도록 세션 캐시도 갱신
  },
  customers:  () => S.get('customers'),
  products:   () => S.get('products'),
  vehicles:   () => S.get('vehicles'),
  hubs:       () => S.get('hubs'),
  orders:     () => S.get('orders'),
  packings:   () => S.get('packings'),
  dispatches: () => S.get('dispatches'),
  events:     () => S.get('events'),
  alarms:     () => S.get('alarms'),
  scans:      () => S.get('scans'),
};

// ══════════════════════════════════════════════════════════════════

// ─── UI 헬퍼 ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function showOverlay(text, sub) {
  el('overlay-text').textContent = text || 'GitHub에서 데이터 불러오는 중...';
  el('overlay-sub').textContent = sub || 'kangsh8880/lmts';
  el('overlay').classList.remove('hidden');
}
function hideOverlay() { el('overlay').classList.add('hidden'); }

function setSyncStatus(state, text, silent=false) {
  // nav 우상단 연결 상태 dot 업데이트
  const dot = el('gh-dot');
  const txt = el('gh-status-text');
  if (dot) dot.className = 'status-dot' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
  if (txt) {
    if (state === 'ok') txt.textContent = 'GitHub 연결됨';
    else if (state === 'err') txt.textContent = '연결 오류';
    else txt.textContent = 'GitHub 미연결';
  }
  // silent=true 이면 sync bar 표시 안 함 (세션캐시 사용 시 등)
  if (silent) return;
  const bar = el('sync-bar');
  if (bar) {
    bar.classList.remove('hidden');
    bar.style.borderColor = '';
    bar.style.color = '';
    el('sync-bar-icon').textContent = state === 'ok' ? '✅' : state === 'err' ? '❌' : '💾';
    el('sync-bar-text').textContent = text;
    if (state === 'ok') setTimeout(() => bar.classList.add('hidden'), 3000);
    if (state === 'warn') { bar.style.borderColor = 'var(--yellow)'; bar.style.color = 'var(--yellow)'; }
  }
}

function openTokenModal() { el('token-modal').classList.remove('hidden'); }
function closeTokenModal() { el('token-modal').classList.add('hidden'); }

async function testAndSaveToken() {
  const token = el('token-input').value.trim();
  if (!token) return alert('토큰을 입력하세요');
  el('token-status').textContent = '🔄 연결 테스트 중...';
  try {
    await GH.testConnection(token);
    GH.saveToken(token);
    el('token-status').innerHTML = '<span style="color:var(--green)">✅ 연결 성공! 데이터를 불러옵니다...</span>';
    closeTokenModal();
    await loadFromGitHub();
  } catch(e) {
    el('token-status').innerHTML = `<span style="color:var(--red)">❌ ${e.message}</span>`;
  }
}

// ══════════════════════════════════════════════════════════════════

// ─── 앱 초기화 ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
async function loadFromGitHub() {
  const SK = 'lmts_session_db';
  let cached = sessionStorage.getItem(SK);
  // 세션 캐시는 마지막 갱신 후 3분 이내일 때만 사용 (다른 PC·탭에서 바뀐 데이터를 놓치지 않도록)
  const ts = Number(sessionStorage.getItem('lmts_session_ts') || 0);
  if (cached && GH.token() && (Date.now() - ts > 180000)) cached = null;
  if (cached) {
    try {
      const c = JSON.parse(cached);
      Object.keys(DB).forEach(k => { if (c[k] !== undefined) DB[k] = c[k]; });
      cleanDeep(DB); snapKeys();
      GH._connected = !!GH.token(); GH._synced = GH._connected && sessionStorage.getItem('lmts_synced') === '1';
      ensureDefaultHubs();
      setSyncStatus(GH._connected ? 'ok' : 'warn', '', true); // 세션캐시: silent
      return;
    } catch(e) { sessionStorage.removeItem(SK); }
  }
  if (!GH.token()) {
    setSyncStatus('warn', 'GitHub 미연결 — 우상단 클릭하여 연결');
    loadFromLocalStorage();
    if (!DB.hubs.length) initSampleData();
    ensureDefaultHubs();
    saveSessionCache();
    return;
  }
  showOverlay('GitHub에서 데이터 불러오는 중...', GH.REPO + ' / ' + GH.DATA_PATH);
  try {
    const data = await GH.load();
    if (data) {
      Object.keys(DB).forEach(k => { if (data[k] !== undefined) DB[k] = data[k]; });
      cleanDeep(DB); snapKeys();
      GH._connected = true; GH._synced = true; try { sessionStorage.setItem('lmts_synced','1'); } catch(e) {}
      ensureDefaultHubs();
      setSyncStatus('ok', '데이터 로드 완료 (' + now().slice(11,16) + ')');
    } else {
      showOverlay('최초 실행: 샘플 데이터 저장 중...');
      initSampleData(); snapKeys();
      GH._synced = true;
      await GH.save(DB);
      GH._connected = true;
      setSyncStatus('ok', '초기 데이터 저장 완료');
    }
    saveSessionCache();
  } catch(e) {
    console.error('GitHub load error:', e);
    if (e.message === 'TOKEN_INVALID') {
      GH.saveToken('');
      setSyncStatus('err', '토큰 오류 — 우상단 클릭하여 재설정');
    } else {
      setSyncStatus('warn', 'GitHub 연결 실패 — 읽기 전용(저장 보류). 연결 확인 후 새로고침하세요');
    }
    try { sessionStorage.removeItem('lmts_synced'); } catch(_) {}
    GH._synced = false;
    loadFromLocalStorage(); cleanDeep(DB); snapKeys();
    if (!DB.hubs.length) initSampleData();
    ensureDefaultHubs();
    saveSessionCache();
  }
  hideOverlay();
}

function loadFromLocalStorage() {
  // localStorage 캐시에서 데이터 로드 (오프라인 모드)
  const keys = ['customers','products','vehicles','hubs','orders','packings','dispatches','events','alarms','scans'];
  keys.forEach(k => {
    const raw = localStorage.getItem('lmts_' + k);
    if (raw) { try { DB[k] = JSON.parse(raw); } catch(e) {} }
  });
  if (!DB.hubs.length) initSampleData();
}

// ══════════════════════════════════════════════════════════════════

// ── 네비게이션: 현재 페이지 active 표시 ─────────────────────────
function initNav() {
  try { reconcileOrderStatus(); } catch (e) { console.warn('status reconcile', e); }
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });
}
// goPage 하위호환성 유지 (일부 코드에서 호출될 수 있음)
function goPage(p, btn) { /* multi-page: 사용 안함 */ }


// ─── SEARCH & TRACKER ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function doSearch(prefix) {
  const q=el(prefix+'-search').value.trim().toLowerCase();
  if (!q) { el(prefix+'-search-result').innerHTML='<div class="alert alert-warn">검색어를 입력하세요</div>'; return; }
  const ps=S.products();
  const matched=S.orders().filter(o=>{
    const pcode=ordCodes(o,ps).join(' ');
    return o.no.toLowerCase().includes(q)||o.product.toLowerCase().includes(q)||pcode.toLowerCase().includes(q)||o.customer.toLowerCase().includes(q);
  });
  if (!matched.length) { el(prefix+'-search-result').innerHTML='<div class="alert alert-warn">검색 결과 없음</div>'; return; }
  el(prefix+'-search-result').innerHTML = matched.map(o=>buildTrackerCard(o,ps)).join('');
}
function clearSearch(prefix) { el(prefix+'-search').value=''; el(prefix+'-search-result').innerHTML=''; }

function buildTrackerCard(o, ps) {
  const pcode=ordCodes(o,ps).join(', ')||'-';
  const events=S.events().filter(e=>e.orderNo===o.no).sort((a,b)=>a.time.localeCompare(b.time));
  const stMap={'대기':'s-ready','패킹완료':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done','지연':'s-delay'};
  const TI2={truck:'🚛',air:'✈️',sea:'🚢'};
  const hhmm=t=>t?String(t).slice(5,16).replace('-','/'):'';

  let trackerHtml='';
  if (o.route) {
    const {origin, waypoints, destination}=o.route;
    const wps=(waypoints||[]);
    const allHubs=[origin,...wps.map(w=>typeof w==='string'?w:w.name),destination].filter(Boolean);
    const passedSet=new Set();
    events.forEach(e=>{
      if (e.event==='OUT'&&e.hub===origin) passedSet.add(origin);
      if (e.event==='IN'||e.event==='도착완료') passedSet.add(e.hub);
    });
    let currentIdx=-1;
    for (let i=allHubs.length-1;i>=0;i--) { if (passedSet.has(allHubs[i])) { currentIdx=i; break; } }
    const currentHub=currentIdx>=0?allHubs[currentIdx]:null;
    const nextHub=(currentIdx>=0&&currentIdx<allHubs.length-1)?allHubs[currentIdx+1]:null;
    const finalDest=destination||allHubs[allHubs.length-1]||'-';
    const isAtDest=currentHub&&currentHub===destination;

    // 상단 요약 한 줄
    if (isAtDest) trackerHtml+=`<div class="trk-sum ok">✅ <b>배송 완료</b><span>${finalDest} 수령 확인</span></div>`;
    else if (currentHub) trackerHtml+=`<div class="trk-sum"><div><em>현재 위치</em><b>${currentHub}</b></div><div><em>다음 거점</em><b>${nextHub||'-'}</b></div><div><em>최종 도착지</em><b class="dst">${finalDest}</b></div></div>`;
    else trackerHtml+=`<div class="trk-sum wait"><div><em>현재 위치</em><b>출발 전</b></div><div><em>다음 거점</em><b>${allHubs[0]||'-'}</b></div><div><em>최종 도착지</em><b class="dst">${finalDest}</b></div></div>`;

    // 세로 단계
    trackerHtml+='<ol class="trk-steps">';
    allHubs.forEach((hub,i)=>{
      const passed=passedSet.has(hub), isCur=i===currentIdx&&!isAtDest;
      const cls=passed?'done':'pending';
      const emoji=i===0?'🏭':i===allHubs.length-1?'🏢':'📍';
      const lastEvt=events.filter(e=>e.hub===hub).slice(-1)[0];
      const stdT=i===0?(o.route.originStdTime||''):(wps[i-1]?.stdTime||'');
      const tm=lastEvt?`${hhmm(lastEvt.time)} ${lastEvt.event}`:(stdT?`표준 ${stdT}분`:'');
      trackerHtml+=`<li class="trk-step ${cls}${isCur?' cur':''}"><span class="trk-dot">${emoji}</span>
        <span class="trk-hub">${hub}</span><span class="trk-tm">${tm}</span></li>`;
      if (i<allHubs.length-1) {
        const wpObj=wps[i]||{};
        const st=i===0?o.route.originStdTime:(typeof wpObj==='object'?wpObj.stdTime:'');
        const wt=typeof wpObj==='object'?wpObj.transport:'';
        const wno=typeof wpObj==='object'?wpObj.transportNo:'';
        const tLabel=wt?(TI2[wt]||'')+(wno?` ${wno}`:''):'';
        const lbl=[tLabel, st?`⏱ ${st}분`:''].filter(Boolean).join('  ·  ');
        const wdc=typeof wpObj==='object'?wpObj.destChange:'';
        const seg=passed&&passedSet.has(allHubs[i+1])?'done':'';
        trackerHtml+=`<li class="trk-leg ${seg}"><span class="trk-line"></span><span class="trk-leg-t">${lbl}${wdc?`<span class="trk-chg">🔀 도착지변경 → ${wdc}</span>`:''}</span></li>`;
      }
    });
    trackerHtml+='</ol>';
  }

  const lastEvt=events.slice(-1)[0];
  return `<div class="tracker-card">
    <div class="trk-head">
      <div class="trk-no">${o.no}<span class="status ${stMap[o.status]||'s-ready'}">${o.status}</span></div>
      <div class="trk-meta">
        <span><em>고객사</em>${o.customer}</span>
        <span><em>제품</em>${ordText(o)} (${pcode})</span>
        <span><em>수량</em>${ordQty(o)}</span>
        <span><em>출하일</em>${o.date}</span>
        ${lastEvt?`<span><em>최근</em>${lastEvt.hub} ${lastEvt.event} ${hhmm(lastEvt.time)}</span>`:''}
      </div>
    </div>
    ${trackerHtml||'<div style="color:var(--gray);font-size:14.5px">경로 정보 없음</div>'}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════

// ─── UTILS ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function v(id) { const e=document.getElementById(id); return e?e.value.trim():''; }
function el(id) { return document.getElementById(id); }
function now() {
  const d=new Date(), pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localDT() {
  const d=new Date(), pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function normTime(raw) { return raw?raw.replace('T',' '):now(); }
function fillSel(id, opts) {
  const e=document.getElementById(id); if(!e) return;
  const cur=e.value;
  e.innerHTML='<option value="">-- 선택 --</option>'+opts.map(o=>`<option value="${o.v}"${o.v===cur?' selected':''}>${o.l}</option>`).join('');
}

// ══════════════════════════════════════════════════════════════════

// ─── SAMPLE DATA ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
function initSampleData() {
  DB.customers = [
    {code:'C001', name:'Samsung Electronics', manager:'김철수', phone:'031-200-1234', addr:'수원시 영통구 삼성로 129', confirm:'서명+사진'},
    {code:'C002', name:'LG Display', manager:'이영희', phone:'031-680-5678', addr:'파주시 월롱면 LG로 245', confirm:'QR스캔'},
    {code:'C003', name:'SK Hynix', manager:'박민준', phone:'031-5185-4321', addr:'이천시 부발읍 SK하이닉스로 26', confirm:'서명'},
  ];
  DB.products = [
    {code:'P001', name:'OLED Module A타입', box:'50x40x30cm', qty:10, weight:8.5},
    {code:'P002', name:'LCD Panel B타입',   box:'60x45x25cm', qty:6,  weight:12.0},
    {code:'P003', name:'Camera Module C타입',box:'30x25x20cm', qty:20, weight:3.2},
  ];
  DB.vehicles = [
    {no:'경기 4521가', type:'2.5톤 윙바디', cap:2500, driver:'홍길동', dphone:'010-1234-5678', status:'대기'},
    {no:'인천 3847나', type:'1톤 탑차',     cap:1000, driver:'김영수', dphone:'010-9876-5432', status:'대기'},
    {no:'서울 9012다', type:'5톤 냉동차',   cap:5000, driver:'이재훈', dphone:'010-5555-7777', status:'대기'},
  ];
  DB.hubs = [
    {code:'HUB-W01', name:'자사물류창고 (화성)',      type:'출발(자사창고)', addr:'경기도 화성시 서신면 공업단지로 100', mgr:'창고팀장'},
    // ── 국내 물류거점
    {code:'HUB-T01', name:'수도권물류센터 (용인)',     type:'경유지', addr:'경기도 용인시 처인구 물류단지길 50', mgr:'물류담당'},
    {code:'HUB-T02', name:'안성허브터미널',            type:'경유지', addr:'경기도 안성시 공도읍 공단로 120', mgr:'터미널장'},
    {code:'HUB-T03', name:'인천항 CY 창고',           type:'경유지', addr:'인천시 연수구 인천신항대로 600', mgr:'CY담당'},
    {code:'HUB-T04', name:'수원 중간집하장',           type:'경유지', addr:'경기도 수원시 팔달구 팔달로 180', mgr:'집하장담당'},
    {code:'HUB-T05', name:'파주 물류단지',             type:'경유지', addr:'경기도 파주시 탄현면 물류단지로 30', mgr:'단지관리'},
    // ── 한국 공항
    {code:'HUB-AIR-KR01', name:'인천국제공항 (ICN)', type:'경유지', addr:'인천시 중구 공항로 272', mgr:'항공화물팀'},
    {code:'HUB-AIR-KR02', name:'김해국제공항 (PUS)', type:'경유지', addr:'부산시 강서구 공항진입로 108', mgr:'항공화물팀'},
    // ── 미국 공항
    {code:'HUB-AIR-US01', name:'LA국제공항 (LAX)',   type:'경유지', addr:'1 World Way, Los Angeles, CA 90045', mgr:'Cargo Team'},
    {code:'HUB-AIR-US02', name:'JFK국제공항 (JFK)',  type:'경유지', addr:'Jamaica, Queens, New York, NY 11430', mgr:'Cargo Team'},
    // ── 멕시코 공항
    {code:'HUB-AIR-MX01', name:'멕시코시티국제공항 (MEX)', type:'경유지', addr:'Ciudad de Mexico, CDMX, Mexico', mgr:'Cargo Team'},
    {code:'HUB-AIR-MX02', name:'몬테레이국제공항 (MTY)',   type:'경유지', addr:'Apodaca, Nuevo Leon, Mexico', mgr:'Cargo Team'},
    // ── 한국 항구
    {code:'HUB-PORT-KR01', name:'부산항 (Busan Port)',        type:'경유지', addr:'부산시 중구 중앙대로 89', mgr:'항만물류팀'},
    {code:'HUB-PORT-KR02', name:'평택항 (Pyeongtaek Port)',   type:'경유지', addr:'경기도 평택시 포승읍 평택항로 97', mgr:'항만물류팀'},
    // ── 미국 항구
    {code:'HUB-PORT-US01', name:'LA항 (Port of Los Angeles)',    type:'경유지', addr:'425 S Palos Verdes St, San Pedro, CA 90731', mgr:'Cargo Team'},
    {code:'HUB-PORT-US02', name:'롱비치항 (Port of Long Beach)', type:'경유지', addr:'415 W Ocean Blvd, Long Beach, CA 90802', mgr:'Cargo Team'},
    // ── 도착 거점
    {code:'HUB-D01', name:'Samsung Electronics 수원', type:'도착(고객사)', addr:'수원시 영통구 삼성로 129', mgr:'자재입고담당'},
    {code:'HUB-D02', name:'LG Display 파주공장',      type:'도착(고객사)', addr:'파주시 월롱면 LG로 245', mgr:'입고팀'},
    {code:'HUB-D03', name:'SK Hynix 이천캠퍼스',      type:'도착(고객사)', addr:'이천시 부발읍 SK하이닉스로 26', mgr:'자재수령팀'},
  ];

  DB.orders = [
    {no:'ORD-260420-001', date:'2026-04-20', customer:'Samsung Electronics', product:'OLED Module A타입',
     boxes:5, note:'취급주의', status:'운송중', created:'2026-04-20 08:00',
     route:{origin:'자사물류창고 (화성)', originStdTime:'30',
            waypoints:[{name:'수도권물류센터 (용인)', stdTime:'45', transport:'truck', transportNo:'경기 4521가', destChange:''},
                       {name:'인천국제공항 (ICN)', stdTime:'60', transport:'air', transportNo:'KE001', destChange:''}],
            destination:'Samsung Electronics 수원'}},
    {no:'ORD-260420-002', date:'2026-04-20', customer:'LG Display', product:'LCD Panel B타입',
     boxes:3, note:'', status:'배차완료', created:'2026-04-20 09:00',
     route:{origin:'자사물류창고 (화성)', originStdTime:'25',
            waypoints:[{name:'안성허브터미널', stdTime:'30', transport:'truck', transportNo:'인천 3847나', destChange:''}],
            destination:'LG Display 파주공장'}},
    {no:'ORD-260419-001', date:'2026-04-19', customer:'SK Hynix', product:'Camera Module C타입',
     boxes:8, note:'', status:'도착완료', created:'2026-04-19 07:00',
     route:{origin:'자사물류창고 (화성)', originStdTime:'20',
            waypoints:[{name:'수원 중간집하장', stdTime:'35', transport:'truck', transportNo:'서울 9012다', destChange:''}],
            destination:'SK Hynix 이천캠퍼스'}},
  ];
  DB.events = [
    {time:'2026-04-20 08:30', orderNo:'ORD-260420-001', customer:'Samsung Electronics', hub:'자사물류창고 (화성)', event:'OUT', person:'창고담당', note:'차량 출발'},
    {time:'2026-04-20 09:20', orderNo:'ORD-260420-001', customer:'Samsung Electronics', hub:'수도권물류센터 (용인)', event:'IN', person:'물류담당', note:''},
    {time:'2026-04-20 10:10', orderNo:'ORD-260420-001', customer:'Samsung Electronics', hub:'수도권물류센터 (용인)', event:'OUT', person:'물류담당', note:'환적 완료'},
    {time:'2026-04-20 08:35', orderNo:'ORD-260420-002', customer:'LG Display', hub:'자사물류창고 (화성)', event:'OUT', person:'창고담당', note:''},
    {time:'2026-04-19 07:30', orderNo:'ORD-260419-001', customer:'SK Hynix', hub:'자사물류창고 (화성)', event:'OUT', person:'창고담당', note:''},
    {time:'2026-04-19 08:05', orderNo:'ORD-260419-001', customer:'SK Hynix', hub:'수원 중간집하장', event:'IN', person:'집하장담당', note:''},
    {time:'2026-04-19 08:50', orderNo:'ORD-260419-001', customer:'SK Hynix', hub:'수원 중간집하장', event:'OUT', person:'집하장담당', note:''},
    {time:'2026-04-19 09:40', orderNo:'ORD-260419-001', customer:'SK Hynix', hub:'SK Hynix 이천캠퍼스', event:'도착완료', person:'박민준', note:'[서명] 인수확인'},
  ];

}

// ══════════════════════════════════════════════════════════════════

// ─── 기본 거점 자동 보완 (업데이트 시 누락 거점 추가) ───────────
// ══════════════════════════════════════════════════════════════════
const DEFAULT_NEW_HUBS = [
  {code:'HUB-AIR-KR01', name:'인천국제공항 (ICN)', type:'경유지', addr:'인천시 중구 공항로 272', mgr:'항공화물팀'},
  {code:'HUB-AIR-KR02', name:'김해국제공항 (PUS)', type:'경유지', addr:'부산시 강서구 공항진입로 108', mgr:'항공화물팀'},
  {code:'HUB-AIR-US01', name:'LA국제공항 (LAX)',   type:'경유지', addr:'1 World Way, Los Angeles, CA 90045', mgr:'Cargo Team'},
  {code:'HUB-AIR-US02', name:'JFK국제공항 (JFK)',  type:'경유지', addr:'Jamaica, Queens, New York, NY 11430', mgr:'Cargo Team'},
  {code:'HUB-AIR-MX01', name:'멕시코시티국제공항 (MEX)', type:'경유지', addr:'Ciudad de Mexico, CDMX, Mexico', mgr:'Cargo Team'},
  {code:'HUB-AIR-MX02', name:'몬테레이국제공항 (MTY)',   type:'경유지', addr:'Apodaca, Nuevo Leon, Mexico', mgr:'Cargo Team'},
  {code:'HUB-PORT-KR01', name:'부산항 (Busan Port)',        type:'경유지', addr:'부산시 중구 중앙대로 89', mgr:'항만물류팀'},
  {code:'HUB-PORT-KR02', name:'평택항 (Pyeongtaek Port)',   type:'경유지', addr:'경기도 평택시 포승읍 평택항로 97', mgr:'항만물류팀'},
  {code:'HUB-PORT-US01', name:'LA항 (Port of Los Angeles)',    type:'경유지', addr:'425 S Palos Verdes St, San Pedro, CA 90731', mgr:'Cargo Team'},
  {code:'HUB-PORT-US02', name:'롱비치항 (Port of Long Beach)', type:'경유지', addr:'415 W Ocean Blvd, Long Beach, CA 90802', mgr:'Cargo Team'},
];

// 로드 후 기존 데이터에 누락 거점 자동 추가
// ─── 거점 좌표(위도·경도) 기본값 — 위치추적 지도용 ─────────────
const HUB_GEO = {
  '자사물류창고 (화성)':[37.1995,126.8312], '수도권물류센터 (용인)':[37.2411,127.1776], '안성허브터미널':[37.0078,127.2797],
  '인천항 CY 창고':[37.4563,126.6053], '수원 중간집하장':[37.2636,127.0286], '파주 물류단지':[37.7600,126.7800],
  '인천국제공항 (ICN)':[37.4602,126.4407], '김해국제공항 (PUS)':[35.1795,128.9382], 'LA국제공항 (LAX)':[33.9416,-118.4085],
  'JFK국제공항 (JFK)':[40.6413,-73.7781], '멕시코시티국제공항 (MEX)':[19.4361,-99.0719], '몬테레이국제공항 (MTY)':[25.7785,-100.1069],
  '부산항 (Busan Port)':[35.1028,129.0403], '평택항 (Pyeongtaek Port)':[36.9667,126.8333], 'LA항 (Port of Los Angeles)':[33.7290,-118.2620],
  '롱비치항 (Port of Long Beach)':[33.7540,-118.2160], 'Samsung Electronics 수원':[37.2565,127.0560], 'LG Display 파주공장':[37.7633,126.7439],
  'SK Hynix 이천캠퍼스':[37.2764,127.4437]
};
function ensureHubGeo() {
  const hubs = S.hubs(); let ch = 0;
  hubs.forEach(h => { if ((h.lat == null || h.lat === '' || h.lng == null || h.lng === '') && HUB_GEO[h.name]) { h.lat = HUB_GEO[h.name][0]; h.lng = HUB_GEO[h.name][1]; ch++; } });
  if (ch) S.set('hubs', hubs);
}

function ensureDefaultHubs() {
  // 구버전 상태명 이전: '패킹중'은 Packing 완료 시점에만 부여되던 값이므로 '패킹완료'로 통일
  (DB.orders||[]).forEach(o => { if (o.status === '패킹중') o.status = '패킹완료'; });
  const hubs = S.hubs();
  const existCodes = new Set(hubs.map(h => h.code));
  const toAdd = DEFAULT_NEW_HUBS.filter(h => !existCodes.has(h.code));
  if (toAdd.length > 0) {
    // 도착(고객사) 거점들 앞에 삽입 (경유지이므로)
    const destIdx = hubs.findIndex(h => h.type === '도착(고객사)');
    if (destIdx >= 0) {
      hubs.splice(destIdx, 0, ...toAdd);
    } else {
      hubs.push(...toAdd);
    }
    S.set('hubs', hubs);
    console.log(`✅ 기본 거점 ${toAdd.length}개 자동 추가:`, toAdd.map(h=>h.name).join(', '));
  }
  ensureHubGeo();
}

// ══════════════════════════════════════════════════════════════════

// ─── INIT ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
async function lmtsInit() {
  await loadFromGitHub();
  if (typeof window.lmtsReady === 'function') {
    window.lmtsReady();
  } else {
    setTimeout(() => {
      if (typeof window.lmtsReady === 'function') window.lmtsReady();
    }, 50);
  }
}
// 모든 스크립트 파싱 완료 후 실행 (Race condition 방지)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', lmtsInit);
} else {
  setTimeout(lmtsInit, 0);
}


// ── 표 숫자열 자동 정렬: 숫자만 들어 있는 열은 머리글·셀 모두 우측 정렬 ──────────────
(function(){
  const NUM = /^-?[\d,]+(\.\d+)?\s*(kg|g|%|분|건|개|곳|h|EA|ea)?$/;
  function align(root){
    (root||document).querySelectorAll('table').forEach(t=>{
      if (t.closest('.cal')) return;
      const rows=[...t.tBodies].flatMap(b=>[...b.rows]); if(!rows.length) return;
      if (rows.some(r=>[...r.cells].some(c=>c.colSpan>1))) return;
      const n=Math.max(...rows.map(r=>r.cells.length));
      for(let i=0;i<n;i++){
        let num=0, bad=0;
        rows.forEach(r=>{ const c=r.cells[i]; if(!c) return; const x=c.textContent.trim(); if(!x||x==='-') return; (NUM.test(x)&&!c.querySelector('button,input,select,a'))?num++:bad++; });
        const on = num>0 && bad===0;
        rows.forEach(r=>{ const c=r.cells[i]; if(c) c.classList.toggle('num-col',on); });
        if(t.tHead) [...t.tHead.rows].forEach(r=>{ const c=r.cells[i]; if(c) c.classList.toggle('num-col',on); });
      }
    });
  }
  let tm=null; const run=()=>{ clearTimeout(tm); tm=setTimeout(()=>align(),60); };
  document.addEventListener('DOMContentLoaded',()=>{ run(); new MutationObserver(run).observe(document.body,{childList:true,subtree:true,characterData:true}); });
  window.alignNumCols=align;
})();


// ── 데이터 백업(JSON 다운로드) — 설정창(우상단 연결 상태 클릭)에 버튼 추가 ──
function downloadBackup(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'LMTS_backup_' + now().replace(/[: ]/g,'').replace(/-/g,'') + '.json'; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
document.addEventListener('DOMContentLoaded', ()=>{
  const m = document.querySelector('#token-modal .modal'); if (!m || m.querySelector('#bk-btn')) return;
  const d = document.createElement('div'); d.id = 'bk-box'; d.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px dashed #cbd5e1';
  d.innerHTML = '<div id="bk-row" style="display:flex;gap:8px;flex-wrap:wrap"><button id="bk-btn" class="btn btn-ghost btn-sm" onclick="downloadBackup()">💾 데이터 백업 받기 (JSON)</button></div><div style="font-size:13px;color:#6b7280;margin-top:8px">전체 데이터를 내 PC에 저장합니다. 정기적으로 보관하세요.</div>';
  m.appendChild(d);
});


// ── 배차 정합성: 오더 경로가 바뀌어 구간(출발·도착 거점)이 달라진 배차 기록은 무효 → 정리 ──
// 이미 통과한 구간(출발 OUT + 도착 IN 이벤트 존재)은 이력이므로 보존한다. orderNo를 주면 그 오더만 대상.
function cleanStaleDispatches(orderNo) {
  const orders = S.orders(), evs = S.events(), all = S.dispatches(), removed = [];
  const keep = all.filter(d => {
    if (orderNo && d.orderNo !== orderNo) return true;
    const o = orders.find(x => x.no === d.orderNo);
    let ok = false;
    if (o && o.route) {
      const hubs = [o.route.origin, ...(o.route.waypoints || []).map(w => typeof w === 'string' ? w : w.name), o.route.destination].filter(Boolean);
      ok = hubs[d.legIdx] === d.fromHub && hubs[d.legIdx + 1] === d.toHub;
    }
    if (ok) return true;
    const passed = evs.some(e => e.orderNo === d.orderNo && e.hub === d.fromHub && e.event === 'OUT') && evs.some(e => e.orderNo === d.orderNo && e.hub === d.toHub && (e.event === 'IN' || e.event === '도착완료'));
    if (passed) return true;
    removed.push(d); return false;
  });
  if (removed.length) S.set('dispatches', keep);
  return removed;
}


// ── 오더 상태 정합: 이벤트·배차·Packing 실적에 비해 상태가 뒤처진 오더를 올려 맞춤 (되돌림 없음) ──
// 우선순위: 도착완료 이벤트 > 거점 OUT 이벤트(운송중) > 배차 기록(배차완료) > Packing 기록(패킹완료)
function reconcileOrderStatus() {
  const RANK = {'대기':0, '패킹완료':1, '배차완료':2, '운송중':3, '지연':3, '도착완료':4};
  const orders = S.orders(), evs = S.events(), dps = S.dispatches(), pks = S.packings();
  let changed = 0;
  orders.forEach(o => {
    const my = evs.filter(e => e.orderNo === o.no);
    let want = null;
    if (my.some(e => e.event === '도착완료')) want = '도착완료';
    else if (my.some(e => e.event === 'OUT')) want = '운송중';
    else if (dps.some(d => d.orderNo === o.no)) want = '배차완료';
    else if (pks.some(p => p.orderNo === o.no)) want = '패킹완료';
    if (want && (RANK[want] > (RANK[o.status] ?? 0))) { o.status = want; changed++; }
  });
  if (changed) S.set('orders', orders);
  return changed;
}
