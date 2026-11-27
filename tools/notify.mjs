// ══ LMTS tools/notify.mjs — 지연 사전경보 자동 알림 (GitHub Actions에서 30분마다 실행) ══
// 화면과 같은 계산 모듈(js/dash-core.js)을 그대로 불러 쓰므로 화면·메일의 경보 기준이 항상 같다.
// 사용:  node tools/notify.mjs [--dry]      환경변수: MAIL_USER, MAIL_PASS, MAIL_TO, SITE_URL
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/lmts_data.json'), 'utf8'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// 화면 공통 파일에서 계산에 필요한 부분만 가져오기 (브라우저 전용 코드는 제외)
const cm = read('js/common.js');
const a = cm.indexOf('// ── 오더 제품 내역 공용'), b = cm.indexOf('function nextReceiptNo');
if (a < 0 || b < 0) { console.error('common.js 구조가 바뀌어 재고 계산부를 찾지 못했습니다'); process.exit(1); }
const ctx = { console, Date, Math, JSON, parseInt, isNaN, Set, Map, String, Number, Object, Array, RegExp, localStorage: { getItem() { return null; } } };
vm.createContext(ctx);
vm.runInContext(`const S={get:k=>(globalThis.__DB[k]||[])};['customers','products','vehicles','hubs','orders','packings','dispatches','events','alarms','scans','receipts','routes','directives'].forEach(k=>S[k]=()=>S.get(k));`, ctx);
ctx.__DB = data;
vm.runInContext(cm.slice(a, b), ctx);
vm.runInContext(read('js/dash-core.js').replace(/^const DC =/m, 'globalThis.DC ='), ctx);
const DC = ctx.DC; DC.setLive(true);                        // 서버 실행: 항상 현재 시각 기준

const lastEv = (data.events || []).map(e => e.time).sort().pop();
if (!lastEv || (Date.now() - new Date(lastEv.replace(' ', 'T')).getTime()) / 864e5 > 14) {
  console.log('최근 14일간 거점 이벤트가 없어 운영 데이터가 아니라고 판단하고 경보를 보내지 않습니다. (마지막 이벤트: ' + (lastEv || '없음') + ')'); process.exit(0);
}
const items = DC.actions().filter(x => x.lv <= 1);
const key = x => x.t;                                        // 같은 경보는 한 번만 보낸다
const stPath = path.join(root, 'data/lmts_alert_state.json');
let prev = []; try { prev = JSON.parse(fs.readFileSync(stPath, 'utf8')).sent || []; } catch (e) {}
const fresh = items.filter(x => !prev.includes(key(x)));
console.log(`활성 경보 ${items.length}건 · 신규 ${fresh.length}건 · 기준시각 ${new Date().toISOString()}`);
items.forEach(x => console.log(`${fresh.includes(x) ? '[신규]' : '[기존]'} Lv${x.lv} ${x.t} — ${x.fact}`));

const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const site = process.env.SITE_URL || 'https://kangsh8880.github.io/lmts/';
const row = x => `<tr><td style="border:1px solid #9CA3AF;padding:8px"><b>${x.lv === 0 ? '🔴' : '🟡'} ${E(x.t)}</b></td><td style="border:1px solid #9CA3AF;padding:8px">${E(x.fact)}</td><td style="border:1px solid #9CA3AF;padding:8px">${E(x.cause)}</td><td style="border:1px solid #9CA3AF;padding:8px"><b style="color:#1D4ED8">${E(x.act)}</b></td></tr>`;
const html = `<div style="font-family:'Malgun Gothic',sans-serif;color:#111;max-width:760px"><h2 style="margin:0 0 6px">LMTS 사전경보 — 확인이 필요한 건 ${fresh.length}건</h2><div style="color:#555;margin-bottom:12px">지연 가능성·스캔 누락·재고 부족을 자동 감지했습니다.</div>
<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#E9EEF7"><th style="border:1px solid #9CA3AF;padding:8px">경보</th><th style="border:1px solid #9CA3AF;padding:8px">사실</th><th style="border:1px solid #9CA3AF;padding:8px">원인 후보</th><th style="border:1px solid #9CA3AF;padding:8px">대안</th></tr>${fresh.map(row).join('')}</table>
<p style="margin-top:14px"><a href="${E(site)}ops.html" style="background:#EAF2FB;border:1px solid #111;border-radius:8px;padding:8px 14px;color:#111;text-decoration:none">운영관제에서 조치 지시하기 ›</a></p>
<div style="font-size:11px;color:#777;margin-top:16px">※ 약어: LMTS = Logistics Shipment Tracking System(물류출하추적시스템) · IN/OUT = 거점 입고/출고 스캔 · 이 메일은 자동 발송입니다.</div></div>`;

let sentNow = false;
if (fresh.length && !DRY) {
  const { MAIL_USER, MAIL_PASS, MAIL_TO } = process.env;
  if (!MAIL_USER || !MAIL_PASS) { console.error('MAIL_USER / MAIL_PASS 비밀값이 설정되지 않아 메일을 보내지 못했습니다.'); process.exit(2); }
  const nm = (await import('nodemailer')).default;
  const tr = nm.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: MAIL_USER, pass: MAIL_PASS } });
  await tr.sendMail({ from: `LMTS 알림 <${MAIL_USER}>`, to: MAIL_TO || MAIL_USER, subject: `[LMTS] 사전경보 ${fresh.length}건 — ${fresh[0].t}${fresh.length > 1 ? ' 외' : ''}`, html });
  sentNow = true; console.log('메일 발송 완료 →', MAIL_TO || MAIL_USER);
}
if (DRY) fs.writeFileSync(path.join(root, 'tools/last_mail_preview.html'), html);
if (!DRY) fs.writeFileSync(stPath, JSON.stringify({ updated: new Date().toISOString(), sent: items.map(key) }, null, 1));   // 해소된 경보는 목록에서 빠져 다음에 다시 발생하면 재발송
