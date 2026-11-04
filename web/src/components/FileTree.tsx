import { useMemo, useState } from 'react';
import { IChevron, IFile, IFolder } from './icons';
import { bytes } from '../lib/util';

export interface TreeFile { path: string; size?: number; badge?: string }
interface Node { name: string; path: string; children: Map<string, Node>; file?: TreeFile; size: number; count: number }

function build(files: TreeFile[]): Node {
  const root: Node = { name: '', path: '', children: new Map(), size: 0, count: 0 };
  for (const f of files) {
    const parts = f.path.split('/');
    let cur = root;
    cur.size += f.size ?? 0;
    cur.count++;
    parts.forEach((p, i) => {
      const isFile = i === parts.length - 1;
      let next = cur.children.get(p + (isFile ? '' : '/'));
      if (!next) {
        next = { name: p, path: parts.slice(0, i + 1).join('/'), children: new Map(), size: 0, count: 0 };
        cur.children.set(p + (isFile ? '' : '/'), next);
      }
      next.size += f.size ?? 0;
      next.count++;
      if (isFile) next.file = f;
      cur = next;
    });
  }
  return root;
}

export function FileTree({ files, selected, onSelect, filter = '', defaultOpenDepth = 1 }: { files: TreeFile[]; selected?: string; onSelect: (f: TreeFile) => void; filter?: string; defaultOpenDepth?: number }) {
  const shown = useMemo(() => (filter ? files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())) : files), [files, filter]);
  const root = useMemo(() => build(shown), [shown]);
  return (
    <div className="mono text-[12.5px]" role="tree">
      {[...root.children.values()].sort(sortNodes).map((n) => (
        <TreeNode key={n.path} node={n} depth={0} selected={selected} onSelect={onSelect} openDepth={filter ? 99 : defaultOpenDepth} />
      ))}
    </div>
  );
}

const sortNodes = (a: Node, b: Node) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name);

function TreeNode({ node, depth, selected, onSelect, openDepth }: { node: Node; depth: number; selected?: string; onSelect: (f: TreeFile) => void; openDepth: number }) {
  const [open, setOpen] = useState(depth < openDepth);
  const pad = { paddingLeft: 6 + depth * 14 };
  if (node.file) {
    const active = selected === node.file.path;
    return (
      <button role="treeitem" aria-selected={active} style={pad} onClick={() => onSelect(node.file!)} className={`flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left ${active ? 'bg-volt-500/20 text-white' : 'text-ink-200 hover:bg-ink-800'}`}>
        <IFile width={14} height={14} className="shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.file.badge && <span className="text-[10px] text-cyan-x">{node.file.badge}</span>}
        {node.file.size !== undefined && <span className="shrink-0 text-[10px] text-ink-500">{bytes(node.file.size)}</span>}
      </button>
    );
  }
  const kids = [...node.children.values()].sort(sortNodes);
  return (
    <div role="group">
      <button style={pad} onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-ink-100 hover:bg-ink-800">
        <IChevron width={14} height={14} className={`shrink-0 text-ink-400 transition ${open ? 'rotate-90' : ''}`} />
        <IFolder width={14} height={14} className="shrink-0 text-volt-400" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="shrink-0 text-[10px] text-ink-500">{node.count}</span>
      </button>
      {open && kids.slice(0, 2000).map((k) => <TreeNode key={k.path} node={k} depth={depth + 1} selected={selected} onSelect={onSelect} openDepth={openDepth} />)}
      {open && kids.length > 2000 && <div style={{ paddingLeft: 20 + depth * 14 }} className="py-1 text-ink-500">… {kids.length - 2000} de plus (utilisez le filtre)</div>}
    </div>
  );
}
