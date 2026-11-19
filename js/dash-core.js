// ══ LMTS dash-core.js — 대시보드 공통 계산 모듈 (Single Source of Truth) ══
// 모든 대시보드 화면은 이 모듈(DC)에서 산출한 값만 사용한다.
const DC = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const toDate = t => { if (!t) return null; const d = new Date(String(t).replace(' ', 'T')); return isNaN(d) ? null : d; };
  const mins = (a, b) => Math.round((b - a) / 60000);
  const pct = (n, d) => d > 0 ? Math.round(n / d * 1000) / 10 : null;      // % → 소수점 1자리
  const fmtPct = v => v == null ? null : v.toFixed(1);
  const hhmm = t => (t || '').slice(11, 16);
  const shortName = n => String(n || '-').replace(/\s*\(.*?\)\s*/g, '').trim() || String(n);

  const nodes = o => o && o.route ? [o.route.origin, ...(o.route.waypoints || []).map(w => w.name), o.route.destination] : [];
  const stds = o => {
    if (!o || !o.route) return [];
    const v = x => (x === '' || x == null || isNaN(+x)) ? null : +x;
    return [v(o.route.originStdTime), ...(o.route.waypoints || []).map(w => v(w.stdTime))];
  };
  const evsOf = o => S.events().filter(e => e.orderNo === o.no).slice().sort((a, b) => a.time.localeCompare(b.time));

  // 현재 위치: {idx, state:'at'|'out'|'none'|'off', last}
  function position(o) {
    const ns = nodes(o), ev = evsOf(o);
    if (!ev.length) return { idx: -1, state: 'none', last: null, ev };
    const last = ev[ev.length - 1], idx = ns.indexOf(last.hub);
    if (idx < 0) return { idx: -1, state: 'off', last, ev };
    return { idx, state: last.event === 'IN' ? 'at' : 'out', last, ev };
  }

  // 구간 실적: OUT(출발거점) → IN(다음거점) 소요(분) vs 표준시간
  function legs(o) {
    const ns = nodes(o), sd = stds(o), ev = evsOf(o), res = [];
    for (let i = 0; i < ns.length - 1; i++) {
      const outs = ev.filter(e => e.hub === ns[i] && e.event === 'OUT');
      if (!outs.length) { res.push({ i, from: ns[i], to: ns[i+1], std: sd[i] ?? null, act: null }); continue; }
      const tOut = outs[outs.length - 1].time;
      const inn = ev.find(e => e.hub === ns[i+1] && e.event === 'IN' && e.time >= tOut);
      const act = inn ? mins(toDate(tOut), toDate(inn.time)) : null;
      res.push({ i, from: ns[i], to: ns[i+1], std: sd[i] ?? null, act, over: (act != null && sd[i] != null) ? act > sd[i] : null });
    }
    return res;
  }

  function dispatchDone(o) {
    const need = Math.max(0, nodes(o).length - 1);
    const got = new Set(S.dispatches().filter(d => d.orderNo === o.no && d.legIdx != null).map(d => d.legIdx)).size;
    return need > 0 && got >= need;
  }

  // ── KPI 일괄 산출 ──────────────────────────────────────────
  function kpi() {
    const O = S.orders(), E = S.events(), P = S.packings(), A = S.alarms(), H = S.hubs();
    const active = O.filter(o => o.status !== '도착완료');
    const done = O.filter(o => o.status === '도착완료').length;
    const delay = O.filter(o => o.status === '지연').length;
    const off = A.filter(a => a.type === 'OFF_ROUTE').length;
    const allLegs = O.flatMap(o => legs(o));
    const meas = allLegs.filter(l => l.act != null);
    const measStd = meas.filter(l => l.std != null);
    const inHub = new Set();
    O.filter(o => o.status !== '도착완료').forEach(o => { const p = position(o); if (p.state === 'at') inHub.add(p.last.hub); });
    const packed = O.filter(o => P.some(p => p.orderNo === o.no)).length;
    const dispatched = O.filter(o => dispatchDone(o)).length;
    // 패킹 미완료: 진행 오더 중 패킹 기록이 없는 오더
    const packPend = active.filter(o => !P.some(p => p.orderNo === o.no));
    // 배차 필요: 진행 오더 중 아직 지나가지 않은 구간(실적 없음)에 배차가 지정되지 않은 오더
    const dispNeed = active.map(o => {
      const got = new Set(S.dispatches().filter(d => d.orderNo === o.no && d.legIdx != null).map(d => d.legIdx));
      const miss = legs(o).filter(l => l.act == null && !got.has(l.i));
      return { o, miss, total: Math.max(0, nodes(o).length - 1), got: got.size };
    }).filter(x => x.miss.length);
    return {
      packPend: packPend.length, packPendList: packPend, dispNeed: dispNeed.length, dispNeedList: dispNeed, dispNeedLegs: dispNeed.reduce((a, x) => a + x.miss.length, 0),
      orders: O.length, active: active.length, moving: O.filter(o => o.status === '운송중').length,
      done, delay, off, alarm: delay + off,
      onTime: (done + delay) > 0 ? pct(done, done + delay) : null,
      packRate: pct(packed, O.length), packed,
      dispRate: pct(dispatched, O.length), dispatched,
      overRate: measStd.length ? pct(measStd.filter(l => l.over).length, measStd.length) : null, measStd: measStd.length,
      avgLeg: meas.length ? Math.round(meas.reduce((s, l) => s + l.act, 0) / meas.length) : null, measN: meas.length,
      inHub: inHub.size, hubs: H.length,
      avgWp: O.length ? Math.round(O.reduce((s, o) => s + (o.route?.waypoints?.length || 0), 0) / O.length * 10) / 10 : null,
      events: E.length,
      stage: ['대기', '패킹중', '배차완료', '운송중', '도착완료', '지연'].map(s => [s, O.filter(o => o.status === s).length])
    };
  }

  // 기준일: 데이터 중 가장 최근 날짜 (과거 데이터만 있을 때 빈 차트 방지)
  function anchorDate() {
    const ds = [...S.events().map(e => e.time.slice(0, 10)), ...S.orders().map(o => (o.created || o.date || '').slice(0, 10))].filter(Boolean).sort();
    return ds.length ? ds[ds.length - 1] : dstr(new Date());
  }

  const TREND = {
    ev:  { name: '거점 IN/OUT 건수', dual: true },
    ord: { name: '출하오더 등록 건수' },
    box: { name: '패킹 완료 박스 수량' }
  };
  function trend(metric, days) {
    const end = toDate(anchorDate() + ' 00:00'), labels = [];
    for (let i = days - 1; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); labels.push(dstr(d)); }
    const m = {}; labels.forEach(l => m[l] = { a: 0, b: 0 });
    if (metric === 'ev') S.events().forEach(e => { const k = e.time.slice(0, 10); if (m[k]) (e.event === 'IN' ? m[k].a++ : m[k].b++); });
    if (metric === 'ord') S.orders().forEach(o => { const k = (o.created || o.date || '').slice(0, 10); if (m[k]) m[k].a++; });
    if (metric === 'box') S.packings().forEach(p => { const k = (p.doneAt || '').slice(0, 10); if (m[k]) m[k].a += (+p.boxes || 0); });
    return { labels, a: labels.map(l => m[l].a), b: labels.map(l => m[l].b) };
  }

  // 규칙 기반 조치 제안 (원인 → 대안). 사실/가설 구분 표기.
  function actions() {
    const out = [];
    S.alarms().filter(a => a.type === 'OFF_ROUTE').forEach(a => out.push({
      lv: 0, t: `비지정 거점 이벤트 · ${a.orderNo}`, fact: `${a.hub} ${a.event} (${hhmm(a.time)}) — 지정 경로 외 거점`,
      cause: '경로 변경 미반영 또는 거점 오입력(가설)', act: '출하오더 경로 변경 또는 이벤트 정정 후 알람 확인 처리', go: 'order.html'
    }));
    S.orders().forEach(o => {
      const ls = legs(o), ov = ls.filter(l => l.over);
      if (o.status === '지연' || ov.length) {
        const w = ov[0];
        out.push({
          lv: o.status === '지연' ? 0 : 1, t: `${o.status === '지연' ? '지연' : '표준시간 초과'} · ${o.no}`,
          fact: w ? `${shortName(w.from)}→${shortName(w.to)} 실적 ${w.act}분 / 표준 ${w.std}분 (+${w.act - w.std}분)` : `${o.customer} 지연 상태`,
          cause: '출발 대기·상차 지연 또는 표준시간 과소 설정(가설)', act: '구간 표준시간 재검토, 출발거점 OUT 시각 확인, 필요 시 차량 재배차', go: 'dispatch.html'
        });
      }
      if (o.status === '대기' && !S.packings().some(p => p.orderNo === o.no))
        out.push({ lv: 2, t: `패킹 미착수 · ${o.no}`, fact: `${o.customer} · ${o.boxes}박스 대기 중`, cause: '패킹 작업 미배정(가설)', act: '박스Packing 화면에서 패킹 착수', go: 'packing.html' });
      else if (o.status !== '도착완료' && S.packings().some(p => p.orderNo === o.no) && !dispatchDone(o))
        out.push({ lv: 2, t: `배차 미완료 · ${o.no}`, fact: `패킹 완료, 구간 배차 ${new Set(S.dispatches().filter(d => d.orderNo === o.no).map(d => d.legIdx)).size}/${Math.max(0, nodes(o).length - 1)}`, cause: '배차 담당 미지정(가설)', act: '차량배차 화면에서 미배차 구간 지정', go: 'dispatch.html' });
    });
    return out.sort((a, b) => a.lv - b.lv);
  }


  // ── 거점·이동 중 운송 (CEO 대시보드용) ─────────────────────────
  const hubMode = n => /공항|Airport/.test(n) ? 'air' : /항 |항\(|\bPort\b|CY/.test(n) ? 'sea' : 'land';
  const MODE = { truck: ['🚛', '차량'], sea: ['🚢', '선박'], air: ['✈️', '항공'] };
  const HUBMODE_ICON = { air: '✈️', sea: '🚢', land: '🏭' };
  function refNow() {            // 데이터가 48시간 이내면 현재 시각, 아니면 마지막 이벤트 시각 기준
    const lt = S.events().map(e => e.time).sort().pop(), ld = lt ? toDate(lt) : null, now = new Date();
    return (ld && (now - ld) / 36e5 <= 48) ? { t: now, live: true } : { t: ld || now, live: false };
  }
  function moving() {
    const R = refNow(), out = [];
    S.orders().filter(o => o.status !== '도착완료').forEach(o => {
      const p = position(o); if (p.state !== 'out') return;
      const ns = nodes(o), i = p.idx, from = ns[i], to = ns[i + 1]; if (!to) return;
      const dp = S.dispatches().find(x => x.orderNo === o.no && x.legIdx === i) || null;
      const std = stds(o)[i] ?? null, tOut = toDate(p.last.time), el = R.live ? mins(tOut, R.t) : null;
      let eta = null;
      if (std != null) { const e = new Date(tOut.getTime() + std * 60000); eta = pad(e.getHours()) + ':' + pad(e.getMinutes()) + (dstr(e) !== dstr(tOut) ? ` (+${Math.round((toDate(dstr(e) + ' 00:00') - toDate(dstr(tOut) + ' 00:00')) / 864e5)}일)` : ''); }
      else if (dp && dp.eta) eta = dp.eta.slice(11, 16);
      let mode = (dp && dp.transportType) || 'truck'; if (!MODE[mode]) mode = 'truck';
      out.push({ o, from, to, dp, mode, std, outTime: p.last.time, elapsed: el, eta, over: el != null && std != null && el > std });
    });
    return out;
  }
  function hubStats(name) {
    const ev = S.events().filter(e => e.hub === name).slice().sort((a, b) => a.time.localeCompare(b.time));
    const rows = ev.map((e, k) => {
      let dwell = null;
      if (e.event === 'OUT') { const inn = ev.slice(0, k).reverse().find(x => x.orderNo === e.orderNo && x.event === 'IN'); if (inn) dwell = mins(toDate(inn.time), toDate(e.time)); }
      return { ...e, dwell };
    });
    const stay = S.orders().filter(o => { if (o.status === '도착완료') return false; const p = position(o); return p.state === 'at' && p.last.hub === name; });
    const dw = rows.filter(r => r.dwell != null && r.dwell >= 0);
    return {
      ev: rows, stay, expect: moving().filter(m => m.to === name),
      inN: ev.filter(e => e.event === 'IN').length, arrN: ev.filter(e => e.event === '도착완료').length, outN: ev.filter(e => e.event === 'OUT').length,
      avgDwell: dw.length ? Math.round(dw.reduce((s, r) => s + r.dwell, 0) / dw.length) : null, dwN: dw.length, last: ev[ev.length - 1] || null
    };
  }

  return { hubMode, MODE, HUBMODE_ICON, refNow, moving, hubStats, esc, pad, dstr, toDate, mins, pct, fmtPct, hhmm, shortName, nodes, stds, evsOf, position, legs, dispatchDone, kpi, anchorDate, TREND, trend, actions };
})();

