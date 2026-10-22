import { Extension, InputRule, Mark, Node, mergeAttributes, textblockTypeInputRule } from '@tiptap/core';
import { type Mark as PMMark, type MarkType } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { HEADING_STYLES, QUOTE_STYLE } from './markdown';
import { cleanPastedHtml } from './paste';

/**
 * Plain formatting (bold, italic, underline, strikethrough, code and links),
 * kept apart from character styles: typing **word** or pasting bold text
 * gives plain bold, while ⌘B applies the Strong style.
 */

const notNormal = (prop: 'fontWeight' | 'fontStyle') => (el: HTMLElement) => (el.style[prop] === 'normal' || el.style[prop] === '400' ? false : null);

export const Bold = Mark.create({
  name: 'bold',
  parseHTML() {
    return [
      { tag: 'strong' },
      // Google Docs wraps everything it copies in a <b> that isn't bold.
      { tag: 'b', getAttrs: (el) => (/^docs-internal-guid/.test(el.id) ? false : notNormal('fontWeight')(el)) },
      { style: 'font-weight=400', clearMark: (m) => m.type.name === this.name },
      { style: 'font-weight', getAttrs: (v) => (/^(bold(er)?|[6-9]\d\d)$/.test(v) ? null : false) },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['strong', HTMLAttributes, 0];
  },
});

export const Italic = Mark.create({
  name: 'italic',
  parseHTML() {
    return [
      { tag: 'em' },
      { tag: 'i', getAttrs: notNormal('fontStyle') },
      { style: 'font-style=normal', clearMark: (m) => m.type.name === this.name },
      { style: 'font-style=italic' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['em', HTMLAttributes, 0];
  },
});

export const Underline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [{ tag: 'u' }, { tag: 'ins' }, { style: 'text-decoration', consuming: false, getAttrs: (v) => (v.includes('underline') ? null : false) }, { style: 'text-decoration-line', consuming: false, getAttrs: (v) => (v.includes('underline') ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', HTMLAttributes, 0];
  },
});

export const Strike = Mark.create({
  name: 'strike',
  parseHTML() {
    return [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration', consuming: false, getAttrs: (v) => (v.includes('line-through') ? null : false) }, { style: 'text-decoration-line', consuming: false, getAttrs: (v) => (v.includes('line-through') ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['s', HTMLAttributes, 0];
  },
});

export const Code = Mark.create({
  name: 'code',
  parseHTML() {
    return [{ tag: 'code' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['code', HTMLAttributes, 0];
  },
});

/** Only web and mail addresses become links; anything else keeps its words and loses the link. */
export function safeHref(href: string | null): string | null {
  if (!href) return null;
  const h = href.trim();
  return /^(https?:|mailto:)/i.test(h) ? h : null;
}

export const Link = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return { href: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'a[href]', getAttrs: (el) => (safeHref(el.getAttribute('href')) ? { href: safeHref(el.getAttribute('href')) } : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { rel: 'noopener noreferrer nofollow', target: '_blank', title: HTMLAttributes.href }), 0];
  },
});

/**
 * Turns `**word**` into bold (and so on) as it is typed. The text keeps any
 * marks it already had, such as a character style around it.
 */
export function markRule(find: RegExp, make: (type: MarkType) => PMMark, type: () => MarkType): InputRule {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      // The closing delimiter has not been inserted yet; range.to is just before it.
      const delimited = match[1]!;
      const inner = match[2]!;
      const delimiter = (delimited.length - inner.length) / 2;
      const delimStart = range.from + match[0].indexOf(delimited);
      const textStart = delimStart + delimiter;
      const before = state.doc.resolve(delimStart).marks();
      const tr = state.tr;
      tr.delete(textStart + inner.length, range.to);
      tr.delete(delimStart, textStart);
      tr.addMark(delimStart, delimStart + inner.length, make(type()));
      tr.setStoredMarks(before);
    },
  });
}

const OPEN = `(?:^|[\\s([{“‘"'])`;
const span = (d: string) => {
  const e = d.replace(/[*~`]/g, '\\$&');
  const c = d[0] === '`' ? '`' : d[0]!.replace(/[*~]/, '\\$&');
  return new RegExp(`${OPEN}(${e}([^${c}\\s](?:[^${c}]*[^${c}\\s])?)${e})$`);
};

/** The plain marks' typing shortcuts. */
export const PlainMarkRules = Extension.create({
  name: 'plainMarkRules',
  addInputRules() {
    const schema = () => this.editor.schema;
    const plain = (t: MarkType) => t.create();
    return [
      markRule(span('**'), plain, () => schema().marks.bold!),
      markRule(span('*'), plain, () => schema().marks.italic!),
      markRule(/(?:^|[\s([{“‘"'])(_([^_\s](?:[^_]*[^_\s])?)_)$/, plain, () => schema().marks.underline!),
      markRule(span('~~'), plain, () => schema().marks.strike!),
      markRule(span('`'), plain, () => schema().marks.code!),
    ];
  },
});

