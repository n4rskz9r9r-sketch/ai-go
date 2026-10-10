/* AI Go Dojo — main thread: match loop, board renderer, panel, controls, persistence */
(function () {
  'use strict';
  const G = GoEngine, T = I18N.t, NM = I18N.name;
  const Q = new URLSearchParams(location.search);
  const STREAM = Q.get('stream') === '1', FAST = Q.get('fast') === '1';
  const VERT = STREAM && (Q.get('v') === '1' || Q.get('vertical') === '1'); // 1080x1920 Shorts layout
  document.body.classList.toggle('vertical', VERT);
  const KEY = 'aigo.league.v1', CUR = 'aigo.cur.v1';
  const SPEEDS = [300, 650, 1000, 2000];
  let thinkMs = +Q.get('ms') || (FAST ? 60 : STREAM ? 650 : +(localStorage.getItem('aigo.ms') || 650));
  const END_PAUSE = FAST ? 600 : STREAM ? 12000 : 8000;
  document.body.classList.toggle('stream', STREAM);
  document.documentElement.lang = I18N.LANG;
  document.title = T('title') + ' — ' + T('subtitle');
  I18N.apply();

  // ---------- worker RPC ----------
  const worker = new Worker('js/worker.js?v=5');
  let rid = 0; const pend = new Map();
  worker.onmessage = (e) => { const d = e.data, p = pend.get(d.id); if (!p) return; pend.delete(d.id); if (d.type === 'error') { console.warn('worker:', d.message); p.rej(new Error(d.message)); } else p.res(d); };
  const rpc = (type, data) => new Promise((res, rej) => { const id = ++rid; pend.set(id, { res, rej }); worker.postMessage(Object.assign({ type, id }, data)); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- state ----------
  const app = { L: null, game: new G.Game(), recs: [], info: { 1: null, 2: null }, thinking: null, overlay: null, paused: false, gen: 0, bk: 'alpha', report: null, phase: 'init', lastSearch: null, startT: Date.now(), banner: null };
  window.__app = app;
  const wk = () => (app.bk === 'alpha' ? 'beta' : 'alpha');
  const keyOf = (c) => (c === G.BLACK ? app.bk : wk());

  // ---------- board renderer ----------
  const cv = document.getElementById('board'), ctx = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1), SIZE = VERT ? 920 : 720, M = VERT ? 26 : 42, K = SIZE / 720, CELL = (SIZE - 2 * M) / 18, R = CELL * 0.485;
  cv.width = SIZE * DPR; cv.height = SIZE * DPR; ctx.scale(DPR, DPR);
  const X = (p) => M + G.px(p) * CELL, Y = (p) => M + G.py(p) * CELL;
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w * DPR; c.height = h * DPR; const x = c.getContext('2d'); x.scale(DPR, DPR); return [c, x]; }
  const [woodC, w] = mk(SIZE, SIZE);
  (function drawWood() {
    let s = 12345; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const g = w.createLinearGradient(0, 0, SIZE, SIZE); g.addColorStop(0, '#e8bf74'); g.addColorStop(0.5, '#ddb065'); g.addColorStop(1, '#cf9d52');
    w.fillStyle = g; w.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 140; i++) { // grain
      const y0 = r() * SIZE, amp = 3 + r() * 10, fr = 0.004 + r() * 0.01, ph = r() * 6;
      w.strokeStyle = `rgba(${120 + r() * 40 | 0},${70 + r() * 30 | 0},${25 + r() * 20 | 0},${0.04 + r() * 0.09})`; w.lineWidth = 0.6 + r() * 2.2;
      w.beginPath(); for (let x = 0; x <= SIZE; x += 8) { const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.1 + ph) * amp * 0.25; x ? w.lineTo(x, y) : w.moveTo(x, y); } w.stroke();
    }
    for (let i = 0; i < 2500; i++) { w.fillStyle = `rgba(90,50,15,${r() * 0.05})`; w.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 2, 1); }
    const v = w.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,30,5,0.35)'); w.fillStyle = v; w.fillRect(0, 0, SIZE, SIZE);
    w.strokeStyle = 'rgba(35,22,8,0.85)';
    for (let i = 0; i < 19; i++) { w.lineWidth = (i === 0 || i === 18 ? 2 : 1) * (VERT ? 1.4 : 1); w.beginPath(); w.moveTo(M, M + i * CELL); w.lineTo(M + 18 * CELL, M + i * CELL); w.stroke(); w.beginPath(); w.moveTo(M + i * CELL, M); w.lineTo(M + i * CELL, M + 18 * CELL); w.stroke(); }
    w.fillStyle = 'rgba(35,22,8,0.9)'; for (const a of [3, 9, 15]) for (const b of [3, 9, 15]) { w.beginPath(); w.arc(M + a * CELL, M + b * CELL, 3.6 * K, 0, 7); w.fill(); }
    w.font = '600 12px system-ui,sans-serif'; w.fillStyle = 'rgba(55,32,10,0.75)'; w.textAlign = 'center'; w.textBaseline = 'middle';
    if (!VERT) for (let i = 0; i < 19; i++) { const l = G.LETTERS[i], n = String(19 - i); w.fillText(l, M + i * CELL, M - 25); w.fillText(l, M + i * CELL, SIZE - M + 25); w.fillText(n, M - 26, M + i * CELL); w.fillText(n, SIZE - M + 26, M + i * CELL); }
  })();
  function stoneSprite(black) {
    const S = Math.ceil(R * 2 + 12), [c, x] = mk(S, S), cx = S / 2 - 1, cy = S / 2 - 1;
    x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 5; x.shadowOffsetX = 2; x.shadowOffsetY = 3;
    const g = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.08, cx, cy, R);
    if (black) { g.addColorStop(0, '#7a7a7a'); g.addColorStop(0.35, '#2a2a2a'); g.addColorStop(1, '#050505'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#ece9e1'); g.addColorStop(1, '#bdb8ab'); }
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill(); x.shadowColor = 'transparent';
    if (!black) { x.strokeStyle = 'rgba(160,150,130,0.18)'; x.lineWidth = 0.8; for (let i = 1; i < 6; i++) { x.beginPath(); x.arc(cx + R * 0.9, cy + R * 0.2, R * (0.35 + i * 0.25), Math.PI * 0.8, Math.PI * 1.25); x.stroke(); } }
    return { c, S };
  }
  const SPR = { 1: stoneSprite(true), 2: stoneSprite(false) };
  const anim = { placed: null, caps: [] };
  function drawStone(p, col, scale, alpha) {
    const s = SPR[col], sz = s.S * scale; ctx.globalAlpha = alpha; ctx.drawImage(s.c, X(p) - sz / 2 + 1, Y(p) - sz / 2 + 1, sz, sz); ctx.globalAlpha = 1;
  }
  function frame() {
    const now = performance.now(), b = app.game.b;
    ctx.drawImage(woodC, 0, 0, SIZE, SIZE);
    const ov = app.overlay;
    for (const p of G.POINTS) {
      const c = b.color[p]; if (c !== 1 && c !== 2) continue;
      let sc = 1, al = 1;
      if (anim.placed && anim.placed.p === p) { const t = Math.min(1, (now - anim.placed.t0) / 230); sc = 1.28 - 0.28 * (1 - Math.pow(1 - t, 3)); al = 0.35 + 0.65 * t; }
      if (ov && ov.dead.has(p)) al = 0.42;
      drawStone(p, c, sc, al);
    }
    anim.caps = anim.caps.filter((a) => now - a.t0 < 520);
    for (const a of anim.caps) { const t = (now - a.t0) / 520; drawStone(a.p, a.c, 1 + t * 0.25, 1 - t); }
    if (ov) for (const p of G.POINTS) {
      const o = ov.owner[p]; if (!o) continue; if (b.color[p] === o && !ov.dead.has(p)) continue;
      const s = CELL * 0.38; ctx.fillStyle = o === 1 ? 'rgba(10,10,10,0.82)' : 'rgba(250,250,245,0.9)'; ctx.fillRect(X(p) - s / 2, Y(p) - s / 2, s, s);
      if (b.color[p]) { ctx.strokeStyle = o === 1 ? '#000' : '#fff'; ctx.lineWidth = 1; ctx.strokeRect(X(p) - s / 2, Y(p) - s / 2, s, s); }
    }
    const lm = b.last;
    if (lm >= 0 && b.color[lm]) { ctx.strokeStyle = b.color[lm] === 1 ? '#f5e3b5' : '#c0392b'; ctx.lineWidth = 2.4 * K; ctx.beginPath(); ctx.arc(X(lm), Y(lm), R * 0.48, 0, 7); ctx.stroke(); }
    else if (lm === G.PASS && !ov) { ctx.font = `700 ${VERT ? 40 : 22}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = VERT ? 'rgba(20,10,0,0.85)' : 'rgba(40,20,5,0.75)'; ctx.fillText(T('pass', { n: NM(keyOf(3 - b.toPlay)) }), SIZE / 2, VERT ? SIZE / 2 : SIZE - 8); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- panel ----------
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const lvOf = (A) => 1 + Math.floor(Math.sqrt((A.positions || 0) / 40));
  function setBanner(a, b) { const el = $('banner'); if (!a) { el.style.display = 'none'; return; } el.querySelector('.b1').textContent = a; el.querySelector('.b2').textContent = b || ''; el.style.display = 'block'; }
  function card(key) {
    const L = app.L, A = L[key], el = $('card-' + key), c = key === app.bk ? 1 : 2, b = app.game.b;
    el.querySelector('.stone').className = 'stone ' + (c === 1 ? 'b' : 'w');
    el.querySelector('.nm').textContent = NM(key);
    el.querySelector('.clr').textContent = c === 1 ? T('black') : T('white');
    el.querySelector('.lv').textContent = T('lv') + ' ' + lvOf(A);
    const h = A.hist || [], d = h.length > 1 ? h[h.length - 1] - h[h.length - 2] : 0;
    el.querySelector('.elo').innerHTML = `${T('elo')} ${fmt(A.elo)} <span class="d ${d >= 0 ? 'up' : 'dn'}">${d ? (d > 0 ? '▲' : '▼') + Math.abs(d) : ''}</span>`;
    const pct = A.games ? Math.round(100 * A.wins / A.games) : 0;
    el.querySelector('.meta').textContent = `${T('wins')} ${A.wins}/${A.games} ${T('games')} · ${pct}% ${T('winrate')}`;
    el.querySelector('.meta2').textContent = `${T('caps')} ${b.caps[c]} · ${T('bench', { w: A.bench.w, n: A.bench.n })}`;
    const th = app.thinking === key; el.classList.toggle('turn', !app.game.over && b.toPlay === c && app.phase === 'play');
    el.querySelector('.think').textContent = th ? T('thinking', { n: NM(key) }) : '';
  }
  function chart() {
    const c = $('chart'), W2 = c.clientWidth || 520, H2 = c.clientHeight || 132;
    if (c.width !== W2 * DPR || c.height !== H2 * DPR) { c.width = W2 * DPR; c.height = H2 * DPR; }
    const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, W2, H2);
    const a = app.L.alpha.hist, bb = app.L.beta.hist, n = Math.max(a.length, bb.length, 2);
    let lo = Math.min(...a, ...bb), hi = Math.max(...a, ...bb); const pad = Math.max(20, (hi - lo) * 0.12); lo -= pad; hi += pad;
    const L0 = VERT ? 62 : 38, px = (i) => L0 + (W2 - L0 - 8) * i / (n - 1), py = (v) => 6 + (H2 - 20) * (1 - (v - lo) / (hi - lo));
    x.font = (VERT ? 20 : 11) + 'px system-ui,sans-serif'; x.fillStyle = '#9d8c70'; x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1; x.textAlign = 'right';
    const raw = (hi - lo) / Math.max(2, Math.floor(H2 / (VERT ? 40 : 35))), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag; const step = Math.max(10, mag * (f > 5 ? 10 : f > 2 ? 5 : f > 1 ? 2 : 1));
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { x.beginPath(); x.moveTo(L0, py(v)); x.lineTo(W2 - 4, py(v)); x.stroke(); x.fillText(String(v), L0 - 6, py(v) + (VERT ? 7 : 4)); }
    x.textAlign = 'left'; x.fillText(T('gamesN', { n: n - 1 }), L0 + 2, H2 - 2);
    for (const [arr, col] of [[a, '#e8a33d'], [bb, '#4fb3d9']]) {
      x.strokeStyle = col; x.lineWidth = VERT ? 4 : 2.4; x.beginPath(); arr.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)))); x.stroke();
      const i = arr.length - 1; x.fillStyle = col; x.beginPath(); x.arc(px(i), py(arr[i]), VERT ? 6 : 3.5, 0, 7); x.fill();
    }
  }
  function lessonLine(key) {
    const A = app.L[key], l = A.learned && A.learned[A.learned.length - 1];
    const el = $('ln-' + key); el.style.color = key === 'alpha' ? '#ffd08a' : '#9fdcf2';
    if (!l) { el.textContent = '🧠 ' + NM(key) + ' — ' + (app.L.games ? I18N.lesson('none') : T('noGames')); return; }
    el.innerHTML = '';
    const bld = document.createElement('b'); bld.textContent = '🧠 ' + NM(key) + ': ';
    el.appendChild(bld); el.appendChild(document.createTextNode(I18N.lesson(l.key) + (l.newShapes ? T('shapes', { k: l.newShapes }) : '')));
  }
  function renderPanel() {
    if (!app.L) return;
    const g = app.game, b = g.b, L = app.L;
    card('alpha'); card('beta');
    $('gNo').textContent = `${T('game')} #${L.games + 1}`;
    $('mNo').textContent = `${T('move')} ${b.moveNum}`;
    // win chance & estimate from the latest search (convert to Black's view)
    const s = app.lastSearch; let pb = 0.5, est = null;
    if (s) { pb = s.color === 1 ? s.winrate : 1 - s.winrate; est = s.scoreEst; }
    if (app.final) { pb = app.final.winner === 1 ? 1 : 0; est = app.final.margin != null ? app.final.margin : est; }
    $('est').textContent = est == null ? T('komi') : `${T('estimate')} ${I18N.est(est)}`;
    $('wbB').style.width = (pb * 100).toFixed(1) + '%';
    $('wbL').textContent = `${NM(app.bk)} ${Math.round(pb * 100)}%`; $('wbR').textContent = `${Math.round((1 - pb) * 100)}% ${NM(wk())}`;
    $('thinkLine').textContent = app.paused ? T('paused') : (s ? T('sims', { n: fmt(s.playouts) }) + (s.pv && s.pv.length ? ' · ' + s.pv.slice(0, 4).map((m) => (m === G.PASS ? T('passWord') : m === G.RESIGN ? T('resignWord') : G.coord(m))).join(' → ') : '') : T('rules', { m: G.MAX_MOVES }));
    lessonLine('alpha'); lessonLine('beta');
    const last = L.log[L.log.length - 1];
    const dur = L.durations.length ? (L.durations.reduce((a, c) => a + c, 0) / L.durations.length / 60000).toFixed(1) : null;
    $('foot1').textContent = last ? `${T('lastGame')}: ${T('wins_by', { n: NM(last.win), r: I18N.res(last.res) })} · ${last.moves} ${T('moves')}${dur ? ' · ' + T('avgLen', { m: dur }) : ''}` : T('noGames');
    $('foot2').textContent = `${T('h2h')}: ${NM('alpha')} ${L.alpha.wins} – ${L.beta.wins} ${NM('beta')} · ${T('komi')}`;
    chart();
  }
  app.renderPanel = renderPanel;

  // ---------- persistence ----------
  function saveLeague() {
    try { localStorage.setItem(KEY, JSON.stringify(app.L)); }
    catch (e) { try { const s = JSON.parse(JSON.stringify(app.L)); s.alpha.snaps = s.alpha.snaps.slice(-1); s.beta.snaps = s.beta.snaps.slice(-1); localStorage.setItem(KEY, JSON.stringify(s)); } catch (e2) { console.warn('save failed'); } }
  }
  function saveCur() { try { localStorage.setItem(CUR, JSON.stringify({ g: app.L.games, moves: app.game.moves, recs: app.recs.map((r) => ({ top: r.top.slice(0, 12) })), elapsed: Date.now() - app.startT })); } catch (e) { /* ignore */ } }

  // ---------- match loop ----------
  async function playGame(resume) {
    const my = ++app.gen; const alive = () => my === app.gen;
    app.game = new G.Game(); app.recs = []; app.overlay = null; app.final = null; app.lastSearch = null; anim.placed = null; anim.caps = [];
    app.bk = G.whoIsBlack(app.L); app.phase = 'play'; setBanner(null);
    if (resume) { try { for (const m of resume.moves) app.game.play(m); app.recs = resume.recs; } catch (e) { app.game = new G.Game(); app.recs = []; } }
    app.startT = Date.now() - (resume && resume.elapsed || 0);
    const gid = Date.now() + ':' + my;
    renderPanel();
    while (!app.game.over) {
      while (app.paused && alive()) await sleep(200);
      if (!alive()) return;
      const g = app.game, c = g.toPlay, key = keyOf(c);
      app.thinking = key; renderPanel();
      const t0 = Date.now();
      const r = await rpc('think', { moves: g.moves, key, ms: thinkMs, game: gid });
      const rest = thinkMs * 0.9 - (Date.now() - t0); if (rest > 0) await sleep(rest);
      if (!alive()) return;
      const before = g.b.color.slice();
      g.play(r.move);
      app.recs.push({ top: r.top });
      app.lastSearch = { color: c, winrate: r.winrate, scoreEst: r.scoreEst, playouts: r.playouts, pv: r.pv }; app.lastOwn = r.own;
      if (r.move >= 0) {
        anim.placed = { p: r.move, t0: performance.now() };
        let caps = 0; for (const p of G.POINTS) if ((before[p] === 1 || before[p] === 2) && !g.b.color[p]) { anim.caps.push({ p, c: before[p], t0: performance.now() + 120 }); caps++; }
        GSound.play('stone'); if (caps) GSound.play('capture');
      } else if (r.move === G.PASS) GSound.play('pass');
      app.thinking = null; saveCur(); renderPanel();
    }
    // ----- game over -----
    app.phase = 'end'; app.thinking = null;
    let res = app.game.result; const SZ = G.SZ, own = new Float32Array(SZ);
    if (!res.resign) {
      setBanner(T('counting'), ''); renderPanel();
      const a = await rpc('analyze', { moves: app.game.moves, key: app.bk, ms: FAST ? 300 : 1500, game: gid });
      if (!alive()) return;
      G.POINTS.forEach((p, i) => { own[p] = a.own[i]; });
      const s = G.finalScore(app.game, own); res = Object.assign({}, res, { margin: s.margin, black: s.black, white: s.white, winner: s.margin > 0 ? 1 : 2 });
      app.overlay = { owner: s.owner, dead: new Set(s.dead) };
    } else {
      if (app.lastOwn) G.POINTS.forEach((p, i) => { own[p] = app.lastOwn[i]; });
      const s = G.finalScore(app.game, own); app.overlay = { owner: s.owner, dead: new Set(s.dead) };
    }
    app.final = res;
    const rs = I18N.res(G.resultString(res)), winKey = keyOf(res.winner), loseKey = keyOf(3 - res.winner);
    setBanner(T('wins_by', { n: NM(winKey), r: rs }), res.resign ? T('resigns', { n: NM(loseKey) }) : `${T('black')} ${res.black} · ${T('white')} ${res.white} + 7.5`);
    GSound.play('end'); renderPanel();
    const ms = Date.now() - app.startT;
    await sleep(FAST ? 100 : 2500);
    const fin = await rpc('finish', { moves: app.game.moves, records: app.recs, result: res, ms, benchGames: 2 });
    if (!alive()) return;
    app.L = fin.state; app.report = fin.report; saveLeague(); try { localStorage.removeItem(CUR); } catch (e) { /* ignore */ }
    app.gamesThisSession = (app.gamesThisSession || 0) + 1;
    renderPanel();
    const end = Date.now() + END_PAUSE;
    while (Date.now() < end) { if (!alive()) return; setBanner(T('wins_by', { n: NM(winKey), r: rs }), T('nextGame', { s: Math.ceil((end - Date.now()) / 1000) })); await sleep(250); }
    setBanner(null);
    if (alive()) playGame(null);
  }

  // ---------- controls ----------
  function toast(s) { const t = $('toast'); t.textContent = s; setTimeout(() => { if (t.textContent === s) t.textContent = ''; }, 4000); }
  function syncRun() { $('btnRun').textContent = app.paused ? '▶ ' + T('start') : '⏸ ' + T('pause'); }
  $('btnRun').onclick = () => { app.paused = !app.paused; syncRun(); renderPanel(); };
  const sel = $('selSpeed'); SPEEDS.forEach((ms) => { const o = document.createElement('option'); o.value = ms; o.textContent = T('perMove', { s: ms / 1000 }); sel.appendChild(o); });
  sel.value = SPEEDS.includes(thinkMs) ? thinkMs : 650; sel.onchange = () => { thinkMs = +sel.value; localStorage.setItem('aigo.ms', thinkMs); };
  $('btnReset').onclick = async () => { if (!confirm(T('confirmReset'))) return; app.gen++; const r = await rpc('reset', {}); app.L = r.state; saveLeague(); localStorage.removeItem(CUR); playGame(null); };
  $('btnExport').onclick = () => { const blob = new Blob([JSON.stringify(app.L)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ai-go-brains-game${app.L.games}.json`; document.body.appendChild(a); a.click(); a.remove(); };
  $('btnImport').onclick = () => $('fileImport').click();
  $('fileImport').onchange = async (ev) => { const f = ev.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!j.alpha || !j.beta) throw new Error('bad'); app.gen++; const r = await rpc('load', { state: j }); app.L = r.state; saveLeague(); localStorage.removeItem(CUR); toast(T('imported')); playGame(null); } catch (e) { toast(T('importFail')); } ev.target.value = ''; };
  const ln = $('lnkLang'); ln.textContent = T('lang'); { const q = new URLSearchParams(location.search); if (I18N.LANG === 'ko') q.set('lang', 'en'); else q.delete('lang'); ln.href = '?' + q.toString(); }
  { const q = new URLSearchParams(); q.set('stream', '1'); q.set('r', '2'); if (I18N.LANG === 'en') q.set('lang', 'en'); $('lnkStream').href = '?' + q.toString(); }
  syncRun();
  // scale to window (normal page); stream is fixed 1280x720
  function fit() { const a = $('app'), wr = $('wrap'); const s = STREAM ? 1 : Math.min(1, window.innerWidth / 1280); a.style.transform = s < 1 ? `scale(${s})` : ''; wr.style.height = (VERT ? 1920 : 720) * s + 'px'; }
  window.addEventListener('resize', fit); fit();

  // ---------- boot ----------
  (async () => {
    let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    const r = await rpc('load', { state: saved }); app.L = r.state; if (!saved) saveLeague();
    let cur = null; try { cur = JSON.parse(localStorage.getItem(CUR) || 'null'); } catch (e) { cur = null; }
    renderPanel(); playGame(cur && cur.g === app.L.games ? cur : null);
  })();
  app.rpc = rpc;
})();
