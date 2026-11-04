/* Poker Coach — coach de table pour une partie à la maison avec de vraies cartes (saisie manuelle rapide). */
(function () {
  'use strict';
  var P = window.Poker, K = window.Coach;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cards = [], rank = -1, opps = 3, startOpps = 3, timer = null;
  var RANK_ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  var STEP = ['ta 1re carte', 'ta 2e carte', 'la 1re carte du flop', 'la 2e carte du flop', 'la 3e carte du flop', 'la carte du turn', 'la carte de la river'];

  function label(r) { var c = P.RANKS[r]; return c === 'T' ? '10' : c; }

  function renderPicker() {
    var used = {}; cards.forEach(function (c) { used[c] = true; });
    var full = cards.length >= 7;
    $('#irl-ranks').innerHTML = RANK_ORDER.map(function (r) {
      var free = [0, 1, 2, 3].some(function (s) { return !used[P.card(r, s)]; });
      return '<button data-r="' + r + '"' + (r === rank ? ' class="on"' : '') + (!free || full ? ' disabled' : '') + '>' + label(r) + '</button>';
    }).join('');
    $('#irl-suits').innerHTML = [0, 1, 2, 3].map(function (s) {
      var dis = rank < 0 || used[P.card(rank, s)] || full;
      var col = s === 1 ? '#c62828' : s === 2 ? '#1565c0' : s === 3 ? '#2e7d32' : '#1a1a1a';
      return '<button data-s="' + s + '" style="color:' + col + '"' + (dis ? ' disabled' : '') + '>' + P.SUIT_SYM[s] + '</button>';
    }).join('');
    $$('#irl-ranks button').forEach(function (b) { b.onclick = function () { rank = +b.dataset.r; renderPicker(); }; });
    $$('#irl-suits button').forEach(function (b) { b.onclick = function () { cards.push(P.card(rank, +b.dataset.s)); rank = -1; update(); }; });

    var h = '';
    for (var i = 0; i < 7; i++) {
      if (i === 2) h += '<span class="gap"></span>';
      h += cards[i] != null ? K.cardHtml(cards[i]) : '<span class="card ghost"></span>';
    }
    $('#irl-cards').innerHTML = h;
    $('#irl-next').textContent = full ? 'Toutes les cartes sont entrées' : 'Entre ' + STEP[cards.length] + (rank >= 0 ? ' : ' + label(rank) + ' de quelle couleur ?' : ' : valeur puis couleur');
    var st = cards.length < 2 ? 'Tes cartes' : cards.length < 5 ? 'Préflop' : cards.length === 5 ? 'Flop' : cards.length === 6 ? 'Turn' : 'River';
    $('#irl-stage').textContent = st + ' · ' + (opps + 1) + ' joueurs dans le coup';
    $('#irl-n').textContent = opps;
  }

  function preflop(hero, pot, toCall, style) {
    var cls = P.classOf(hero[0], hero[1]), rp = P.classRankPct(cls), players = opps + 1;
    var thr = players <= 2 ? 65 : players === 3 ? 45 : players === 4 ? 35 : players <= 6 ? 25 : 18;
    if (style >= 80) thr *= 0.9; // contre des joueurs qui suivent tout, on joue plus serré mais on mise plus pour la valeur
    var a = { txt: ['Main : <b>' + K.classLabel(cls) + '</b>, dans le top <b>' + Math.round(rp) + ' %</b> des mains de départ.'] };
    if (rp <= thr / 3 || rp <= 4) {
      a.verdict = 'RELANCER'; a.tone = 'raise';
      a.txt.push('Très bonne main : relance (environ 3 à 4 grosses blindes, un peu plus s\'il y a déjà des suiveurs) pour faire payer les mains moins bonnes.');
    } else if (rp <= thr) {
      a.verdict = toCall > 0 ? 'SUIVRE' : 'JOUER (check ou suivre)'; a.tone = 'call';
      a.txt.push('Main jouable à ' + players + ' joueurs : entre dans le coup sans trop investir, et décide au flop.');
      if (toCall > 0 && pot > 0 && toCall > pot) { a.verdict = 'SE COUCHER'; a.tone = 'fold'; a.txt.push('Mais la relance est grosse par rapport au pot : avec cette main, ça ne vaut pas le prix.'); }
    } else {
      a.verdict = toCall > 0 ? 'SE COUCHER' : 'CHECK (sinon se coucher)'; a.tone = 'fold';
      a.txt.push('Avec ' + players + ' joueurs, cette main gagne trop rarement : ne mets pas de jetons dedans.');
    }
    if (players > 4) a.txt.push('Plus il y a de joueurs, plus il faut une bonne main : quelqu\'un a souvent mieux.');
    return a;
  }

  function compute() {
    var box = $('#irl-advice');
    var n = cards.length;
    if (n < 2) { box.innerHTML = '<div class="coach-h">🎓 Coach de table</div><div class="muted">Entre tes deux cartes pour avoir un conseil.</div>'; return; }
    if (n === 3 || n === 4) { box.innerHTML = '<div class="coach-h">🎓 Coach de table</div><div class="muted">Termine le flop (3 cartes) pour le conseil suivant.</div>'; return; }
    var hero = cards.slice(0, 2), board = cards.slice(2);
    var pot = parseFloat($('#irl-pot').value) || 0, toCall = parseFloat($('#irl-call').value) || 0, style = +$('#irl-style').value;
    var range = style >= 100 ? null : P.topPercent(style);
    var eq = P.equity(hero, board, { count: opps, range: range }, Math.round(7000 / Math.sqrt(opps)));
    if (!eq) { box.innerHTML = '<div class="muted">Calcul impossible avec ces cartes.</div>'; return; }
    var a, notes = [];
    if (!board.length) a = preflop(hero, pot, toCall, style);
    else {
      var outsN = (P.outs(hero, board) || []).length;
      var potUsed = pot;
      if (toCall > 0 && pot <= 0) { potUsed = toCall; notes.push('Entre le pot pour un calcul de cote précis (je compte seulement la mise adverse).'); }
      var d = K.decide(eq, opps, board, potUsed, toCall, outsN);
      a = { verdict: d.verdict, tone: d.tone, txt: ['Ta main : <b>' + P.describe(cards) + '</b>' + (outsN && board.length < 5 ? ' · <b>' + outsN + '</b> outs (≈ ' + Math.min(100, outsN * (board.length === 3 ? 4 : 2)) + ' % de toucher)' : '') + '.'].concat(d.txt) };
      if (d.tone === 'raise' && pot > 0) a.txt.push('Taille conseillée : environ <b>' + Math.round(toCall > 0 ? toCall * 3 : pot * 0.66) + '</b>.');
    }
    box.innerHTML = '<div class="coach-h">🎓 Coach de table</div>' +
      '<div class="verdict ' + a.tone + '">' + a.verdict + '</div>' +
      '<div class="muted">Chances de gagner : <b>' + K.pct(eq.equity) + '</b> contre ' + opps + ' adversaire' + (opps > 1 ? 's' : '') + '</div>' +
      '<ul class="why">' + a.txt.concat(notes).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
  }

  function update() {
    renderPicker();
    clearTimeout(timer);
    $('#irl-advice').innerHTML = '<div class="coach-h">🎓 Coach de table</div><div class="muted">Calcul…</div>';
    timer = setTimeout(compute, 20);
  }

  function newHand() {
    cards = []; rank = -1; opps = startOpps;
    $('#irl-pot').value = ''; $('#irl-call').value = '';
    update();
  }

  $('#irl-start').onclick = function () {
    $('#g-setup').hidden = true; $('#irl-setup').hidden = true; $('#irl').hidden = false;
    newHand();
  };
  $('#irl-quit').onclick = function () { $('#irl').hidden = true; $('#g-setup').hidden = false; $('#irl-setup').hidden = false; };
  $('#irl-new').onclick = newHand;
  $('#irl-undo').onclick = function () { if (rank >= 0) rank = -1; else cards.pop(); update(); };
  $$('.stepper button').forEach(function (b) {
    b.onclick = function () {
      opps = Math.max(1, Math.min(9, opps + +b.dataset.s));
      if (cards.length < 2) startOpps = opps; // le nombre de joueurs du début de main est retenu pour la suivante
      update();
    };
  });
  ['#irl-pot', '#irl-call', '#irl-style'].forEach(function (s) { $(s).addEventListener('input', update); $(s).addEventListener('change', update); });

  // l'écran de partie contre les bots masque aussi ce bloc
  var gs = $('#g-start'), prev = gs.onclick;
  gs.onclick = function () { $('#irl-setup').hidden = true; prev(); };
  var gq = $('#g-quit'), prevQ = gq.onclick;
  gq.onclick = function () { prevQ(); $('#irl-setup').hidden = false; };
})();
