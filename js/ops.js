// ══ LMTS ops.js — 운영관제 (일정·작업·알람) ══
let calY, calM, selD;
const KR_SOL = { '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일', '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절' };
const VN_SOL = { '01-01': 'Tết dương', '04-30': 'Giải phóng', '05-01': 'Lao động', '09-02': 'Quốc khánh' };
const _lf = new Intl.DateTimeFormat('ko-KR-u-ca-chinese', { month: 'numeric', day: 'numeric' });
function lunar(d) {                       // 음력 {m,d,leap}
  const p = Object.fromEntries(_lf.formatToParts(d).map(x => [x.type, x.value]));
  const m = parseInt(p.month, 10);
  return { m, d: parseInt(p.day, 10), leap: !/^\d+$/.test(p.month) };
}
function holidays(d) {                    // 참고용 휴일 라벨(고정 양력 + 음력 기반)
  const k = `${DC.pad(d.getMonth() + 1)}-${DC.pad(d.getDate())}`, out = [];
  if (KR_SOL[k]) out.push(KR_SOL[k]);
  if (VN_SOL[k]) out.push(VN_SOL[k]);
  const L = lunar(d); if (!L.leap) {
    const nx = lunar(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)), pv = lunar(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    if (L.m === 1 && L.d === 1) out.push('설날·Tết');
    else if (nx.m === 1 && nx.d === 1 && !nx.leap) out.push('설 연휴');
    else if (pv.m === 1 && pv.d === 1) out.push('설 연휴');
    else if (L.m === 1 && (L.d === 2 || L.d === 3)) out.push('Tết');
    if (L.m === 8 && L.d >= 14 && L.d <= 16) out.push(L.d === 15 ? '추석' : '추석 연휴');
    if (L.m === 4 && L.d === 8) out.push('석가탄신일');
    if (L.m === 3 && L.d === 10) out.push('Giỗ Tổ');
  }
  return out;
}
function originOut(o) { return S.events().filter(e => e.orderNo === o.no && e.event === 'OUT' && e.hub === (o.route && o.route.origin)).map(e => e.time).sort()[0] || null; }
function dayCounts(ds) {
  const ords = S.orders();
  return {
    inn: S.events().filter(e => e.time.startsWith(ds) && e.event === 'IN').length,
    out: ords.filter(o => { const t = originOut(o); return t && t.startsWith(ds); }).length,
    ord: ords.filter(o => (o.date || '') === ds).length
  };
}
function renderCal() {
  el('cal-ttl').textContent = `${calY}년 ${calM + 1}월`;
  const first = new Date(calY, calM, 1), start = new Date(calY, calM, 1 - first.getDay()), today = DC.dstr(new Date());
  let h = '<div></div>' + ['일', '월', '화', '수', '목', '금', '토'].map((n, i) => `<div class="dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${n}</div>`).join('');
  const rows = Math.ceil((first.getDay() + new Date(calY, calM + 1, 0).getDate()) / 7);
  for (let w = 0; w < rows; w++) {
    const wd = new Date(start); wd.setDate(start.getDate() + w * 7 + 3);
    const jan1 = new Date(wd.getFullYear(), 0, 1), wk = Math.ceil(((wd - jan1) / 864e5 + jan1.getDay() + 1) / 7);
    h += `<div class="wk">${wk}</div>`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + w * 7 + i); const ds = DC.dstr(d);
      const c = dayCounts(ds), hol = holidays(d), L = lunar(d), cur = d.getMonth() === calM;
      h += `<div class="day ${i === 0 || i === 6 ? 'we' : ''} ${cur ? '' : 'out'} ${ds === today ? 'today' : ''} ${ds === selD ? 'sel' : ''}" onclick="selDay('${ds}')">
        <div><div class="dn ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''} ${hol.length ? 'hol' : ''}"><b>${d.getDate()}</b><em>${L.leap ? '윤' : ''}${L.m}.${L.d}</em></div><div class="hn">${DC.esc(hol.join(' · '))}</div></div>
        <div class="cn"><div class="a" title="거점 IN 건수"><span>▲</span><span>${c.inn}</span></div><div class="b" title="출하 실적: 출발 거점에서 OUT된 오더 수(오더당 1회)"><span>▼</span><span>${c.out}</span></div><div class="c" title="출하 목표: 출하예정일이 그날인 오더 수"><span>■</span><span>${c.ord}</span></div></div></div>`;
    }
  }
  el('cal').style.gridTemplateRows = `auto repeat(${rows},minmax(0,1fr))`;
  el('cal').innerHTML = h;
}
function selDay(ds) {
  selD = ds; const d = DC.toDate(ds + ' 00:00');
  if (d.getMonth() !== calM || d.getFullYear() !== calY) { calY = d.getFullYear(); calM = d.getMonth(); }
  renderCal();
  el('day-ttl').textContent = `${ds} 작업 내역`;
  const os = S.orders().filter(o => (o.date || '') === ds), es = S.events().filter(e => e.time.startsWith(ds)).slice().sort((a, b) => a.time.localeCompare(b.time));
  el('day-body').innerHTML = `<div class="pnl-h" style="border-radius:10px;margin-bottom:6px"><span>출하 목표 ${os.length}건 중 출하 ${os.filter(o => originOut(o)).length}건 · 미출하 ${os.filter(o => !originOut(o)).length}건</span><span class="chip">${os.length}건</span></div>` +
    (os.length ? `<table class="dt"><thead><tr><th>오더</th><th>고객사</th><th class="num">수량</th><th>출하</th><th>상태</th></tr></thead><tbody>${os.map(o => `<tr><td>${DC.esc(o.no)}</td><td style="white-space:normal">${DC.esc(o.customer)}</td><td class="num">${ordQty(o)}</td><td>${originOut(o) ? '<span class="chip blue">' + DC.hhmm(originOut(o)) + '</span>' : '<span class="chip red">미출하</span>'}</td><td><span class="chip ${o.status === '지연' ? 'red' : ''}">${DC.esc(o.status)}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty-n">예정 오더 없음</div>') +
    `<div class="pnl-h" style="border-radius:10px;margin:10px 0 6px"><span>거점 IN/OUT 이벤트</span><span class="chip">${es.length}건</span></div>` +
    (es.length ? `<table class="dt"><thead><tr><th>시각</th><th>오더</th><th>거점</th><th>구분</th></tr></thead><tbody>${es.map(e => `<tr><td>${DC.hhmm(e.time)}</td><td>${DC.esc(e.orderNo)}</td><td>${DC.esc(DC.shortName(e.hub))}</td><td><span class="chip ${e.event === 'IN' ? 'blue' : 'red'}">${e.event}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty-n">이벤트 없음</div>');
}
function calMove(n) { const d = new Date(calY, calM + n, 1); calY = d.getFullYear(); calM = d.getMonth(); renderCal(); }
function calNow() { const d = new Date(); calY = d.getFullYear(); calM = d.getMonth(); selDay(DC.dstr(d)); }
function calToday() { const d = DC.toDate(DC.anchorDate() + ' 00:00'); calY = d.getFullYear(); calM = d.getMonth(); selDay(DC.anchorDate()); }

function renderOps() {
  const K = DC.kpi(), n = s => K.stage.find(x => x[0] === s)[1], ac = DC.actions(), a = DC.anchorDate(), dc = dayCounts(a);
  el('kpis').innerHTML = [
    kbox('c6', '출하 대기', kv(n('대기'), '건'), '패킹 전', '상태가 대기인 오더', 'js:openOpsKpi(\'wait\')'),
    kbox('c3', '패킹 완료', kv(n('패킹완료'), '건'), '배차 대기', '상태가 패킹완료인 오더', 'js:openOpsKpi(\'pack\')'),
    kbox('c4', '배차 완료', kv(n('배차완료'), '건'), '출발 대기', '배차 지정 후 미출발 오더', 'js:openOpsKpi(\'disp\')'),
    kbox('c1', '운송 중', kv(DC.moving().length, '건'), '거점 이동', '거점 OUT 후 다음 거점 IN 전 오더', 'js:openOpsKpi(\'mv\')'),
    kbox('c5', '지연', kv(n('지연'), '건', n('지연') > 0 ? 'bad' : ''), '즉시 조치', '상태가 지연인 오더', 'js:openOpsKpi(\'delay\')'),
    kbox('c5', '비지정 이벤트', kv(K.off, '건', K.off > 0 ? 'bad' : ''), '확인 필요', '지정 경로 외 거점 이벤트 알람', 'js:openOpsKpi(\'off\')'),
    kbox('c2', '거점 체류', kv(K.inHub, '곳'), `전체 ${K.hubs}곳`, '진행 오더가 입고된 상태로 머무는 거점 수', 'js:openOpsKpi(\'hub\')'),
    kbox('c1', '기준일 이벤트', kv(dc.inn + dc.out, '건'), `IN ${dc.inn} · OUT ${dc.out}`, `데이터 기준일 ${a}의 IN/OUT 합계`, 'js:openOpsKpi(\'ev\')')
  ].join('');
  const ac2 = ac; el('act-n').textContent = ac2.length + '건';
  el('acts').innerHTML = ac2.length ? ac2.map(x => `<div class="al ${x.lv === 0 ? '' : x.lv === 1 ? 'warn' : 'info'}"><b>${DC.esc(x.t)}</b><p>사실: ${DC.esc(x.fact)}<br>원인 후보: ${DC.esc(x.cause)}<br><em>대안: ${DC.esc(x.act)}</em> · <a href="${x.go}">화면 이동</a></p></div>`).join('')
    : '<div class="empty-n">조치가 필요한 항목이 없습니다</div>';
  el('asof').textContent = `데이터 기준일 ${a}`;
  el('cover').innerHTML = `<b>데이터 확보 현황</b> · 연계: 출하오더·패킹·배차·거점이벤트·알람 · <b>연계 예정</b>: 운송비 · 차량 위치`;
  calToday();
}
// ── KPI 클릭 → 해당 목록 보조창 ────────────────────────────
function openPop(title, sub, html, go, goLabel) {
  el('kpi-pop-ttl').textContent = title; el('kpi-pop-sub').innerHTML = sub || '';
  el('kpi-pop-body').innerHTML = html;
  el('kpi-pop-go').innerHTML = `<span class="pop-hint">제목줄을 끌어 이동 · 우측 아래 모서리를 끌어 크기 조절</span>` + (go ? `<a class="btn btn-primary" href="${go}">${goLabel} 열기 ›</a>` : '');
  el('kpi-pop').classList.remove('hidden');
}
function closePop() { el('kpi-pop').classList.add('hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
function openOpsKpi(k) {
  const O = S.orders(), E = DC.esc;
  const tb = (heads, rows) => rows.length ? `<table class="dt"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty-n">해당 내역이 없습니다</div>';
  const st = o => `<span class="chip ${o.status === '지연' ? 'red' : o.status === '도착완료' ? 'grn' : 'blue'}">${E(o.status)}</span>`;
  const base = o => [`<b>${E(o.no)}</b>`, E(o.customer), E(ordText(o)), E(o.date || '-')];
  const legN = o => Math.max(0, DC.nodes(o).length - 1);
  const dpN = o => new Set(S.dispatches().filter(d => d.orderNo === o.no).map(d => d.legIdx)).size;
  const where = o => { const p = DC.position(o); return p.last ? `${E(DC.shortName(p.last.hub))} ${p.last.event} ${p.last.time.slice(5, 16)}` : '이벤트 없음'; };
  const by = s => O.filter(o => o.status === s);
  if (k === 'wait') { const L = by('대기'); openPop('출하 대기 상세', `상태가 <b>대기</b>(Packing 전)인 오더 <b>${L.length}</b>건`, tb(['오더', '고객사', '제품·수량', '출하예정일', '상태'], L.map(o => [...base(o), st(o)])), 'packing.html', '입고Packing'); }
  else if (k === 'pack') { const L = by('패킹완료'); openPop('패킹 완료 상세', `Packing이 끝나고 <b>배차를 기다리는</b> 오더 <b>${L.length}</b>건`, tb(['오더', '고객사', '제품·수량', '출하예정일', 'Packing 완료', '배차 진행'], L.map(o => { const p = S.packings().filter(x => x.orderNo === o.no).pop(); return [...base(o), p ? E(p.doneAt) : '-', `${dpN(o)}/${legN(o)}구간`]; })), 'dispatch.html', '차량배차'); }
  else if (k === 'disp') { const L = by('배차완료'); openPop('배차 완료 상세', `배차를 지정했고 <b>출발을 기다리는</b> 오더 <b>${L.length}</b>건`, tb(['오더', '고객사', '제품·수량', '출하예정일', '배차 진행', '첫 구간 출발예정'], L.map(o => { const d = S.dispatches().find(x => x.orderNo === o.no && x.legIdx === 0); return [...base(o), `${dpN(o)}/${legN(o)}구간`, d && d.departPlan ? E(d.departPlan.replace('T', ' ')) : '-']; })), 'dispatch.html', '차량배차'); }
  else if (k === 'mv') { const mv = DC.moving().map(m=>m.o.no), L = S.orders().filter(o=>mv.includes(o.no)); openPop('운송 중 상세', `거점 OUT 후 다음 거점 IN 전 오더 <b>${L.length}</b>건 · 현재 위치는 마지막 거점 이벤트 기준`, tb(['오더', '고객사', '제품·수량', '출하예정일', '현재 위치(마지막 이벤트)', '지도'], L.map(o => [...base(o), where(o), `<a href="map.html?order=${encodeURIComponent(o.no)}">🗺️ 위치추적</a>`])), 'map.html', '위치추적'); }
  else if (k === 'delay') {
    const L = by('지연'), ac = DC.actions().filter(a => /표준시간 초과/.test(a.t));
    openPop('지연 상세', `상태가 <b>지연</b>인 오더 <b>${L.length}</b>건 · 아래에 표준시간 초과 알람 <b>${ac.length}</b>건`,
      tb(['오더', '고객사', '제품·수량', '출하예정일', '현재 위치'], L.map(o => [...base(o), where(o)])) +
      (ac.length ? `<div class="pop-sub" style="margin-top:10px"><b>표준시간 초과 알람</b></div>` + tb(['알람', '사실', '대안'], ac.map(a => [E(a.t), E(a.fact), E(a.act)])) : ''), 'tracking.html', '거점In/Out');
  }
  else if (k === 'off') { const L = S.alarms().filter(a => a.type === 'OFF_ROUTE'); openPop('비지정 이벤트 상세', `오더의 지정 경로에 없는 거점에서 등록된 이벤트 <b>${L.length}</b>건`, tb(['시각', '오더', '거점', '구분', '조치'], L.map(a => [DC.hhmm(a.time), `<b>${E(a.orderNo)}</b>`, E(a.hub), `<span class="chip red">${E(a.event)}</span>`, '경로 변경 또는 이벤트 정정'])), 'order.html', '출하오더'); }
  else if (k === 'hub') {
    const rows = []; O.filter(o => o.status !== '도착완료').forEach(o => { const p = DC.position(o); if (p.state === 'at') rows.push([E(DC.shortName(p.last.hub)), `<b>${E(o.no)}</b>`, E(o.customer), E(DC.hhmm(p.last.time) + ' (' + p.last.time.slice(5, 10) + ')')]); });
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    openPop('거점 체류 상세', `진행 오더가 <b>입고(IN)된 채 머무는</b> 거점 · 오더 <b>${rows.length}</b>건`, tb(['거점', '오더', '고객사', '입고 시각'], rows), 'tracking.html', '거점In/Out');
  }
  else if (k === 'ev') { const a = DC.anchorDate(), L = S.events().filter(e => e.time.startsWith(a)).slice().sort((x, y) => x.time.localeCompare(y.time)); openPop('기준일 이벤트 상세', `데이터 기준일 <b>${a}</b>의 거점 IN/OUT 이벤트 <b>${L.length}</b>건`, tb(['시각', '오더', '고객사', '거점', '구분', '처리자'], L.map(e => [DC.hhmm(e.time), `<b>${E(e.orderNo)}</b>`, E(e.customer || ''), E(DC.shortName(e.hub)), `<span class="chip ${e.event === 'IN' ? 'blue' : 'red'}">${E(e.event)}</span>`, E(e.person || '-')])), 'tracking.html', '거점In/Out'); }
}
window.lmtsReady = function () { initNav(); renderOps(); };
