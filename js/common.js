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
    // base64 → UTF-8 디코딩
    const binary = atob(file.content.replace(/\n/g, ''));
    const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)));
    const text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text);
  },

  // 데이터 파일 저장 (Create or Update)
  async save(dataObj) {
    if (this._saving) return;
    this._saving = true;
    setSyncStatus('sync', '저장 중...');
    try {
      // UTF-8 → base64 인코딩
      const json = JSON.stringify(dataObj, null, 2);
      const bytes = new TextEncoder().encode(json);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      const content = btoa(binary);

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
      if (res.status === 409) {
        // SHA 충돌 → SHA 다시 받아서 재시도
        await this._refreshSha();
        body.sha = this._sha;
        const res2 = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}`, {
          method: 'PUT', headers: this.headers(), body: JSON.stringify(body)
        });
        if (!res2.ok) throw new Error(`Save failed: ${res2.status}`);
        const r2 = await res2.json();
        this._sha = r2.content.sha;
      } else if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      } else {
        const r = await res.json();
        this._sha = r.content.sha;
      }
      setSyncStatus('ok', `저장완료 ${now().slice(11,16)}`);
    } catch(e) {
      setSyncStatus('err', `저장실패: ${e.message}`);
      console.error('GH save error:', e);
    } finally {
      this._saving = false;
    }
  },

  async _refreshSha() {
    const res = await fetch(`${this.API}/repos/${this.REPO}/contents/${this.DATA_PATH}`, {headers: this.headers()});
    if (res.ok) { const f = await res.json(); this._sha = f.sha; }
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
  orders:[], packings:[], dispatches:[], events:[], alarms:[],
  lastUpdated: ''
};

const S = {
  get: k => DB[k] || [],
  set(k, v) {
    DB[k] = v;
    DB.lastUpdated = now();
    GH.scheduleSave();  // GitHub에 자동 저장
    // localStorage에도 캐시 (오프라인 폴백)
    try { localStorage.setItem('lmts_' + k, JSON.stringify(v)); } catch(e) {}
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

function setSyncStatus(state, text) {
  const dot = el('gh-dot');
  const stText = el('gh-status-text');
  const bar = el('sync-bar');
  dot.className = 'status-dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'sync');
  stText.textContent = state === 'ok' ? 'GitHub 연결됨' : state === 'err' ? '저장 오류' : '동기화 중';
  if (bar) {
    bar.classList.remove('hidden');
    el('sync-bar-icon').textContent = state === 'ok' ? '✅' : state === 'err' ? '❌' : '💾';
    el('sync-bar-text').textContent = text;
    if (state === 'ok') setTimeout(() => bar.classList.add('hidden'), 3000);
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
  showOverlay('GitHub에서 데이터 불러오는 중...', `${GH.REPO} / ${GH.DATA_PATH}`);
  try {
    const data = await GH.load();
    if (data) {
      // GitHub 데이터로 DB 업데이트
      Object.keys(DB).forEach(k => { if (data[k] !== undefined) DB[k] = data[k]; });
      GH._connected = true;
      ensureDefaultHubs();  // 누락 거점 자동 보완
      setSyncStatus('ok', `데이터 로드 완료 (${now().slice(11,16)})`);
    } else {
      // 파일 없음 → 초기 샘플 데이터 푸시
      showOverlay('최초 실행: 초기 데이터를 GitHub에 저장 중...');
      initSampleData();
      await GH.save(DB);
      GH._connected = true;
    }
  } catch(e) {
    if (e.message === 'TOKEN_INVALID' || !GH.token()) {
      hideOverlay();
      setSyncStatus('err', '토큰 미설정');
      openTokenModal();
      // localStorage 캐시로 폴백
      loadFromLocalStorage();
      return;
    }
    // 기타 오류 → localStorage 폴백
    console.error('GitHub load error:', e);
    setSyncStatus('err', `로드 실패: ${e.message}`);
    loadFromLocalStorage();
  }
  hideOverlay();
  renderDashboard();
}

function loadFromLocalStorage() {
  // localStorage 캐시에서 데이터 로드 (오프라인 모드)
  const keys = ['customers','products','vehicles','hubs','orders','packings','dispatches','events','alarms'];
  keys.forEach(k => {
    const raw = localStorage.getItem('lmts_' + k);
    if (raw) { try { DB[k] = JSON.parse(raw); } catch(e) {} }
  });
  if (!DB.hubs.length) initSampleData();
}

// ══════════════════════════════════════════════════════════════════

// ── 네비게이션: 현재 페이지 active 표시 ─────────────────────────
function initNav() {
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
    const pcode=ps.find(p=>p.name===o.product)?.code||'';
    return o.no.toLowerCase().includes(q)||o.product.toLowerCase().includes(q)||pcode.toLowerCase().includes(q)||o.customer.toLowerCase().includes(q);
  });
  if (!matched.length) { el(prefix+'-search-result').innerHTML='<div class="alert alert-warn">검색 결과 없음</div>'; return; }
  el(prefix+'-search-result').innerHTML = matched.map(o=>buildTrackerCard(o,ps)).join('');
}
function clearSearch(prefix) { el(prefix+'-search').value=''; el(prefix+'-search-result').innerHTML=''; }

function buildTrackerCard(o, ps) {
  const pcode=ps.find(p=>p.name===o.product)?.code||'-';
  const events=S.events().filter(e=>e.orderNo===o.no).sort((a,b)=>a.time.localeCompare(b.time));
  const stMap={'대기':'s-ready','패킹중':'s-packing','배차완료':'s-dispatch','운송중':'s-moving','도착완료':'s-done','지연':'s-delay'};

  let trackerHtml='';
  if (o.route) {
    const {origin, waypoints, destination}=o.route;
    const allHubs=[origin,...(waypoints||[]).map(w=>typeof w==='string'?w:w.name),destination].filter(Boolean);
    const passedSet=new Set();
    events.forEach(e=>{
      if (e.event==='OUT'&&e.hub===origin) passedSet.add(origin);
      if (e.event==='IN'||e.event==='도착완료') passedSet.add(e.hub);
    });
    let currentIdx=-1;
    for (let i=allHubs.length-1;i>=0;i--) { if (passedSet.has(allHubs[i])) { currentIdx=i; break; } }

    trackerHtml=`<div style="overflow-x:auto;padding:4px 0"><div class="tracker-route">`;
    const TI2={truck:'🚛',air:'✈️',sea:'🚢'};
    allHubs.forEach((hub,i)=>{
      const passed=passedSet.has(hub), isActive=i===currentIdx;
      const cls=passed?'done':(isActive?'active':'pending');
      const emoji=i===0?'🏭':i===allHubs.length-1?'🏢':'📍';
      const lastEvt=events.filter(e=>e.hub===hub).slice(-1)[0];
      const stdT=i===0?(o.route.originStdTime||''):(o.route.waypoints?.[i-1]?.stdTime||'');
      const timeStr=lastEvt?lastEvt.time.slice(11,16):(stdT?`표준${stdT}분`:'');
      trackerHtml+=`<div class="tr-node">
        <div class="tr-dot ${cls}">${emoji}</div>
        <div class="tr-node-label" style="color:${passed?'var(--green)':isActive?'var(--accent)':'#999'}">${hub}</div>
        <div class="tr-node-time">${timeStr}</div></div>`;
      if (i<allHubs.length-1) {
        const nextPassed=passedSet.has(allHubs[i+1]);
        const fillPct=passed&&nextPassed?'100':passed?'50':'0';
        const wpObj=o.route.waypoints?.[i]||{};
        const st=i===0?o.route.originStdTime:(typeof wpObj==='object'?wpObj.stdTime:'');
        // 운송수단 정보
        const wt=typeof wpObj==='object'?wpObj.transport:'';
        const wno=typeof wpObj==='object'?wpObj.transportNo:'';
        const tLabel=wt?(TI2[wt]||'')+(wno?` ${wno}`:''):'';
        const connLabel=[st?`⏱${st}분`:'', tLabel].filter(Boolean).join(' ');
        trackerHtml+=`<div class="tr-conn"><div class="tr-conn-bg"></div>
          <div class="tr-conn-fill" style="width:${fillPct}%"></div>
          ${connLabel?`<div class="tr-conn-label">${connLabel}</div>`:''}</div>`;
        // 도착지 변경 표시
        const wdc=typeof wpObj==='object'?wpObj.destChange:'';
        if (wdc) {
          trackerHtml+=`</div></div><div style="display:flex;align-items:center;gap:4px;margin:2px 0 4px 4px;flex-shrink:0;">
            <span style="font-size:9px;background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;border-radius:8px;padding:1px 6px;font-weight:700;white-space:nowrap;">🔀 도착지변경→🏢 ${wdc}</span>
          </div><div class="tracker-route" style="margin:0;">`;
        }
      }
    });
    trackerHtml+=`</div></div>`;

    const currentHub=currentIdx>=0?allHubs[currentIdx]:null;
    const nextHub=(currentIdx>=0&&currentIdx<allHubs.length-1)?allHubs[currentIdx+1]:null;
    const finalDest=destination||allHubs[allHubs.length-1]||'-';
    if (currentHub) {
      const isAtDest=currentHub===destination;
      trackerHtml+=isAtDest
        ? `<div class="alert alert-success" style="margin-top:8px;margin-bottom:0">✅ <b>배송 완료</b> — 최종 도착지: <b>${finalDest}</b> 수령 확인됨</div>`
        : `<div class="alert alert-info" style="margin-top:8px;margin-bottom:0">🚛 <b>현재 위치:</b> ${currentHub} 통과 &nbsp;|&nbsp; <b>다음 거점:</b> ${nextHub||'?'} &nbsp;|&nbsp; 🏢 <b>최종 도착지:</b> <b style="color:#1565C0">${finalDest}</b></div>`;
    } else {
      trackerHtml+=`<div class="alert alert-warn" style="margin-top:8px;margin-bottom:0">⏳ 아직 출발 전 &nbsp;|&nbsp; 🏢 최종 도착지: <b>${finalDest}</b></div>`;
    }
  }

  const lastEvt=events.slice(-1)[0];
  return `<div class="tracker-card">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <div>
        <div style="font-size:15px;font-weight:800;color:var(--dk)">${o.no}</div>
        <div style="font-size:12px;color:var(--gray);margin-top:2px">고객사: <b>${o.customer}</b> &nbsp;|&nbsp; 제품: <b>${o.product}</b> (코드: ${pcode}) &nbsp;|&nbsp; ${o.boxes}박스 &nbsp;|&nbsp; ${o.date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="status ${stMap[o.status]||'s-ready'}">${o.status}</span>
        ${lastEvt?`<span style="font-size:11px;color:var(--gray)">최근: ${lastEvt.hub} ${lastEvt.event} ${lastEvt.time.slice(11,16)}</span>`:''}
      </div>
    </div>
    ${trackerHtml||'<div style="color:var(--gray);font-size:12px">경로 정보 없음</div>'}
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
function ensureDefaultHubs() {
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
}

// ══════════════════════════════════════════════════════════════════

// ─── INIT ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
async function lmtsInit() {
  await loadFromGitHub();
  if (typeof window.lmtsReady === 'function') window.lmtsReady();
}
lmtsInit();