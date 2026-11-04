/* Tableaux préflop simplifiés (bases d'étude, pas des solutions de solveur). */
window.CHARTS = {
  // Cash game 6-max, 100 BB : ouverture quand personne n'a relancé avant toi.
  open: {
    UTG: '22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,ATo+,KJo+,QJo',
    MP:  '22+,A2s+,K7s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,ATo+,KTo+,QTo+,JTo',
    CO:  '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,85s+,74s+,64s+,53s+,43s,A8o+,KTo+,QTo+,JTo,T9o',
    BTN: '22+,A2s+,K2s+,Q2s+,J4s+,T6s+,95s+,84s+,73s+,63s+,52s+,42s+,32s,A2o+,K8o+,Q9o+,J8o+,T8o+,97o+,87o,76o',
    SB:  '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T9o,98o'
  },
  // Face à une relance standard (2,5 BB) d'un joueur placé avant toi.
  vs: {
    MP:  { raise: 'QQ+,AKs,AKo,A5s', call: 'JJ-88,AQs-AJs,KQs,QJs,JTs' },
    CO:  { raise: 'JJ+,AQs+,AKo,A5s-A4s,KQs', call: 'TT-66,AJs-ATs,KJs-KTs,QJs,JTs,T9s,AQo' },
    BTN: { raise: 'TT+,AJs+,AQo+,KQs,A5s-A3s', call: '99-22,ATs-A6s,KJs-KTs,QTs+,J9s+,T9s,98s,87s,76s,65s,AJo,KQo' },
    SB:  { raise: '99+,ATs+,KJs+,QJs,A5s-A4s,AJo+,KQo', call: '' },
    BB:  { raise: 'TT+,AJs+,KQs,A5s-A4s,AQo+',
           call: '99-22,ATs-A2s,KJs-K2s,Q4s+,J6s+,T6s+,96s+,85s+,74s+,63s+,53s+,43s,AJo-A2o,KJo-K8o,Q9o+,J9o+,T9o,98o,87o' }
  },
  // Tournoi, tapis ou se coucher quand personne n'est entré avant toi : % des meilleures mains à mettre à tapis.
  push: {
    5:  { UTG: 25, MP: 30, CO: 40, BTN: 55, SB: 70 },
    10: { UTG: 13, MP: 16, CO: 22, BTN: 33, SB: 50 },
    15: { UTG: 9,  MP: 11, CO: 15, BTN: 22, SB: 35 },
    20: { UTG: 7,  MP: 8,  CO: 11, BTN: 16, SB: 25 }
  },
  posName: { UTG: 'sous le pistolet (UTG)', MP: 'au milieu (MP)', CO: 'au cut-off (CO)', BTN: 'au bouton (BTN)', SB: 'en petite blinde (SB)', BB: 'en grosse blinde (BB)' }
};
