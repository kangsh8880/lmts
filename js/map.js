// ══ LMTS map.js — 위치추적(지도) ══
// 거점 이벤트(IN/OUT)와 구간 표준시간으로 "현재 위치"를 추정하고, 출발~현재(실선)와 현재~도착(점선) 경로를 지도에 표시한다.
const MP = (() => {
  const esc = DC.esc;
  const ICON = { truck: '🚛', air: '✈️', sea: '🚢' }, LABEL = { truck: '차량', air: '항공', sea: '선박' };
  const C_DONE = '#365C89', C_TODO = '#9fb3cc', C_BAD = '#c0392b';
  const S_ = { mode: 'order', map: null, lg: null, mk: null, order: null, legs: [], st: null, pos: null, timer: null, raf: null, fitted: false };
  const rad = Math.PI / 180;
  const fmt = d => d ? `${DC.pad(d.getMonth()+1)}-${DC.pad(d.getDate())} ${DC.pad(d.getHours())}:${DC.pad(d.getMinutes())}` : '-';
  const dur = m => { m = Math.round(Math.abs(m)); const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), r = m % 60; return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${r}분` : `${r}분`; };

  // ── 좌표 ──────────────────────────────────────────────
  function hubLL(name) { const h = S.hubs().find(x => x.name === name); return (!h || h.lat == null || h.lat === '' || isNaN(+h.lat) || isNaN(+h.lng)) ? null : [+h.lat, +h.lng]; }
  function hav(a, b) { const dl = (b[0]-a[0])*rad, dg = (b[1]-a[1])*rad, x = Math.sin(dl/2)**2 + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dg/2)**2; return 12742 * Math.asin(Math.sqrt(x)); }
  function stopsGeo(o) {      // 날짜변경선을 건너는 경로(한국→미국)가 끊기지 않도록 경도를 연속값으로 보정
    let prev = null;
    return DC.nodes(o).map(n => { const ll = hubLL(n); if (!ll) return { name: n, ll: null };
      let g = ll[1]; if (prev != null) { while (g - prev > 180) g -= 360; while (g - prev < -180) g += 360; } prev = g; return { name: n, ll: [ll[0], g] }; });
  }
  function legMode(o, i, from, to) {
    const d = S.dispatches().find(x => x.orderNo === o.no && x.legIdx === i);
    if (d && d.transportType) return d.transportType;
    const fm = DC.hubMode(from), tm = DC.hubMode(to);
    if (fm === 'air' && tm === 'air') return 'air';
    if (fm === 'sea' && tm === 'sea') { const a = hubLL(from), b = hubLL(to); return (a && b && hav(a, b) < 150) ? 'truck' : 'sea'; }
    return 'truck';
  }
  // 대권(지구 곡선) 경로 + 수송수단별 곡률(항공: 위로 볼록, 선박: 반대로 완만)
  function arcPts(a, b, bulge) {
    const A = [Math.cos(a[0]*rad)*Math.cos(a[1]*rad), Math.cos(a[0]*rad)*Math.sin(a[1]*rad), Math.sin(a[0]*rad)];
    const B = [Math.cos(b[0]*rad)*Math.cos(b[1]*rad), Math.cos(b[0]*rad)*Math.sin(b[1]*rad), Math.sin(b[0]*rad)];
    const om = Math.acos(Math.max(-1, Math.min(1, A[0]*B[0] + A[1]*B[1] + A[2]*B[2])));
    const dlat = b[0]-a[0], dlng = b[1]-a[1], len = Math.hypot(dlat, dlng) || 1;
    const n = Math.max(24, Math.min(140, Math.round(len * 2))), out = []; let pl = a[1];
    for (let k = 0; k <= n; k++) { const t = k / n; let la, lo;
      if (om < 1e-6) { la = a[0]; lo = a[1]; } else { const s1 = Math.sin((1-t)*om)/Math.sin(om), s2 = Math.sin(t*om)/Math.sin(om);
        const v = [A[0]*s1+B[0]*s2, A[1]*s1+B[1]*s2, A[2]*s1+B[2]*s2]; la = Math.asin(v[2])/rad; lo = Math.atan2(v[1], v[0])/rad; }
      while (lo - pl > 180) lo -= 360; while (lo - pl < -180) lo += 360; pl = lo;
      const off = bulge * len * Math.sin(Math.PI * t);
      out.push([la + (dlng/len)*off, lo - (dlat/len)*off]); }
    out[0] = a.slice(); out[out.length-1] = b.slice();
    return out;
  }
  function cumOf(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i-1] + Math.hypot(pts[i][0]-pts[i-1][0], (pts[i][1]-pts[i-1][1]) * Math.cos(pts[i][0]*rad))); return c; }
  function setPts(L, pts) { L.pts = pts; L.cum = cumOf(pts); L.len = L.cum[L.cum.length-1] || 1e-9; }
  function pointAt(L, f) {
    f = Math.max(0, Math.min(1, f)); const t = f * L.len; let i = 1; while (i < L.cum.length - 1 && L.cum[i] < t) i++;
    const s = (L.cum[i] - L.cum[i-1]) || 1e-9, r = (t - L.cum[i-1]) / s, a = L.pts[i-1], b = L.pts[i];
    return [a[0] + (b[0]-a[0])*r, a[1] + (b[1]-a[1])*r];
  }
  function split(L, f) {      // 경로를 진행률 f 지점에서 둘로 나눔
    f = Math.max(0, Math.min(1, f)); const t = f * L.len, P = pointAt(L, f); let i = 1; while (i < L.cum.length - 1 && L.cum[i] < t) i++;
    return [[...L.pts.slice(0, i), P], [P, ...L.pts.slice(i)]];
  }
  // 차량 구간: 공개 도로경로(OSRM)를 시도하고 실패하면 직선 — 결과는 브라우저에 저장해 재사용
  function roadKey(a, b) { return [a[0].toFixed(3), a[1].toFixed(3), b[0].toFixed(3), b[1].toFixed(3)].join(','); }
  function roadCache() { try { return JSON.parse(localStorage.getItem('lmts_road_cache') || '{}'); } catch (e) { return {}; } }
  function saveRoad(k, v) { try { const c = roadCache(); c[k] = v; localStorage.setItem('lmts_road_cache', JSON.stringify(c)); } catch (e) {} }
  function decimate(p, max) { if (p.length <= max) return p; const o = [], st = (p.length - 1) / (max - 1); for (let i = 0; i < max; i++) o.push(p[Math.round(i * st)]); return o; }
  async function loadRoad(L, token) {
    const k = roadKey(L.a, L.b), c = roadCache()[k];
    if (c) { setPts(L, c); L.road = true; return true; }
    if (L.a[1] > 180 || L.b[1] > 180 || L.a[1] < -180 || L.b[1] < -180) return false;
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${L.a[1]},${L.a[0]};${L.b[1]},${L.b[0]}?overview=simplified&geometries=geojson`, { signal: ctl.signal });
      clearTimeout(tm); const j = await r.json();
      if (token !== S_.token || !j.routes || !j.routes[0]) return false;
      const pts = decimate(j.routes[0].geometry.coordinates.map(x => [x[1], x[0]]), 160);
      pts[0] = L.a.slice(); pts[pts.length-1] = L.b.slice(); saveRoad(k, pts); setPts(L, pts); L.road = true; return true;
    } catch (e) { return false; }
  }

  // ── 위치 추정 ─────────────────────────────────────────
  function legDefs(o) {
    const ns = DC.nodes(o), sd = DC.stds(o), ev = DC.evsOf(o), g = stopsGeo(o), out = [];
    let after = '';
    for (let i = 0; i < ns.length - 1; i++) {
      const outs = ev.filter(e => e.hub === ns[i] && e.event === 'OUT' && e.time >= after), tOut = outs.length ? outs[0].time : null;
      const inn = tOut ? ev.find(e => e.hub === ns[i+1] && e.event === 'IN' && e.time >= tOut) : null;
      if (inn) after = inn.time; else if (tOut) after = tOut;
      const mode = legMode(o, i, ns[i], ns[i+1]);
      const d = S.dispatches().find(x => x.orderNo === o.no && x.legIdx === i);
      let std = sd[i], est = false;
      if (std == null) { const a = d && DC.toDate(d.departPlan), b = d && DC.toDate(d.eta); std = (a && b && b > a) ? DC.mins(a, b) : 60; est = true; }
      const L = { i, from: ns[i], to: ns[i+1], mode, std, stdEst: est, tOut, tIn: inn ? inn.time : null, a: g[i].ll, b: g[i+1].ll, road: false };
      if (L.a && L.b) setPts(L, mode === 'truck' ? [L.a, L.b] : arcPts(L.a, L.b, mode === 'air' ? 0.12 : -0.05));
      out.push(L);
    }
    return { legs: out, stops: g, ev };
  }
  function calc(o, now) {
    const D = legDefs(o), legs = D.legs, n = legs.length;
    const hasArr = o.status === '도착완료' || D.ev.some(e => e.event === '도착완료') || (n && legs[n-1].tIn);
    let k = -1; legs.forEach(L => { if (L.tOut) k = L.i; });
    const sum = (f, t) => legs.slice(f, t).reduce((a, L) => a + L.std, 0), total = sum(0, n);
    const t0 = legs.find(L => L.tOut) ? DC.toDate(legs.find(L => L.tOut).tOut) : now;
    const st = { D, legs, n, total, now, plan: new Date(t0.getTime() + total * 60000) };
    if (hasArr) { Object.assign(st, { state: 'done', leg: n, prog: 1, pct: 100, eta: DC.toDate(D.ev.filter(e => e.event === '도착완료' || (e.event === 'IN' && e.hub === legs[n-1]?.to)).pop()?.time) || now, delta: 0, over: 0 }); st.delta = DC.mins(st.plan, st.eta); return st; }
    if (k < 0) { Object.assign(st, { state: 'pre', leg: 0, prog: 0, pct: 0, eta: new Date(now.getTime() + total * 60000), over: 0 }); st.delta = DC.mins(st.plan, st.eta); return st; }
    const L = legs[k];
    if (L.tIn) { const dw = DC.mins(DC.toDate(L.tIn), now); const eta = new Date(now.getTime() + sum(k+1, n) * 60000);
      Object.assign(st, { state: 'at', leg: k + 1, prog: 0, pct: Math.min(100, sum(0, k+1) / total * 100), eta, dwell: Math.max(0, dw), over: 0 }); st.delta = DC.mins(st.plan, eta); return st; }
    const el = DC.mins(DC.toDate(L.tOut), now), raw = el / L.std, over = Math.max(0, el - L.std);
    const eta = new Date(now.getTime() + (over ? 0 : (L.std - el)) * 60000 + sum(k+1, n) * 60000);
    Object.assign(st, { state: 'move', leg: k, prog: Math.max(0, Math.min(raw, 0.985)), raw, over, elapsed: Math.max(0, el),
      pct: Math.min(99.9, (sum(0, k) + L.std * Math.min(raw, 1)) / total * 100), eta });
    st.delta = DC.mins(st.plan, eta); return st;
  }
  function curPos(st) {
    const { legs, n } = st; if (!n) return null;
    if (st.state === 'done') return legs[n-1].b;
    if (st.state === 'move') { const L = legs[st.leg]; return L.pts ? pointAt(L, st.prog) : null; }
    const L = legs[Math.min(st.leg, n-1)]; return st.leg >= n ? L.b : L.a;
  }

  // ── 지도 그리기 ───────────────────────────────────────
  function styleOf(mode, done, bad) {
    const base = { weight: mode === 'air' ? 4 : 5, opacity: done ? 0.95 : 0.85, color: done ? (bad ? C_BAD : C_DONE) : C_TODO, lineCap: 'round', lineJoin: 'round' };
    if (mode === 'air') base.dashArray = '12 9'; if (mode === 'sea') base.dashArray = '1 11';
    return base;
  }
  function drawRoute() {
    if (!S_.map || !S_.st) return; const st = S_.st; S_.lg.clearLayers();
    const bad = st.over > 0;
    st.legs.forEach(L => {
      if (!L.pts) return;
      if (L.i < st.leg || st.state === 'done') L.layers = [L.mode ? L.pts : L.pts].map(p => L_.polyline(p, styleOf(L.mode, true, false)));
      else if (L.i === st.leg && st.state === 'move') { const [a, b] = split(L, st.prog); L.layers = [L_.polyline(a, styleOf(L.mode, true, bad)), L_.polyline(b, styleOf(L.mode, false))]; }
      else L.layers = [L_.polyline(L.pts, styleOf(L.mode, false))];
      L.layers.forEach(x => x.addTo(S_.lg));
      // 구간 수단 아이콘(구간 중앙)
      const mid = pointAt(L, 0.5), ic = L_.marker(mid, { icon: L_.divIcon({ className: '', html: `<div style="font-size:18px;background:#fff;border:1px solid #888;border-radius:10px;padding:0 3px;line-height:18px">${ICON[L.mode]}</div>`, iconSize: [26, 20], iconAnchor: [13, 10] }), interactive: false, keyboard: false }); ic.addTo(S_.lg);
    });
    st.D.stops.forEach((s, i) => {
      if (!s.ll) return;
      const pass = i < st.leg || st.state === 'done' || (st.state === 'at' && i === st.leg ? false : false), curHub = (st.state === 'at' || st.state === 'pre') && i === st.leg;
      const passed = (st.state === 'done') || i < st.leg || (st.state === 'move' && i <= st.leg);
      const typ = i === 0 ? '🏭' : i === st.D.stops.length - 1 ? '🏢' : (DC.HUBMODE_ICON[DC.hubMode(s.name)] || '📍');
      const mk = L_.marker(s.ll, { icon: L_.divIcon({ className: '', html: `<div class="mp-hub ${passed ? 'pass' : ''} ${curHub ? 'cur' : ''}">${typ}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
      const evs = st.D.ev.filter(e => e.hub === s.name).map(e => `${e.event} ${e.time.slice(5, 16)}`).join('<br>');
      mk.bindTooltip(`<b>${esc(s.name)}</b>${evs ? '<br>' + evs : ''}`, { className: 'mp-tip', direction: 'top', offset: [0, -12] }); mk.addTo(S_.lg);
    });
  }
  function mkIcon(st) {
    const L = st.legs[Math.min(st.leg, st.n - 1)], ic = st.state === 'done' ? '✅' : st.state === 'move' ? ICON[L.mode] : '📍';
    return L_.divIcon({ className: '', html: `<div class="mp-mk ${st.state === 'done' ? 'done' : st.over > 0 ? 'bad' : ''}"><span>${ic}</span></div>`, iconSize: [38, 38], iconAnchor: [19, 19] });
  }
  function animate(from, to, ms, cb) {
    cancelAnimationFrame(S_.raf); if (!from || ms <= 0) { cb(to, 1); return; } const t0 = performance.now();
    const step = t => { const r = Math.min(1, (t - t0) / ms), e = r < .5 ? 2*r*r : 1 - Math.pow(-2*r + 2, 2) / 2; cb([from[0] + (to[0]-from[0])*e, from[1] + (to[1]-from[1])*e], r); if (r < 1) S_.raf = requestAnimationFrame(step); };
    S_.raf = requestAnimationFrame(step);
  }
  function placeMarker(animateMs) {
    const st = S_.st, p = curPos(st); if (!p || !S_.map) return;
    if (!S_.mk) S_.mk = L_.marker(p, { icon: mkIcon(st), zIndexOffset: 1000 }).addTo(S_.map); else S_.mk.setIcon(mkIcon(st));
    const from = S_.pos; S_.pos = p;
    animate(from && S_.mk ? S_.mk.getLatLng() && [S_.mk.getLatLng().lat, S_.mk.getLatLng().lng] : null, p, animateMs, q => S_.mk.setLatLng(q));
  }

  // ── 우측 패널 ─────────────────────────────────────────
  function evHtml(o) {
    if (!window.EV) return ''; const rows = EV.of(o.no);
    if (!rows.length) return '<div class="mp-note">📷 증빙 사진 없음 (Packing·거점 처리 시 선택적으로 촬영)</div>';
    const ok = rows.filter(r => EV.verdict(r).k === 'ok').length;
    return `<div class="mp-now" style="margin-top:8px"><b>📷 사진·GPS 증빙 ${rows.length}건</b> ${EV.badge(o.no)}<br>거점 위치 확인 <b>${ok}건</b>${rows.length - ok ? ` · 미확인 ${rows.length - ok}건` : ''} <span class="mp-sub" style="margin:0">(최근: ${esc(rows[rows.length - 1].hub)} ${esc(rows[rows.length - 1].time.slice(5))})</span></div>`;
  }
  function evMarks() {      // 증빙 사진을 찍은 실제 위치(GPS)를 지도에 표시
    if (!window.EV || !S_.order || !S_.lg) return;
    EV.of(S_.order.no).filter(r => r.lat != null).forEach(r => { const v = EV.verdict(r);
      L_.marker([r.lat, r.lng], { icon: L_.divIcon({ className: '', html: `<div class="mp-ev ${v.k}">📷</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), zIndexOffset: 800 })
        .bindTooltip(`<b>📷 ${esc(r.hub)} ${esc(r.kind)}</b><br>${esc(r.time)}<br>${esc(v.t)}`, { className: 'mp-tip', direction: 'top', offset: [0, -10] }).on('click', () => EV.view(r.orderNo, r.hub, r.kind)).addTo(S_.lg); });
  }
  function panel() {
    const o = S_.order, st = S_.st; if (!o || !st) return;
    const bad = st.over > 0 || st.delta > 30 || o.status === '지연', D = st.D;
    const where = st.state === 'done' ? `도착 완료 — ${esc(DC.shortName(st.legs[st.n-1].to))}` :
      st.state === 'pre' ? `출발 전 — ${esc(DC.shortName(D.stops[0].name))} 대기` :
      st.state === 'at' ? `${esc(DC.shortName(D.stops[st.leg].name))} 체류 중 (${dur(st.dwell)} 경과)` :
      `${esc(DC.shortName(st.legs[st.leg].from))} → ${esc(DC.shortName(st.legs[st.leg].to))} ${LABEL[st.legs[st.leg].mode]} 이동 중`;
    const dl = st.delta, dtxt = st.state === 'done' ? (dl > 0 ? `계획 대비 +${dur(dl)}` : '계획 내 도착') : (dl > 0 ? `계획 대비 +${dur(dl)} 지연 예상` : `계획 대비 ${dur(dl)} 여유`);
    let cum = 0;
    const baseT = st.legs.find(L => L.tOut) ? DC.toDate(st.legs.find(L => L.tOut).tOut) : st.now;
    let tl = '';
    D.stops.forEach((s, i) => {
      const L = st.legs[i - 1], planT = new Date(baseT.getTime() + (i ? st.legs.slice(0, i).reduce((a, x) => a + x.std, 0) : 0) * 60000);
      const evs = D.ev.filter(e => e.hub === s.name), inn = evs.find(e => e.event === 'IN' || e.event === '도착완료'), out = evs.find(e => e.event === 'OUT');
      const passed = st.state === 'done' || i < st.leg || (st.state === 'move' && i <= st.leg), cur = (st.state === 'at' || st.state === 'pre') && i === st.leg;
      tl += `<div class="mp-st"><div class="mp-dot ${passed ? 'pass' : ''} ${cur ? 'cur' + (bad ? '' : ' ok') : ''}">${passed ? '✓' : cur ? '●' : ''}</div><div><div class="mp-stn">${esc(s.name)}${s.ll ? '' : ' <span style="color:#c0392b;font-weight:400">· 좌표 미입력</span>'}</div>
        <div class="mp-stt">계획 ${fmt(planT)}${inn ? ` · <b>IN ${inn.time.slice(5, 16)}</b>` : ''}${out ? ` · <b>OUT ${out.time.slice(5, 16)}</b>` : ''}</div></div></div>`;
      if (i < D.stops.length - 1) {
        const Lg = st.legs[i], done = i < st.leg || st.state === 'done', curL = i === st.leg && st.state === 'move';
        const pr = done ? 100 : curL ? Math.min(100, Math.round(st.raw * 1000) / 10) : 0;
        const act = (Lg.tOut && Lg.tIn) ? DC.mins(DC.toDate(Lg.tOut), DC.toDate(Lg.tIn)) : null;
        tl += `<div class="mp-leg ${done ? 'done' : ''} ${curL ? 'cur' + (bad ? '' : ' ok') : ''}">${ICON[Lg.mode]} ${LABEL[Lg.mode]} · 표준 ${Lg.std}분${Lg.stdEst ? '(미입력→기본값)' : ''}${act != null ? ` · 실적 <b>${act}분</b>` : ''}${curL ? ` · 진행 <b>${pr.toFixed(1)}%</b>${st.over > 0 ? ` <span style="color:#c0392b">(+${dur(st.over)} 초과)</span>` : ''}` : ''}
          <div class="mp-bar"><i style="width:${Math.min(100, pr)}%"></i></div></div>`;
      }
    });
    el('mp-head').textContent = `📍 ${o.no} 위치 현황`;
    el('mp-side').innerHTML = `<div class="mp-ord">${esc(o.no)} <span class="status" style="font-size:13px">${esc(o.status)}</span></div>
      <div class="mp-sub">${esc(o.customer)} · ${esc(ordText(o))}</div>
      <div class="mp-kpis"><div class="mp-kpi"><small>진행률</small><b>${st.pct.toFixed(1)}%</b></div>
        <div class="mp-kpi ${bad ? 'bad' : 'ok'}"><small>${st.state === 'done' ? '도착 시각' : '도착 예상(ETA)'}</small><b>${fmt(st.eta)}</b></div>
        <div class="mp-kpi ${bad ? 'bad' : 'ok'}"><small>계획 도착</small><b>${fmt(st.plan)}</b></div></div>
      <div class="mp-now"><b>현재 위치 ${st.state === 'move' ? '(추정)' : ''}</b><br>${where}<br><span style="color:${bad ? '#c0392b' : '#1a4fa0'};font-weight:700">${dtxt}</span></div>
      <div class="mp-note">※ 마지막 거점 이벤트(IN/OUT)와 구간 표준시간 비율로 위치를 추정합니다. 기준시각 ${fmt(st.now)} (${DC.refNow().live ? '현재 시각' : '마지막 이벤트 시각'}) · 지도 수단: 🚛 차량 실선 · ✈️ 항공 곡선 · 🚢 선박 점선</div>
      ${evHtml(o)}
      <div class="mp-tl">${tl}</div>`;
  }


  // ── 전체 보기(초기 화면): 운송 중인 모든 오더를 한 번에 ──────────────────
  function overview() {
    if (!S_.map) return;
    cancelAnimationFrame(S_.raf); S_.touring = false;
    if (S_.trail) { S_.map.removeLayer(S_.trail); S_.trail = null; }
    if (S_.mk) { S_.map.removeLayer(S_.mk); S_.mk = null; } S_.pos = null;
    S_.order = null; S_.st = null; S_.token = Math.random(); S_.lg.clearLayers();
    const t = S_.token, R = DC.refNow().t, list = DC.moving().map(m => m.o), rows = [], all = [];
    list.forEach(o => {
      const st = calc(o, R);
      st.legs.forEach(L => { if (L.mode === 'truck' && L.a && L.b) { const c = roadCache()[roadKey(L.a, L.b)]; if (c) { setPts(L, c); L.road = true; } } });
      const bad = st.over > 0 || st.delta > 30 || o.status === '지연';
      st.legs.forEach(L => {
        if (!L.pts) return; all.push(...L.pts);
        let lay;
        if (L.i < st.leg) lay = [L_.polyline(L.pts, styleOf(L.mode, true, false))];
        else if (L.i === st.leg && st.state === 'move') { const [a, b] = split(L, st.prog); lay = [L_.polyline(a, styleOf(L.mode, true, bad)), L_.polyline(b, styleOf(L.mode, false))]; }
        else lay = [L_.polyline(L.pts, styleOf(L.mode, false))];
        lay.forEach(x => x.addTo(S_.lg));
      });
      const p = curPos(st);
      if (p) {
        const Lg = st.legs[Math.min(st.leg, st.n - 1)], ic = st.state === 'move' ? ICON[Lg.mode] : '📍';
        const mk = L_.marker(p, { icon: L_.divIcon({ className: '', html: `<div class="mp-mk ${bad ? 'bad' : ''}"><span>${ic}</span><em class="mp-mk-no">${esc(o.no.slice(-7))}</em></div>`, iconSize: [38, 38], iconAnchor: [19, 19] }), zIndexOffset: 1000 });
        mk.bindTooltip(`<b>${esc(o.no)}</b><br>${esc(o.customer)}<br>진행 ${st.pct.toFixed(1)}%`, { className: 'mp-tip', direction: 'top', offset: [0, -18] });
        mk.on('click', () => pick(o.no)); mk.addTo(S_.lg); all.push(p);
      }
      st.D.stops.forEach(s => { if (s.ll) all.push(s.ll); });
      const where = st.state === 'move' ? `${esc(DC.shortName(st.legs[st.leg].from))} → ${esc(DC.shortName(st.legs[st.leg].to))} ${ICON[st.legs[st.leg].mode]}` : st.state === 'at' ? `${esc(DC.shortName(st.D.stops[st.leg].name))} 체류` : '-';
      rows.push({ o, st, bad, where });
      if (st.state === 'move') st.legs.filter(L => L.mode === 'truck' && L.a && L.b && !L.road).forEach(L => loadRoad(L, t).then(ok => { if (ok && t === S_.token && !S_.order) overview(); }));
    });
    // 전체 경로가 지도에 보이도록 맞춤 (가장 처음 한 번)
    if (all.length) { S_.map.invalidateSize(); S_.map.fitBounds(L_.latLngBounds(all), { padding: [50, 50], maxZoom: 10, animate: false }); }
    el('mp-warn').classList.add('hidden'); el('mp-q').value = '';
    el('mp-head').textContent = `🗺️ 운송 중 오더 전체 (${rows.length}건)`;
    el('mp-side').innerHTML = rows.length ? `<div class="mp-note" style="margin-top:0">지도의 오더를 누르거나 아래 목록을 선택하면 해당 오더만 자세히 보여줍니다.</div>` +
      rows.map(r => `<div class="mp-ovc ${r.bad ? 'bad' : ''}" onclick="MP.pick('${esc(r.o.no)}')"><div class="mp-ord" style="font-size:inherit">${esc(r.o.no)} <span class="status" style="font-size:13px">${esc(r.o.status)}</span></div>
        <div class="mp-sub">${esc(r.o.customer)} · ${esc(ordText(r.o))}</div>
        <div class="mp-ovr"><span>${r.where}</span><span>진행 <b>${r.st.pct.toFixed(1)}%</b></span><span>ETA <b>${fmt(r.st.eta)}</b></span></div>
        <div class="mp-bar"><i style="width:${Math.min(100, r.st.pct)}%"></i></div></div>`).join('')
      : '<div class="empty">현재 운송 중인 오더가 없습니다.<br>상단 목록에서 오더를 선택하면 위치를 볼 수 있습니다.</div>';
    el('mp-all').style.display = 'none'; chips();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  }


  // ── 운송수단별 조회 ───────────────────────────────────
  const TLAB = { truck: '차량', air: '항공', sea: '선박' };
  function unitIdOf(d) { return d.transportType === 'air' ? `${d.airline || ''} ${d.flightNo || ''}`.trim() : d.transportType === 'sea' ? (d.vessel || '').trim() : (d.vehicleNo || '').trim(); }
  function unitData(R) {
    const map = {};
    S.orders().filter(o => o.status !== '도착완료').forEach(o => {
      const ds = S.dispatches().filter(d => d.orderNo === o.no); if (!ds.length) return;
      const st = calc(o, R); if (st.state === 'done') return;
      st.legs.forEach(L => { if (L.mode === 'truck' && L.a && L.b) { const c = roadCache()[roadKey(L.a, L.b)]; if (c) { setPts(L, c); L.road = true; } } });
      const L = st.legs[Math.min(st.leg, st.n - 1)], d = L && ds.find(x => x.legIdx === L.i); if (!d) return;
      const id = unitIdOf(d); if (!id) return;
      const key = d.transportType + '|' + id, move = st.state === 'move';
      const u = map[key] || (map[key] = { key, type: d.transportType, id, d, rows: [], move: false, L });
      u.rows.push({ o, st, L, d, move }); if (move) { u.move = true; u.L = L; u.d = d; }
    });
    return Object.values(map).sort((a, b) => (b.move - a.move) || a.id.localeCompare(b.id));
  }
  const uSub = u => { const d = u.d; return u.type === 'truck' ? `${d.driver || '-'} ${d.dphone && d.dphone !== '-' ? '· ' + d.dphone : ''}` : u.type === 'air' ? `${d.depAirport || ''}${d.depAirport || d.arrAirport ? ' → ' : ''}${d.arrAirport || ''}` : `${d.shippingCo || ''} ${d.depPort ? '· ' + d.depPort + ' → ' + (d.arrPort || '') : ''}`; };
  const uPct = u => { const r = u.rows.find(x => x.move); return r ? Math.min(99, Math.round(r.st.raw * 100)) : 0; };
  const uEta = u => { const r = u.rows.find(x => x.move); if (r && r.L.tOut) return new Date(DC.toDate(r.L.tOut).getTime() + r.L.std * 60000); return DC.toDate(u.d.eta); };
  const uDep = u => { const r = u.rows.find(x => x.move); return r && r.L.tOut ? DC.toDate(r.L.tOut) : DC.toDate(u.d.departPlan); };
  function unitPos(u) { const r = u.rows.find(x => x.move) || u.rows[0]; return r.L.pts ? (r.move ? pointAt(r.L, r.st.prog) : r.L.a) : null; }
  function unitDraw(list, sel) {
    S_.lg.clearLayers(); const all = [], t = S_.token;
    list.forEach(u => {
      const on = !sel || sel === u.key, r = u.rows.find(x => x.move) || u.rows[0], L = r.L; if (!L.pts) return;
      const bad = u.rows.some(x => x.st.over > 0);
      if (u.move) { const [a, b] = split(L, r.st.prog); [L_.polyline(a, Object.assign(styleOf(L.mode, true, bad), { opacity: on ? .95 : .25 })), L_.polyline(b, Object.assign(styleOf(L.mode, false), { opacity: on ? .85 : .2 }))].forEach(x => x.addTo(S_.lg)); }
      else L_.polyline(L.pts, Object.assign(styleOf(L.mode, false), { opacity: on ? .85 : .2 })).addTo(S_.lg);
      all.push(...L.pts);
      [[L.a, L.from], [L.b, L.to]].forEach(([ll, nm]) => { if (ll && on) L_.marker(ll, { icon: L_.divIcon({ className: '', html: `<div class="mp-hub pass">${DC.HUBMODE_ICON[DC.hubMode(nm)] || '📍'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).bindTooltip(esc(nm), { className: 'mp-tip', direction: 'top', offset: [0, -12] }).addTo(S_.lg); });
      const p = unitPos(u);
      if (p) { const mk = L_.marker(p, { icon: L_.divIcon({ className: '', html: `<div class="mp-mk ${bad ? 'bad' : ''} ${u.move ? '' : 'wait'}" style="${on ? '' : 'opacity:.45'}"><span>${ICON[u.type]}</span><em class="mp-mk-no">${esc(u.id.slice(-7))}</em></div>`, iconSize: [38, 38], iconAnchor: [19, 19] }), zIndexOffset: on ? 1500 : 500 });
        mk.bindTooltip(`<b>${ICON[u.type]} ${esc(u.id)}</b><br>${esc(DC.shortName(L.from))} → ${esc(DC.shortName(L.to))}<br>${u.rows.length}건 적재`, { className: 'mp-tip', direction: 'top', offset: [0, -18] });
        mk.on('click', () => unitPick(u.key)); mk.addTo(S_.lg); all.push(p); }
      if (L.mode === 'truck' && L.a && L.b && !L.road && t) loadRoad(L, t).then(ok => { if (ok && t === S_.token && S_.mode === 'unit') unitOverview(true); });
    });
    return all;
  }
  function unitOverview(keep) {
    if (!S_.map) return;
    cancelAnimationFrame(S_.raf); S_.touring = false;
    if (S_.trail) { S_.map.removeLayer(S_.trail); S_.trail = null; }
    if (S_.mk) { S_.map.removeLayer(S_.mk); S_.mk = null; } S_.pos = null; S_.order = null; S_.st = null;
    if (!keep) S_.token = Math.random();
    const R = DC.refNow().t; let list = unitData(R); S_.units = list;
    const cnt = { truck: 0, air: 0, sea: 0 }; list.forEach(u => cnt[u.type]++);
    const f = S_.uf || 'all', vis = list.filter(u => f === 'all' || u.type === f), sel = S_.unit && vis.find(u => u.key === S_.unit) ? S_.unit : null; if (!sel) S_.unit = null;
    const all = unitDraw(vis, sel);
    if (!keep && all.length) { S_.map.invalidateSize(); const sp = sel ? unitPts(vis.find(u => u.key === sel)) : all; S_.map.fitBounds(L_.latLngBounds(sp), { padding: [50, 50], maxZoom: sel ? 10 : 8, animate: false }); }
    el('mp-warn').classList.add('hidden');
    const sl = el('mp-u'); sl.innerHTML = `<option value="">🚚 운송수단 전체 (${list.length}대)</option>` + ['truck', 'air', 'sea'].map(t => { const g = list.filter(u => u.type === t); return g.length ? `<optgroup label="${ICON[t]} ${TLAB[t]}">${g.map(u => `<option value="${esc(u.key)}" ${u.key === sel ? 'selected' : ''}>${esc(u.id)} · ${esc(DC.shortName(u.L.from))}→${esc(DC.shortName(u.L.to))} (${u.rows.length}건)</option>`).join('')}</optgroup>` : ''; }).join('');
    sl.value = sel || '';
    const chipH = `<div class="mp-fchips">${[['all', '전체', list.length], ['truck', '🚛 차량', cnt.truck], ['air', '✈️ 항공', cnt.air], ['sea', '🚢 선박', cnt.sea]].map(([k, n, c]) => `<button class="${f === k ? 'on' : ''}" onclick="MP.unitFilter('${k}')">${n} ${c}</button>`).join('')}</div>`;
    if (sel) { const u = vis.find(x => x.key === sel); el('mp-head').textContent = `${ICON[u.type]} ${u.id}`; el('mp-side').innerHTML = unitDetail(u); }
    else {
      el('mp-head').textContent = `🚚 운송수단별 현황 (${vis.length}대)`;
      el('mp-side').innerHTML = chipH + (vis.length ? vis.map(u => unitCard(u)).join('') : '<div class="empty">배차된 운송수단이 없습니다.<br>[차량배차]에서 구간별 운송수단을 배차하면 표시됩니다.</div>');
    }
    el('mp-all').style.display = sel ? '' : 'none';
  }
  function unitPts(u) { const L = u.L, a = []; if (L.pts) a.push(...L.pts); return a.length ? a : [[36.5, 127.8]]; }
  function unitCard(u) {
    const L = u.L, bad = u.rows.some(x => x.st.over > 0), pct = uPct(u);
    return `<div class="mp-ovc ${bad ? 'bad' : ''}" onclick="MP.unitPick('${esc(u.key)}')"><div class="mp-ord" style="font-size:inherit">${ICON[u.type]} ${esc(u.id)} <span class="status" style="font-size:13px">${u.move ? '이동중' : '출발대기'}</span></div>
      <div class="mp-sub">${esc(uSub(u))}</div>
      <div class="mp-ovr"><span>${esc(DC.shortName(L.from))} → ${esc(DC.shortName(L.to))}</span><span>적재 <b>${u.rows.length}건</b></span><span>도착 <b>${fmt(uEta(u))}</b></span></div>
      <div class="mp-bar"><i style="width:${pct}%"></i></div></div>`;
  }
  function unitDetail(u) {
    const L = u.L, pct = uPct(u), boxes = u.rows.reduce((a, r) => a + (+((S.packings().find(p => p.orderNo === r.o.no) || {}).boxes) || 0), 0);
    return `<div class="mp-sec"><div class="mp-ord">${ICON[u.type]} ${esc(u.id)} <span class="status">${u.move ? '이동중' : '출발대기'}</span></div><div class="mp-sub">${TLAB[u.type]} · ${esc(uSub(u))}</div></div>
      <div class="mp-kv"><span>구간</span><b>${esc(L.from)} → ${esc(L.to)}</b></div>
      <div class="mp-kv"><span>출발</span><b>${fmt(uDep(u))} ${u.move && u.rows[0].L.tOut ? '(실적)' : '(계획)'}</b></div>
      <div class="mp-kv"><span>도착 예정</span><b>${fmt(uEta(u))}</b></div>
      <div class="mp-kv"><span>구간 진행</span><b>${pct}%</b></div><div class="mp-bar"><i style="width:${pct}%"></i></div>
      <div class="mp-sec" style="margin-top:12px"><div class="mp-ord" style="font-size:15px">적재 내역 (오더 ${u.rows.length}건 · 박스 ${boxes}개)</div></div>
      <table class="mp-tbl"><thead><tr><th>오더</th><th>고객</th><th>제품·수량</th><th>박스</th></tr></thead><tbody>${u.rows.map(r => { const pk = S.packings().find(p => p.orderNo === r.o.no); return `<tr class="lk" onclick="MP.setMode('order');MP.pick('${esc(r.o.no)}')" title="오더 위치 보기"><td>${esc(r.o.no)}</td><td>${esc(r.o.customer)}</td><td>${esc(ordText(r.o))}</td><td>${pk ? esc(pk.boxes) : '-'} ${window.EV ? EV.badge(r.o.no) : ''}</td></tr>`; }).join('')}</tbody></table>
      <div class="mp-note">오더 행을 누르면 해당 오더의 전체 경로(오더별 보기)로 이동합니다.</div>`;
  }
  function unitPick(key) { S_.unit = key || null; unitOverview(false); }
  function unitFilter(f) { S_.uf = f; S_.unit = null; unitOverview(false); }
  function setMode(m) {
    if (m === S_.mode) { if (m === 'unit') { S_.unit = null; unitOverview(false); } return; }
    S_.mode = m; const u = m === 'unit';
    el('mp-m-o').classList.toggle('on', !u); el('mp-m-u').classList.toggle('on', u);
    el('mp-q').style.display = u ? 'none' : ''; el('mp-u').style.display = u ? '' : 'none';
    ['mp-rep', 'mp-foc', 'mp-tour'].forEach(i => el(i).style.display = u ? 'none' : '');
    if (u) { S_.unit = null; unitOverview(false); } else { el('mp-all').style.display = 'none'; overview(); }
    try { history.replaceState(null, '', location.pathname + (u ? '?mode=unit' : '')); } catch (e) {}
  }

  // ── 제어 ──────────────────────────────────────────────
  const el = id => document.getElementById(id);
  let L_ = null;
  function chips() {
    const act = S.orders().filter(o => o.status !== '도착완료'), mv = act.filter(o => ['운송중', '지연'].includes(o.status));
    const cur = S_.order ? S_.order.no : '', nmv = DC.moving().length, opt = o => `<option value="${esc(o.no)}" ${o.no === cur ? 'selected' : ''}>${esc(o.no)} · ${esc(o.customer)} [${esc(o.status)}]</option>`;
    el('mp-q').innerHTML = `<option value="" ${cur ? '' : 'selected'}>🗺️ 운송 중 전체 (${nmv}건)</option><optgroup label="진행 중 오더">${act.map(opt).join('')}</optgroup><optgroup label="도착 완료 오더">${S.orders().filter(o => o.status === '도착완료').map(opt).join('')}</optgroup>`;
  }
  function warn(st) {
    const miss = st.D.stops.filter(s => !s.ll).map(s => s.name), w = el('mp-warn');
    if (miss.length) { w.innerHTML = `⚠️ 좌표가 없는 거점: <b>${miss.map(esc).join(', ')}</b><br>[기준정보 → 거점]에서 위도·경도를 입력하면 지도에 표시됩니다.`; w.classList.remove('hidden'); } else w.classList.add('hidden');
  }
  function fit(pad) {
    if (!S_.map || !S_.st) return; const pts = []; S_.st.legs.forEach(L => L.pts && pts.push(...L.pts)); S_.st.D.stops.forEach(s => s.ll && pts.push(s.ll));
    if (pts.length) S_.map.fitBounds(L_.latLngBounds(pts), { padding: [50, 50], maxZoom: 12 });
  }
  function pick(no) {
    const o = S.orders().find(x => x.no === no); if (!o) { alert('오더번호를 찾을 수 없습니다: ' + no); return; }
    S_.touring = false; S_.order = o; S_.fitted = false; S_.mk && S_.map.removeLayer(S_.mk); S_.mk = null; S_.pos = null; S_.token = Math.random();
    el('mp-q').value = no; el('mp-all').style.display = ''; S_.lg.clearLayers(); refresh(false); chips();
    const t = S_.token; S_.st.legs.filter(L => L.mode === 'truck' && L.a && L.b).forEach(L => loadRoad(L, t).then(ok => { if (ok && t === S_.token) { drawRoute(); evMarks(); placeMarker(0); if (!S_.fitted) fit(); } }));
    try { history.replaceState(null, '', '?order=' + encodeURIComponent(no)); } catch (e) {}
  }
  function refresh(anim) {
    if (!S_.order) return; const st = S_.st ? calcKeep() : null;
    S_.st = calcWithPts(S_.order); drawRoute(); evMarks(); placeMarker(anim ? 1400 : 0); panel(); warn(S_.st);
    if (!S_.fitted && S_.map) { fit(); S_.fitted = true; }
  }
  const calcKeep = () => null;
  function calcWithPts(o) {       // 이전에 읽어 둔 도로경로를 재계산 후에도 유지
    const old = S_.st && S_.order === o ? S_.st.legs : [], st = calc(o, DC.refNow().t);
    st.legs.forEach(L => { const p = old.find(x => x.i === L.i && x.from === L.from && x.to === L.to); if (p && p.road && L.mode === 'truck') { L.pts = p.pts; L.cum = p.cum; L.len = p.len; L.road = true; } else if (L.mode === 'truck' && L.a && L.b) { const c = roadCache()[roadKey(L.a, L.b)]; if (c) { setPts(L, c); L.road = true; } } });
    return st;
  }
  function search() { const q = el('mp-q').value; if (q) pick(q); else overview(); }
  function replay() {
    const st = S_.st; if (!st || !S_.map || !S_.mk) return; const pts = [];
    st.legs.forEach(L => { if (!L.pts) return; if (L.i < st.leg || st.state === 'done') pts.push(...L.pts); else if (L.i === st.leg && st.state === 'move') pts.push(...split(L, st.prog)[0]); });
    if (pts.length < 2) return; const cum = cumOf(pts), tot = cum[cum.length-1] || 1, t0 = performance.now(), ms = 7000; cancelAnimationFrame(S_.raf);
    const step = t => { const r = Math.min(1, (t - t0) / ms), tt = r * tot; let i = 1; while (i < cum.length - 1 && cum[i] < tt) i++;
      const s = (cum[i]-cum[i-1]) || 1e-9, q = (tt - cum[i-1]) / s, a = pts[i-1], b = pts[i]; S_.mk.setLatLng([a[0] + (b[0]-a[0])*q, a[1] + (b[1]-a[1])*q]); S_.map.panTo(S_.mk.getLatLng(), { animate: false });
      if (r < 1) S_.raf = requestAnimationFrame(step); else placeMarker(0); };
    S_.raf = requestAnimationFrame(step);
  }
  function tour() {            // 전체 경로: 출발지 → 최종 도착지 이동을 처음부터 끝까지 보여줌
    const st = S_.st; if (!st || !S_.map || !S_.mk) return; fit(); const pts = [];
    st.legs.forEach(L => { if (L.pts) pts.push(...L.pts); }); if (pts.length < 2) return;
    const cum = cumOf(pts), tot = cum[cum.length-1] || 1, t0 = performance.now(), ms = 10000, stopIdx = []; cancelAnimationFrame(S_.raf);
    if (S_.trail) S_.map.removeLayer(S_.trail); S_.trail = L_.polyline([pts[0]], { color: '#c0392b', weight: 5, opacity: .85 }).addTo(S_.map); S_.touring = true;
    const done = () => { S_.touring = false; if (S_.trail) { const t = S_.trail; setTimeout(() => S_.map && S_.map.removeLayer(t), 1500); S_.trail = null; } placeMarker(900); };
    const step = t => { if (!S_.touring) return; const r = Math.min(1, (t - t0) / ms), tt = r * tot; let i = 1; while (i < cum.length - 1 && cum[i] < tt) i++;
      const sg = (cum[i]-cum[i-1]) || 1e-9, q = Math.min(1, Math.max(0, (tt - cum[i-1]) / sg)), a = pts[i-1], b = pts[i], cur = [a[0] + (b[0]-a[0])*q, a[1] + (b[1]-a[1])*q];
      S_.mk.setLatLng(cur); S_.trail.setLatLngs(pts.slice(0, i).concat([cur]));
      if (r < 1) S_.raf = requestAnimationFrame(step); else done(); };
    S_.mk.setLatLng(pts[0]); S_.raf = requestAnimationFrame(step);
  }
  function focusNow() { if (S_.pos && S_.map) S_.map.setView(S_.pos, Math.max(S_.map.getZoom(), 7), { animate: true }); }
  function init() {
    initNav(); chips();
    if (typeof L === 'undefined') { el('mp-map').innerHTML = '<div class="mp-empty">지도 라이브러리를 불러오지 못했습니다.<br>인터넷 연결을 확인한 뒤 새로고침(Ctrl+Shift+R) 하세요.</div>'; }
    else {
      L_ = L; S_.map = L_.map('mp-map', { zoomControl: true, worldCopyJump: false, minZoom: 2, attributionControl: true }).setView([36.5, 127.8], 6);
      L_.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(S_.map);
      S_.lg = L_.layerGroup().addTo(S_.map);
    }
    const q = new URLSearchParams(location.search).get('order');
    const first = q && S.orders().find(o => o.no === q);
    if (!S.orders().length) el('mp-side').innerHTML = '<div class="empty">등록된 오더가 없습니다</div>';
    else if (S_.map) { if (new URLSearchParams(location.search).get('mode') === 'unit') { S_.mode = 'order'; setMode('unit'); } else if (first) pick(first.no); else overview(); }
    if (window.EV) EV.onChange(() => { if (S_.order) { panel(); S_.lg && drawRoute(); evMarks(); } else if (S_.mode === 'unit' && S_.map) unitOverview(true); });
    clearInterval(S_.timer); S_.timer = setInterval(() => { if (document.hidden || S_.touring) return; if (S_.mode === 'unit') { if (S_.map) unitOverview(true); } else if (S_.order) { chips(); refresh(true); } else if (S_.map) { const c = S_.map.getCenter(), z = S_.map.getZoom(); overview(); S_.map.setView(c, z, { animate: false }); } }, 20000);
    window.addEventListener('resize', () => S_.map && S_.map.invalidateSize());
  }
  return { init, pick, allBtn: () => S_.mode === 'unit' ? unitPick(null) : overview(), setMode, unitPick, unitFilter, overview, search, replay, tour, fit: () => fit(), focusNow, _s: S_, _calc: calc };
})();
window.lmtsReady = function () { MP.init(); };
