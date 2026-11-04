import { ReactNode, useMemo } from 'react';

type Lang = 'java' | 'smali' | 'xml' | 'kotlin' | 'text' | 'gradle';

const JAVA_KW = /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|var|val|fun|object|null|true|false|override|when|is|in|as|lateinit|companion|data|sealed|suspend|internal|open)\b/g;

function highlightLine(line: string, lang: Lang): ReactNode[] {
  if (lang === 'text') return [line];
  const out: ReactNode[] = [];
  let re: RegExp;
  if (lang === 'xml') re = /(<!--.*?-->)|("[^"]*")|(<\/?[\w:.-]+|\/?>)|([\w:.-]+(?==))/g;
  else if (lang === 'smali') re = /(#.*$)|("(?:[^"\\]|\\.)*")|(\.\w[\w-]*)|(\b(?:invoke|move|const|return|if|goto|new|check|iget|iput|sget|sput|aget|aput|throw|monitor|packed|sparse|fill|filled|cmp)[\w/-]*)|(\b[vp]\d+\b)|(L[\w/$]+;)/g;
  else re = /(\/\/.*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@\w+)|(\b\d[\d_]*(?:\.\d+)?[fFlLdD]?\b|\b0x[0-9a-fA-F]+\b)|(\b[A-Z][\w$]*\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(...kw(line.slice(last, m.index), lang, k++));
    const [t] = m;
    let cls = '';
    if (lang === 'xml') cls = m[1] ? 'tok-c' : m[2] ? 'tok-s' : m[3] ? 'tok-t' : 'tok-a';
    else if (lang === 'smali') cls = m[1] ? 'tok-c' : m[2] ? 'tok-s' : m[3] ? 'tok-a' : m[4] ? 'tok-k' : m[5] ? 'tok-n' : 'tok-t';
    else cls = m[1] ? 'tok-c' : m[2] ? 'tok-s' : m[3] ? 'tok-a' : m[4] ? 'tok-n' : 'tok-t';
    out.push(
      <span key={`m${k++}`} className={cls}>
        {t}
      </span>,
    );
    last = m.index + t.length;
    if (t.length === 0) re.lastIndex++;
  }
  if (last < line.length) out.push(...kw(line.slice(last), lang, k++));
  return out;
}

function kw(s: string, lang: Lang, key: number): ReactNode[] {
  if (lang !== 'java' && lang !== 'kotlin' && lang !== 'gradle') return [s];
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of s.matchAll(JAVA_KW)) {
    if (m.index! > last) parts.push(s.slice(last, m.index));
    parts.push(
      <span key={`k${key}-${i++}`} className="tok-k">
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

export function langOf(path: string): Lang {
  if (/\.java$/.test(path)) return 'java';
  if (/\.kts?$/.test(path)) return 'kotlin';
  if (/\.gradle$/.test(path)) return 'gradle';
  if (/\.smali$/.test(path)) return 'smali';
  if (/\.(xml|html|svg)$/.test(path)) return 'xml';
  return 'text';
}

const MAX_LINES = 20000;

export function CodeView({ code, lang = 'text', className = '', maxHeight = '70vh', highlightLine: hl }: { code: string; lang?: Lang; className?: string; maxHeight?: string; highlightLine?: number }) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  const big = code.length > 400_000;
  return (
    <div className={`scroll-thin overflow-auto rounded-xl border border-ink-700 bg-ink-950/80 ${className}`} style={{ maxHeight }}>
      <pre className="mono min-w-max py-2 text-[12px] leading-[1.6]">
        {shown.map((l, i) => (
          <div key={i} className={`flex ${hl === i + 1 ? 'bg-bad/15' : ''}`}>
            <span className="sticky left-0 w-12 shrink-0 bg-ink-950/95 pr-3 text-right text-ink-500 select-none">{i + 1}</span>
            <code className="pr-4 whitespace-pre">{big ? l : highlightLine(l, lang)}</code>
          </div>
        ))}
        {lines.length > MAX_LINES && <div className="px-4 py-2 text-ink-400">… {lines.length - MAX_LINES} lignes supplémentaires non affichées</div>}
      </pre>
    </div>
  );
}
