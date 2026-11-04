/* Poker Coach — interface. */
(function () {
  'use strict';
  var P = window.Poker, C = window.CHARTS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d).replace('.', ',') + ' %'; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function rnd(n) { return (Math.random() * n) | 0; }

  function cardHtml(c, small) {
    var s = c & 3, red = s === 1 || s === 2;
    var r = P.RANKS[c >> 2]; if (r === 'T') r = '10';
    return '<span class="card' + (red ? ' red' : '') + (small ? ' sm' : '') + ' s' + s + '"><b>' + r + '</b><i>' + P.SUIT_SYM[s] + '</i></span>';
  }
  function classLabel(cls) {
    return cls.replace(/T/g, '10') + (cls.length === 2 ? '' : '');
  }

  /* ================= Onglets ================= */
  $$('.tabs button').forEach(function (b) {
    b.onclick = function () {
      $$('.tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $$('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab); });
      window.scrollTo(0, 0);
      if (b.dataset.tab === 'quiz' && !quizState) nextQuiz();
    };
  });
  function seg(id, onChange) {
    var root = $('#' + id);
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', root).forEach(function (x) { x.classList.toggle('on', x === b); });
      onChange(b.dataset.v);
    });
    return function () { var on = $('button.on', root); return on && on.dataset.v; };
  }

  /* ================= Analyse ================= */
  var slots = [null, null, null, null, null, null, null]; // 0-1 héros, 2-6 board
  var active = 0;
  var heroSlots = $('#hero-slots'), boardSlots = $('#board-slots'), picker = $('#picker');

  function renderSlots() {
    heroSlots.innerHTML = ''; boardSlots.innerHTML = '';
    slots.forEach(function (c, i) {
      var s = el('button', 'slot' + (i === active ? ' active' : '') + (c == null ? ' empty' : ''));
      s.innerHTML = c == null ? '<span>' + (i < 2 ? 'Carte ' + (i + 1) : ['Flop', 'Flop', 'Flop', 'Turn', 'River'][i - 2]) + '</span>' : cardHtml(c);
      s.onclick = function () {
        if (slots[i] != null && active === i) { slots[i] = null; }
        active = i; renderSlots(); renderPicker();
      };
      (i < 2 ? heroSlots : boardSlots).appendChild(s);
    });
  }
  function renderPicker() {
    picker.innerHTML = '';
    var used = {}; slots.forEach(function (c) { if (c != null) used[c] = true; });
    for (var s = 0; s < 4; s++) {
      var row = el('div', 'prow');
      for (var r = 12; r >= 0; r--) {
        (function (c) {
          var b = el('button', 'pcard' + (s === 1 || s === 2 ? ' red' : '') + ' s' + s + (used[c] ? ' used' : ''));
          var rr = P.RANKS[c >> 2]; b.innerHTML = (rr === 'T' ? '10' : rr) + '<i>' + P.SUIT_SYM[c & 3] + '</i>';
          b.disabled = !!used[c];
          b.onclick = function () { pick(c); };
          row.appendChild(b);
        })(P.card(r, s));
      }
      picker.appendChild(row);
    }
  }
  function pick(c) {
    slots[active] = c;
    // avancer vers la prochaine case vide (main d'abord, puis board dans l'ordre)
    var next = -1;
    for (var i = 0; i < 7; i++) if (slots[i] == null) { next = i; break; }
    if (next >= 0) active = next;
    renderSlots(); renderPicker();
  }
  $('#btn-clear').onclick = function () { slots = [null, null, null, null, null, null, null]; active = 0; $('#result').innerHTML = ''; renderSlots(); renderPicker(); };
  $('#btn-random').onclick = function () {
    var deck = []; for (var i = 0; i < 52; i++) deck.push(i);
    deck.sort(function () { return Math.random() - 0.5; });
    var nb = [0, 3, 4, 5][rnd(4)];
    slots = [deck[0], deck[1]].concat(deck.slice(2, 2 + nb));
    while (slots.length < 7) slots.push(null);
    active = slots.indexOf(null); if (active < 0) active = 6;
    renderSlots(); renderPicker();
  };

  function boardCards() {
    // le board doit être rempli dans l'ordre (flop complet avant turn, etc.)
    var b = slots.slice(2).filter(function (c) { return c != null; });
    return b;
  }

  function analyse() {
    var out = $('#result');
    if (slots[0] == null || slots[1] == null) { out.innerHTML = '<div class="panel err">Choisis d\'abord tes deux cartes.</div>'; return; }
    var hero = [slots[0], slots[1]], board = boardCards();
    if (board.length === 1 || board.length === 2) { out.innerHTML = '<div class="panel err">Le flop compte 3 cartes : complète-le (ou vide le board pour le préflop).</div>'; return; }
    var n = +$('#opp-count').value, prof = +$('#opp-profile').value;
    var pot = parseFloat($('#pot').value) || 0, toCall = parseFloat($('#tocall').value) || 0;
    out.innerHTML = '<div class="panel center">Calcul en cours…</div>';
    setTimeout(function () {
      var range = prof >= 100 ? null : P.topPercent(prof);
      var iters = board.length === 5 ? 15000 : 25000;
      var eq = P.equity(hero, board, { count: n, range: range }, Math.max(8000, Math.round(iters / Math.sqrt(n))));
      if (!eq) { out.innerHTML = '<div class="panel err">Range adverse incompatible avec les cartes choisies.</div>'; return; }
      out.innerHTML = '';
      out.appendChild(renderResult(hero, board, n, prof, pot, toCall, eq));
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }
  $('#btn-analyse').onclick = analyse;

  var STREET = ['Préflop', '', '', 'Flop', 'Turn', 'River'];

  function decide(eq, n, board, pot, toCall, outsN) {
    var fair = 1 / (n + 1), e = eq.equity, txt = [], verdict, tone;
    var strong = Math.min(0.9, fair * 1.3), good = fair;
    if (toCall > 0) {
      var req = toCall / (pot + toCall);
      txt.push('Tu dois payer <b>' + toCall + '</b> pour un pot final de <b>' + (pot + toCall) + '</b> : il te faut au moins <b>' + pct(req) + '</b> d\'équité pour que suivre soit rentable. Tu as <b>' + pct(e) + '</b>.');
      if (e >= req && e >= strong && e >= req + 0.15) {
        verdict = 'RELANCER'; tone = 'raise';
        txt.push('Tu es largement devant : relance pour la valeur (environ 3× la mise adverse) afin de faire payer les mains moins bonnes et les tirages.');
      } else if (e >= req) {
        verdict = 'SUIVRE'; tone = 'call';
        txt.push('Ton équité dépasse la cote du pot : suivre gagne de l\'argent sur le long terme (gain moyen ≈ <b>' + ((e * (pot + toCall) - toCall)).toFixed(1).replace('.', ',') + '</b>).');
      } else if (board.length < 5 && outsN >= 8 && e >= req - 0.08) {
        verdict = 'SUIVRE si tapis profonds'; tone = 'warn';
        txt.push('Il te manque un peu d\'équité, mais ton tirage peut te rapporter plus sur les rues suivantes (cotes implicites). Suis seulement si l\'adversaire a encore beaucoup de jetons et paiera quand tu toucheras ; sinon couche-toi.');
      } else {
        verdict = 'SE COUCHER'; tone = 'fold';
        txt.push('Ton équité est trop faible par rapport au prix demandé : suivre perd de l\'argent en moyenne (perte ≈ <b>' + (toCall - e * (pot + toCall)).toFixed(1).replace('.', ',') + '</b>).');
      }
    } else {
      if (board.length === 0) {
        txt.push('Personne n\'a misé : regarde surtout l\'onglet <b>Préflop</b> selon ta position.');
      }
      if (e >= strong) {
        verdict = 'MISER (valeur)'; tone = 'raise';
        txt.push('Main très forte face à ' + (n > 1 ? n + ' adversaires' : 'ton adversaire') + ' : mise ½ à ¾ du pot pour te faire payer.');
      } else if (e >= good) {
        verdict = 'MISER petit ou CHECK'; tone = 'call';
        txt.push('Tu es légèrement devant : une petite mise (⅓ du pot) protège ta main ; check si le board est dangereux ou si l\'adversaire est agressif.');
      } else if (board.length > 0 && board.length < 5 && outsN >= 8) {
        verdict = 'CHECK ou SEMI-BLUFF'; tone = 'warn';
        txt.push('Tu as un bon tirage : miser maintenant (semi-bluff) peut faire coucher l\'adversaire, et tu peux encore toucher sinon.');
      } else {
        verdict = 'CHECK'; tone = 'fold';
        txt.push('Main faible : check et abandonne si l\'adversaire mise fort.');
      }
    }
    if (n > 1) txt.push('À ' + (n + 1) + ' joueurs, ta part « juste » du pot est ' + pct(fair, 0) + ' : il faut une main plus forte qu\'en tête-à-tête.');
    return { verdict: verdict, tone: tone, txt: txt };
  }

  function renderResult(hero, board, n, prof, pot, toCall, eq) {
    var box = el('div', 'panel result');
    var street = STREET[board.length];
    var made = board.length >= 3 ? P.describe(hero.concat(board)) : null;
    var cls = P.classOf(hero[0], hero[1]);
    var outsList = P.outs(hero, board) || [];
    var d = decide(eq, n, board, pot, toCall, outsList.length);

    var h = '<div class="res-head"><div>' + cardHtml(hero[0], true) + cardHtml(hero[1], true) +
      (board.length ? '<span class="sep"></span>' + board.map(function (c) { return cardHtml(c, true); }).join('') : '') +
      '</div><span class="tag">' + street + '</span></div>';
    h += '<div class="verdict ' + d.tone + '">' + d.verdict + '</div>';
    h += '<div class="eqline"><div class="big">' + pct(eq.equity) + '</div><div class="sub">équité vs ' + n + ' adversaire' + (n > 1 ? 's' : '') +
      ' (' + (prof >= 100 ? 'mains au hasard' : 'top ' + prof + ' %') + ')</div></div>';
    h += '<div class="bar"><span class="w" style="width:' + eq.win * 100 + '%"></span><span class="t" style="width:' + eq.tie * 100 + '%"></span></div>';
    h += '<div class="barlbl"><span>Gagne ' + pct(eq.win) + '</span><span>Égalité ' + pct(eq.tie) + '</span><span>Perd ' + pct(eq.lose) + '</span></div>';
    h += '<ul class="why">' + d.txt.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';

    h += '<div class="facts">';
    if (made) h += '<div><span>Ta main</span><b>' + made + '</b></div>';
    else h += '<div><span>Main de départ</span><b>' + classLabel(cls) + ' — top ' + Math.round(P.classRankPct(cls)) + ' %</b></div>';
    if (board.length === 3 || board.length === 4) {
      var mult = board.length === 3 ? 4 : 2;
      h += '<div><span>Outs</span><b>' + outsList.length + (outsList.length ? ' → ≈ ' + Math.min(100, outsList.length * mult) + ' % (règle du ' + mult + ')' : '') + '</b></div>';
    }
    h += '</div>';
    if (outsList.length) h += '<div class="outs">' + outsList.map(function (c) { return cardHtml(c, true); }).join('') + '</div>';

    if (board.length < 5) {
      h += '<div class="row-title">Ta main à la river</div><div class="cats">';
      for (var i = 8; i >= 0; i--) if (eq.cats[i] > 0.0005) {
        h += '<div class="cat"><span>' + P.CAT_FR[i] + '</span><div class="cb"><i style="width:' + Math.max(1, eq.cats[i] * 100) + '%"></i></div><b>' + pct(eq.cats[i]) + '</b></div>';
      }
      h += '</div>';
    }
    h += '<p class="foot">Simulation de ' + eq.iters.toLocaleString('fr-FR') + ' donnes. Outil d\'étude : à utiliser hors des parties en argent réel.</p>';
    box.innerHTML = h;
    return box;
  }

  /* ================= Préflop ================= */
  var pfMode = seg('pf-mode', function (v) { $('#pf-cash-opts').hidden = v !== 'cash'; $('#pf-mtt-opts').hidden = v !== 'mtt'; renderPos(); renderChart(); });
  var pfSit = seg('pf-sit', function () { renderPos(); renderChart(); });
  var pfStack = seg('pf-stack', function () { renderChart(); });
  var pfPos = 'BTN';
  function posList() {
    if (pfMode() === 'mtt') return ['UTG', 'MP', 'CO', 'BTN', 'SB'];
    return pfSit() === 'open' ? ['UTG', 'MP', 'CO', 'BTN', 'SB'] : ['MP', 'CO', 'BTN', 'SB', 'BB'];
  }
  function renderPos() {
    var root = $('#pf-pos'), list = posList();
    if (list.indexOf(pfPos) < 0) pfPos = list[list.length - 2] || list[0];
    root.innerHTML = '';
    list.forEach(function (p) {
      var b = el('button', p === pfPos ? 'on' : '', p);
      b.onclick = function () { pfPos = p; renderPos(); renderChart(); };
      root.appendChild(b);
    });
  }
  // Action conseillée pour une classe de main : 'raise' | 'call' | 'fold'
  function chartAction(mode, sit, pos, stack, cls) {
    if (mode === 'mtt') return P.topPercent(C.push[stack][pos])[cls] ? 'raise' : 'fold';
    if (sit === 'open') return P.parseRange(C.open[pos])[cls] ? 'raise' : 'fold';
    var v = C.vs[pos];
    if (P.parseRange(v.raise)[cls]) return 'raise';
    if (P.parseRange(v.call)[cls]) return 'call';
    return 'fold';
  }
  function actionWord(mode, sit, a) {
    if (a === 'fold') return 'Se coucher';
    if (mode === 'mtt') return 'Tapis';
    if (sit === 'open') return 'Relancer (2,5 BB)';
    return a === 'raise' ? 'Sur-relancer (3-bet)' : 'Suivre';
  }
  function renderChart() {
    var mode = pfMode(), sit = pfSit(), stack = pfStack(), grid = $('#pf-grid');
    grid.innerHTML = '';
    var n = { raise: 0, call: 0 };
    for (var i = 0; i < 13; i++) for (var j = 0; j < 13; j++) {
      (function (cls) {
        var a = chartAction(mode, sit, pfPos, stack, cls);
        if (a !== 'fold') n[a] += P.comboCount(cls);
        var c = el('button', 'rc ' + a, cls.replace(/[so]$/, '<small>$&</small>'));
        c.onclick = function () {
          $$('.rc.sel', grid).forEach(function (x) { x.classList.remove('sel'); });
          c.classList.add('sel');
          $('#pf-info').innerHTML = '<b>' + classLabel(cls) + '</b> (' + P.comboCount(cls) + ' combinaisons, top ' + Math.round(P.classRankPct(cls)) + ' %), ' +
            C.posName[pfPos] + ' : <span class="act ' + a + '">' + actionWord(mode, sit, a) + '</span>';
        };
        grid.appendChild(c);
      })(P.gridClass(i, j));
    }
    var lbl = mode === 'mtt' ? ['Tapis', ''] : sit === 'open' ? ['Relancer', ''] : ['3-bet', 'Suivre'];
    var leg = '<span class="lg raise"></span>' + lbl[0] + ' ' + (n.raise / 13.26).toFixed(0) + ' %';
    if (lbl[1]) leg += '<span class="lg call"></span>' + lbl[1] + ' ' + (n.call / 13.26).toFixed(0) + ' %';
    leg += '<span class="lg fold"></span>Se coucher';
    $('#pf-legend').innerHTML = leg;
    var ctx = mode === 'mtt'
      ? 'Tournoi, tapis de ' + stack + ' BB, personne n\'est entré avant toi : soit tapis, soit couché.'
      : sit === 'open' ? 'Cash 6-max 100 BB, personne n\'a relancé avant toi.' : 'Cash 6-max 100 BB, un joueur placé avant toi a relancé à ~2,5 BB.';
    $('#pf-info').innerHTML = ctx + ' Touche une case pour le détail (T = 10).';
  }

  /* ================= Quiz ================= */
  var quizState = null;
  var score = store('pc_score') || { ok: 0, total: 0, streak: 0, best: 0 };
  var qzMode = seg('qz-mode', function () { nextQuiz(); });
  function renderScore() {
    var r = score.total ? Math.round(score.ok / score.total * 100) : 0;
    $('#qz-score').innerHTML = '<div><b>' + score.ok + '/' + score.total + '</b><span>bonnes réponses (' + r + ' %)</span></div>' +
      '<div><b>' + score.streak + '</b><span>série</span></div><div><b>' + score.best + '</b><span>record</span></div>' +
      '<button class="ghost tiny" id="qz-reset">Remettre à zéro</button>';
    $('#qz-reset').onclick = function () { score = { ok: 0, total: 0, streak: 0, best: 0 }; store('pc_score', score); renderScore(); };
  }
  function randomHandOfClass(cls) { var cb = P.combosOf(cls); return cb[rnd(cb.length)]; }

  function nextQuiz() {
    var mode = qzMode(), q = { mode: mode };
    if (mode === 'post') {
      var deck = []; for (var i = 0; i < 52; i++) deck.push(i);
      deck.sort(function () { return Math.random() - 0.5; });
      q.hero = [deck[0], deck[1]];
      q.board = deck.slice(2, 2 + (Math.random() < 0.6 ? 3 : 4));
      q.prof = [50, 30, 15][rnd(3)];
      q.pot = 4 + rnd(37);
      var frac = [0.33, 0.5, 0.66, 0.75, 1, 1.25][rnd(6)];
      q.bet = Math.max(1, Math.round(q.pot * frac));
      q.potWithBet = q.pot + q.bet;
      q.options = [['fold', 'Se coucher'], ['call', 'Suivre']];
    } else {
      q.pos = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'][rnd(6)];
      if (mode === 'mtt') {
        if (q.pos === 'BB') q.pos = 'SB';
        q.stack = [5, 10, 15, 20][rnd(4)]; q.sit = 'open';
        q.options = [['fold', 'Se coucher'], ['raise', 'Tapis']];
      } else {
        q.sit = q.pos === 'BB' ? 'vs' : q.pos === 'UTG' ? 'open' : (Math.random() < 0.5 ? 'open' : 'vs');
        q.options = q.sit === 'open' ? [['fold', 'Se coucher'], ['raise', 'Relancer']] : [['fold', 'Se coucher'], ['call', 'Suivre'], ['raise', '3-bet']];
      }
      // une fois sur deux, une main proche de la limite du tableau (plus instructif)
      var cls, tries = 0;
      do {
        cls = P.ALL_CLASSES[rnd(169)]; tries++;
        var a = chartAction(mode === 'mtt' ? 'mtt' : 'cash', q.sit, q.pos, q.stack, cls);
      } while (Math.random() < 0.5 && a === 'fold' && P.classRankPct(cls) > 70 && tries < 20);
      q.cls = cls; q.hero = randomHandOfClass(cls);
      q.answer = chartAction(mode === 'mtt' ? 'mtt' : 'cash', q.sit, q.pos, q.stack, cls);
    }
    quizState = q; renderQuiz();
  }

  function renderQuiz(feedback) {
    var q = quizState, card = $('#qz-card'), h = '';
    if (q.mode === 'post') {
      h += '<div class="qz-ctx">Après le flop · adversaire ' + (q.prof === 50 ? 'large' : q.prof === 30 ? 'moyen' : 'serré') + ' (top ' + q.prof + ' %)</div>';
      h += '<div class="qz-cards">' + cardHtml(q.hero[0]) + cardHtml(q.hero[1]) + '</div>';
      h += '<div class="qz-board">' + q.board.map(function (c) { return cardHtml(c, true); }).join('') + '</div>';
      h += '<div class="qz-q">Pot : <b>' + q.pot + '</b> · L\'adversaire mise <b>' + q.bet + '</b>.<br>Que fais-tu ?</div>';
    } else {
      var ctx = q.mode === 'mtt' ? 'Tournoi · ' + q.stack + ' BB · personne n\'est entré'
        : q.sit === 'open' ? 'Cash 6-max · personne n\'a relancé' : 'Cash 6-max · un joueur avant toi relance à 2,5 BB';
      h += '<div class="qz-ctx">' + ctx + '</div>';
      h += '<div class="qz-cards">' + cardHtml(q.hero[0]) + cardHtml(q.hero[1]) + '</div>';
      h += '<div class="qz-q">Tu es <b>' + C.posName[q.pos] + '</b> avec <b>' + classLabel(q.cls) + '</b>.<br>Que fais-tu ?</div>';
    }
    h += '<div class="qz-opts">' + q.options.map(function (o) {
      var cl = 'opt ' + o[0];
      if (feedback) { if (o[0] === q.answer) cl += ' right'; else if (o[0] === feedback.choice) cl += ' wrong'; }
      return '<button class="' + cl + '" data-a="' + o[0] + '"' + (feedback ? ' disabled' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>';
    if (feedback) {
      h += '<div class="qz-fb ' + (feedback.ok ? 'ok' : 'ko') + '"><b>' + (feedback.ok ? 'Bien joué !' : 'Pas tout à fait.') + '</b> ' + feedback.text + '</div>';
      h += '<button class="primary" id="qz-next">Question suivante</button>';
    }
    card.innerHTML = h;
    $$('.qz-opts button', card).forEach(function (b) { b.onclick = function () { answer(b.dataset.a); }; });
    if (feedback) $('#qz-next').onclick = nextQuiz;
    renderScore();
  }

  function answer(choice) {
    var q = quizState, text;
    if (q.mode === 'post') {
      var eq = P.equity(q.hero, q.board, { count: 1, range: P.topPercent(q.prof) }, 6000);
      var req = q.bet / (q.potWithBet + q.bet);
      q.answer = eq.equity >= req ? 'call' : 'fold';
      var outsN = (P.outs(q.hero, q.board) || []).length;
      text = 'Ta main : ' + P.describe(q.hero.concat(q.board)) + (outsN ? ' (' + outsN + ' outs)' : '') + '. Équité ≈ <b>' + pct(eq.equity) +
        '</b> ; il en faut <b>' + pct(req) + '</b> (' + q.bet + ' ÷ ' + (q.potWithBet + q.bet) + '). ' +
        (q.answer === 'call' ? 'Suivre est rentable.' : 'Se coucher est le bon choix.');
    } else {
      var mode = q.mode === 'mtt' ? 'mtt' : 'cash';
      text = 'Le tableau conseille : <b>' + actionWord(mode, q.sit, q.answer) + '</b> avec ' + classLabel(q.cls) + ' (top ' + Math.round(P.classRankPct(q.cls)) + ' % des mains), ' + C.posName[q.pos] + '.';
      if (mode === 'mtt') text += ' À ' + q.stack + ' BB depuis cette position, on met à tapis environ ' + C.push[q.stack][q.pos] + ' % des mains.';
    }
    var ok = choice === q.answer;
    score.total++; if (ok) { score.ok++; score.streak++; score.best = Math.max(score.best, score.streak); } else score.streak = 0;
    store('pc_score', score);
    renderQuiz({ choice: choice, ok: ok, text: text });
  }

  /* ================= Démarrage ================= */
  renderSlots(); renderPicker(); renderPos(); renderChart(); renderScore();
})();
