// node test/selfplay.js <games> <msPerMove> [out.json] — runs league self-play exactly like the browser worker does
const G = require('../js/engine.js');
const games = +process.argv[2] || 1, ms = +process.argv[3] || 500, out = process.argv[4];
const L = out && require('fs').existsSync(out) ? G.loadLeague(JSON.parse(require('fs').readFileSync(out))) : G.newLeague();
const se = new G.Searcher();
for (let k = 0; k < games; k++) {
  const g = new G.Game(), recs = [], bk = G.whoIsBlack(L), mem = { 1: {}, 2: {} }; const t0 = Date.now(); let po = 0, last;
  while (!g.over) {
    const c = g.toPlay, A = L[c === 1 ? bk : (bk === 'alpha' ? 'beta' : 'alpha')];
    const r = se.search(g, A.brain, { timeMs: ms }); po += r.playouts; last = r;
    const m = G.decide(g, r, mem[c]); recs.push({ top: r.top }); g.play(m);
  }
  let res = g.result;
  if (!res.resign) { const fin = se.search(g, L[bk].brain, { timeMs: Math.max(ms, 300) }); const s = G.finalScore(g, fin.ownership); res = { ...res, ...s, winner: s.margin > 0 ? 1 : 2 }; }
  const dur = Date.now() - t0;
  const rep = G.finishGame(L, g.moves, recs, res, { ms: dur });
  console.log(`game ${L.games}: B=${bk} ${G.resultString(res)} moves=${g.moves.length} ${res.twoPass ? '2pass' : res.cap ? 'cap' : 'resign'} ${(dur / 1000).toFixed(1)}s avgPO=${Math.round(po / g.moves.length)} | Alpha ${Math.round(L.alpha.elo)} (${L.alpha.wins}W) Beta ${Math.round(L.beta.elo)} (${L.beta.wins}W) | learned A:${rep.lessons.alpha.key} B:${rep.lessons.beta.key} bench A ${L.alpha.bench.w}/${L.alpha.bench.n} B ${L.beta.bench.w}/${L.beta.bench.n}`);
  if (out) require('fs').writeFileSync(out, JSON.stringify(G.serializeLeague(L)));
}
