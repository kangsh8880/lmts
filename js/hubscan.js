/* LMTS 거점 현장 모드 — 박스(포장번호 QR)·운송장 스캔 → 오더 자동 IN/OUT
   · 오더의 박스를 모두 스캔하면 자동 확정, 일부만 스캔하면 "부분 입고"로 남고 [부분 확정]으로 마감
   · 상황실은 [📡 스캔 현황]에서 진행 중·장시간 미완료를 확인 */
const HS = (() => {
  const K = 'lmts_hs', STALE_MIN = 60;
  let foreign = 0, cfg = { hub: '', person: '', mode: 'auto' }, view = 'ctl', stream = null, camTimer = null, lastCam = { v: '', t: 0 };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const save = () => { try { localStorage.setItem(K, JSON.stringify(cfg)); } catch (e) {} };
  const pkgOf = no => S.packings().find(p => p.orderNo === no);
  const packsOf = p => LBL_packs(p);
  function LBL_packs(p) { const s = []; (p.lines || []).forEach(l => { const k = String(l.packNo == null ? '1' : l.packNo); if (!s.includes(k)) s.push(k); }); if (!s.length) for (let i = 1; i <= (+p.boxes || 0); i++) s.push(String(i)); return s.sort((a, b) => (+a || 0) - (+b || 0) || a.localeCompare(b)); }
  const mins = t => { const a = new Date(String(t).replace(' ', 'T')); return isNaN(a) ? 0 : Math.max(0, Math.round((Date.now() - a.getTime()) / 60000)); };
  const evDone = (no, hub, ev) => S.events().some(e => e.orderNo === no && e.hub === hub && e.event === ev);

  // ── 스캔 진행(아직 확정되지 않은 것) ─────────────────────
  function progress() {
    const g = {};
    S.scans().forEach(s => { if (evDone(s.orderNo, s.hub, s.event)) return; const k = [s.orderNo, s.hub, s.event].join('|'); (g[k] = g[k] || { no: s.orderNo, hub: s.hub, event: s.event, packs: new Set(), first: s.time, last: s.time, person: s.person });
      g[k].packs.add(String(s.packNo)); if (s.time < g[k].first) g[k].first = s.time; if (s.time > g[k].last) g[k].last = s.time; });
    return Object.values(g).map(x => { const p = pkgOf(x.no), tot = p ? packsOf(p).length : x.packs.size; return Object.assign(x, { total: tot, k: x.packs.size }); });
  }
  const progOf = (no, hub, ev) => progress().find(x => x.no === no && x.hub === hub && x.event === ev);

  // ── 소리·메시지 ─────────────────────────────────────────
  let ac = null;
  function beep(kind) { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const seq = kind === 'ok' ? [[880, .12]] : kind === 'done' ? [[660, .1], [990, .18]] : [[220, .18], [180, .25]];
    let t = ac.currentTime; seq.forEach(([f, d]) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = .12; o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d); t += d + .04; });
    if (navigator.vibrate) navigator.vibrate(kind === 'err' || kind === 'warn' ? [120, 60, 120] : 60); } catch (e) {} }
  function say(kind, text) { const m = document.getElementById('hs-msg'); if (m) { m.className = 'hs-msg ' + kind; m.textContent = text; } beep(kind === 'ok' ? 'ok' : kind === 'done' ? 'done' : 'err'); }

  // ── 코드 해석: 포장번호(오더#상자) / 운송장 / 오더번호 ───
  function resolve(raw) {
    raw = String(raw || '').trim(); if (!raw) return null;
    const L = LBL.parse(raw);
    if (L.ok && L.pk === 'IN' && /^RCV-/.test(L.no)) return { err: `${L.no} 는 자사물류창고 입고 라벨입니다 — 거점 IN/OUT 대상이 아닙니다 (출하 포장 라벨을 스캔하세요)` };
    if (L.ok) { const p = pkgOf(L.no); if (!p) return { err: `${L.no} 는 LMTS 라벨이지만 Packing 기록이 없습니다 (이 시스템에 등록되지 않은 오더)` }; if (!packsOf(p).includes(L.pk)) return { err: `${L.no} 에 상자 ${L.pk} 는 없습니다` }; return { no: L.no, pack: L.pk }; }
    if (L.mine) return { err: L.err };
    const way = S.packings().find(p => p.waybill && p.waybill.toLowerCase() === raw.toLowerCase()); if (way) return { no: way.orderNo, pack: null, via: '운송장' };
    return { err: `우리(LMTS) 물건이 아닙니다 — LMTS 라벨이 아니고 등록된 운송장도 아닙니다 (${raw.slice(0, 40)}). 타사 물건인지 확인하세요`, foreign: true };
  }
  function whyNot(no, hub) {
    const o = S.orders().find(x => x.no === no); if (!o || !o.route) return '오더 정보를 찾을 수 없습니다';
    if (!routeNames(o).includes(hub)) return `⚠ ${no} 의 경로에 없는 거점입니다 (상황실에서 확인)`;
    const nx = nextStep(o); if (nx.done) return `${no} 는 이미 모든 거점 처리가 끝났습니다`;
    if (!HP_ACT.includes(o.status)) return `${no} 는 현재 '${o.status}' 상태라 처리할 수 없습니다 (출고·배차 확인)`;
    return `${no} 는 아직 이 거점 차례가 아닙니다 (다음 처리: ${nx.hub} ${nx.event})`;
  }

  // ── 스캔 처리 ───────────────────────────────────────────
  function scan(raw) {
    if (!cfg.hub) return say('err', '먼저 내 거점을 선택하세요');
    const r = resolve(raw); if (!r) return; if (r.err) { if (r.foreign) { foreign++; render(); } return say('err', '⛔ ' + r.err); }
    const td = hubTodo(cfg.hub).find(x => x.o.no === r.no);
    if (!td) return say('err', '⛔ ' + whyNot(r.no, cfg.hub));
    if (cfg.mode !== 'auto' && td.event !== cfg.mode) return say('err', `⛔ ${r.no} 는 지금 ${td.event} 차례입니다 (선택한 모드: ${cfg.mode})`);
    const p = pkgOf(r.no), packs = packsOf(p), have = new Set((progOf(r.no, cfg.hub, td.event) || { packs: new Set() }).packs);
    if (r.pack && have.has(r.pack)) return say('warn', `이미 스캔한 상자입니다 — ${r.no} 상자 ${r.pack} (${have.size}/${packs.length})`);
    const add = (r.pack ? [r.pack] : packs).filter(x => !have.has(x)); if (!add.length) return say('warn', `${r.no} 는 이미 모든 상자를 스캔했습니다`);
    const arr = S.scans(), t = now();
    add.forEach(x => arr.push({ time: t, hub: cfg.hub, event: td.event, code: LBL.code(r.no, x), orderNo: r.no, packNo: x, person: cfg.person }));
    S.set('scans', arr);
    const k = have.size + add.length;
    if (k >= packs.length) { confirm(r.no, cfg.hub, td.event, false); say('done', `✅ ${r.no} · ${cfg.hub} ${td.event} 자동 확정 (박스 ${k}/${packs.length}${r.via ? ' · ' + r.via : ''})`); }
    else say('ok', `📦 ${r.no} 상자 ${r.pack} 확인 — ${k}/${packs.length}`);
    render(); focus();
  }

  // ── 이벤트 확정 ─────────────────────────────────────────
  function confirm(no, hub, ev, partial, manual) {
    const td = hubTodo(hub).find(x => x.o.no === no && x.event === ev); if (!td) return false;
    const pr = progOf(no, hub, ev), p = pkgOf(no), tot = p ? packsOf(p).length : 0, k = pr ? pr.k : 0, t = normTime(localDT());
    const note = manual ? '수동 처리(현장)' : partial ? `스캔 부분 ${k}/${tot} (미확인 ${tot - k})` : `스캔 ${tot}박스`;
    const events = S.events(); events.push({ time: t, orderNo: no, customer: td.o.customer || '', hub, event: ev, person: cfg.person, note });
    S.set('events', events);
    if (ev === '도착완료') updateOrderStatus(no, '도착완료'); else reconcileOrderStatus();
    if (partial && !manual) { const al = S.alarms(); al.push({ id: 'ALM-' + Date.now(), time: t, type: 'PARTIAL_SCAN', orderNo: no, customer: td.o.customer || '', hub, event: ev, message: `[부분 ${ev}] ${no} ${hub}: 박스 ${k}/${tot} 만 확인되어 마감 (미확인 ${tot - k})`, read: false }); S.set('alarms', al); }
    try { fillTrackingSelects(); onOrderPick(); renderHubPanel(); } catch (e) {}
    return true;
  }
  function partialConfirm(no, hub, ev) {
    const pr = progOf(no, hub, ev); if (!pr) return;
    if (!window.confirm(`${no} — ${hub} ${ev}\n박스 ${pr.k}/${pr.total} 만 스캔되었습니다.\n나머지 ${pr.total - pr.k}박스는 미확인으로 기록하고 ${ev} 처리할까요?`)) return;
    if (confirm(no, hub, ev, true)) say('warn', `${no} 부분 ${ev} 확정 (${pr.k}/${pr.total}) — 상황실에 미확인 알림`); render(); focus();
  }
  function manual(no, hub, ev) {
    if (!window.confirm(`${no} — ${hub} ${ev}\n스캔 없이 수동으로 ${ev} 처리할까요?`)) return;
    if (confirm(no, hub, ev, false, true)) say('ok', `${no} ${hub} ${ev} 수동 처리`); render(); focus();
  }
  function undo() {
    const arr = S.scans(); let i = -1; for (let j = arr.length - 1; j >= 0; j--) if (arr[j].hub === cfg.hub && !evDone(arr[j].orderNo, arr[j].hub, arr[j].event)) { i = j; break; }
    if (i < 0) return say('warn', '취소할 스캔이 없습니다'); const s = arr.splice(i, 1)[0]; S.set('scans', arr); say('warn', `↩ 스캔 취소 — ${s.orderNo} 상자 ${s.packNo}`); render(); focus();
  }

  // ── 화면 ────────────────────────────────────────────────
  const focus = () => { const i = document.getElementById('hs-in'); if (i && view === 'hub') setTimeout(() => i.focus(), 30); };
  function render() {
    if (!document.getElementById('hub-scan')) return;
    const hubs = S.hubs(), sel = document.getElementById('hs-hub');
    if (sel) { const todoN = n => hubTodo(n).length; sel.innerHTML = '<option value="">-- 내 거점 선택 --</option>' + hubs.map(h => `<option value="${esc(h.name)}"${h.name === cfg.hub ? ' selected' : ''}>${esc(h.name)}${todoN(h.name) ? ` — 처리 ${todoN(h.name)}건` : ''}</option>`).join(''); }
    const pi = document.getElementById('hs-person'); if (pi && pi.value !== cfg.person) pi.value = cfg.person;
    document.querySelectorAll('#hs-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === cfg.mode));
    const body = document.getElementById('hs-body'); if (!cfg.hub) { body.innerHTML = '<div class="empty">위에서 내 거점을 선택하면 처리할 오더와 스캔 현황이 나타납니다.</div>'; kpi([]); return; }
    const todo = hubTodo(cfg.hub), prog = progress().filter(x => x.hub === cfg.hub && todo.some(t => t.o.no === x.no && t.event === x.event));
    const progNos = new Set(prog.map(x => x.no)), wait = todo.filter(t => !progNos.has(t.o.no));
    const today = now().slice(0, 10), done = S.events().filter(e => e.hub === cfg.hub && /^(스캔|수동 처리\(현장\))/.test(e.note || '') && e.time.slice(0, 10) === today).sort((a, b) => b.time.localeCompare(a.time));
    kpi([done.length, prog.length, wait.length]);
    const card = x => { const p = pkgOf(x.no), o = S.orders().find(y => y.no === x.no), packs = p ? packsOf(p) : [], pct = x.total ? Math.round(x.k / x.total * 100) : 0;
      return `<div class="hs-oc"><div class="hs-oh"><b>${esc(x.no)}</b> <span class="trk-ev ${x.event}">${x.event}</span> <span class="hs-cu">${esc(o ? o.customer : '')} · ${esc(o ? ordText(o) : '')}</span></div>
        <div class="hs-bar2"><i style="width:${pct}%"></i></div><div class="hs-pk"><b>${x.k} / ${x.total}</b> 박스 ${packs.map(k => `<span class="hs-chip ${x.packs.has(k) ? 'ok' : ''}">${x.packs.has(k) ? '✓' : '○'} ${esc(k)}</span>`).join('')}</div>
        <div class="hs-act"><button type="button" class="btn btn-ghost btn-sm" onclick="HS.partial('${esc(x.no)}','${esc(x.hub)}','${x.event}')">부분 ${x.event} 확정</button></div></div>`; };
    body.innerHTML = `<div class="hs-col"><div class="hs-h">📦 스캔 중인 오더 <span>${prog.length}건</span></div>${prog.map(card).join('') || '<div class="empty">스캔을 시작하면 여기에 진행 상태가 나타납니다.</div>'}
      <div class="hs-h" style="margin-top:12px">✅ 오늘 이 거점에서 확정 <span>${done.length}건</span></div>${done.slice(0, 8).map(e => `<div class="hs-dn"><b>${esc(e.orderNo)}</b> <span class="trk-ev ${e.event}">${e.event}</span> ${esc(e.time.slice(11, 16))} <span class="hs-nt">${esc(e.note || '')}</span> ${window.EV ? `${EV.badge(e.orderNo, e.hub, e.event)}<button type="button" class="ev-bd" onclick="HS.photo('${esc(e.orderNo)}','${esc(e.hub)}','${e.event}')">📷 사진</button>` : ''}</div>`).join('') || '<div class="empty">아직 없음</div>'}</div>
      <div class="hs-col"><div class="hs-h">⏳ 이 거점 처리 대기 <span>${wait.length}건</span></div>${wait.map(t => { const p = pkgOf(t.o.no); return `<div class="hs-wt"><b>${esc(t.o.no)}</b> <span class="trk-ev ${t.event}">${t.event}</span> <span class="hs-cu">${esc(t.o.customer)} · ${esc(t.state)} · ${p ? '박스 ' + packsOf(p).length : 'Packing 없음'}</span>
        <button type="button" class="btn btn-ghost btn-xs" onclick="HS.manual('${esc(t.o.no)}','${esc(cfg.hub)}','${t.event}')">수동 처리</button></div>`; }).join('') || '<div class="empty">처리할 오더가 없습니다</div>'}</div>`;
  }
  function kpi(a) { const k = document.getElementById('hs-kpi'); if (!k) return; const [d, p, w] = a.length ? a : ['-', '-', '-']; k.innerHTML = `<span>오늘 확정 <b>${d}</b></span><span>스캔 중 <b>${p}</b></span><span>처리 대기 <b>${w}</b></span>${foreign ? `<span class="hs-fg">타사 물건 감지 <b>${foreign}</b></span>` : ''}`; }

  // ── 상황실: 스캔 현황 보조창 ────────────────────────────
  function statusRows() { return progress().map(x => Object.assign(x, { min: mins(x.first), idle: mins(x.last) })).sort((a, b) => b.min - a.min); }
  function badge() { const b = document.getElementById('sc-n'); if (!b) return; const r = statusRows(), st = r.filter(x => x.min >= STALE_MIN).length; b.textContent = r.length ? `(${r.length})` : ''; b.className = st ? 'sc-warn' : ''; }
  function openStatus() {
    const r = statusRows(), sc = S.scans().slice().sort((a, b) => b.time.localeCompare(a.time)).slice(0, 15), m = document.getElementById('scan-modal');
    document.getElementById('sc-body').innerHTML = `<div class="hs-h">📦 부분 스캔 진행 중 <span>${r.length}건 · ${STALE_MIN}분 이상 미완료 ${r.filter(x => x.min >= STALE_MIN).length}건</span></div>
      <table class="trk-log" data-xl="skip"><thead><tr><th>오더</th><th>거점</th><th>이벤트</th><th>박스</th><th>첫 스캔</th><th>경과</th><th>처리자</th></tr></thead><tbody>${r.map(x => `<tr class="${x.min >= STALE_MIN ? 'sc-stale' : ''}"><td><b>${esc(x.no)}</b></td><td>${esc(x.hub)}</td><td><span class="trk-ev ${x.event}">${x.event}</span></td><td><b>${x.k}/${x.total}</b></td><td>${esc(x.first.slice(5))}</td><td>${x.min >= 60 ? Math.floor(x.min / 60) + '시간 ' + (x.min % 60) + '분' : x.min + '분'}${x.min >= STALE_MIN ? ' ⚠' : ''}</td><td>${esc(x.person || '-')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">진행 중인 스캔이 없습니다</td></tr>'}</tbody></table>
      <div class="hs-h" style="margin-top:12px">🕘 최근 스캔 <span>${sc.length}건</span></div>
      <table class="trk-log" data-xl="skip"><thead><tr><th>시각</th><th>거점</th><th>이벤트</th><th>포장번호</th><th>처리자</th></tr></thead><tbody>${sc.map(s => `<tr><td>${esc(s.time.slice(5))}</td><td>${esc(s.hub)}</td><td><span class="trk-ev ${s.event}">${s.event}</span></td><td>${esc(s.code)}</td><td>${esc(s.person || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">스캔 기록 없음</td></tr>'}</tbody></table>`;
    m.classList.remove('hidden');
  }

  // ── 카메라 스캔 ─────────────────────────────────────────
  async function cam() {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return say('warn', '이 브라우저는 카메라 스캔을 지원하지 않습니다. 스캐너 또는 직접 입력을 사용하세요 (Android 크롬 권장)');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { return say('err', '카메라를 사용할 수 없습니다 (권한 허용 확인)'); }
    const ov = document.getElementById('hs-cam-ov'), vd = document.getElementById('hs-video'); vd.srcObject = stream; await vd.play(); ov.classList.remove('hidden');
    const det = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
    camTimer = setInterval(async () => { try { const r = await det.detect(vd); if (r.length) { const v = r[0].rawValue, t = Date.now(); if (v !== lastCam.v || t - lastCam.t > 2500) { lastCam = { v, t }; scan(v); } } } catch (e) {} }, 300);
  }
  function camClose() { clearInterval(camTimer); camTimer = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; const ov = document.getElementById('hs-cam-ov'); if (ov) ov.classList.add('hidden'); focus(); }

  // ── 모드·설정 ───────────────────────────────────────────
  function setView(v) {
    view = v; document.body.classList.toggle('hubmode', v === 'hub');
    document.querySelectorAll('#md-ctl button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    try { localStorage.setItem('lmts_trk_view', v); } catch (e) {}
    render(); focus();
  }
  function init() {
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) {}
    const q = new URLSearchParams(location.search); if (q.get('hub')) { cfg.hub = q.get('hub'); save(); }
    let v = 'ctl'; try { v = localStorage.getItem('lmts_trk_view') || 'ctl'; } catch (e) {} if (q.get('mode') === 'hub' || q.get('hub')) v = 'hub'; else if (q.get('mode') === 'ctl') v = 'ctl';
    const inp = document.getElementById('hs-in'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const x = inp.value; inp.value = ''; scan(x); } });
    const pe = document.getElementById('hs-person'); if (pe) pe.addEventListener('change', () => { cfg.person = pe.value.trim(); save(); });
    setView(v); badge(); setInterval(() => { if (!document.hidden) { badge(); if (view === 'hub') render(); } }, 20000);
  }
  return { init, scan, setView, setHub: h => { cfg.hub = h; save(); render(); focus(); }, setMode: m => { cfg.mode = m; save(); render(); focus(); }, submit: () => { const i = document.getElementById('hs-in'); const x = i.value; i.value = ''; scan(x); },
    partial: partialConfirm, manual, undo, cam, camClose, openStatus, badge, render, photo: (no, hub, ev) => EV.ask(hub + ' ' + ev + ' 사진 증빙 (선택)', [{ orderNo: no, hub, kind: ev }], cfg.person), _cfg: () => cfg };
})();
window.HS = HS;
