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
function dayCounts(ds) {
  return {
    inn: S.events().filter(e => e.time.startsWith(ds) && e.event === 'IN').length,
    out: S.events().filter(e => e.time.startsWith(ds) && e.event === 'OUT').length,
    ord: S.orders().filter(o => (o.date || '') === ds).length
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
        <div class="cn"><div class="a"><span>▲</span><span>${c.inn}</span></div><div class="b"><span>▼</span><span>${c.out}</span></div><div class="c"><span>■</span><span>${c.ord}</span></div></div></div>`;
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
  el('day-body').innerHTML = `<div class="pnl-h" style="border-radius:10px;margin-bottom:6px"><span>출하 예정 오더</span><span class="chip">${os.length}건</span></div>` +
    (os.length ? `<table class="dt"><thead><tr><th>오더</th><th>고객사</th><th class="num">박스</th><th>상태</th></tr></thead><tbody>${os.map(o => `<tr><td>${DC.esc(o.no)}</td><td>${DC.esc(o.customer)}</td><td class="num">${o.boxes}</td><td><span class="chip ${o.status === '지연' ? 'red' : ''}">${DC.esc(o.status)}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty-n">예정 오더 없음</div>') +
    `<div class="pnl-h" style="border-radius:10px;margin:10px 0 6px"><span>거점 IN/OUT 이벤트</span><span class="chip">${es.length}건</span></div>` +
    (es.length ? `<table class="dt"><thead><tr><th>시각</th><th>오더</th><th>거점</th><th>구분</th></tr></thead><tbody>${es.map(e => `<tr><td>${DC.hhmm(e.time)}</td><td>${DC.esc(e.orderNo)}</td><td>${DC.esc(DC.shortName(e.hub))}</td><td><span class="chip ${e.event === 'IN' ? 'blue' : 'red'}">${e.event}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty-n">이벤트 없음</div>');
}
function calMove(n) { const d = new Date(calY, calM + n, 1); calY = d.getFullYear(); calM = d.getMonth(); renderCal(); }
function calToday() { const d = DC.toDate(DC.anchorDate() + ' 00:00'); calY = d.getFullYear(); calM = d.getMonth(); selDay(DC.anchorDate()); }

function renderOps() {
  const K = DC.kpi(), n = s => K.stage.find(x => x[0] === s)[1], ac = DC.actions(), a = DC.anchorDate(), dc = dayCounts(a);
  el('kpis').innerHTML = [
    kbox('c6', '출하 대기', kv(n('대기'), '건'), '패킹 전', '상태가 대기인 오더', 'order.html'),
    kbox('c3', '패킹 중', kv(n('패킹중'), '건'), '박스 작업', '상태가 패킹중인 오더', 'packing.html'),
    kbox('c4', '배차 완료', kv(n('배차완료'), '건'), '출발 대기', '배차 지정 후 미출발 오더', 'dispatch.html'),
    kbox('c1', '운송 중', kv(n('운송중'), '건'), '거점 이동', '상태가 운송중인 오더', 'tracking.html'),
    kbox('c5', '지연', kv(n('지연'), '건', n('지연') > 0 ? 'bad' : ''), '즉시 조치', '상태가 지연인 오더'),
    kbox('c5', '비지정 이벤트', kv(K.off, '건', K.off > 0 ? 'bad' : ''), '확인 필요', '지정 경로 외 거점 이벤트 알람'),
    kbox('c2', '거점 체류', kv(K.inHub, '곳'), `전체 ${K.hubs}곳`, '진행 오더가 입고된 상태로 머무는 거점 수'),
    kbox('c1', '기준일 이벤트', kv(dc.inn + dc.out, '건'), `IN ${dc.inn} · OUT ${dc.out}`, `데이터 기준일 ${a}의 IN/OUT 합계`)
  ].join('');
  const ac2 = ac; el('act-n').textContent = ac2.length + '건';
  el('acts').innerHTML = ac2.length ? ac2.map(x => `<div class="al ${x.lv === 0 ? '' : x.lv === 1 ? 'warn' : 'info'}"><b>${DC.esc(x.t)}</b><p>사실: ${DC.esc(x.fact)}<br>원인 후보: ${DC.esc(x.cause)}<br><em>대안: ${DC.esc(x.act)}</em> · <a href="${x.go}">화면 이동</a></p></div>`).join('')
    : '<div class="empty-n">조치가 필요한 항목이 없습니다</div>';
  el('asof').textContent = `데이터 기준일 ${a}`;
  el('cover').innerHTML = `<b>데이터 확보 현황</b> · 연계: 출하오더·패킹·배차·거점이벤트·알람 · <b>연계 예정</b>: 운송비 · 차량 위치`;
  calToday();
}
window.lmtsReady = function () { initNav(); renderOps(); };
