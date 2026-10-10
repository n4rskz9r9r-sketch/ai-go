/* AI Go Dojo — search & learning worker */
importScripts('engine.js');
const G = self.GoEngine;
let L = G.newLeague();
const se = new G.Searcher();
const mems = {};
const strip = (S) => S; // full serialized league (brains included) for localStorage
onmessage = (e) => {
  const d = e.data;
  try {
    if (d.type === 'load') { L = G.loadLeague(d.state); postMessage({ type: 'state', id: d.id, state: G.serializeLeague(L) }); }
    else if (d.type === 'reset') { L = G.newLeague(); postMessage({ type: 'state', id: d.id, state: G.serializeLeague(L) }); }
    else if (d.type === 'think' || d.type === 'analyze') {
      const g = G.Game.fromMoves(d.moves.filter((m) => m !== G.RESIGN));
      const key = d.key, A = L[key];
      const r = se.search(g, A.brain, { timeMs: d.ms, maxPlayouts: d.maxPlayouts });
      const mk = d.game + ':' + g.toPlay; mems[mk] = mems[mk] || {};
      const move = d.type === 'think' ? G.decide(g, r, mems[mk]) : null;
      const own = new Float32Array(G.N * G.N); G.POINTS.forEach((p, i) => { own[i] = r.ownership[p]; });
      postMessage({ type: d.type, id: d.id, move, winrate: r.winrate, playouts: r.playouts, ms: r.ms, scoreEst: r.scoreEst, top: r.top.slice(0, 24), pv: r.pv, own }, [own.buffer]);
    } else if (d.type === 'finish') {
      const report = G.finishGame(L, d.moves, d.records, d.result, { ms: d.ms, benchGames: d.benchGames });
      for (const k in mems) delete mems[k];
      postMessage({ type: 'finished', id: d.id, report, state: strip(G.serializeLeague(L)) });
    }
  } catch (err) { postMessage({ type: 'error', id: d.id, message: String(err && err.stack || err) }); }
};
