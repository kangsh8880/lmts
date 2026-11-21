/* LMTS 사진·GPS 증빙 (선택 기능)
   - Packing 완료 / 거점 IN·OUT·도착완료 처리 후 "사진을 남기시겠습니까?" 로 안내 (강제 아님)
   - 사진 촬영 위치(GPS)를 거점 좌표와 비교해 "오더가 실제 그 장소에 있음"을 집계
   - 저장은 어댑터 방식: 지금은 이 기기(IndexedDB), 저장소(private 저장소) 준비 후 EV.adapter 만 교체 */
const EV = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NEAR_KM = 3;                                 // 거점 좌표와 이 거리 이내면 "거점 확인"
  const KIND = { PACKING: '📦 Packing', IN: '⬇️ IN', OUT: '⬆️ OUT', '도착완료': '🏁 도착완료' };
  let list = [], ready = false, cur = null, st = null, listeners = [];

  // ── 저장 어댑터 (로컬: IndexedDB) ───────────────────────
  const Local = {
    name: '이 기기(임시)',
    _db() { return new Promise((res, rej) => { const r = indexedDB.open('lmts_evidence', 1); r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('blob'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async all() { const db = await this._db(); return new Promise((res, rej) => { const q = db.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); },
    async add(meta, blob) { const db = await this._db(); return new Promise((res, rej) => { const t = db.transaction(['meta', 'blob'], 'readwrite'); t.objectStore('meta').put(meta); if (blob) t.objectStore('blob').put(blob, meta.id); t.oncomplete = () => res(meta); t.onerror = () => rej(t.error); }); },
    async blob(id) { const db = await this._db(); return new Promise((res, rej) => { const q = db.transaction('blob').objectStore('blob').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); },
    async remove(id) { const db = await this._db(); return new Promise((res, rej) => { const t = db.transaction(['meta', 'blob'], 'readwrite'); t.objectStore('meta').delete(id); t.objectStore('blob').delete(id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  };
  const api = { adapter: Local };

  const nowS = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const rad = Math.PI / 180;
  const hav = (a, b) => { const dl = (b[0] - a[0]) * rad, dg = (b[1] - a[1]) * rad, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dg / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  function hubLL(name) { try { const h = S.hubs().find(x => x.name === name); return (!h || h.lat == null || h.lat === '' || isNaN(+h.lat) || isNaN(+h.lng)) ? null : [+h.lat, +h.lng]; } catch (e) { return null; } }
  function dist(m) { if (!m || m.lat == null) return null; const h = hubLL(m.hub); return h ? hav(h, [m.lat, m.lng]) : null; }
  function verdict(m) {          // 'ok' 거점 확인 / 'far' 거점과 멀음 / 'nogps' 위치 없음 / 'nohub' 거점 좌표 없음
    if (m.lat == null) return { k: 'nogps', t: '위치 정보 없음' };
    const d = dist(m); if (d == null) return { k: 'nohub', t: '위치 기록됨 (거점 좌표 미입력)' };
    return d <= NEAR_KM ? { k: 'ok', t: `거점 확인 (${d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km'} 이내)`, d } : { k: 'far', t: `거점에서 ${d.toFixed(1)}km 떨어짐`, d };
  }

  api.init = async () => { try { list = await api.adapter.all(); } catch (e) { list = []; } ready = true; listeners.forEach(f => { try { f(); } catch (e) {} }); };
  api.onChange = f => { listeners.push(f); if (ready) f(); };
  api.all = () => list.slice();
  api.of = no => list.filter(x => x.orderNo === no).sort((a, b) => a.time < b.time ? -1 : 1);
  api.has = (no, hub, kind) => list.some(x => x.orderNo === no && (!hub || x.hub === hub) && (!kind || x.kind === kind));
  api.verdict = verdict; api.KIND = KIND;
  api.badge = (no, hub, kind) => { const n = list.filter(x => x.orderNo === no && (!hub || x.hub === hub) && (!kind || x.kind === kind)).length;
    return n ? `<button type="button" class="ev-bd" onclick="event.stopPropagation();EV.view('${esc(no)}','${esc(hub || '')}','${esc(kind || '')}')" title="증빙 사진 보기">📷 ${n}</button>` : ''; };
  api.stat = (orders) => { const need = orders.length, got = orders.filter(o => list.some(x => x.orderNo === o.no)).length, ok = orders.filter(o => list.some(x => x.orderNo === o.no && verdict(x).k === 'ok')).length; return { need, got, ok, rate: need ? got / need * 100 : 0 }; };

  // ── 사진 압축 ──────────────────────────────────────────
  function compress(file, max = 1280, q = 0.72) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { const r = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? res(b) : rej(new Error('compress')), 'image/jpeg', q); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); }; im.src = url;
    });
  }

  // ── GPS ────────────────────────────────────────────────
  function locate() {
    return new Promise(res => {
      if (!navigator.geolocation) return res({ err: '이 기기는 위치 기능을 지원하지 않습니다' });
      navigator.geolocation.getCurrentPosition(p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0) }),
        e => res({ err: e && e.code === 1 ? '위치 사용이 허용되지 않았습니다(브라우저 설정 확인)' : '위치를 확인하지 못했습니다' }), { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 });
    });
  }

  // ── 촬영 창 ────────────────────────────────────────────
  function shell() {
    let m = document.getElementById('ev-modal');
    if (!m) { m = document.createElement('div'); m.id = 'ev-modal'; m.className = 'modal-bg hidden'; document.body.appendChild(m); }
    return m;
  }
  api.close = () => { const m = document.getElementById('ev-modal'); if (m) m.classList.add('hidden'); if (st && st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} } st = null; };
  api.open = function (o) {       // o: {title, targets:[{orderNo,hub,kind}], person}
    const targets = (o.targets || []).filter(t => t && t.orderNo); if (!targets.length) return;
    st = { title: o.title || '사진 증빙', targets: targets.map(t => Object.assign({ done: false }, t)), i: 0, person: o.person || '', blob: null, url: null, gps: null, busy: false };
    draw(); gps();
  };
  async function gps() { if (!st) return; st.gps = { wait: true }; paintGps(); const g = await locate(); if (!st) return; st.gps = g; paintGps(); }
  function paintGps() {
    const e = document.getElementById('ev-gps'); if (!e || !st) return; const g = st.gps, t = st.targets[st.i];
    if (!g || g.wait) { e.innerHTML = '📡 현재 위치 확인 중…'; return; }
    if (g.err) { e.innerHTML = `<span class="ev-warn">⚠️ ${esc(g.err)}</span> · 사진만 저장할 수 있습니다 <button type="button" class="ev-lk" onclick="EV._gps()">다시 확인</button>`; return; }
    const v = verdict({ lat: g.lat, lng: g.lng, hub: t.hub });
    e.innerHTML = `📍 <b>${g.lat}, ${g.lng}</b> (정확도 ±${g.acc}m) · <span class="ev-v ${v.k}">${esc(v.t)}</span> <button type="button" class="ev-lk" onclick="EV._gps()">다시 확인</button>`;
  }
  api._gps = gps;
  function draw() {
    const m = shell(), t = st.targets[st.i], dn = st.targets.filter(x => x.done).length;
    m.innerHTML = `<div class="modal ev-box"><div class="modal-title">📷 ${esc(st.title)}</div>
      <div class="modal-desc">사진은 선택 사항입니다. 물품 또는 송장을 촬영하면 촬영 위치(GPS)가 함께 기록되어, 해당 오더가 그 장소에 있었음을 확인할 수 있습니다.</div>
      ${st.targets.length > 1 ? `<div class="ev-row"><label>대상</label><select id="ev-tg" onchange="EV._tg(this.value)">${st.targets.map((x, k) => `<option value="${k}" ${k === st.i ? 'selected' : ''}>${x.done ? '✓ ' : ''}${esc(x.orderNo)} · ${esc(KIND[x.kind] || x.kind)}</option>`).join('')}</select><span class="ev-sub">${dn} / ${st.targets.length}건 저장</span></div>`
        : `<div class="ev-row"><label>대상</label><b>${esc(t.orderNo)}</b> · ${esc(KIND[t.kind] || t.kind)}</div>`}
      <div class="ev-row"><label>거점</label><b>${esc(t.hub || '-')}</b></div>
      <div class="ev-row"><label>사진</label><input type="file" id="ev-file" accept="image/*" capture="environment" onchange="EV._pick(this)"><span class="ev-sub" id="ev-size"></span></div>
      <div class="ev-prev" id="ev-prev">${st.url ? `<img src="${st.url}" alt="증빙 사진">` : '<span>촬영 또는 선택한 사진이 여기에 표시됩니다</span>'}</div>
      <div class="ev-row ev-gpsrow" id="ev-gps"></div>
      <div class="ev-row"><label>메모</label><input type="text" id="ev-note" placeholder="예) 송장 확인" maxlength="80"></div>
      <div class="ev-msg" id="ev-msg"></div>
      <div class="ev-foot"><button type="button" class="btn btn-ghost" onclick="EV.close()">${dn ? '닫기' : '건너뛰기'}</button><button type="button" class="btn btn-primary" id="ev-save" onclick="EV._save()">💾 사진 저장</button></div></div>`;
    m.classList.remove('hidden'); paintGps();
  }
  api._tg = k => { st.i = +k; st.blob = null; if (st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} st.url = null; } draw(); };
  api._pick = async inp => {
    const f = inp.files && inp.files[0]; if (!f || !st) return; const msg = document.getElementById('ev-msg'); msg.textContent = '사진 처리 중…';
    try { const b = await compress(f); st.blob = b; if (st.url) URL.revokeObjectURL(st.url); st.url = URL.createObjectURL(b);
      document.getElementById('ev-prev').innerHTML = `<img src="${st.url}" alt="증빙 사진">`; document.getElementById('ev-size').textContent = `${Math.round(b.size / 1024)}KB`; msg.textContent = ''; }
    catch (e) { msg.innerHTML = '<span class="ev-warn">사진을 읽지 못했습니다. 다른 사진을 선택하세요.</span>'; }
  };
  api._save = async () => {
    if (!st || st.busy) return; const msg = document.getElementById('ev-msg');
    if (!st.blob) { msg.innerHTML = '<span class="ev-warn">사진을 촬영하거나 선택하세요. (사진 없이 넘어가려면 [건너뛰기])</span>'; return; }
    if (st.gps && st.gps.wait) { msg.textContent = '위치 확인이 끝난 뒤 저장됩니다…'; await new Promise(r => setTimeout(r, 1500)); }
    st.busy = true; const t = st.targets[st.i], g = st.gps && !st.gps.err && !st.gps.wait ? st.gps : {};
    const meta = { id: 'EV-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), orderNo: t.orderNo, hub: t.hub || '', kind: t.kind, time: nowS(), lat: g.lat == null ? null : g.lat, lng: g.lng == null ? null : g.lng, acc: g.acc == null ? null : g.acc,
      person: st.person || '', note: (document.getElementById('ev-note') || {}).value || '', size: st.blob.size };
    try { await api.adapter.add(meta, st.blob); list.push(meta); listeners.forEach(f => { try { f(); } catch (e) {} }); t.done = true; }
    catch (e) { st.busy = false; msg.innerHTML = '<span class="ev-warn">저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.</span>'; return; }
    st.busy = false; const next = st.targets.findIndex(x => !x.done);
    if (next < 0) { const n = st.targets.length; api.close(); toast(`📷 증빙 ${n}건 저장 완료`); return; }
    st.i = next; st.blob = null; if (st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} st.url = null; } draw(); document.getElementById('ev-msg').innerHTML = '<span style="color:#1a4fa0">✓ 저장했습니다. 다음 오더를 촬영하세요.</span>'; gps();
  };
  function toast(t) { const d = document.createElement('div'); d.className = 'ev-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

  // ── 증빙 보기 ──────────────────────────────────────────
  api.view = async function (no, hub, kind) {
    const rows = api.of(no).filter(x => (!hub || x.hub === hub) && (!kind || x.kind === kind)), m = shell();
    const urls = await Promise.all(rows.map(async r => { try { const b = await api.adapter.blob(r.id); return b ? URL.createObjectURL(b) : ''; } catch (e) { return ''; } }));
    m.innerHTML = `<div class="modal ev-box ev-wide"><div class="modal-title">📷 ${esc(no)} 증빙 사진 (${rows.length}건)</div>
      <div class="ev-grid">${rows.map((r, i) => { const v = verdict(r); return `<div class="ev-card"><div class="ev-img">${urls[i] ? `<a href="${urls[i]}" target="_blank" rel="noopener"><img src="${urls[i]}" alt="증빙"></a>` : '<span>사진 없음</span>'}</div>
        <div class="ev-meta"><b>${esc(KIND[r.kind] || r.kind)}</b> · ${esc(r.hub)}<br>${esc(r.time)}${r.person ? ' · ' + esc(r.person) : ''}<br>${r.lat != null ? `📍 ${r.lat}, ${r.lng} (±${r.acc}m)` : '📍 위치 없음'}<br><span class="ev-v ${v.k}">${esc(v.t)}</span>${r.note ? `<br>📝 ${esc(r.note)}` : ''}</div></div>`; }).join('') || '<div class="empty">등록된 증빙 사진이 없습니다</div>'}</div>
      <div class="ev-foot"><button type="button" class="btn btn-ghost" onclick="EV.close()">닫기</button></div></div>`;
    m.classList.remove('hidden');
  };
  api.ask = (title, targets, person) => api.open({ title, targets, person });
  return api;
})();
window.EV = EV;
document.addEventListener("DOMContentLoaded", () => EV.init());
