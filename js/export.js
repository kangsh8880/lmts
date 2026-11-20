// ══ LMTS export.js — 엑셀(.xlsx) 다운로드 ══
// ① 화면의 모든 표에 "⬇ 엑셀" 버튼을 자동으로 붙임 (현재 화면에 보이는 행·필터 결과 그대로 저장)
// ② 설정창의 "전체 데이터 엑셀"로 오더·Packing·배차·이벤트·기준정보를 시트별로 저장
// SheetJS(xlsx)를 불러오지 못하면 CSV(엑셀에서 열림)로 대신 저장한다.
(function () {
  const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}️‍]/gu;
  const SKIP_HEAD = new Set(['', '수정', '삭제', '수정 / 삭제', '수정/삭제', '경로변경', '지도', '상세', '선택']);
  const pad = n => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
  const clean = s => String(s == null ? '' : s).replace(EMO, '').replace(/\s+/g, ' ').trim();
  const safeName = s => (clean(s).replace(/[\\/:*?"<>|\[\]]/g, '').trim() || '데이터');

  function cellText(td) {
    const rc = td.querySelector('.route-chips');
    if (rc) return [...rc.querySelectorAll('.r-chip')].map(x => clean(x.textContent)).join(' → ');
    const c = td.cloneNode(true);
    c.querySelectorAll('button,input,select,.pop-hint').forEach(x => x.remove());
    c.querySelectorAll('br').forEach(b => b.replaceWith(' / '));
    return clean(c.textContent);
  }
  function conv(v) {   // 숫자처럼 보이는 값은 숫자로 (코드·날짜·0으로 시작하는 값은 문자 유지)
    if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  function tableToAOA(table) {
    const hr = table.querySelector('thead tr:last-child'); if (!hr) return null;
    const heads = [...hr.children].map(th => clean(th.textContent));
    const keep = heads.map((h, i) => !SKIP_HEAD.has(h) ? i : -1).filter(i => i >= 0);
    const rows = [...table.querySelectorAll('tbody tr')].filter(tr => !tr.querySelector('td.empty') && tr.children.length >= keep.length)
      .map(tr => keep.map(i => conv(cellText(tr.children[i]))));
    return [keep.map(i => heads[i]), ...rows];
  }
  function save(wb, aoaSingle, name) {
    const file = `LMTS_${safeName(name)}_${stamp()}`;
    if (typeof XLSX === 'undefined') {   // 폴백: CSV(UTF-8 BOM)
      const csv = '﻿' + aoaSingle.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = file + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return;
    }
    XLSX.writeFile(wb, file + '.xlsx');
  }
  function sheetOf(aoa) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = aoa[0].map((_, ci) => ({ wch: Math.min(60, Math.max(8, ...aoa.map(r => (String(r[ci] == null ? '' : r[ci]).length * 1.6 + 2) | 0))) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    return ws;
  }

  // ① 표 내려받기
  function exportTable(table, title) {
    const aoa = tableToAOA(table);
    if (!aoa || aoa.length < 2) return alert('내려받을 데이터가 없습니다.');
    let wb = null;
    if (typeof XLSX !== 'undefined') { wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheetOf(aoa), safeName(title).slice(0, 31)); }
    save(wb, aoa, title);
  }
  window.exportTableXlsx = exportTable;

  // ② 전체 데이터 내려받기 (시트별)
  const HEAD = {
    no: '번호', date: '일자', customer: '고객사', product: '제품', boxes: '수량', status: '상태', note: '비고', created: '등록시각',
    orderNo: '오더번호', hub: '거점', event: '이벤트', time: '시각', person: '처리자', code: '코드', name: '이름', addr: '주소', mgr: '담당자', type: '유형', lat: '위도', lng: '경도',
    phone: '연락처', manager: '담당자', confirm: '확인방식', qty: '총수량', weight: '중량', cap: '적재용량', driver: '기사', dphone: '기사연락처', doneAt: '완료시각',
    legIdx: '구간번호', fromHub: '출발거점', toHub: '도착거점', transportType: '수송수단', departPlan: '출발예정', eta: 'ETA', vehicleNo: '차량번호', savedAt: '저장시각',
    airline: '항공사', flightNo: '편명', depAirport: '출발공항', arrAirport: '도착공항', shippingCo: '선사', vessel: '선박', depPort: '출발항', arrPort: '도착항'
  };
  const routeText = r => r ? [r.origin, ...(r.waypoints || []).map(w => typeof w === 'string' ? w : w.name), r.destination].filter(Boolean).join(' → ') : '';
  function flat(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? Object.values(x).filter(y => typeof y !== 'object').join('×') : String(x)).join(' / ');
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }
  function arrSheet(arr, pre) {
    const keys = []; arr.forEach(o => Object.keys(o).forEach(k => { if (!keys.includes(k) && !(pre && pre.drop && pre.drop.includes(k))) keys.push(k); }));
    const extra = (pre && pre.extra) || {};
    const heads = [...Object.keys(extra), ...keys.map(k => HEAD[k] || k)];
    return [heads, ...arr.map(o => [...Object.values(extra).map(f => f(o)), ...keys.map(k => flat(o[k]))])];
  }
  function exportAll() {
    if (typeof XLSX === 'undefined') return alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결 확인 후 새로고침하세요.\n(표별 "⬇ 엑셀" 버튼은 CSV로 내려받을 수 있습니다)');
    const wb = XLSX.utils.book_new(), add = (n, aoa) => XLSX.utils.book_append_sheet(wb, sheetOf(aoa.length > 1 ? aoa : [aoa[0] || ['데이터 없음']]), n);
    add('오더', arrSheet(S.orders(), { drop: ['route', 'items'], extra: { '제품·수량': o => (o.items || []).map(i => `${i.product} ${i.qty}`).join(' / ') || o.product || '', '운송경로': o => routeText(o.route) } }));
    add('Packing', arrSheet(S.packings(), { drop: ['lines'], extra: { 'Packing내역': p => (p.lines || []).map(l => `상자${l.packNo}:${l.boxNo}×${l.qty}`).join(' / ') } }));
    add('배차', arrSheet(S.dispatches().slice().sort((a, b) => String(a.orderNo).localeCompare(String(b.orderNo), undefined, { numeric: true }) || a.legIdx - b.legIdx)));
    add('거점이벤트', arrSheet(S.events().slice().sort((a, b) => String(a.time).localeCompare(String(b.time)))));
    add('고객사', arrSheet(S.customers())); add('제품', arrSheet(S.products())); add('차량기사', arrSheet(S.vehicles())); add('거점', arrSheet(S.hubs()));
    XLSX.writeFile(wb, `LMTS_전체데이터_${stamp()}.xlsx`);
  }
  window.exportAllXlsx = exportAll;

  // 버튼 자동 부착
  function titleOf(t) {
    const card = t.closest('.card'), h = card && card.querySelector('.card-head');
    if (h) return clean(h.firstChild && h.firstChild.textContent || h.textContent);
    const pn = t.closest('.pnl'), ph = pn && pn.querySelector('.pnl-h');
    if (ph) return clean(ph.querySelector('span') ? ph.querySelector('span').textContent : ph.textContent);
    if (t.closest('#kpi-pop')) return clean((document.getElementById('kpi-pop-ttl') || {}).textContent || '상세');
    return clean(document.title.replace(/^LMTS\s*-\s*/, ''));
  }
  function inject() {
    document.querySelectorAll('table').forEach(t => {
      if (t.dataset.xl) return;
      const id = (t.querySelector('tbody') || {}).id || '';
      if (id === 'pk-need' || id === 'pk-lines') { t.dataset.xl = 'skip'; return; }   // 작업 중 임시 표는 제외
      t.dataset.xl = '1';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'xl-btn'; btn.textContent = '⬇ 엑셀'; btn.title = '이 표를 엑셀(.xlsx) 파일로 저장'; btn.onclick = e => { e.stopPropagation(); let ti = titleOf(t); const same = [...document.querySelectorAll('table[data-xl="1"]')].filter(x => titleOf(x) === ti);
        if (same.length > 1) ti += ' (' + [...t.querySelectorAll('thead tr:last-child th')].map(h => clean(h.textContent)).filter(h => h && !SKIP_HEAD.has(h)).slice(0, 3).join('·') + ')';   // 같은 제목의 표가 여럿이면 열 이름으로 구분
        exportTable(t, ti); };
      const card = t.closest('.card'), head = card && card.querySelector('.card-head');
      if (head && !head.querySelector('.xl-btn') && card.querySelectorAll('table[data-xl="1"]').length <= 1) { btn.classList.add('xl-head'); head.appendChild(btn); return; }
      const bar = document.createElement('div'); bar.className = 'xl-bar'; bar.appendChild(btn);
      (t.closest('.tbl-wrap') || t).before(bar);
    });
  }
  function boot() { inject(); new MutationObserver(() => { clearTimeout(boot._t); boot._t = setTimeout(inject, 120); }).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);

  // 설정창에 전체 데이터 버튼
  document.addEventListener('DOMContentLoaded', () => {
    const bk = document.getElementById('bk-btn'); if (!bk || document.getElementById('xl-all-btn')) return;
    const b = document.createElement('button'); b.id = 'xl-all-btn'; b.className = 'btn btn-ghost btn-sm'; b.textContent = '📊 전체 데이터 엑셀 받기'; b.onclick = exportAll; bk.after(b);
  });
})();
