// node test/strength.js league.json <key> <mctsGames> <msPerMove> — trained brain vs blank rookie
const G = require('../js/engine.js'); const fs = require('fs');
const L = G.loadLeague(JSON.parse(fs.readFileSync(process.argv[2]))); const key = process.argv[3] || 'beta';
const n = +process.argv[4] || 4, ms = +process.argv[5] || 200; const T = L[key].brain, R = new G.Brain();
let qw = 0; for (let i = 0; i < 40; i++) { const tb = i % 2 === 0; const r = G.quickGame(tb ? T : R, tb ? R : T); if ((r.winner === 1) === tb) qw++; }
console.log(`${key} after ${L.games} games: instinct (policy-only) vs rookie ${qw}/40`);
const se = new G.Searcher(); let w = 0;
for (let i = 0; i < n; i++) {
  const tb = i % 2 === 0, g = new G.Game(), mem = { 1: {}, 2: {} };
  while (!g.over) { const br = (g.toPlay === 1) === tb ? T : R; const r = se.search(g, br, { timeMs: ms }); g.play(G.decide(g, r, mem[g.toPlay])); }
  let res = g.result; if (!res.resign) { const f = se.search(g, R, { timeMs: 500 }); const s = G.finalScore(g, f.ownership); res = { ...s, winner: s.margin > 0 ? 1 : 2 }; }
  const won = (res.winner === 1) === tb; if (won) w++; console.log(`  search game ${i + 1}: trained as ${tb ? 'Black' : 'White'} ${won ? 'WON' : 'lost'} ${G.resultString(res)} (${g.moves.length} moves)`);
}
console.log(`${key}: with search (${ms}ms/move) vs rookie ${w}/${n}`);
