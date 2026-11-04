/**
 * Native DEX parser + Dalvik bytecode decoder (format: https://source.android.com/docs/core/runtime/dex-format).
 * Provides class/method/field/string indexes, cross references and a smali-like disassembly.
 * The full-fidelity smali and Java views come from Apktool / JADX when they are installed.
 */

export class DexError extends Error {}

// name|format|indexKind   (indexKind: s=string t=type f=field m=method c=callsite h=methodhandle p=proto)
const OPS_SRC = `nop|10x;move|12x;move/from16|22x;move/16|32x;move-wide|12x;move-wide/from16|22x;move-wide/16|32x;move-object|12x;move-object/from16|22x;move-object/16|32x;move-result|11x;move-result-wide|11x;move-result-object|11x;move-exception|11x;return-void|10x;return|11x;return-wide|11x;return-object|11x;const/4|11n;const/16|21s;const|31i;const/high16|21h;const-wide/16|21s;const-wide/32|31i;const-wide|51l;const-wide/high16|21h;const-string|21c|s;const-string/jumbo|31c|s;const-class|21c|t;monitor-enter|11x;monitor-exit|11x;check-cast|21c|t;instance-of|22c|t;array-length|12x;new-instance|21c|t;new-array|22c|t;filled-new-array|35c|t;filled-new-array/range|3rc|t;fill-array-data|31t;throw|11x;goto|10t;goto/16|20t;goto/32|30t;packed-switch|31t;sparse-switch|31t;cmpl-float|23x;cmpg-float|23x;cmpl-double|23x;cmpg-double|23x;cmp-long|23x;if-eq|22t;if-ne|22t;if-lt|22t;if-ge|22t;if-gt|22t;if-le|22t;if-eqz|21t;if-nez|21t;if-ltz|21t;if-gez|21t;if-gtz|21t;if-lez|21t;-;-;-;-;-;-;aget|23x;aget-wide|23x;aget-object|23x;aget-boolean|23x;aget-byte|23x;aget-char|23x;aget-short|23x;aput|23x;aput-wide|23x;aput-object|23x;aput-boolean|23x;aput-byte|23x;aput-char|23x;aput-short|23x;iget|22c|f;iget-wide|22c|f;iget-object|22c|f;iget-boolean|22c|f;iget-byte|22c|f;iget-char|22c|f;iget-short|22c|f;iput|22c|f;iput-wide|22c|f;iput-object|22c|f;iput-boolean|22c|f;iput-byte|22c|f;iput-char|22c|f;iput-short|22c|f;sget|21c|f;sget-wide|21c|f;sget-object|21c|f;sget-boolean|21c|f;sget-byte|21c|f;sget-char|21c|f;sget-short|21c|f;sput|21c|f;sput-wide|21c|f;sput-object|21c|f;sput-boolean|21c|f;sput-byte|21c|f;sput-char|21c|f;sput-short|21c|f;invoke-virtual|35c|m;invoke-super|35c|m;invoke-direct|35c|m;invoke-static|35c|m;invoke-interface|35c|m;-;invoke-virtual/range|3rc|m;invoke-super/range|3rc|m;invoke-direct/range|3rc|m;invoke-static/range|3rc|m;invoke-interface/range|3rc|m;-;-`;
const UNOPS = 'neg-int not-int neg-long not-long neg-float neg-double int-to-long int-to-float int-to-double long-to-int long-to-float long-to-double float-to-int float-to-long float-to-double double-to-int double-to-long double-to-float int-to-byte int-to-char int-to-short'.split(' ');
const BINOPS = 'add-int sub-int mul-int div-int rem-int and-int or-int xor-int shl-int shr-int ushr-int add-long sub-long mul-long div-long rem-long and-long or-long xor-long shl-long shr-long ushr-long add-float sub-float mul-float div-float rem-float add-double sub-double mul-double div-double rem-double'.split(' ');
const LIT16 = 'add-int rsub-int mul-int div-int rem-int and-int or-int xor-int'.split(' ');
const LIT8 = 'add-int rsub-int mul-int div-int rem-int and-int or-int xor-int shl-int shr-int ushr-int'.split(' ');