export const HardBreak = Node.create({
  name: 'hardBreak',
  inline: true,
  group: 'inline',
  selectable: false,
  linebreakReplacement: true,
  parseHTML() {
    return [{ tag: 'br' }];
  },
  renderHTML() {
    return ['br'];
  },
  renderText() {
    return '\n';
  },
  addKeyboardShortcuts() {
    const insert = () => this.editor.chain().insertContent({ type: this.name }).run();
    return { 'Shift-Enter': insert, 'Mod-Enter': insert };
  },
});

export const CodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (el) => /language-(\S+)/.exec(el.querySelector('code')?.className ?? '')?.[1] ?? null,
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'pre', preserveWhitespace: 'full' }];
  },
  renderHTML({ node }) {
    return ['pre', ['code', node.attrs.language ? { class: `language-${node.attrs.language}` } : {}, 0]];
  },
  addInputRules() {
    return [textblockTypeInputRule({ find: /^```([a-z0-9-]*)\s$/i, type: this.type, getAttributes: (m) => ({ language: m[1] || null }) })];
  },
  addKeyboardShortcuts() {
    return {
      // Three Enters at the end leave the code block.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type !== this.type || $from.parentOffset !== $from.parent.content.size) return false;
        if (!$from.parent.textContent.endsWith('\n\n')) return false;
        return editor
          .chain()
          .command(({ tr }) => {
            tr.delete($from.pos - 2, $from.pos);
            return true;
          })
          .exitCode()
          .run();
      },
      // Backspace in an empty code block turns it back into a paragraph.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type !== this.type || $from.parent.content.size > 0) return false;
        return editor.commands.setNode('paragraph');
      },
    };
  },
});

type PictureLoader = (path: string) => Promise<string>;
let loadPicture: PictureLoader | null = null;
/** How pictures in the book are shown; set once a book is open. */
export function setPictureLoader(loader: PictureLoader | null): void {
  loadPicture = loader;
}

/** A picture written as ![alt](path). Only Markdown brings them in; pasted pictures are left out. */
export const Image = Node.create({
  name: 'image',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: '' }, alt: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'img[data-cb-src]', getAttrs: (el) => ({ src: el.getAttribute('data-cb-src'), alt: el.getAttribute('alt') ?? '' }) }];
  },
  renderHTML({ node }) {
    return ['img', { 'data-cb-src': node.attrs.src, alt: node.attrs.alt, class: 'cb-picture' }];
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      img.className = 'cb-picture';
      img.alt = node.attrs.alt as string;
      img.dataset.cbSrc = node.attrs.src as string;
      const src = node.attrs.src as string;
      if (/^https?:/i.test(src)) img.src = src;
      else
        void loadPicture?.(src).then(
          (url) => (img.src = url),
          () => img.classList.add('missing'),
        );
      return { dom: img };
    };
  },
});

/** Typing # , ## , ### or > at the start of a paragraph gives it that style. */
export const BlockShortcuts = Extension.create({
  name: 'blockShortcuts',
  addInputRules() {
    const rule = (find: RegExp, style: (m: RegExpMatchArray) => string) =>
      new InputRule({
        find,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return null;
          state.tr.delete(range.from, range.to).setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, style: style(match) });
        },
      });
    return [rule(/^(#{1,3})\s$/, (m) => HEADING_STYLES[m[1]!.length - 1]!), rule(/^>\s$/, () => QUOTE_STYLE)];
  },
});

/** Cleans up HTML from Word, Google Docs and others before it is pasted. */
export const PasteCleanup = Extension.create({
  name: 'pasteCleanup',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedHTML: (html) => cleanPastedHtml(html),
          // Pasted into an empty paragraph, the first pasted paragraph keeps its own style (a title stays a title).
          handlePaste: (view, _event, slice) => {
            const { $from, empty } = view.state.selection;
            const first = slice.content.firstChild;
            if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0) return false;
            if (slice.openStart === 0 || first?.type.name !== 'paragraph' || first.attrs.style === $from.parent.attrs.style) return false;
            const start = $from.before();
            const tr = view.state.tr.replaceSelection(slice);
            const target = tr.doc.nodeAt(start);
            if (target?.type.name === 'paragraph') tr.setNodeMarkup(start, undefined, { ...target.attrs, style: first.attrs.style });
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
