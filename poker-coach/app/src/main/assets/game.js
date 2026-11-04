/* Poker Coach — partie d'entraînement contre des bots, avec coach en direct (jetons fictifs). */
(function () {
  'use strict';
  var P = window.Poker, C = window.CHARTS, K = window.Coach;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function rnd(n) { return (Math.random() * n) | 0; }
  function fmt(n) { return Math.round(n).toLocaleString('fr-FR'); }

  var SB = 5, BB = 10, START = 1000;
  var NAMES = ['Robo-Max', 'Le Roc', 'Bluffeur', 'Calculette', 'Turbo'];
  var STYLES = {
    roc: { label: 'serré', open: 13, call: 9, aggr: 0.2, stick: 0 },
    reg: { label: 'régulier', open: 22, call: 14, aggr: 0.45, stick: 0.03 },
    fou: { label: 'agressif', open: 38, call: 22, aggr: 0.85, stick: 0.05 },
    calling: { label: 'suiveur', open: 30, call: 40, aggr: 0.15, stick: 0.18 }
  };
  var MIX = ['roc', 'reg', 'fou', 'calling', 'reg'];
  var POS_LABELS = {
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'],
    5: ['BTN', 'SB', 'BB', 'MP', 'CO'], 6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']
  };
  var STREET_FR = ['Préflop', 'Flop', 'Turn', 'River'];

  var G = null, timer = null;

  /* ---------------- outils ---------------- */
  function n() { return G.players.length; }
  function inPlay(p) { return p.inHand && !p.folded; }
  function canAct(p) { return inPlay(p) && !p.allIn; }
  function nextIdx(i, pred) {
    pred = pred || inPlay;
    for (var k = 1; k <= n(); k++) { var j = (i + k) % n(); if (pred(G.players[j])) return j; }
    return -1;
  }
  function alive() { return G.players.filter(inPlay); }
  function betsOnTable() { return G.players.reduce(function (s, p) { return s + p.bet; }, 0); }
  function potTotal() { return G.pot + betsOnTable(); }
  function log(t) { G.log.unshift(t); if (G.log.length > 60) G.log.pop(); }
  function put(p, amt) { amt = Math.min(amt, p.stack); p.stack -= amt; p.bet += amt; p.total += amt; if (p.stack === 0) p.allIn = true; return amt; }
  function shuffle() { var d = []; for (var i = 0; i < 52; i++) d.push(i); for (i = 51; i > 0; i--) { var j = rnd(i + 1), t = d[i]; d[i] = d[j]; d[j] = t; } return d; }

  /* ---------------- déroulement ---------------- */
  function newGame(nBots, styleMode, coachOn) {
    var players = [{ name: 'Toi', hero: true, stack: START }];
    for (var i = 0; i < nBots; i++) {
      var st = styleMode === 'mix' ? MIX[i] : styleMode;
      players.push({ name: NAMES[i], style: st, stack: START });
    }
    G = { players: players, button: rnd(players.length), hand: 0, log: [], coachOn: coachOn, advised: 0, followed: 0, startStack: START, rebuys: 0, botRebuys: 0 };
    $('#g-coach').checked = coachOn;
    $('#g-setup').hidden = true; $('#g-play').hidden = false;
    startHand();
  }

  function startHand() {
    clearTimeout(timer);
    G.players.forEach(function (p) {
      if (p.stack <= 0 && !p.hero) { p.stack = START; G.botRebuys++; log('🔄 ' + p.name + ' se recave (' + fmt(START) + ').'); }
      p.cards = null; p.folded = false; p.allIn = false; p.bet = 0; p.total = 0; p.last = ''; p.won = 0; p.inHand = p.stack > 0; p.desc = '';
    });
    var hero = G.players[0];
    if (!hero.inHand) { G.phase = 'bust'; render(); renderControls(); return; }
    G.hand++;
    G.button = nextIdx(G.button, function (p) { return p.inHand; });
    var deck = shuffle();
    G.deck = deck; G.board = []; G.street = 0; G.pot = 0; G.phase = 'bet'; G.advice = null; G.raises = 0;
    G.players.forEach(function (p) { if (p.inHand) p.cards = [deck.pop(), deck.pop()]; });
    // positions
    var order = [], i = G.button;
    do { order.push(i); i = nextIdx(i, function (p) { return p.inHand; }); } while (i !== G.button);
    var labels = POS_LABELS[order.length];
    G.pos = {}; order.forEach(function (idx, k) { G.pos[idx] = labels[k]; });
    var sb, bb;
    if (order.length === 2) { sb = order[0]; bb = order[1]; } else { sb = order[1]; bb = order[2]; }
    put(G.players[sb], SB); G.players[sb].last = 'PB ' + SB;
    put(G.players[bb], BB); G.players[bb].last = 'GB ' + BB;
    G.currentBet = BB; G.minRaise = BB; G.bbIdx = bb;
    G.need = G.players.map(canAct);
    G.toAct = nextIdx(bb);
    log('— Main n°' + G.hand + ' — tu es ' + (G.pos[0] === 'BTN' && order.length === 2 ? 'au bouton (petite blinde)' : C.posName[G.pos[0]] || G.pos[0]) + '.');
    proceed();
  }

  function proceed() {
    clearTimeout(timer);
    if (alive().length === 1) return winUncontested(alive()[0]);
    if (!G.need.some(Boolean)) return endStreet();
    var i = G.toAct;
    for (var k = 0; k < n() && !G.need[i]; k++) i = (i + 1) % n();
    G.toAct = i;
    render();
    if (G.players[i].hero) {
      G.advice = G.coachOn ? computeAdvice() : null;
      // personne ne peut plus relancer derrière : relancer revient à suivre
      if (G.advice && !G.players.some(function (q, j) { return j !== 0 && canAct(q); }) && G.advice.ok.indexOf('raise') >= 0) G.advice.ok.push('call');
      renderCoach(); renderControls();
    }
    else { renderCoach(); renderControls(); timer = setTimeout(function () { botAct(i); }, 700); }
  }

  function act(i, type, to) {
    var p = G.players[i], toCall = G.currentBet - p.bet;
    if (type === 'raise' && to <= G.currentBet) type = 'call';
    if (type === 'call' && toCall <= 0) type = 'check';
    if (type === 'fold') { p.folded = true; p.last = 'Couché'; }
    else if (type === 'check') { p.last = 'Check'; }
    else if (type === 'call') { var a = put(p, toCall); p.last = p.allIn ? 'Tapis ' + fmt(p.bet) : 'Suit ' + fmt(a); }
    else {
      to = Math.min(to, p.bet + p.stack);
      var wasBet = G.currentBet === 0;
      put(p, to - p.bet);
      var incr = to - G.currentBet;
      if (incr >= G.minRaise) G.minRaise = incr;
      G.currentBet = to; G.raises++;
      p.last = p.allIn ? 'Tapis ' + fmt(to) : (wasBet ? 'Mise ' : 'Relance à ') + fmt(to);
      G.players.forEach(function (q, j) { if (j !== i && canAct(q)) G.need[j] = true; });
    }
    G.need[i] = false;
    log((p.hero ? '👉 ' : '') + p.name + ' : ' + p.last.toLowerCase());
    G.toAct = (i + 1) % n();
    proceed();
  }

  function endStreet() {
    clearTimeout(timer);
    G.players.forEach(function (p) { G.pot += p.bet; p.bet = 0; if (canAct(p)) p.last = ''; });
    if (G.street === 3) return showdown();
    G.street++;
    G.deck.pop(); // carte brûlée
    if (G.street === 1) G.board.push(G.deck.pop(), G.deck.pop(), G.deck.pop()); else G.board.push(G.deck.pop());
    log(STREET_FR[G.street] + ' : ' + G.board.map(P.cardStr).join(' ').replace(/T/g, '10'));
    G.currentBet = 0; G.minRaise = BB; G.raises = 0;
    var able = G.players.filter(canAct).length;
    G.need = G.players.map(function (p) { return able >= 2 && canAct(p); });
    G.toAct = nextIdx(G.button);
    if (able < 2) { render(); renderCoach(); renderControls(); timer = setTimeout(endStreet, 1100); }
    else proceed();
  }

  function finishHand() {
    G.phase = 'done';
    var hero = G.players[0];
    if (hero.won > 0) log('💰 Tu remportes ' + fmt(hero.won) + '.');
    render(); renderCoach(); renderControls();
  }

  function winUncontested(w) {
    G.players.forEach(function (p) { G.pot += p.bet; p.bet = 0; });
    var amount = G.players.reduce(function (s, p) { return s + p.total; }, 0);
    w.stack += amount; w.won = amount;
    log('🏆 ' + w.name + ' remporte ' + fmt(amount) + ' (tout le monde s\'est couché).');
    finishHand();
  }

  function showdown() {
    var live = alive();
    live.forEach(function (p) { p.score = P.evaluate(p.cards.concat(G.board)); p.desc = P.describe(p.cards.concat(G.board)); });
    var levels = live.map(function (p) { return p.total; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
    var prev = 0, given = 0, lastWinners = null, all = G.players.reduce(function (s, p) { return s + p.total; }, 0);
    levels.forEach(function (L) {
      var amount = G.players.reduce(function (s, p) { return s + Math.min(p.total, L) - Math.min(p.total, prev); }, 0);
      var elig = live.filter(function (p) { return p.total >= L; });
      var best = Math.max.apply(null, elig.map(function (p) { return p.score; }));
      var winners = elig.filter(function (p) { return p.score === best; });
      var share = Math.floor(amount / winners.length), rest = amount - share * winners.length;
      winners.forEach(function (w, k) { var g = share + (k === 0 ? rest : 0); w.stack += g; w.won += g; });
      given += amount; prev = L; lastWinners = winners;
    });
    if (all > given && lastWinners) { lastWinners[0].stack += all - given; lastWinners[0].won += all - given; }
    G.pot = 0;
    live.forEach(function (p) { log((p.won ? '🏆 ' : '   ') + p.name + ' : ' + p.desc + (p.won ? ' — gagne ' + fmt(p.won) : '')); });
    finishHand();
  }

  /* ---------------- bots ---------------- */
  function legalRaise(p, to) {
    to = Math.round(to / 5) * 5;
    to = Math.max(to, G.currentBet + G.minRaise);
    var max = p.bet + p.stack;
    if (to >= max * 0.8) to = max;
    if (to <= G.currentBet) return { type: 'call' };
    return { type: 'raise', to: to };
  }
  function botAct(i) {
    if (!G || G.phase !== 'bet') return;
    var d = botDecide(G.players[i]);
    act(i, d.type, d.to);
  }
  function botDecide(p) {
    var st = STYLES[p.style], toCall = G.currentBet - p.bet, pot = potTotal(), r = Math.random(), opps = alive().length - 1;
    var pos = G.pos[G.players.indexOf(p)];
    if (G.street === 0) {
      var rp = P.classRankPct(P.classOf(p.cards[0], p.cards[1]));
      var factor = { UTG: 0.7, MP: 0.85, CO: 1.1, BTN: 1.5, SB: 1.1, BB: 1.3 }[pos] || 1;
      if (G.raises === 0) {
        var limpers = G.players.filter(function (q) { return inPlay(q) && q.bet === BB && G.pos[G.players.indexOf(q)] !== 'BB'; }).length;
        if (rp <= st.open * factor || r < st.aggr * 0.05) return legalRaise(p, BB * 2.5 + limpers * BB);
        if (toCall === 0) return { type: 'check' };
        if (rp <= st.open * factor * 1.6 && toCall <= SB) return { type: 'call' };
        return { type: 'fold' };
      }
      var cheap = toCall <= p.stack * 0.1;
      if (G.raises === 1) {
        if (rp <= 3 + st.aggr * 5 || (r < st.aggr * 0.07 && rp < 35)) return legalRaise(p, G.currentBet * 3);
        if (rp <= st.call * (cheap ? 1 : 0.45)) return { type: 'call' };
        if (pos === 'BB' && toCall <= BB * 2.5 && rp <= st.call * 2) return { type: 'call' };
        return { type: 'fold' };
      }
      if (rp <= 2.8) return legalRaise(p, G.currentBet > p.stack * 0.3 ? p.bet + p.stack : G.currentBet * 2.3);
      if (rp <= 4.5 + st.stick * 20 && toCall <= p.stack * 0.3) return { type: 'call' };
      return { type: 'fold' };
    }
    var eq = P.equity(p.cards, G.board, { count: Math.max(1, opps) }, 400).equity;
    var fair = 1 / (opps + 1);
    if (toCall === 0) {
      if (eq > Math.max(0.62, fair * 1.6) && r > 0.15) return legalRaise(p, pot * (0.5 + 0.3 * Math.random()));
      if (eq > Math.max(0.5, fair * 1.2) && r < 0.35 + st.aggr * 0.3) return legalRaise(p, pot * 0.4);
      if (r < st.aggr * 0.22 && opps <= 2) return legalRaise(p, pot * 0.55);
      return { type: 'check' };
    }
    var req = toCall / (pot + toCall);
    var adj = eq - 0.12 * Math.min(1, toCall / Math.max(pot - toCall, 1)); // grosse mise = range adverse plus forte
    if (adj > Math.max(0.72, fair * 1.8) && r < 0.4 + st.aggr * 0.4) return legalRaise(p, G.currentBet * 2.5 + pot * 0.2);
    if (adj >= req * (1.15 - st.stick * 2)) return { type: 'call' };
    if (r < st.stick) return { type: 'call' };
    return { type: 'fold' };
  }

  /* ---------------- coach ---------------- */
  function computeAdvice() {
    var hero = G.players[0], toCall = G.currentBet - hero.bet, pot = potTotal(), opps = alive().length - 1;
    var cls = P.classOf(hero.cards[0], hero.cards[1]), rp = P.classRankPct(cls), a = { txt: [] };
    var eff = hero.stack + hero.bet;
    if (G.street === 0) {
      var pos = G.pos[0], chartPos = pos === 'BTN' || pos === 'CO' || pos === 'MP' || pos === 'UTG' || pos === 'SB' ? pos : 'BB';
      a.txt.push('Main : <b>' + K.classLabel(cls) + '</b>, dans le top <b>' + Math.round(rp) + ' %</b> des mains de départ. Position : ' + (C.posName[pos] || pos) + '.');
      if (G.raises === 0) {
        if (toCall === 0) {
          if (rp <= 18) set(a, 'RELANCER', 'raise', 'Personne n\'a relancé et ta main est forte : relance pour isoler les suiveurs.', BB * 4);
          else set(a, 'CHECK', 'call', 'Tu vois le flop gratuitement : check.');
        } else if (eff <= 15 * BB) {
          var pushP = C.push[eff <= 7 * BB ? 5 : 10][chartPos === 'BB' ? 'SB' : chartPos];
          if (rp <= pushP) set(a, 'TAPIS', 'raise', 'Petit tapis (' + Math.round(eff / BB) + ' BB) : à cette position on fait tapis avec le top ' + pushP + ' % des mains.', eff);
          else set(a, 'SE COUCHER', 'fold', 'Avec un petit tapis, on joue tapis ou couché ; cette main n\'est pas assez forte ici.');
        } else {
          var openRange = C.open[chartPos === 'BB' ? 'SB' : chartPos];
          var limpers = G.players.filter(function (q, j) { return j !== 0 && inPlay(q) && q.bet === BB && G.pos[j] !== 'BB'; }).length;
          if (P.parseRange(openRange)[cls]) set(a, 'RELANCER', 'raise', 'Cette main fait partie des mains à ouvrir ' + (C.posName[pos] || '') + ' : relance à 2,5 BB' + (limpers ? ' + 1 BB par suiveur' : '') + '.', BB * 2.5 + limpers * BB);
          else set(a, 'SE COUCHER', 'fold', 'Cette main est trop faible pour entrer dans le coup depuis cette position.');
        }
      } else if (G.raises === 1) {
        var v = C.vs[chartPos === 'UTG' ? 'MP' : chartPos];
        if (eff <= 20 * BB && rp <= 10) set(a, 'TAPIS', 'raise', 'Avec ' + Math.round(eff / BB) + ' BB et une main du top 10 %, fais tapis face à la relance.', eff);
        else if (P.parseRange(v.raise)[cls]) set(a, '3-BET', 'raise', 'Main assez forte pour sur-relancer (environ 3× la relance).', G.currentBet * 3);
        else if (P.parseRange(v.call)[cls] && toCall <= eff * 0.1) set(a, 'SUIVRE', 'call', 'Main jouable : suis pour voir le flop' + (pos === 'BB' ? ' (tu as déjà mis la grosse blinde, le prix est bon)' : '') + '.');
        else set(a, 'SE COUCHER', 'fold', 'Face à une relance, cette main ne gagne pas assez souvent : couche-toi.');
      } else {
        if (rp <= 2.8) set(a, 'TAPIS / 4-BET', 'raise', 'Une des toutes meilleures mains (QQ+, AK) : continue l\'escalade.', Math.max(G.currentBet * 2.3, 0));
        else if (rp <= 4.5 && toCall <= eff * 0.25) set(a, 'SUIVRE', 'call', 'Main forte mais pas assez pour tout miser : suis si le prix reste raisonnable.');
        else set(a, 'SE COUCHER', 'fold', 'Face à une sur-relance, l\'adversaire a souvent une très grosse main : couche-toi.');
      }
      return a;
    }
    var range = P.topPercent(opps > 1 ? 40 : 50);
    var eq = P.equity(hero.cards, G.board, { count: opps, range: range }, Math.round(7000 / Math.sqrt(opps)));
    var outsN = (P.outs(hero.cards, G.board) || []).length;
    var d = K.decide(eq, opps, G.board, pot, toCall, outsN);
    a.verdict = d.verdict; a.tone = d.tone; a.eq = eq.equity;
    a.txt.push('Ta main : <b>' + P.describe(hero.cards.concat(G.board)) + '</b>' + (outsN && G.board.length < 5 ? ' · <b>' + outsN + '</b> outs' : '') + '.');
    a.txt = a.txt.concat(d.txt);
    if (d.tone === 'raise') a.size = toCall > 0 ? G.currentBet * 3 : pot * 0.66;
    else if (/MISER/.test(d.verdict)) a.size = pot * 0.33;
    a.ok = d.tone === 'raise' ? ['raise'] : d.tone === 'warn' ? ['call', 'raise', 'fold'] : d.tone === 'call' ? (/MISER/.test(d.verdict) ? ['call', 'raise'] : ['call']) : (toCall > 0 ? ['fold'] : ['call']);
    if (a.size) { var lr = legalRaise(hero, a.size); a.size = lr.type === 'raise' ? lr.to : 0; }
    return a;
  }
  function set(a, verdict, tone, why, size) {
    a.verdict = verdict; a.tone = tone; a.txt.push(why);
    a.ok = tone === 'raise' ? ['raise'] : tone === 'call' ? ['call'] : ['fold'];
    if (G.currentBet - G.players[0].bet === 0 && tone === 'fold') a.ok = ['call'];
    if (size) { var lr = legalRaise(G.players[0], size); a.size = lr.type === 'raise' ? lr.to : 0; }
  }

  function heroAct(type, to) {
    if (G.advice) {
      var cat = type === 'check' ? 'call' : type;
      G.advised++;
      if (G.advice.ok.indexOf(cat) >= 0) { G.followed++; log('✔ Coach : bonne décision.'); }
      else log('✖ Coach : il conseillait « ' + G.advice.verdict.toLowerCase() + ' ».');
    }
    G.advice = null;
    act(0, type, to);
  }

  /* ---------------- affichage ---------------- */
  function cardFace(c, cls) { return K.cardHtml(c, true).replace('class="card', 'class="card ' + (cls || '')); }
  function render() {
    var t = $('#g-table'), N = n(), h = '';
    var hero = G.players[0];
    $('#g-info').innerHTML = 'Main n°' + G.hand + ' · ' + SB + '/' + BB + ' · ' + (G.phase === 'bet' ? STREET_FR[G.street] : G.phase === 'done' ? 'Fin du coup' : '');
    h += '<div class="felt"></div><div class="center"><div class="board">';
    for (var b = 0; b < 5; b++) h += G.board[b] != null ? cardFace(G.board[b]) : '<span class="card sm ghost"></span>';
    h += '</div><div class="pot">Pot : ' + fmt(G.phase === 'done' ? 0 : potTotal()) + '</div></div>';
    G.players.forEach(function (p, i) {
      var ang = (90 + i * 360 / N) * Math.PI / 180, x = 50 + 41 * Math.cos(ang), y = 50 + 37 * Math.sin(ang);
      var cls = 'seat' + (p.hero ? ' hero' : '') + (p.folded || !p.inHand ? ' out' : '') + (G.phase === 'bet' && G.toAct === i ? ' turn' : '') + (G.phase === 'done' && p.won ? ' win' : '');
      var cards = '';
      if (p.cards && !p.folded) {
        var show = p.hero || (G.phase === 'done' && alive().length > 1);
        cards = show ? cardFace(p.cards[0], 'xs') + cardFace(p.cards[1], 'xs') : '<span class="card xs back"></span><span class="card xs back"></span>';
      }
      var pos = G.pos && G.pos[i] ? G.pos[i] : '';
      h += '<div class="' + cls + '" style="left:' + x + '%;top:' + y + '%">' +
        '<div class="nm">' + (pos === 'BTN' ? '<span class="dealer">D</span>' : '') + p.name + (pos ? ' <i>' + pos + '</i>' : '') + '</div>' +
        '<div class="sc">' + cards + '</div>' +
        '<div class="stk">' + (p.inHand || p.hero ? fmt(p.stack) : 'éliminé') + '</div>' +
        (p.last ? '<div class="lst">' + p.last + '</div>' : '') +
        (G.phase === 'done' && p.desc && !p.folded ? '<div class="lst">' + p.desc + '</div>' : '') + '</div>';
      if (p.bet > 0) {
        var bx = 50 + 41 * 0.5 * Math.cos(ang), by = 50 + 37 * 0.48 * Math.sin(ang);
        h += '<div class="chip" style="left:' + bx + '%;top:' + by + '%">' + fmt(p.bet) + '</div>';
      }
    });
    t.innerHTML = h;
    $('#g-log').innerHTML = '<div class="row-title">Historique</div>' + G.log.slice(0, 25).map(function (l) { return '<div>' + l + '</div>'; }).join('');
  }

  function renderCoach() {
    var box = $('#g-coachbox');
    if (!G.coachOn) { box.innerHTML = '<div class="muted">Coach désactivé — active-le en haut pour avoir les conseils en direct.</div>'; return; }
    var rate = G.advised ? ' · conseils suivis : <b>' + G.followed + '/' + G.advised + '</b> (' + Math.round(G.followed / G.advised * 100) + ' %)' : '';
    if (G.phase === 'done') {
      var hero = G.players[0];
      box.innerHTML = '<div class="coach-h">🎓 Coach' + rate + '</div><div>' +
        (hero.won > 0 ? 'Coup gagné : +' + fmt(hero.won - hero.total) + '.' : hero.total ? 'Coup perdu : −' + fmt(hero.total) + '. Une bonne décision peut perdre : juge tes choix, pas le résultat.' : 'Tu n\'as pas joué ce coup.') +
        ' Tapis : <b>' + fmt(hero.stack) + '</b> (' + (hero.stack - START * (1 + G.rebuys) >= 0 ? '+' : '') + fmt(hero.stack - START * (1 + G.rebuys)) + ' depuis le début).</div>';
      return;
    }
    if (G.phase !== 'bet' || !G.players[0].inHand || G.players[0].folded) { box.innerHTML = '<div class="coach-h">🎓 Coach' + rate + '</div><div class="muted">' + (G.players[0].folded ? 'Tu t\'es couché, regarde la suite du coup.' : 'En attente…') + '</div>'; return; }
    if (G.toAct !== 0 || !G.advice) { box.innerHTML = '<div class="coach-h">🎓 Coach' + rate + '</div><div class="muted">' + G.players[G.toAct].name + ' réfléchit…</div>'; return; }
    var a = G.advice;
    box.innerHTML = '<div class="coach-h">🎓 Coach en direct' + rate + '</div>' +
      '<div class="verdict ' + a.tone + '">' + a.verdict + (a.size ? ' <small>à ' + fmt(a.size) + '</small>' : '') + '</div>' +
      (a.eq != null ? '<div class="muted">Équité estimée : <b>' + K.pct(a.eq) + '</b> contre ' + (alive().length - 1) + ' adversaire(s)</div>' : '') +
      '<ul class="why">' + a.txt.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
  }

  function renderControls() {
    var c = $('#g-controls'), hero = G.players[0];
    if (G.phase === 'bust') {
      c.innerHTML = '<div class="center">Tu n\'as plus de jetons.</div><button class="primary" id="g-rebuy">Se recaver (' + fmt(START) + ')</button>';
      $('#g-rebuy').onclick = function () { hero.stack = START; G.rebuys++; log('🔄 Tu te recaves.'); startHand(); };
      return;
    }
    if (G.phase === 'done') {
      c.innerHTML = '<button class="primary" id="g-next">Main suivante</button>';
      $('#g-next').onclick = startHand; return;
    }
    if (G.toAct !== 0 || hero.folded) { c.innerHTML = '<div class="center muted">' + (hero.folded ? 'Couché.' : 'Au tour de ' + G.players[G.toAct].name + '…') + '</div>'; return; }
    var toCall = G.currentBet - hero.bet, max = hero.bet + hero.stack, pot = potTotal();
    var minTo = Math.min(max, G.currentBet + G.minRaise), canRaise = max > G.currentBet && G.players.some(function (p, j) { return j !== 0 && canAct(p); });
    var h = '<div class="g-btns">';
    if (toCall > 0) h += '<button class="opt fold" data-a="fold">Se coucher</button>';
    h += toCall > 0 ? '<button class="opt call" data-a="call">' + (toCall >= hero.stack ? 'Tapis ' + fmt(hero.stack) : 'Suivre ' + fmt(toCall)) + '</button>'
      : '<button class="opt call" data-a="check">Check</button>';
    if (canRaise) h += '<button class="opt raise" data-a="raise" id="g-raise"></button>';
    h += '</div>';
    if (canRaise && max > minTo) {
      var pres = G.street === 0
        ? (G.raises === 0 ? [['2,5 BB', BB * 2.5], ['3 BB', BB * 3], ['4 BB', BB * 4]] : [['×3', G.currentBet * 3], ['×4', G.currentBet * 4]])
        : [['½ pot', G.currentBet + 0.5 * (pot + toCall)], ['¾ pot', G.currentBet + 0.75 * (pot + toCall)], ['Pot', G.currentBet + pot + toCall]];
      pres.push(['Tapis', max]);
      h += '<div class="g-pres">' + pres.map(function (p) { return '<button class="ghost tiny" data-to="' + Math.round(p[1]) + '">' + p[0] + '</button>'; }).join('') + '</div>';
      h += '<input type="range" id="g-slider" min="' + minTo + '" max="' + max + '" step="5">';
    }
    c.innerHTML = h;
    var slider = $('#g-slider'), rb = $('#g-raise');
    function upd() {
      if (!rb) return;
      var v = slider ? +slider.value : max;
      if (slider && v > max - 5) v = max;
      rb.dataset.to = v;
      rb.textContent = (v >= max ? 'Tapis ' : G.currentBet === 0 ? 'Miser ' : 'Relancer à ') + fmt(v);
    }
    if (slider) {
      var def = G.advice && G.advice.size ? G.advice.size : (G.street === 0 ? (G.raises === 0 ? BB * 2.5 : G.currentBet * 3) : G.currentBet + 0.66 * (pot + toCall));
      slider.value = Math.max(minTo, Math.min(max, Math.round(def / 5) * 5));
      slider.oninput = upd;
      $$('.g-pres button', c).forEach(function (b) { b.onclick = function () { slider.value = Math.max(minTo, Math.min(max, +b.dataset.to)); upd(); }; });
    }
    upd();
    $$('.g-btns button', c).forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.a;
        heroAct(a, a === 'raise' ? Math.max(minTo, +b.dataset.to) : undefined);
      };
    });
  }

  /* ---------------- branchements ---------------- */
  $('#g-start').onclick = function () { newGame(+$('#g-nbots').value, $('#g-style').value, $('#g-coach-start').checked); };
  $('#g-quit').onclick = function () { clearTimeout(timer); G = null; $('#g-play').hidden = true; $('#g-setup').hidden = false; };
  $('#g-coach').onchange = function () {
    if (!G) return;
    G.coachOn = this.checked;
    if (G.coachOn && G.phase === 'bet' && G.toAct === 0 && !G.advice) G.advice = computeAdvice();
    if (!G.coachOn) G.advice = null;
    renderCoach();
  };
  window.PokerGame = { state: function () { return G; } };
})();
