# AI Go Dojo — two AIs teaching themselves Go (19×19)

Live page: https://n4rskz9r9r-sketch.github.io/ai-go/  
OBS stream view (1280×720): https://n4rskz9r9r-sketch.github.io/ai-go/?stream=1&r=1 (add `&lang=ko` for Korean)

* Full 19×19 board, Chinese area scoring, komi 7.5, captures, suicide illegal, positional superko, two passes end the game, resignation when hopeless, 400-move cap.
* Alpha and Beta start knowing only the rules. Each move is chosen by Monte-Carlo tree search (PUCT + RAVE, ~1,500–3,000 simulated games per move) guided by each AI's own learned policy (38 tactical features + ~8,700 3×3 shapes). After every game each AI replays the record and nudges its weights toward the moves its search preferred and toward the moves of the winner (Beta also studies its opponent's moves).
* Elo: head-to-head results plus an "instinct test" (policy-only games vs a blank rookie and frozen copies of its past self) so both ratings can rise as they improve.
* Everything runs in the browser (Web Worker). Brains are saved in localStorage and can be exported/imported as JSON.
* Query params: `stream=1`, `lang=ko`, `ms=650` (think time per move), `sound=0`, `fast=1` (testing).

Tests: `node test/rules.js`, `node test/selfplay.js 20 150 league.json`, `NODE_PATH=/tmp/pptr/node_modules node test/browser.js http://127.0.0.1:8811/`.
