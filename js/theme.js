// ══ LMTS theme.js — 다크모드 토글 + 뉴스바 (모든 페이지 공통) ══
(function () {
  const KEY = 'lmts_theme';
  const get = () => { try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; } };
  const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
  const apply = v => { document.documentElement.setAttribute('data-theme', v); const b = document.getElementById('theme-btn'); if (b) b.textContent = v === 'dark' ? '☀️ 라이트' : '🌙 다크'; };
  apply(get());                                   // 깜빡임 방지: 즉시 적용

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function buildNews() {
    const items = [];
    try {
      const O = S.orders(), E = S.events(), A = S.alarms();
      O.filter(o => o.status === '지연').forEach(o => items.push({ c: 'red', h: `🔴 <b>지연</b> ${esc(o.no)} · ${esc(o.customer)}` }));
      A.filter(a => a.type === 'OFF_ROUTE').forEach(a => items.push({ c: 'red', h: `⚠️ <b>비지정 거점</b> ${esc(a.orderNo)} · ${esc(a.hub)} ${esc(a.event)}` }));
      E.slice().sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 15).forEach(e => {
        const arr = e.event === '도착완료';
        items.push({ c: arr ? 'blue' : '', h: `${arr ? '✅' : e.event === 'IN' ? '⬇️' : '⬆️'} <span class="tm">${esc(String(e.time).slice(5, 16))}</span> <b>${esc(e.orderNo)}</b> · ${esc(e.hub)} ${esc(e.event)}` });
      });
      const act = O.filter(o => o.status !== '도착완료').length;
      items.unshift({ c: '', h: `📦 진행 오더 <b>${act}</b>건 / 전체 <b>${O.length}</b>건 · 거점 이벤트 <b>${E.length}</b>건` });
    } catch (e) {}
    return items;
  }
  function renderNews() {
    const bar = document.getElementById('newsbar'); if (!bar) return;
    const items = buildNews(), v = bar.querySelector('.nb-view');
    if (!items.length) { v.innerHTML = '<div class="nb-item">표시할 소식이 없습니다</div>'; return; }
    const one = items.map(i => `<span class="nb-item ${i.c}">${i.h}</span>`).join('');
    v.innerHTML = `<div class="nb-track" style="--nb-dur:${Math.max(40, Math.round(one.replace(/<[^>]+>/g, '').length * 0.22))}s">${one}${one}</div>`;   // 2회 반복 → 끊김 없는 순환
  }
  window.lmtsNewsRefresh = renderNews;

  function mount() {
    const nav = document.querySelector('nav.nav, .nav');
    if (!nav || document.getElementById('newsbar')) return;
    const btn = document.createElement('button');
    btn.id = 'theme-btn'; btn.className = 'theme-btn'; btn.type = 'button'; btn.title = '라이트 / 다크 모드 전환';
    btn.onclick = () => { const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; set(n); apply(n); };
    const nb = document.createElement('button');   // 뉴스바 보이기/숨기기 (선택 기억)
    nb.id = 'news-btn'; nb.className = 'theme-btn nb-tg'; nb.type = 'button'; nb.textContent = '📰'; nb.title = '뉴스바 보이기 / 숨기기';
    const st = nav.querySelector('.nav-status'); st ? (nav.insertBefore(nb, st), nav.insertBefore(btn, st)) : (nav.appendChild(nb), nav.appendChild(btn));
    const bar = document.createElement('div'); bar.id = 'newsbar'; bar.className = 'newsbar';
    bar.innerHTML = '<div class="nb-label">📰 뉴스</div><div class="nb-view"></div><button class="nb-x" title="뉴스바 닫기" onclick="lmtsNews(false)">✕</button>';
    nav.after(bar); apply(get()); renderNews();
    const nget = () => { try { return localStorage.getItem('lmts_news') !== 'off'; } catch (e) { return true; } };
    window.lmtsNews = on => { bar.classList.toggle('off', !on); nb.style.opacity = on ? 1 : .55; try { localStorage.setItem('lmts_news', on ? 'on' : 'off'); } catch (e) {} };
    nb.onclick = () => lmtsNews(bar.classList.contains('off'));
    lmtsNews(nget());
    setInterval(renderNews, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  // 데이터 로딩 완료(lmtsReady) 후 뉴스 갱신
  let _f = null;
  try {
    Object.defineProperty(window, 'lmtsReady', { configurable: true, set(f) { _f = f; }, get() { return function () { if (_f) _f.apply(this, arguments); renderNews(); }; } });
  } catch (e) {}
})();
