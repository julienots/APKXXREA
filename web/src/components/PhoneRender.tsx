import { CSSProperties, ReactNode } from 'react';
import { Paint, UiNode } from '../lib/api';
import { cssColor, url } from '../lib/util-url';

/**
 * Approximate HTML renderer for reconstructed Android view trees (1dp = 1 CSS px at the chosen device width).
 * LinearLayout is rendered faithfully with flexbox; Relative/Constraint layouts are rendered as a vertical flow
 * (the generated project keeps the positioning rules — this is only a preview).
 */
export function PhoneRender({ root, analysisId, selected, onSelect }: { root: UiNode; analysisId: string; selected?: string; onSelect?: (uid: string) => void }) {
  return <Node n={root} parent={null} ctx={{ analysisId, selected, onSelect }} />;
}

interface Ctx { analysisId: string; selected?: string; onSelect?: (uid: string) => void }

function paintCss(p: Paint | undefined, ctx: Ctx): CSSProperties {
  if (!p) return {};
  const s: CSSProperties = {};
  if (p.color) s.backgroundColor = cssColor(p.color);
  if (p.image && !p.color) {
    s.backgroundImage = `url("${url(`/analyses/${ctx.analysisId}/drawable`, { path: p.image })}")`;
    s.backgroundSize = '100% 100%';
  }
  if (p.radius) s.borderRadius = p.radius;
  if (p.stroke) s.border = `1px solid ${cssColor(p.stroke)}`;
  return s;
}

function dim(v: string | undefined, axis: 'w' | 'h', parentRow: boolean | null, weight?: number): CSSProperties {
  const s: CSSProperties = {};
  const key = axis === 'w' ? 'width' : 'height';
  const along = parentRow === null ? false : axis === 'w' ? parentRow : !parentRow;
  if (weight && along) {
    s.flex = `${weight} 1 0`;
    s[axis === 'w' ? 'minWidth' : 'minHeight'] = 0;
    return s;
  }
  if (v === 'match') {
    if (along) s.flex = '1 1 auto';
    else if (parentRow !== null) s.alignSelf = 'stretch';
    s[key] = along ? undefined : '100%';
    if (axis === 'h' && parentRow === null) s.minHeight = '100%';
  } else if (v && /dp$/.test(v)) {
    const n = parseFloat(v);
    s[key] = n;
    if (along) s.flexShrink = 0;
  }
  return s;
}

function gravityToFlex(g: string | undefined, row: boolean): CSSProperties {
  if (!g) return {};
  const has = (x: string) => g.split('|').includes(x);
  const s: CSSProperties = {};
  const hCenter = has('center') || has('center_horizontal');
  const vCenter = has('center') || has('center_vertical');
  const hEnd = has('end') || has('right');
  const vEnd = has('bottom');
  if (row) {
    if (hCenter) s.justifyContent = 'center';
    if (hEnd) s.justifyContent = 'flex-end';
    if (vCenter) s.alignItems = 'center';
    if (vEnd) s.alignItems = 'flex-end';
  } else {
    if (vCenter) s.justifyContent = 'center';
    if (vEnd) s.justifyContent = 'flex-end';
    if (hCenter) s.alignItems = 'center';
    if (hEnd) s.alignItems = 'flex-end';
  }
  return s;
}

function selfGravity(g: string | undefined, parentRow: boolean | null): CSSProperties {
  if (!g || parentRow === null) return {};
  const has = (x: string) => g.split('|').includes(x);
  if (parentRow) {
    if (has('center') || has('center_vertical')) return { alignSelf: 'center' };
    if (has('bottom')) return { alignSelf: 'flex-end' };
  } else {
    if (has('center') || has('center_horizontal')) return { alignSelf: 'center' };
    if (has('end') || has('right')) return { alignSelf: 'flex-end' };
  }
  return {};
}

const CONTAINERS = new Set(['linear', 'scroll', 'hscroll', 'relative', 'constraint', 'card', 'frame', 'toolbar', 'custom', 'fragment', 'include', 'surface']);

