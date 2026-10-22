import { serializeMarkdown } from '../editor/markdown';
import { type Manuscript } from './manuscript';

/** The book as one Markdown file: folders as headings, scenes in Cookbook's own (Pandoc-style) Markdown. */
export function bookMarkdown(m: Manuscript): string {
  const out: string[] = [`# ${m.title}`];
  for (const part of m.parts) {
    if (part.kind === 'heading') out.push(`${'#'.repeat(Math.min(6, part.depth + 1))} ${part.text}`);
    else if (part.kind === 'break') out.push('* * *');
    else out.push(serializeMarkdown(part.body).trimEnd());
  }
  return out.filter((s) => s.length > 0).join('\n\n') + '\n';
}
