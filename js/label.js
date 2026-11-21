/* LMTS 포장번호 라벨 인쇄 — 박스(포장 상자) 1개당 라벨 1장, QR = "오더번호#상자번호"
   거점에서 이 QR(또는 운송장번호)을 스캔하면 오더가 자동으로 IN/OUT 처리됩니다. */
const LBL = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 식별 코드: LMTS:오더번호#상자:검증값 — 타사 물건·임의 바코드와 구분하고 오독을 걸러냄 (위조 방지용 보안 아님)
  const SALT = 'UTI-LMTS-2026';
  const ck = (no, pk) => { let h = 0x811c9dc5; const t = `LMTS|${no}|${pk}|${SALT}`; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).toUpperCase().padStart(6, '0').slice(-4); };
  const code = (no, pk) => `LMTS:${no}#${pk}:${ck(no, pk)}`;
  function parse(raw) {     // → {ok,no,pk} | {mine:true,err} (LMTS 라벨이나 이상) | {mine:false} (우리 라벨 아님)
    raw = String(raw || '').trim(); if (!/^LMTS:/i.test(raw)) return { mine: false };
    const b = raw.slice(5), j = b.lastIndexOf(':'), i = b.lastIndexOf('#', j < 0 ? undefined : j);
    if (j < 0 || i < 1) return { mine: true, err: 'LMTS 라벨 형식이 올바르지 않습니다 (훼손·오독 가능) — 다시 스캔하세요' };
    const no = b.slice(0, i), pk = b.slice(i + 1, j), c = b.slice(j + 1).toUpperCase();
    return c === ck(no, pk) ? { ok: true, no, pk } : { mine: true, err: 'LMTS 라벨 검증에 실패했습니다 (훼손·위조·오독 가능) — 다시 스캔하거나 수동 처리하세요' };
  }
  const packsOf = p => { const s = []; (p.lines || []).forEach(l => { const k = String(l.packNo == null ? '1' : l.packNo); if (!s.includes(k)) s.push(k); }); if (!s.length) for (let i = 1; i <= (+p.boxes || 0); i++) s.push(String(i));
    return s.sort((a, b) => (+a || 0) - (+b || 0) || a.localeCompare(b)); };
  function qrSvg(text, px) {
    const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), c = px / n; let d = '';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) d += `M${(k * c).toFixed(2)} ${(r * c).toFixed(2)}h${c.toFixed(2)}v${c.toFixed(2)}h-${c.toFixed(2)}z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function html(orderNo) {
    const p = S.packings().find(x => x.orderNo === orderNo), o = S.orders().find(x => x.no === orderNo);
    if (!p) return '';
    const packs = packsOf(p), rt = o && o.route ? `${o.route.origin || ''} → ${o.route.destination || ''}` : '';
    return packs.map((pk, i) => {
      const items = (p.lines || []).filter(l => String(l.packNo == null ? '1' : l.packNo) === pk).map(l => `${esc(l.product)} × ${esc(l.qty)}`).join('<br>');
      return `<section class="lb"><div class="lq">${qrSvg(code(orderNo, pk), 150)}<div class="lm">LMTS</div></div><div class="lt">
        <div class="ln">${esc(orderNo)}</div><div class="lbx">상자 <b>${esc(pk)}</b> / ${packs.length}</div>
        <div class="lc">${esc(p.customer || (o && o.customer) || '')}</div><div class="lr">${esc(rt)}</div>
        <div class="li">${items || '-'}</div>${p.waybill ? `<div class="lw">운송장 ${esc(p.waybill)}</div>` : ''}<div class="lk">${esc(code(orderNo, pk))}</div></div></section>`;
    }).join('');
  }
  function print(orderNo) {
    const b = html(orderNo); if (!b) return alert('Packing 완료된 오더만 라벨을 인쇄할 수 있습니다');
    const w = window.open('', '_blank'); if (!w) return alert('팝업이 차단되었습니다. 팝업을 허용해 주세요');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>포장 라벨 ${esc(orderNo)}</title><style>
      @page{size:100mm 70mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:'Malgun Gothic',sans-serif;color:#000}
      .lb{width:100mm;height:70mm;padding:4mm;display:flex;gap:4mm;page-break-after:always;border:1px dashed #bbb;overflow:hidden}
      .lq svg{display:block;width:34mm;height:34mm}.lm{margin-top:1mm;text-align:center;font-weight:700;font-size:11pt;letter-spacing:2px;border:1.5px solid #000;border-radius:2mm}.lt{flex:1;min-width:0;font-size:9pt;line-height:1.3}
      .ln{font-size:12pt;font-weight:700}.lbx{font-size:18pt;margin:1mm 0}.lc{font-weight:700}.lr{color:#333;font-size:8pt}
      .li{margin-top:2mm;font-size:8.5pt}.lw{margin-top:1mm;font-size:8pt}.lk{margin-top:1mm;font-size:7pt;color:#555;word-break:break-all}
      @media print{.lb{border:0}.bar{display:none}}.bar{padding:8px;background:#eef2f7;font-size:14px}
      </style></head><body><div class="bar">라벨 ${esc(orderNo)} — 인쇄 창이 열리지 않으면 Ctrl+P 를 누르세요. (용지 100×70mm 라벨 기준)</div>${b}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }
  return { print, html, code, parse, packsOf, qrSvg };
})();
window.LBL = LBL;