function Node({ n, parent, ctx }: { n: UiNode; parent: UiNode | null; ctx: Ctx }): ReactNode {
  const p = n.props;
  if (p.visibility === 'gone') return null;
  const parentRow = parent ? (parent.kind === 'linear' ? parent.props.orientation === 'horizontal' : parent.kind === 'toolbar' || parent.kind === 'hscroll') : null;
  const isRow = (n.kind === 'linear' && p.orientation === 'horizontal') || n.kind === 'toolbar' || n.kind === 'hscroll';
  const sel = ctx.selected === n.uid;
  const style: CSSProperties = {
    boxSizing: 'border-box',
    position: 'relative',
    ...dim(p.width ?? 'wrap', 'w', parentRow, p.weight),
    ...dim(p.height ?? 'wrap', 'h', parentRow, p.weight),
    ...(p.padding ? { padding: `${p.padding[1]}px ${p.padding[2]}px ${p.padding[3]}px ${p.padding[0]}px` } : {}),
    ...(p.margin ? { margin: `${p.margin[1]}px ${p.margin[2]}px ${p.margin[3]}px ${p.margin[0]}px` } : {}),
    ...paintCss(p.background, ctx),
    ...selfGravity(p.layoutGravity, parentRow),
    visibility: p.visibility === 'invisible' ? 'hidden' : undefined,
    outline: sel ? '2px solid #22e3ff' : undefined,
    outlineOffset: sel ? -1 : undefined,
    cursor: ctx.onSelect ? 'pointer' : undefined,
    minWidth: 0,
  };
  const textStyle: CSSProperties = {
    color: cssColor(p.textColor) ?? (n.kind === 'button' ? '#111' : '#1f2937'),
    fontSize: p.textSize ?? (n.kind === 'button' ? 14 : 14),
    fontWeight: p.textStyle?.includes('bold') ? 700 : undefined,
    fontStyle: p.textStyle?.includes('italic') ? 'italic' : undefined,
    ...gravityToFlex(p.gravity, true),
  };
  const click = (e: React.MouseEvent) => {
    if (!ctx.onSelect) return;
    e.stopPropagation();
    ctx.onSelect(n.uid);
  };
  const kids = n.children.map((c) => <Node key={c.uid} n={c} parent={n} ctx={ctx} />);
  const title = `${n.tag}${n.viewId ? ' #' + n.viewId : ''}`;

  if (CONTAINERS.has(n.kind) && (n.children.length || ['linear', 'frame', 'relative', 'constraint', 'card', 'scroll', 'toolbar'].includes(n.kind))) {
    const flex: CSSProperties = { display: 'flex', flexDirection: isRow ? 'row' : 'column', ...gravityToFlex(p.gravity, isRow) };
    if (n.kind === 'scroll') Object.assign(flex, { overflowY: 'auto' });
    if (n.kind === 'hscroll') Object.assign(flex, { overflowX: 'auto' });
    if (n.kind === 'card') Object.assign(style, { borderRadius: style.borderRadius ?? 10, boxShadow: '0 1px 4px rgba(0,0,0,.25)', backgroundColor: style.backgroundColor ?? '#fff' });
    if (n.kind === 'toolbar') Object.assign(style, { minHeight: style.height ?? 56, alignItems: 'center', backgroundColor: style.backgroundColor ?? '#2f6bff', color: '#fff' });
    if (['custom', 'fragment', 'surface'].includes(n.kind) && !n.children.length) Object.assign(style, { border: '1px dashed #94a3b8', minHeight: style.height ?? 48 });
    return (
      <div style={{ ...style, ...flex }} onClick={click} title={title} data-uid={n.uid}>
        {kids}
        {['custom', 'fragment', 'surface'].includes(n.kind) && !n.children.length && <Placeholder label={n.tag.split('.').pop()!} />}
      </div>
    );
  }
  switch (n.kind) {
    case 'text':
      return (
        <div style={{ ...style, ...textStyle, display: 'flex', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.3 }} onClick={click} title={title}>
          {p.text || (p.hint ? <span style={{ opacity: 0.45 }}>{p.hint}</span> : <span style={{ opacity: 0.35 }}>{n.viewId ? `[${n.viewId}]` : 'Texte dynamique'}</span>)}
        </div>
      );
    case 'button':
      return (
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', borderRadius: 6, backgroundColor: '#e2e8f0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, ...style, ...textStyle }} onClick={click} title={title}>
          {p.text || 'Button'}
        </div>
      );
    case 'edit':
      return (
        <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', borderBottom: '1.5px solid #64748b', padding: '8px 4px', ...style, ...textStyle }} onClick={click} title={title}>
          {p.text ? p.text : <span style={{ opacity: 0.45 }}>{p.hint ?? ''}</span>}
          {p.inputType?.includes('Password') && p.text && '••••'}
        </div>
      );
    case 'check':
    case 'switch':
    case 'radio':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, ...style, ...textStyle }} onClick={click} title={title}>
          {n.kind === 'switch' ? (
            <>
              <span style={{ flex: 1 }}>{p.text}</span>
              <span style={{ width: 34, height: 18, borderRadius: 9, background: p.checked ? '#2f6bff' : '#cbd5e1', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 2, left: p.checked ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff' }} />
              </span>
            </>
          ) : (
            <>
              <span style={{ width: 16, height: 16, borderRadius: n.kind === 'radio' ? 8 : 3, border: '2px solid #475569', background: p.checked ? '#2f6bff' : undefined }} />
              <span>{p.text}</span>
            </>
          )}
        </div>
      );
    case 'image':
    case 'imagebutton': {
      const src = p.src?.image ? url(`/analyses/${ctx.analysisId}/drawable`, { path: p.src.image }) : undefined;
      const sz: CSSProperties = { ...style };
      if (!sz.width && !sz.flex && !sz.alignSelf) sz.width = 48;
      if (!sz.height && !sz.flex) sz.height = sz.width === '100%' ? 160 : 48;
      return (
        <div style={{ ...sz, display: 'grid', placeItems: 'center', overflow: 'hidden' }} onClick={click} title={title}>
          {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: p.scaleType?.includes('crop') ? 'cover' : p.scaleType === 'fitXY' ? 'fill' : 'contain' }} /> : p.src?.color ? <div style={{ width: '100%', height: '100%', background: cssColor(p.src.color) }} /> : <Placeholder label="Image" />}
        </div>
      );
    }
    case 'progress':
      return (
        <div style={{ ...style, minHeight: 6, display: 'grid', placeItems: 'center' }} onClick={click} title={title}>
          <div style={{ width: style.width ? '100%' : 32, height: style.width ? 4 : 32, borderRadius: 16, border: style.width ? undefined : '3px solid #2f6bff', borderTopColor: 'transparent', background: style.width ? 'linear-gradient(90deg,#2f6bff 40%,#cbd5e1 40%)' : undefined }} />
        </div>
      );
    case 'seek':
      return (
        <div style={{ ...style, minHeight: 24, display: 'flex', alignItems: 'center' }} onClick={click} title={title}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#2f6bff 50%,#cbd5e1 50%)' }} />
        </div>
      );
    case 'list':
      return (
        <div style={{ ...style, minHeight: style.height ?? 160 }} onClick={click} title={title}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 52, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', opacity: 1 - i * 0.2 }}>
              <span style={{ width: 32, height: 32, borderRadius: 16, background: '#cbd5e1' }} />
              <span style={{ height: 8, width: '50%', background: '#e2e8f0', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      );
    case 'web':
      return <div style={{ ...style, minHeight: style.height ?? 200, border: '1px dashed #94a3b8' }} onClick={click} title={title}><Placeholder label="WebView" /></div>;
    case 'spinner':
      return <div style={{ ...style, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #64748b', padding: '0 4px', color: '#1f2937' }} onClick={click} title={title}>— <span>▾</span></div>;
    default:
      return <div style={{ ...style, minHeight: style.height ?? (n.kind === 'view' ? 1 : 24), ...(n.kind === 'view' && !p.background ? {} : {}) }} onClick={click} title={title} />;
  }
}

function Placeholder({ label }: { label: string }) {
  return <div style={{ fontSize: 11, color: '#64748b', padding: 6, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>{label}</div>;
}