interface OpInfo { name: string; fmt: string; idx?: string }
const OPS: OpInfo[] = new Array(256).fill(null).map(() => ({ name: 'unused', fmt: '10x' }));
OPS_SRC.split(';').forEach((s, i) => {
  if (s === '-') return;
  const [name, fmt, idx] = s.split('|');
  OPS[i] = { name, fmt, idx };
});
UNOPS.forEach((n, i) => (OPS[0x7b + i] = { name: n, fmt: '12x' }));
BINOPS.forEach((n, i) => {
  OPS[0x90 + i] = { name: n, fmt: '23x' };
  OPS[0xb0 + i] = { name: n + '/2addr', fmt: '12x' };
});
LIT16.forEach((n, i) => (OPS[0xd0 + i] = { name: n + (n === 'rsub-int' ? '' : '/lit16'), fmt: '22s' }));
LIT8.forEach((n, i) => (OPS[0xd8 + i] = { name: n + '/lit8', fmt: '22b' }));
OPS[0xfa] = { name: 'invoke-polymorphic', fmt: '45cc', idx: 'm' };
OPS[0xfb] = { name: 'invoke-polymorphic/range', fmt: '4rcc', idx: 'm' };
OPS[0xfc] = { name: 'invoke-custom', fmt: '35c', idx: 'c' };
OPS[0xfd] = { name: 'invoke-custom/range', fmt: '3rc', idx: 'c' };
OPS[0xfe] = { name: 'const-method-handle', fmt: '21c', idx: 'h' };
OPS[0xff] = { name: 'const-method-type', fmt: '21c', idx: 'p' };

const FMT_UNITS: Record<string, number> = {
  '10x': 1, '12x': 1, '11n': 1, '11x': 1, '10t': 1, '20t': 2, '22x': 2, '21t': 2, '21s': 2, '21h': 2, '21c': 2,
  '23x': 2, '22b': 2, '22t': 2, '22s': 2, '22c': 2, '30t': 3, '32x': 3, '31i': 3, '31t': 3, '31c': 3, '35c': 3,
  '3rc': 3, '45cc': 4, '4rcc': 4, '51l': 5,
};

export const ACC: [number, string][] = [
  [0x1, 'public'], [0x2, 'private'], [0x4, 'protected'], [0x8, 'static'], [0x10, 'final'], [0x20, 'synchronized'],
  [0x40, 'bridge'], [0x80, 'varargs'], [0x100, 'native'], [0x200, 'interface'], [0x400, 'abstract'],
  [0x800, 'strict'], [0x1000, 'synthetic'], [0x2000, 'annotation'], [0x4000, 'enum'], [0x10000, 'constructor'],
];
export const accessString = (f: number) => ACC.filter(([b]) => f & b).map(([, n]) => n).join(' ');

