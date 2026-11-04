const P=require(__dirname+'/../app/src/main/assets/poker.js');
const res=P.ALL_CLASSES.map(cls=>{const cb=P.combosOf(cls)[0];return [cls,P.equity(cb,[],{count:1},200000).equity];});
res.sort((a,b)=>b[1]-a[1]);
require('fs').writeFileSync(__dirname+'/../app/src/main/assets/order.js','/* Classement des 169 mains par équité vs main aléatoire (généré par tools/gen-order.js). */\nwindow.POKER_ORDER = '+JSON.stringify(res.map(r=>r[0]).join(' '))+';\n');
console.log(res.slice(0,20).map(r=>r[0]+':'+r[1].toFixed(3)).join(' '));console.log(res.slice(-5).map(r=>r[0]).join(' '));