// ── 공통 UI 조각 ───────────────────────────────────────────────
function kbox(cls, title, valHtml, sub, tip, href) {
  return `<div class="kbox ${cls}" title="${DC.esc(tip || '')}" ${href ? (href.startsWith('js:') ? `onclick="${href.slice(3)}"` : `onclick="location.href='${href}'"`) : ''}>
    <div class="k-ttl">${title}</div>${valHtml}<div class="k-sub">${sub || '&nbsp;'}</div></div>`;
}
const kv = (v, unit, cls) => v == null
  ? `<div class="k-val na">데이터 없음</div>`
  : `<div class="k-val ${cls || ''}">${v}${unit ? `<u>${unit}</u>` : ''}</div>`;

// 검색 결과(공통 buildTrackerCard 재사용)
function dashSearch() {
  const q = (el('dash-q').value || '').trim().toLowerCase(), box = el('search-pop');
  if (!q) { box.classList.add('hidden'); return; }
  const ps = S.products();
  const m = S.orders().filter(o => {
    const pc = ps.find(p => p.name === o.product)?.code || '';
    return [o.no, o.product, pc, o.customer].some(x => String(x).toLowerCase().includes(q));
  });
  el('search-pop-body').innerHTML = m.length ? m.map(o => buildTrackerCard(o, ps)).join('') : '<div class="empty-n">검색 결과 없음</div>';
  box.classList.remove('hidden');
}
function dashSearchClear() { el('dash-q').value = ''; el('search-pop').classList.add('hidden'); }