export function descriptorToJava(d: string): string {
  let dims = 0;
  while (d[dims] === '[') dims++;
  const base = d.slice(dims);
  const prim: Record<string, string> = { V: 'void', Z: 'boolean', B: 'byte', S: 'short', C: 'char', I: 'int', J: 'long', F: 'float', D: 'double' };
  const name = base.startsWith('L') ? base.slice(1, -1).replace(/\//g, '.') : prim[base] ?? base;
  return name + '[]'.repeat(dims);
}

export interface DexMethod {
  idx: number;
  name: string;
  params: string[];
  ret: string;
  access: number;
  codeOff: number;
  insnsSize: number;
  registers: number;
}
export interface DexField { idx: number; name: string; type: string; access: number }
export interface DexClass {
  name: string; // java name
  descriptor: string;
  superName?: string;
  interfaces: string[];
  access: number;
  sourceFile?: string;
  fields: DexField[];
  methods: DexMethod[];
}

export class Dex {
  readonly b: Buffer;
  readonly version: string;
  strings: string[] = [];
  types: string[] = [];
  protos: { shorty: string; ret: string; params: string[] }[] = [];
  fields: { cls: string; type: string; name: string }[] = [];
  methods: { cls: string; proto: number; name: string }[] = [];
  classes: DexClass[] = [];

  constructor(b: Buffer) {
    if (b.length < 0x70 || b.toString('latin1', 0, 4) !== 'dex\n') throw new DexError('Fichier DEX invalide');
    this.b = b;
    this.version = b.toString('latin1', 4, 7);
    const r = (o: number) => b.readUInt32LE(o);
    const [sN, sO, tN, tO, pN, pO, fN, fO, mN, mO, cN, cO] = [0x38, 0x3c, 0x40, 0x44, 0x48, 0x4c, 0x50, 0x54, 0x58, 0x5c, 0x60, 0x64].map(r);
    this.check(sO, sN * 4); this.check(tO, tN * 4); this.check(pO, pN * 12); this.check(fO, fN * 8); this.check(mO, mN * 8); this.check(cO, cN * 32);
    for (let i = 0; i < sN; i++) this.strings.push(this.readString(r(sO + i * 4)));
    for (let i = 0; i < tN; i++) this.types.push(this.strings[r(tO + i * 4)] ?? '?');
    for (let i = 0; i < pN; i++) {
      const o = pO + i * 12;
      this.protos.push({ shorty: this.strings[r(o)], ret: this.types[r(o + 4)], params: this.typeList(r(o + 8)) });
    }
    for (let i = 0; i < fN; i++) {
      const o = fO + i * 8;
      this.fields.push({ cls: this.types[b.readUInt16LE(o)], type: this.types[b.readUInt16LE(o + 2)], name: this.strings[r(o + 4)] });
    }
    for (let i = 0; i < mN; i++) {
      const o = mO + i * 8;
      this.methods.push({ cls: this.types[b.readUInt16LE(o)], proto: b.readUInt16LE(o + 2), name: this.strings[r(o + 4)] });
    }
    for (let i = 0; i < cN; i++) {
      try {
        this.classes.push(this.readClass(cO + i * 32));
      } catch {
        /* skip malformed class_def */
      }
    }
  }

  private check(off: number, len: number) {
    if (len && (off + len > this.b.length)) throw new DexError('Table DEX hors limites');
  }

  private uleb(o: { p: number }): number {
    let res = 0, shift = 0, byte: number;
    do {
      byte = this.b[o.p++];
      res |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80 && shift < 35);
    return res >>> 0;
  }

  private readString(off: number): string {
    const o = { p: off };
    const len = this.uleb(o);
    const b = this.b;
    const units: number[] = [];
    let p = o.p;
    while (units.length < len && p < b.length) {
      const c = b[p++];
      if (c < 0x80) units.push(c);
      else if ((c & 0xe0) === 0xc0) units.push(((c & 0x1f) << 6) | (b[p++] & 0x3f));
      else units.push(((c & 0x0f) << 12) | ((b[p++] & 0x3f) << 6) | (b[p++] & 0x3f));
    }
    let s = '';
    for (let i = 0; i < units.length; i += 8192) s += String.fromCharCode(...units.slice(i, i + 8192));
    return s;
  }

  private typeList(off: number): string[] {
    if (!off) return [];
    const n = this.b.readUInt32LE(off);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(this.types[this.b.readUInt16LE(off + 4 + i * 2)]);
    return out;
  }

  private readClass(o: number): DexClass {
    const b = this.b;
    const desc = this.types[b.readUInt32LE(o)];
    const superIdx = b.readUInt32LE(o + 8);
    const srcIdx = b.readUInt32LE(o + 16);
    const dataOff = b.readUInt32LE(o + 24);
    const cls: DexClass = {
      name: descriptorToJava(desc),
      descriptor: desc,
      superName: superIdx === 0xffffffff ? undefined : descriptorToJava(this.types[superIdx]),
      interfaces: this.typeList(b.readUInt32LE(o + 12)).map(descriptorToJava),
      access: b.readUInt32LE(o + 4),
      sourceFile: srcIdx === 0xffffffff ? undefined : this.strings[srcIdx],
      fields: [],
      methods: [],
    };
    if (!dataOff) return cls;
    const p = { p: dataOff };
    const sf = this.uleb(p), inf = this.uleb(p), dm = this.uleb(p), vm = this.uleb(p);
    for (const n of [sf, inf]) {
      let idx = 0;
      for (let i = 0; i < n; i++) {
        idx += this.uleb(p);
        const access = this.uleb(p);
        const f = this.fields[idx];
        cls.fields.push({ idx, name: f?.name ?? '?', type: descriptorToJava(f?.type ?? 'V'), access });
      }
    }
    for (const n of [dm, vm]) {
      let idx = 0;
      for (let i = 0; i < n; i++) {
        idx += this.uleb(p);
        const access = this.uleb(p);
        const codeOff = this.uleb(p);
        const m = this.methods[idx];
        const proto = this.protos[m?.proto ?? 0];
        let insnsSize = 0, registers = 0;
        if (codeOff && codeOff + 16 <= b.length) {
          registers = b.readUInt16LE(codeOff);
          insnsSize = b.readUInt32LE(codeOff + 12);
        }
        cls.methods.push({ idx, name: m?.name ?? '?', params: (proto?.params ?? []).map(descriptorToJava), ret: descriptorToJava(proto?.ret ?? 'V'), access, codeOff, insnsSize, registers });
      }
    }
    return cls;
  }

  methodRef(i: number): string {
    const m = this.methods[i];
    if (!m) return `method@${i}`;
    const p = this.protos[m.proto];
    return `${m.cls}->${m.name}(${p?.params.join('') ?? ''})${p?.ret ?? ''}`;
  }
  fieldRef(i: number): string {
    const f = this.fields[i];
    return f ? `${f.cls}->${f.name}:${f.type}` : `field@${i}`;
  }

  /** Iterate over decoded instructions of a method. */
  *instructions(m: DexMethod): Generator<Insn> {
    if (!m.codeOff || !m.insnsSize) return;
    const b = this.b;
    const base = m.codeOff + 16;
    const n = Math.min(m.insnsSize, Math.floor((b.length - base) / 2));
    const U = (i: number) => (i < n ? b.readUInt16LE(base + i * 2) : 0);
    const S = (i: number) => (i < n ? b.readInt16LE(base + i * 2) : 0);
    const I32 = (i: number) => (U(i) | (U(i + 1) << 16)) | 0;
    let pc = 0;
    while (pc < n) {
      const u = U(pc);
      const op = u & 0xff;
      if (op === 0 && u !== 0) {
        // payload pseudo-instructions
        let len = 1;
        if (u === 0x0100) len = U(pc + 1) * 2 + 4;
        else if (u === 0x0200) len = U(pc + 1) * 4 + 2;
        else if (u === 0x0300) len = Math.ceil((U(pc + 1) * (U(pc + 2) | (U(pc + 3) << 16))) / 2) + 4;
        yield { pc, op, name: u === 0x0300 ? '.array-data' : u === 0x0100 ? '.packed-switch' : '.sparse-switch', regs: [], payload: true };
        pc += Math.max(1, len);
        continue;
      }
      const info = OPS[op];
      const AA = u >> 8, A = (u >> 8) & 0xf, B = u >> 12;
      const ins: Insn = { pc, op, name: info.name, regs: [] };
      switch (info.fmt) {
        case '12x': ins.regs = [A, B]; break;
        case '11n': ins.regs = [A]; ins.lit = (B << 28) >> 28; break;
        case '11x': ins.regs = [AA]; break;
        case '10t': ins.target = pc + ((AA << 24) >> 24); break;
        case '20t': ins.target = pc + S(pc + 1); break;
        case '22x': ins.regs = [AA, U(pc + 1)]; break;
        case '21t': ins.regs = [AA]; ins.target = pc + S(pc + 1); break;
        case '21s': ins.regs = [AA]; ins.lit = S(pc + 1); break;
        case '21h': ins.regs = [AA]; ins.lit = op === 0x15 ? (U(pc + 1) << 16) | 0 : U(pc + 1) * 2 ** 48; break;
        case '21c': ins.regs = [AA]; ins.index = U(pc + 1); break;
        case '23x': ins.regs = [AA, U(pc + 1) & 0xff, U(pc + 1) >> 8]; break;
        case '22b': ins.regs = [AA, U(pc + 1) & 0xff]; ins.lit = (U(pc + 1) << 16) >> 24; break;
        case '22t': ins.regs = [A, B]; ins.target = pc + S(pc + 1); break;
        case '22s': ins.regs = [A, B]; ins.lit = S(pc + 1); break;
        case '22c': ins.regs = [A, B]; ins.index = U(pc + 1); break;
        case '30t': ins.target = pc + I32(pc + 1); break;
        case '32x': ins.regs = [U(pc + 1), U(pc + 2)]; break;
        case '31i': ins.regs = [AA]; ins.lit = I32(pc + 1); break;
        case '31t': ins.regs = [AA]; ins.target = pc + I32(pc + 1); break;
        case '31c': ins.regs = [AA]; ins.index = (U(pc + 1) | (U(pc + 2) << 16)) >>> 0; break;
        case '35c': case '45cc': {
          const cnt = B, g = A, w = U(pc + 2);
          ins.regs = [w & 0xf, (w >> 4) & 0xf, (w >> 8) & 0xf, w >> 12, g].slice(0, cnt);
          ins.index = U(pc + 1);
          break;
        }
        case '3rc': case '4rcc': {
          const c = U(pc + 2);
          ins.regs = Array.from({ length: Math.min(AA, 256) }, (_, k) => c + k);
          ins.range = true;
          ins.index = U(pc + 1);
          break;
        }
        case '51l': ins.regs = [AA]; ins.lit = Number(b.readBigInt64LE(base + (pc + 1) * 2)); break;
      }
      if (info.idx && ins.index !== undefined) ins.ref = this.resolveIndex(info.idx, ins.index);
      ins.kind = info.idx;
      yield ins;
      pc += FMT_UNITS[info.fmt] ?? 1;
    }
  }

  resolveIndex(kind: string, i: number): string {
    switch (kind) {
      case 's': return JSON.stringify(this.strings[i] ?? `string@${i}`);
      case 't': return this.types[i] ?? `type@${i}`;
      case 'f': return this.fieldRef(i);
      case 'm': return this.methodRef(i);
      default: return `${kind}@${i}`;
    }
  }

  /** Smali-like listing of one class (generated by APPXRAY's own decoder). */
  disassemble(cls: DexClass): string {
    const L: string[] = [];
    L.push(`# APPXRAY native disassembly (registers shown as vN — use Apktool smali for p-register naming)`);
    L.push(`.class ${accessString(cls.access & ~0x10000)} ${cls.descriptor}`.replace(/  +/g, ' '));
    if (cls.superName) L.push(`.super L${cls.superName.replace(/\./g, '/')};`);
    if (cls.sourceFile) L.push(`.source "${cls.sourceFile}"`);
    for (const i of cls.interfaces) L.push(`.implements L${i.replace(/\./g, '/')};`);
    L.push('');
    for (const f of cls.fields) L.push(`.field ${accessString(f.access)} ${this.fields[f.idx]?.name}:${this.fields[f.idx]?.type}`);
    for (const m of cls.methods) {
      const mm = this.methods[m.idx];
      const p = this.protos[mm.proto];
      L.push('', `.method ${accessString(m.access)} ${m.name}(${p.params.join('')})${p.ret}`.replace(/  +/g, ' '));
      if (m.codeOff) L.push(`    .registers ${m.registers}`);
      for (const ins of this.instructions(m)) L.push('    ' + formatInsn(ins));
      L.push('.end method');
    }
    return L.join('\n');
  }
}

export interface Insn {
  pc: number;
  op: number;
  name: string;
  regs: number[];
  lit?: number;
  target?: number;
  index?: number;
  ref?: string;
  kind?: string;
  range?: boolean;
  payload?: boolean;
}

export function formatInsn(i: Insn): string {
  const label = `:${i.pc.toString(16).padStart(4, '0')}`;
  if (i.payload) return `${label} ${i.name}`;
  const parts: string[] = [];
  if (i.kind && i.regs.length && (i.name.startsWith('invoke') || i.name.startsWith('filled-new-array'))) {
    parts.push(i.range ? `{v${i.regs[0]} .. v${i.regs[i.regs.length - 1]}}` : `{${i.regs.map((r) => 'v' + r).join(', ')}}`);
  } else parts.push(...i.regs.map((r) => 'v' + r));
  if (i.lit !== undefined) parts.push(`0x${(i.lit < 0 ? '-' : '') + Math.abs(i.lit).toString(16)}`);
  if (i.target !== undefined) parts.push(`:${i.target.toString(16).padStart(4, '0')}`);
  if (i.ref) parts.push(i.ref);
  return `${label} ${i.name}${parts.length ? ' ' + parts.join(', ') : ''}`;
}

/** Collect cross-references from a class: referenced types, invoked methods, string literals, int literals. */
export function classRefs(dex: Dex, cls: DexClass) {
  const types = new Set<string>();
  const strings = new Set<string>();
  const literals = new Set<number>();
  const invokes = new Set<string>();
  const resFields = new Set<string>(); // "layout/main" for non-inlined R.<type>.<name> accesses (AGP 8 nonFinalResIds)
  for (const m of cls.methods) {
    for (const ins of dex.instructions(m)) {
      if (ins.kind === 't' && ins.index !== undefined) types.add(descriptorToJava(dex.types[ins.index] ?? ''));
      else if (ins.kind === 'm' && ins.index !== undefined) {
        const mm = dex.methods[ins.index];
        if (mm) {
          types.add(descriptorToJava(mm.cls));
          invokes.add(`${descriptorToJava(mm.cls)}.${mm.name}`);
        }
      } else if (ins.kind === 'f' && ins.index !== undefined) {
        const f = dex.fields[ins.index];
        if (f) {
          types.add(descriptorToJava(f.cls));
          const rm = /\/R\$(\w+);$/.exec(f.cls);
          if (rm && f.type === 'I') resFields.add(`${rm[1]}/${f.name}`);
        }
      } else if (ins.kind === 's' && ins.index !== undefined) strings.add(dex.strings[ins.index] ?? '');
      else if ((ins.op === 0x14 || ins.op === 0x15) && ins.lit !== undefined) literals.add(ins.lit >>> 0);
    }
  }
  types.delete(cls.name);
  return { types, strings, literals, invokes, resFields };
}
