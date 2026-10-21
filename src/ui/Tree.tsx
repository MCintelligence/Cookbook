import { useState } from 'react';
import { type TreeNode } from '../storage/book';

interface Props {
  nodes: TreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
}

export function Tree({ nodes, selected, onSelect }: Props) {
  return (
    <ul className="tree" role="tree">
      {nodes.map((n) => (
        <TreeItem key={n.path} node={n} selected={selected} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function TreeItem({ node, selected, onSelect }: { node: TreeNode } & Omit<Props, 'nodes'>) {
  const [open, setOpen] = useState(true);
  const label = node.name.replace(/\.md$/, '');
  if (node.kind === 'file') {
    return (
      <li role="treeitem" aria-selected={selected === node.path}>
        <button className="tree-file" onClick={() => onSelect(node.path)}>
          {label}
        </button>
      </li>
    );
  }
  return (
    <li role="treeitem" aria-expanded={open}>
      <button className="tree-folder" onClick={() => setOpen(!open)}>
        <span aria-hidden="true" className="chevron">{open ? '▾' : '▸'}</span>
        {label}
      </button>
      {open && node.children && node.children.length > 0 && (
        <Tree nodes={node.children} selected={selected} onSelect={onSelect} />
      )}
    </li>
  );
}