// 추이 차트 (SVG)
function drawTrend(host, data, dual) {
  const W = Math.max(260, host.clientWidth || 420), H = Math.max(120, host.clientHeight || 190), L = 28, R = 6, T = 8, B = 22, n = data.labels.length;
  const max = Math.max(1, ...data.a, ...(dual ? data.b : [0])), top = Math.ceil(max * 1.15);
  const x = i => L + (W - L - R) * (i + .5) / n, y = v => T + (H - T - B) * (1 - v / top);
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = Math.round(top * k / 4), yy = y(v); g += `<line class="grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-4}" y="${yy+3}" text-anchor="end">${v}</text>`; }
  const bw = Math.max(3, (W - L - R) / n * (dual ? .34 : .55));
  let body = '';
  data.labels.forEach((lb, i) => {
    const cx = x(i), lab = (i % Math.ceil(n / Math.max(3, Math.floor(W / 52))) === 0) ? `<text x="${cx}" y="${H-8}" text-anchor="middle">${lb.slice(5)}</text>` : '';
    if (dual) {
      body += `<rect class="bar-in" x="${cx-bw-1}" y="${y(data.a[i])}" width="${bw}" height="${Math.max(0, y(0)-y(data.a[i]))}"><title>${lb} IN ${data.a[i]}건</title></rect>`;
      body += `<rect class="bar-out" x="${cx+1}" y="${y(data.b[i])}" width="${bw}" height="${Math.max(0, y(0)-y(data.b[i]))}"><title>${lb} OUT ${data.b[i]}건</title></rect>`;
    } else body += `<rect class="bar-in" x="${cx-bw/2}" y="${y(data.a[i])}" width="${bw}" height="${Math.max(0, y(0)-y(data.a[i]))}"><title>${lb} ${data.a[i]}</title></rect>`;
    body += lab;
  });
  host.innerHTML = `<svg class="trend-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}${body}</svg>`;
}
