/* Poker Coach — moteur : évaluation de mains, ranges, équité Monte-Carlo.
 * Carte = entier 0..51 : rang = c >> 2 (0 = 2 … 12 = As), couleur = c & 3. */
(function (root) {
  'use strict';
  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc'; // pique, cœur, carreau, trèfle
  var SUIT_SYM = ['♠', '♥', '♦', '♣'];
  var CAT_FR = ['Hauteur', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];

  function card(rank, suit) { return rank * 4 + suit; }
  function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
  function parseCard(s) {
    var r = RANKS.indexOf(s[0].toUpperCase()), su = SUITS.indexOf(s[1].toLowerCase());
    return r < 0 || su < 0 ? -1 : card(r, su);
  }

  function bitCount(m) { var n = 0; while (m) { m &= m - 1; n++; } return n; }
  function straightHigh(m) {
    for (var r = 12; r >= 4; r--) if (((m >> (r - 4)) & 31) === 31) return r;
    if ((m & 0x100F) === 0x100F) return 3; // roue A-2-3-4-5
    return -1;
  }
  function topRanks(m, n) {
    var out = [];
    for (var r = 12; r >= 0 && out.length < n; r--) if (m & (1 << r)) out.push(r);
    return out;
  }
  function pack(cat, list) {
    var v = cat << 20;
    for (var i = 0; i < list.length; i++) v |= list[i] << (16 - 4 * i);
    return v;
  }

  /* Évalue 5 à 7 cartes ; plus le score est grand, meilleure est la main. Catégorie = score >> 20. */
  function evaluate(cs) {
    var rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], sm = [0, 0, 0, 0], all = 0, i, r;
    for (i = 0; i < cs.length; i++) { r = cs[i] >> 2; rc[r]++; sm[cs[i] & 3] |= 1 << r; all |= 1 << r; }
    var flush = -1;
    for (i = 0; i < 4; i++) if (bitCount(sm[i]) >= 5) {
      var sf = straightHigh(sm[i]);
      if (sf >= 0) return pack(8, [sf]);
      flush = pack(5, topRanks(sm[i], 5));
    }
    var quad = -1, trips = [], pairs = [];
    for (r = 12; r >= 0; r--) {
      if (rc[r] === 4) quad = r; else if (rc[r] === 3) trips.push(r); else if (rc[r] === 2) pairs.push(r);
    }
    if (quad >= 0) return pack(7, [quad].concat(topRanks(all & ~(1 << quad), 1)));
    if (trips.length && (trips.length > 1 || pairs.length)) {
      var p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
      return pack(6, [trips[0], p]);
    }
    if (flush >= 0) return flush;
    var st = straightHigh(all);
    if (st >= 0) return pack(4, [st]);
    if (trips.length) return pack(3, [trips[0]].concat(topRanks(all & ~(1 << trips[0]), 2)));
    if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1]].concat(topRanks(all & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1)));
    if (pairs.length) return pack(1, [pairs[0]].concat(topRanks(all & ~(1 << pairs[0]), 3)));
    return pack(0, topRanks(all, 5));
  }

  function describe(cs) {
    var s = evaluate(cs), cat = s >> 20, a = (s >> 16) & 15, b = (s >> 12) & 15;
    var NAME = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi', 'As'];
    var PL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valets', 'Dames', 'Rois', 'As'];
    switch (cat) {
      case 0: return 'Hauteur ' + NAME[a];
      case 1: return 'Paire de ' + PL[a];
      case 2: return 'Double paire ' + PL[a] + ' et ' + PL[b];
      case 3: return 'Brelan de ' + PL[a];
      case 4: return 'Quinte hauteur ' + NAME[a];
      case 5: return 'Couleur hauteur ' + NAME[a];
      case 6: return 'Full aux ' + PL[a] + ' par les ' + PL[b];
      case 7: return 'Carré de ' + PL[a];
      default: return a === 12 ? 'Quinte flush royale' : 'Quinte flush hauteur ' + NAME[a];
    }
  }

  /* ---------- Classes de mains (169) et ranges ---------- */
  // Grille 13x13 : ligne i / colonne j avec rangs décroissants (A..2). i===j paire, i<j suited, i>j offsuit.
  function gridClass(i, j) {
    var a = 12 - i, b = 12 - j;
    if (i === j) return RANKS[a] + RANKS[a];
    if (i < j) return RANKS[a] + RANKS[b] + 's';
    return RANKS[b] + RANKS[a] + 'o';
  }
  var ALL_CLASSES = [];
  for (var gi = 0; gi < 13; gi++) for (var gj = 0; gj < 13; gj++) ALL_CLASSES.push(gridClass(gi, gj));

  function classOf(c1, c2) {
    var r1 = c1 >> 2, r2 = c2 >> 2;
    if (r1 < r2) { var t = r1; r1 = r2; r2 = t; }
    if (r1 === r2) return RANKS[r1] + RANKS[r1];
    return RANKS[r1] + RANKS[r2] + ((c1 & 3) === (c2 & 3) ? 's' : 'o');
  }
  function combosOf(cls) {
    var a = RANKS.indexOf(cls[0]), b = RANKS.indexOf(cls[1]), out = [], s, t;
    if (a === b) { for (s = 0; s < 4; s++) for (t = s + 1; t < 4; t++) out.push([card(a, s), card(a, t)]); }
    else if (cls[2] === 's') { for (s = 0; s < 4; s++) out.push([card(a, s), card(b, s)]); }
    else { for (s = 0; s < 4; s++) for (t = 0; t < 4; t++) if (s !== t) out.push([card(a, s), card(b, t)]); }
    return out;
  }
  function comboCount(cls) { return cls.length === 2 ? 6 : cls[2] === 's' ? 4 : 12; }

  /* Notation : "22+", "TT-77", "A2s+", "K9s-K6s", "ATo+", "QJ", "76s". Renvoie un objet {classe: true}. */
  function parseRange(str) {
    var set = {};
    function add(c) { set[c] = true; }
    String(str || '').split(',').forEach(function (tok) {
      tok = tok.trim(); if (!tok) return;
      var plus = tok.slice(-1) === '+'; if (plus) tok = tok.slice(0, -1);
      var parts = tok.split('-');
      var h = parts[0], a = RANKS.indexOf(h[0].toUpperCase()), b = RANKS.indexOf(h[1].toUpperCase()), suf = (h[2] || '').toLowerCase();
      var sufs = suf ? [suf] : ['s', 'o'];
      if (a < 0 || b < 0) return;
      if (a === b) {
        var lo = a, hi = plus ? 12 : a;
        if (parts[1]) { var e = RANKS.indexOf(parts[1][0].toUpperCase()); lo = Math.min(a, e); hi = Math.max(a, e); }
        for (var r = lo; r <= hi; r++) add(RANKS[r] + RANKS[r]);
        return;
      }
      if (a < b) { var tt = a; a = b; b = tt; }
      var kLo = b, kHi = plus ? a - 1 : b;
      if (parts[1]) { var k2 = RANKS.indexOf(parts[1][1].toUpperCase()); kLo = Math.min(b, k2); kHi = Math.max(b, k2); }
      for (var k = kLo; k <= kHi; k++) sufs.forEach(function (s) { add(RANKS[a] + RANKS[k] + s); });
    });
    return set;
  }
  function rangePercent(set) {
    var n = 0; for (var c in set) n += comboCount(c); return n / 1326 * 100;
  }

  // Classement des 169 mains par équité contre une main aléatoire (pré-calculé, 200 000 tirages par main).
  var ORDER = (root.POKER_ORDER || '').split(' ').filter(Boolean);
  function topPercent(pct) {
    var set = {}, n = 0, target = pct / 100 * 1326;
    for (var i = 0; i < ORDER.length && n < target - 0.5; i++) { set[ORDER[i]] = true; n += comboCount(ORDER[i]); }
    return set;
  }
  function classRankPct(cls) { // % des mains meilleures ou égales
    var n = 0;
    for (var i = 0; i < ORDER.length; i++) { n += comboCount(ORDER[i]); if (ORDER[i] === cls) return n / 1326 * 100; }
    return 100;
  }

  /* ---------- Équité Monte-Carlo ----------
   * hero : [c1,c2] ; board : 0..5 cartes ; opp : { count: n, range: set|null } (range null = mains aléatoires).
   * Renvoie { win, tie, lose, equity, iters, cats: répartition des catégories finales du héros } */
  function equity(hero, board, opp, iters) {
    iters = iters || 10000;
    var dead = {}, i, k;
    hero.concat(board).forEach(function (c) { dead[c] = true; });
    var deck = []; for (i = 0; i < 52; i++) if (!dead[i]) deck.push(i);
    var nOpp = Math.max(1, opp.count || 1), rangeCombos = null;
    if (opp.range) {
      rangeCombos = [];
      for (var cls in opp.range) combosOf(cls).forEach(function (cb) { if (!dead[cb[0]] && !dead[cb[1]]) rangeCombos.push(cb); });
      if (rangeCombos.length < nOpp) return null;
    }
    var win = 0, tie = 0, eqSum = 0, cats = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var need = 5 - board.length, d = deck.slice(), hand = new Array(7), oh = new Array(7), used = new Array(52);
    for (var it = 0; it < iters; it++) {
      for (i = 0; i < 52; i++) used[i] = false;
      var oppCards = [];
      if (rangeCombos) {
        for (k = 0; k < nOpp; k++) {
          for (var tries = 0; tries < 50; tries++) {
            var cb = rangeCombos[(Math.random() * rangeCombos.length) | 0];
            if (!used[cb[0]] && !used[cb[1]]) { oppCards.push(cb); used[cb[0]] = used[cb[1]] = true; break; }
          }
          if (oppCards.length <= k) break;
        }
        if (oppCards.length < nOpp) { it--; iters--; if (iters <= 0) return null; continue; }
      }
      // tirage partiel de Fisher-Yates en sautant les cartes prises par les ranges
      var drawn = [], j = 0, want = need + (rangeCombos ? 0 : nOpp * 2);
      while (drawn.length < want) {
        var x = j + ((Math.random() * (d.length - j)) | 0), tmp = d[j]; d[j] = d[x]; d[x] = tmp;
        if (!used[d[j]]) drawn.push(d[j]);
        j++;
      }
      var p = 0, full = board.slice();
      for (k = 0; k < need; k++) full.push(drawn[p++]);
      if (!rangeCombos) for (k = 0; k < nOpp; k++) { oppCards.push([drawn[p], drawn[p + 1]]); p += 2; }
      hand[0] = hero[0]; hand[1] = hero[1];
      for (k = 0; k < 5; k++) hand[k + 2] = full[k];
      var hs = evaluate(hand), best = -1, ties = 0;
      for (k = 0; k < oppCards.length; k++) {
        oh[0] = oppCards[k][0]; oh[1] = oppCards[k][1];
        for (var q = 0; q < 5; q++) oh[q + 2] = full[q];
        var os = evaluate(oh);
        if (os > best) { best = os; ties = (os === hs) ? 1 : 0; } else if (os === best && os === hs) ties++;
      }
      cats[hs >> 20]++;
      if (hs > best) { win++; eqSum += 1; }
      else if (hs === best) { tie++; eqSum += 1 / (ties + 1); }
    }
    return {
      win: win / iters, tie: tie / iters, lose: (iters - win - tie) / iters, equity: eqSum / iters, iters: iters,
      cats: cats.map(function (c) { return c / iters; })
    };
  }

  /* Outs : cartes qui font passer le héros à une catégorie supérieure (sans que le board seul l'explique). */
  function outs(hero, board) {
    if (board.length < 3 || board.length > 4) return null;
    var dead = {}; hero.concat(board).forEach(function (c) { dead[c] = true; });
    var cur = evaluate(hero.concat(board)) >> 20, list = [];
    for (var c = 0; c < 52; c++) {
      if (dead[c]) continue;
      var nb = board.concat([c]);
      var heroCat = evaluate(hero.concat(nb)) >> 20;
      var boardCat = nb.length >= 5 ? evaluate(nb) >> 20 : (function () {
        // catégorie du board seul (moins de 5 cartes) : paires / brelan seulement
        var rc = {}; nb.forEach(function (x) { rc[x >> 2] = (rc[x >> 2] || 0) + 1; });
        var m = 0, pairs = 0; for (var r in rc) { m = Math.max(m, rc[r]); if (rc[r] >= 2) pairs++; }
        return m >= 4 ? 7 : m === 3 ? 3 : pairs >= 2 ? 2 : pairs === 1 ? 1 : 0;
      })();
      if (heroCat > cur && heroCat >= 2 && heroCat > boardCat) list.push(c);
    }
    return list;
  }

  var api = {
    RANKS: RANKS, SUITS: SUITS, SUIT_SYM: SUIT_SYM, CAT_FR: CAT_FR, ALL_CLASSES: ALL_CLASSES, ORDER: ORDER,
    card: card, cardStr: cardStr, parseCard: parseCard, evaluate: evaluate, describe: describe,
    gridClass: gridClass, classOf: classOf, combosOf: combosOf, comboCount: comboCount,
    parseRange: parseRange, rangePercent: rangePercent, topPercent: topPercent, classRankPct: classRankPct,
    equity: equity, outs: outs
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Poker = api;
})(typeof window !== 'undefined' ? window : globalThis);
