/* AI Go Dojo — language. English by default, ?lang=ko for Korean. */
(function (root) {
  'use strict';
  const Q = new URLSearchParams((root.location && root.location.search) || '');
  const LANG = Q.get('lang') === 'ko' ? 'ko' : 'en';
  const D = {
    en: {
      title: 'AI Go Dojo', subtitle: 'Two AIs teaching themselves Go — 19×19, live 24/7',
      black: 'Black', white: 'White', elo: 'Elo', lv: 'Lv', wins: 'Wins', games: 'games', caps: 'Captures', winrate: 'win rate',
      game: 'Game', move: 'Move', estimate: 'Estimate', thinking: '{n} is thinking…', sims: '{n} simulations',
      winprob: 'Win chance', chart: 'Elo rating (rises as they learn)', learnedTitle: 'What they just learned',
      lastGame: 'Last game', noGames: 'First game — both AIs know only the rules.', komi: 'Chinese rules · komi 7.5',
      resigns: '{n} resigns', wins_by: '{n} wins {r}', counting: 'Counting territory…', learning: 'Studying the game record…',
      nextGame: 'Next game in {s}s', pass: '{n} passes', avgLen: 'avg game {m} min',
      learnedLine: '{n} learned: {t}', shapes: ' (+{k} new shapes)', bench: 'instinct test {w}/{n}',
      start: 'Start', pause: 'Pause', speed: 'Think time', reset: 'Reset learning', export: 'Export brains', import: 'Import brains',
      confirmReset: 'Erase everything both AIs have learned and start from zero?', imported: 'Brains imported.', importFail: 'Could not read that file.',
      vol: 'Volume', bgm: 'Music', sfx: 'Stones', tapSound: '🔊 Tap to enable sound', clickSound: '🔊 Click to enable sound', streamLink: 'OBS stream view',
      perMove: '{s}s / move', lang: 'Korean', moves: 'moves', gamesN: '{n} games', h2h: 'Head-to-head', rules: 'Rules: area scoring, positional superko, two passes end the game, resign when hopeless, {m}-move cap.',
      paused: 'Paused',
    },
    ko: {
      title: 'AI 바둑 도장', subtitle: '스스로 배우며 크는 두 AI의 19줄 바둑 · 24시간 생방송',
      black: '흑', white: '백', elo: 'Elo', lv: 'Lv', wins: '승', games: '판', caps: '따낸 돌', winrate: '승률',
      game: '대국', move: '수', estimate: '형세', thinking: '{n} 생각 중…', sims: '시뮬레이션 {n}번',
      winprob: '승리 확률', chart: 'Elo 점수 (배울수록 올라가요)', learnedTitle: '방금 배운 것',
      lastGame: '지난 대국', noGames: '첫 대국 — 두 AI는 아직 규칙만 알아요.', komi: '중국식 계가 · 덤 7.5집',
      resigns: '{n} 불계패 (기권)', wins_by: '{n} 승리 {r}', counting: '계가 중…', learning: '기보 복습 중…',
      nextGame: '{s}초 뒤 다음 대국', pass: '{n} 패스', avgLen: '평균 {m}분',
      learnedLine: '{n}: {t}', shapes: ' (새 모양 {k}개)', bench: '직감 테스트 {w}/{n}',
      start: '시작', pause: '일시정지', speed: '생각 시간', reset: '학습 초기화', export: '두뇌 내보내기', import: '두뇌 불러오기',
      confirmReset: '두 AI가 배운 걸 모두 지우고 처음부터 시작할까요?', imported: '두뇌를 불러왔어요.', importFail: '파일을 읽을 수 없어요.',
      vol: '볼륨', bgm: '배경음악', sfx: '돌 소리', tapSound: '🔊 화면을 터치하면 소리 켜짐', clickSound: '🔊 클릭하면 소리 켜짐', streamLink: 'OBS 방송 화면',
      perMove: '한 수 {s}초', lang: 'English', moves: '수', gamesN: '{n}판', h2h: '상대 전적', rules: '규칙: 중국식 계가, 동형반복 금지, 연속 두 번 패스로 종료, 가망 없으면 기권, 최대 {m}수.',
      paused: '일시정지됨',
    },
  };
  const NAMES = { en: { alpha: 'Alpha', beta: 'Beta' }, ko: { alpha: '알파', beta: '베타' } };
  const LESSONS = {
    en: {
      'cap1+': 'capture a lone stone in atari right away', 'cap1-': 'not every one-stone capture is worth a move',
      'cap2+': 'capturing two or three stones is a big deal', 'cap2-': 'chasing small captures can waste tempo',
      'cap4+': 'capturing a big group wins games', 'cap4-': 'a big capture alone does not decide the game',
      'capsave+': 'rescue stones in atari by capturing back', 'capsave-': 'rescue stones in other ways than capturing',
      'save+': 'extend stones in atari to escape', 'save-': 'some stones in atari are better abandoned',
      'savebig+': 'never let a big group die in atari', 'savebig-': 'even a big group can be sacrificed',
      'selfat+': 'a one-stone sacrifice can be a tesuji', 'selfat-': 'avoid walking into atari',
      'selfatbig+': 'trying big sacrifice tactics', 'selfatbig-': 'never put its own group into atari',
      'atari+': 'putting stones in atari is strong', 'atari-': 'pointless ataris only help the opponent',
      'ataribig+': 'go after big groups with atari', 'ataribig-': 'hasty ataris on big groups backfire',
      'o1+': 'likes first-line moves in the opening (hmm…)', 'o1-': 'stay off the first line in the opening',
      'o2+': 'likes low second-line moves early', 'o2-': 'the second line is too low early on',
      'o3+': 'open on the 3rd line to secure territory', 'o3-': 'fewer 3rd-line opening moves',
      'o4+': 'open on the 4th line to build influence', 'o4-': 'fewer 4th-line opening moves',
      'o5+': 'likes central moves in the opening', 'o5-': 'the center is too thin early on',
      'l1+': 'first-line moves matter in the endgame', 'l1-': 'stop crawling along the first line',
      'near+': "answer the opponent's move up close", 'near-': "don't just follow the opponent around",
      'tenuki+': 'play elsewhere (tenuki) when there is a bigger point', 'tenuki-': 'tenuki less, respond more',
      'follow+': 'keep building on its own last move', 'follow-': 'spread its moves around the board',
      'big+': 'grab big empty areas early', 'big-': 'fighting beats empty corners early',
      'biglate+': 'look for open space later in the game', 'biglate-': 'later on, fights matter more than open space',
      'lib2+': 'two-liberty shapes are acceptable', 'lib2-': 'shapes with only two liberties are dangerous',
      'lib4+': 'keep groups with plenty of liberties', 'lib4-': 'profit first, liberties second',
      'ko+': 'enjoys ko fights', 'ko-': 'avoid ko fights', 'cut+': 'cutting the opponent apart is strong', 'cut-': 'hold back on risky cuts',
      none: 'still digesting the last game',
    },
    ko: {
      'cap1+': '단수된 돌 한 점은 바로 따낸다', 'cap1-': '돌 한 점 따내기가 늘 이득은 아니다',
      'cap2+': '두세 점 따내기는 큰 이득이다', 'cap2-': '작은 따내기에 매달리면 손해다',
      'cap4+': '큰 무리를 잡으면 이긴다', 'cap4-': '큰 따내기만으로 승부가 나진 않는다',
      'capsave+': '단수된 내 돌은 되따내서 살린다', 'capsave-': '따내기 말고 다른 방법으로 살린다',
      'save+': '단수된 돌은 달아나서 살린다', 'save-': '단수된 돌 중엔 버리는 게 나은 돌도 있다',
      'savebig+': '큰 무리가 단수되면 꼭 살린다', 'savebig-': '큰 무리도 때로는 버린다',
      'selfat+': '한 점 희생이 맥이 될 수 있다', 'selfat-': '스스로 단수에 들어가지 않는다',
      'selfatbig+': '큰 희생 작전을 시험 중이다', 'selfatbig-': '내 무리를 스스로 단수에 넣지 않는다',
      'atari+': '단수 치기가 강하다', 'atari-': '쓸데없는 단수는 상대만 돕는다',
      'ataribig+': '큰 무리에 단수를 노린다', 'ataribig-': '큰 무리에 섣부른 단수는 역효과다',
      'o1+': '초반 1선 수를 좋아하게 됐다 (음…)', 'o1-': '초반에 1선은 피한다',
      'o2+': '초반 2선 수를 선호한다', 'o2-': '초반 2선은 너무 낮다',
      'o3+': '초반 3선으로 실리를 챙긴다', 'o3-': '초반 3선 수를 줄인다',
      'o4+': '초반 4선으로 세력을 쌓는다', 'o4-': '초반 4선 수를 줄인다',
      'o5+': '초반 중앙 수를 좋아한다', 'o5-': '초반 중앙은 너무 엷다',
      'l1+': '끝내기에선 1선 수도 중요하다', 'l1-': '1선을 기어가지 않는다',
      'near+': '상대 수 가까이에서 응수한다', 'near-': '상대를 무작정 따라 두지 않는다',
      'tenuki+': '더 큰 곳이 있으면 손을 뺀다', 'tenuki-': '손 빼기를 줄이고 응수한다',
      'follow+': '내 직전 수를 이어서 둔다', 'follow-': '판 전체에 넓게 둔다',
      'big+': '초반엔 넓은 빈 곳을 먼저 차지한다', 'big-': '초반에도 빈 귀보다 싸움이 급하다',
      'biglate+': '후반에도 빈 곳을 찾는다', 'biglate-': '후반엔 빈 곳보다 싸움이 급하다',
      'lib2+': '활로 둘인 모양도 괜찮다', 'lib2-': '활로가 둘뿐인 모양은 위험하다',
      'lib4+': '활로가 넉넉한 모양을 만든다', 'lib4-': '활로보다 실리가 먼저다',
      'ko+': '패싸움을 즐긴다', 'ko-': '패싸움은 피한다', 'cut+': '상대 돌을 끊는 수가 강하다', 'cut-': '무리한 끊기는 삼간다',
      none: '지난 대국을 아직 정리 중',
    },
  };
  function t(key, vars) { let s = (D[LANG][key] != null ? D[LANG][key] : D.en[key] != null ? D.en[key] : key); if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]); return s; }
  const name = (key) => NAMES[LANG][key] || key;
  const lesson = (k) => LESSONS[LANG][k] || LESSONS[LANG].none;
  function apply(rootEl) { (rootEl || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); }); }
  root.I18N = { LANG, t, name, lesson, apply, LESSONS, D };
})(typeof self !== 'undefined' ? self : this);
