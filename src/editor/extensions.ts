import { type AnyExtension, Extension, InputRule, Mark, Node, mergeAttributes, wrappingInputRule, type Editor } from '@tiptap/core';
import { BulletList, ListItem, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Typography } from '@tiptap/extension-typography';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import { type Mark as PMMark, type NodeType } from '@tiptap/pm/model';
import { liftListItem } from '@tiptap/pm/schema-list';
import { Plugin, Selection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { commandFor } from '../shortcuts';
import { type AppSettings, getSettings } from '../settings';
import { BODY_STYLE, HEADING_STYLES, QUOTE_STYLE } from './markdown';
import { type ParagraphFormat, type TextFormat, textFormatOf } from './format';
import { PX_PER_PT, darkPageColor, fontStack } from '../styles/styles';
import { BlockShortcuts, Bold, Code, CodeBlock, HardBreak, Image, Italic, Link, PasteCleanup, PlainMarkRules, Strike, Underline } from './formatting';
import { FindExtension } from './findPlugin';
import { FocusMode } from './focusMode';
import { LinkedNames } from './names';
import { Proofread } from '../proofread/plugin';
import { DialogueFocus, Footnote, Note, type SeasoningsRequest, insertFootnote } from './seasonings';

/** Where Enter goes next: each paragraph style names its follower. */
export type NextStyle = (style: string) => string;

/** Headings pasted from other apps come in as Chapter title and the heading styles. */
const TAG_STYLE: Record<string, string> = { H1: HEADING_STYLES[0], H2: HEADING_STYLES[1], H3: HEADING_STYLES[2], H4: HEADING_STYLES[2], H5: HEADING_STYLES[2], H6: HEADING_STYLES[2] };

type TypingSetting = keyof Pick<AppSettings, 'curlyQuotes' | 'emDash' | 'markdown' | 'lineStarters'>;

/** An extension whose typing shortcuts only work while a setting is on; the setting is read on each key. */
function whenOn<T extends AnyExtension>(extension: T, setting: TypingSetting): T {
  return extension.extend({
    addInputRules() {
      return (this.parent?.() ?? []).map(
        (rule: InputRule) =>
          new InputRule({
            find: rule.find,
            handler: (props) => (getSettings()[setting] ? rule.handler(props) : null),
            undoable: rule.undoable,
          }),
      );
    },
  }) as T;
}

/** A paragraph that is only "* * *" becomes a scene break when Enter is pressed. */
const BREAK_LINE = /^\s*\*\s*\*\s*\*\s*$/;

const StyledParagraph = Node.create<{ nextStyle: NextStyle }>({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  priority: 1000,
  addOptions() {
    return { nextStyle: (style: string) => style };
  },
  addAttributes() {
    return {
      style: {
        default: BODY_STYLE,
        keepOnSplit: true,
        parseHTML: (el) => el.getAttribute('data-style') || TAG_STYLE[el.tagName] || (el.closest('blockquote') ? QUOTE_STYLE : BODY_STYLE),
        renderHTML: (attrs) => (attrs.style && attrs.style !== BODY_STYLE ? { 'data-style': attrs.style } : {}),
      },
      // Alignment and spacing set on this paragraph by hand, over its style's.
      align: {
        default: null,
        keepOnSplit: true,
        parseHTML: (el) => el.getAttribute('data-align'),
        renderHTML: (attrs) => (attrs.align ? { 'data-align': attrs.align, style: `text-align: ${attrs.align}` } : {}),
      },
      lineSpacing: {
        default: null,
        keepOnSplit: true,
        parseHTML: (el) => Number(el.getAttribute('data-spacing')) || null,
        renderHTML: (attrs) => (attrs.lineSpacing ? { 'data-spacing': attrs.lineSpacing, style: `line-height: ${attrs.lineSpacing}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'p' }, ...Object.keys(TAG_STYLE).map((tag) => ({ tag: tag.toLowerCase() }))];
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        // Only top-level paragraphs; lists keep their own Enter behaviour.
        if (!empty || $from.depth !== 1 || $from.parent.type.name !== this.name) return false;
        if (getSettings().lineStarters && BREAK_LINE.test($from.parent.textContent) && $from.parentOffset === $from.parent.content.size) {
          return editor.commands.command(({ tr, state }) => {
            const start = $from.before();
            tr.replaceWith(start, $from.after(), state.schema.nodes.sceneBreak!.create());
            const after = start + 1;
            if (after >= tr.doc.content.size || tr.doc.nodeAt(after)?.type.name !== 'paragraph') tr.insert(after, state.schema.nodes.paragraph!.create());
            tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
            return true;
          });
        }
        const style = $from.parent.attrs.style as string;
        const next = this.options.nextStyle(style);
        // A new paragraph in the same style keeps its alignment and spacing, as in Word; a heading's don't carry into Body.
        const reset = next === style ? {} : { align: null, lineSpacing: null };
        return editor.chain().splitBlock().updateAttributes(this.name, { style: next, ...reset }).run();
      },
    };
  },
});

const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'hr[data-scene-break]' }, { tag: 'hr' }];
  },
  renderHTML() {
    return ['hr', { 'data-scene-break': '' }];
  },
});

/** One mark for every character style; several can sit on the same text. */
export const CharStyle = Mark.create({
  name: 'charStyle',
  excludes: '',
  addAttributes() {
    return {
      style: {
        default: 'emphasis',
        parseHTML: (el) => el.getAttribute('data-char'),
        renderHTML: (attrs) => ({ 'data-char': attrs.style }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-char]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * Font, size and colour set on words by hand (see format.ts). One mark holds
 * all three, so setting one keeps the others.
 */
export const TextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      font: { default: null, parseHTML: (el) => el.getAttribute('data-font') || null, renderHTML: () => ({}) },
      size: { default: null, parseHTML: (el) => Number(el.getAttribute('data-size')) || null, renderHTML: () => ({}) },
      color: { default: null, parseHTML: (el) => el.getAttribute('data-color') || null, renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    // Only Cookbook's own; pasted fonts and colours from other apps are left behind.
    return [{ tag: 'span[data-format]' }];
  },
  renderHTML({ mark }) {
    const { font, size, color } = textFormatOf(mark.attrs);
    const css: string[] = [];
    const data: Record<string, string> = { 'data-format': '' };
    if (font) {
      css.push(`font-family: ${fontStack(font)}`);
      data['data-font'] = font;
    }
    if (size) {
      css.push(`font-size: ${size * PX_PER_PT}px`);
      data['data-size'] = String(size);
    }
    if (color) {
      // The page's stylesheet picks between these, so the colour reads on a dark page too.
      css.push(`--ink: ${color}; --ink-dark: ${darkPageColor(color)}`);
      data['data-color'] = color;
    }
    return ['span', { ...data, style: css.join('; ') }, 0];
  },
});

type Unset<T> = { [K in keyof T]?: T[K] | null };

/**
 * Sets font, size or colour on the selected words, or on what is typed next
 * when nothing is selected. Null takes that part off, back to the style's.
 */
export function setTextFormat(editor: Editor, changes: Unset<TextFormat>): void {
  const { state } = editor;
  const type = state.schema.marks.textStyle!;
  const { from, to, empty, $from } = state.selection;
  const tr = state.tr;
  const merged = (mark?: PMMark) => {
    const attrs = { font: null, size: null, color: null, ...mark?.attrs, ...changes };
    return attrs.font || attrs.size || attrs.color ? type.create(attrs) : null;
  };
  if (empty) {
    const current = state.storedMarks ?? $from.marks();
    const next = merged(current.find((m) => m.type === type));
    const rest = current.filter((m) => m.type !== type);
    tr.setStoredMarks(next ? [...rest, next] : rest);
  } else {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      const next = merged(node.marks.find((m) => m.type === type));
      if (next) tr.addMark(start, end, next);
      else tr.removeMark(start, end, type);
    });
  }
  editor.view.dispatch(tr);
}

/** The top-level paragraphs the selection touches, with their positions. */
function selectedParagraphs(editor: Editor): { pos: number; attrs: Record<string, unknown> }[] {
  const { doc, selection } = editor.state;
  const out: { pos: number; attrs: Record<string, unknown> }[] = [];
  const first = selection.$from.depth >= 1 ? selection.$from.before(1) : 0;
  const last = selection.$to.depth >= 1 ? selection.$to.before(1) : first;
  doc.forEach((node, pos) => {
    if (pos >= first && pos <= last && node.type.name === 'paragraph') out.push({ pos, attrs: node.attrs });
  });
  return out;
}

/** Sets alignment or spacing on the paragraphs the selection touches. Null goes back to the style's. */
export function setParagraphFormat(editor: Editor, changes: Unset<ParagraphFormat>): void {
  const tr = editor.state.tr;
  for (const { pos, attrs } of selectedParagraphs(editor)) tr.setNodeMarkup(pos, undefined, { ...attrs, ...changes });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/**
 * After a style has taken in what was set by hand in a paragraph, takes those
 * values off the paragraph, so it follows the style again. Other words keep theirs.
 */
export function dropTakenFormat(editor: Editor, pos: number, taken: TextFormat & ParagraphFormat): void {
  const { state } = editor;
  const type = state.schema.marks.textStyle!;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  const tr = state.tr;
  const attrs = { ...node.attrs };
  if (taken.align) attrs.align = null;
  if (taken.lineSpacing) attrs.lineSpacing = null;
  tr.setNodeMarkup(pos, undefined, attrs);
  node.descendants((child, offset) => {
    const mark = child.isText ? child.marks.find((m) => m.type === type) : undefined;
    if (!mark) return;
    const next = { ...mark.attrs };
    for (const key of ['font', 'size', 'color'] as const) if (taken[key] && next[key] === taken[key]) next[key] = null;
    const from = pos + 1 + offset;
    if (next.font || next.size || next.color) tr.addMark(from, from + child.nodeSize, type.create(next));
    else tr.removeMark(from, from + child.nodeSize, type);
  });
  editor.view.dispatch(tr);
}

/** Takes off everything set by hand in the selection, leaving the styles. */
export function clearFormatting(editor: Editor): void {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  const type = state.schema.marks.textStyle!;
  if (empty) tr.setStoredMarks((state.storedMarks ?? state.selection.$from.marks()).filter((m) => m.type !== type));
  else tr.removeMark(from, to, type);
  for (const { pos, attrs } of selectedParagraphs(editor)) if (attrs.align || attrs.lineSpacing) tr.setNodeMarkup(pos, undefined, { ...attrs, align: null, lineSpacing: null });
  editor.view.dispatch(tr);
}

/** One format part across the selection: its value if it's the same everywhere, 'mixed' if not, null if unset. */
export function textFormatAt(editor: Editor): { [K in keyof TextFormat]-?: NonNullable<TextFormat[K]> | null | 'mixed' } {
  const { state } = editor;
  const type = state.schema.marks.textStyle!;
  const { from, to, empty, $from } = state.selection;
  const formats: TextFormat[] = [];
  if (empty) formats.push(textFormatOf((state.storedMarks ?? $from.marks()).find((m) => m.type === type)?.attrs));
  else
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText) formats.push(textFormatOf(node.marks.find((m) => m.type === type)?.attrs));
    });
  const one = <K extends keyof TextFormat>(key: K): NonNullable<TextFormat[K]> | null | 'mixed' => {
    const values = new Set(formats.map((f) => f[key] ?? null));
    return values.size > 1 ? 'mixed' : ([...values][0] ?? null);
  };
  return { font: one('font'), size: one('size'), color: one('color') };
}

/**
 * The page's own shortcuts, which the writer can change in Settings: notes,
 * footnotes and the three basic character styles. They are looked up on each
 * key press, so a change applies straight away.
 */
const PageShortcuts = Extension.create<{ onRequest: (r: SeasoningsRequest) => void }>({
  name: 'pageShortcuts',
  priority: 1100,
  addOptions() {
    return { onRequest: () => {} };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const onRequest = (r: SeasoningsRequest) => this.options.onRequest(r);
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, event) {
            const id = commandFor(event, ['footnote', 'strong', 'emphasis', 'underline']);
            if (!id) return false;
            event.preventDefault();
            if (id === 'footnote') onRequest({ tab: 'footnotes', index: insertFootnote(editor) });
            else toggleFormat(editor, id as BasicStyle);
            return true;
          },
        },
      }),
    ];
  },
});

function findStyle(marks: readonly PMMark[], style: string): PMMark | undefined {
  return marks.find((m) => m.type.name === 'charStyle' && m.attrs.style === style);
}

export function hasCharStyle(editor: Editor, style: string): boolean {
  const { state } = editor;
  const { from, to, empty, $from } = state.selection;
  if (empty) return !!findStyle(state.storedMarks ?? $from.marks(), style);
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && findStyle(node.marks, style)) found = true;
  });
  return found;
}

export function toggleCharStyle(editor: Editor, style: string): boolean {
  const { state, view } = editor;
  const type = state.schema.marks.charStyle!;
  const { from, to, empty, $from } = state.selection;
  const tr = state.tr;
  if (empty) {
    const current = state.storedMarks ?? $from.marks();
    const existing = findStyle(current, style);
    tr.setStoredMarks(existing ? current.filter((m) => m !== existing) : [...current, type.create({ style })]);
  } else if (hasCharStyle(editor, style)) {
    state.doc.nodesBetween(from, to, (node, pos) => {
      const mark = node.isText ? findStyle(node.marks, style) : undefined;
      if (mark) tr.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), mark);
    });
  } else {
    tr.addMark(from, to, type.create({ style }));
  }
  view.dispatch(tr);
  return true;
}

/** The plain mark that looks like each of the three basic character styles. */
const LOOKALIKE = { strong: 'bold', emphasis: 'italic', underline: 'underline' } as const;
export type BasicStyle = keyof typeof LOOKALIKE;

/** Bold-looking, whether from the Strong style or plain bold (and so on for italic and underline). */
export function isFormatted(editor: Editor, style: BasicStyle): boolean {
  return hasCharStyle(editor, style) || editor.isActive(LOOKALIKE[style]);
}

/**
 * ⌘B, ⌘I, ⌘U and the toolbar's B, I and U. They apply the Strong, Emphasis and
 * Underline styles; on text that is plain bold (say, pasted), they take the bold off instead.
 */
export function toggleFormat(editor: Editor, style: BasicStyle): boolean {
  if (editor.isActive(LOOKALIKE[style])) return editor.chain().unsetMark(LOOKALIKE[style]).run();
  return toggleCharStyle(editor, style);
}

const ITEMS = new Set(['listItem', 'taskItem']);

/** The list item the cursor's paragraph opens, when the cursor is in an item's first paragraph. */
function itemAtCursor(editor: Editor): NodeType | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 2 || $from.parent.type.name !== 'paragraph' || $from.index($from.depth - 1) !== 0) return null;
  const item = $from.node($from.depth - 1);
  return ITEMS.has(item.type.name) ? item.type : null;
}

/**
 * Takes the cursor's list item out of every list it sits in, in one undo step,
 * so it becomes a plain paragraph at the left margin.
 */
export function leaveLists(editor: Editor): boolean {
  let state = editor.state;
  const tr = state.tr;
  for (;;) {
    const { $from } = state.selection;
    let item: NodeType | null = null;
    for (let d = $from.depth; d > 0 && !item; d--) if (ITEMS.has($from.node(d).type.name)) item = $from.node(d).type;
    let lifted: Transaction | null = null;
    if (!item || !liftListItem(item)(state, (t) => (lifted = t)) || !lifted) break;
    const step: Transaction = lifted;
    step.steps.forEach((s) => tr.step(s));
    state = state.apply(step);
  }
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, state.selection.from)).scrollIntoView());
  return true;
}

/**
 * Lists stay simple. Enter or Backspace on an empty item leaves the list
 * completely, even from a sub-list; Backspace at the start of an item makes it
 * a paragraph rather than joining it to the item above. Tab outside a list
 * indents the line with a tab and never starts a list.
 */
const ListKeys = Extension.create({
  name: 'listKeys',
  priority: 1050,
  addKeyboardShortcuts() {
    const atItemStart = (editor: Editor) => {
      const { empty, $from } = editor.state.selection;
      return empty && $from.parentOffset === 0 && itemAtCursor(editor) !== null;
    };
    return {
      Enter: ({ editor }) => atItemStart(editor) && editor.state.selection.$from.parent.content.size === 0 && leaveLists(editor),
      // Backspace straight after - or -TD gives the typed text back first.
      Backspace: ({ editor }) => editor.commands.undoInputRule() || (atItemStart(editor) && leaveLists(editor)),
      Tab: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'paragraph' || $from.depth !== 1) return false;
        return editor.commands.insertContent('\t');
      },
      'Shift-Tab': ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if ($from.parent.type.name !== 'paragraph' || $from.depth !== 1) return false;
        // Takes back a tab just before the cursor, and otherwise keeps the cursor on the page.
        if (empty && $from.parentOffset > 0 && $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset) === '\t') editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos });
        return true;
      },
    };
  },
});

/** Only what a novelist expects from Typography; nothing turns (c) into © behind their back. */
const NO_TYPOGRAPHY = {
  leftArrow: false,
  rightArrow: false,
  copyright: false,
  trademark: false,
  servicemark: false,
  registeredTrademark: false,
  oneHalf: false,
  oneQuarter: false,
  threeQuarters: false,
  plusMinus: false,
  notEqual: false,
  laquo: false,
  raquo: false,
  multiplication: false,
  superscriptTwo: false,
  superscriptThree: false,
} as const;

export function cookbookExtensions(nextStyle: NextStyle, onRequest: (r: SeasoningsRequest) => void = () => {}) {
  return [
    Document,
    Text,
    StyledParagraph.configure({ nextStyle }),
    SceneBreak,
    CharStyle,
    // After CharStyle, so it sits inside character styles and its colour and size show.
    TextStyle,
    PageShortcuts.configure({ onRequest }),
    ListKeys,
    Note.configure({ onRequest }),
    Footnote.configure({ onRequest }),
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    Link,
    whenOn(PlainMarkRules, 'markdown'),
    HardBreak,
    whenOn(CodeBlock, 'markdown'),
    Image,
    whenOn(BlockShortcuts, 'markdown'),
    PasteCleanup,
    whenOn(
      BulletList.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*-\s$/, type: this.type })];
        },
      }),
      'lineStarters',
    ),
    // -1 starts a numbered list, as - starts bullets and -TD a checklist; so does 1. on its own.
    whenOn(
      OrderedList.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*(?:-1|1\.)\s$/, type: this.type })];
        },
      }),
      'lineStarters',
    ),
    ListItem.extend({ content: 'paragraph list*' }),
    whenOn(
      TaskList.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*-TD\s$/i, type: this.type })];
        },
      }),
      'lineStarters',
    ),
    TaskItem.extend({ content: 'paragraph list*' }).configure({ nested: true }),
    Table.extend({
      addKeyboardShortcuts() {
        // The browser's own Ctrl+End stops short of a table at the end of the scene.
        const go = (end: boolean) => ({ editor }: { editor: Editor }) => {
          const { doc, tr } = editor.state;
          editor.view.dispatch(tr.setSelection(end ? Selection.atEnd(doc) : Selection.atStart(doc)).scrollIntoView());
          return true;
        };
        return { ...this.parent?.(), 'Mod-End': go(true), 'Mod-Home': go(false) };
      },
      addCommands() {
        return {
          ...this.parent?.(),
          // A table never ends the scene, so there is always somewhere to type after it.
          insertTable:
            (options) =>
            (props) => {
              if (!this.parent?.().insertTable!(options)(props)) return false;
              const { tr, dispatch } = props;
              if (dispatch && tr.doc.lastChild?.type.name === 'table') tr.insert(tr.doc.content.size, this.editor.schema.nodes.paragraph!.create());
              return true;
            },
        };
      },
    }).configure({ resizable: false }),
    TableRow,
    TableHeader.extend({ content: 'paragraph' }),
    TableCell.extend({ content: 'paragraph' }),
    whenOn(
      Typography.extend({ name: 'curlyQuotes' }).configure({
        ...NO_TYPOGRAPHY,
        emDash: false,
        ellipsis: false,
      }),
      'curlyQuotes',
    ),
    whenOn(
      Typography.extend({ name: 'dashes' }).configure({
        ...NO_TYPOGRAPHY,
        openDoubleQuote: false,
        closeDoubleQuote: false,
        openSingleQuote: false,
        closeSingleQuote: false,
      }),
      'emDash',
    ),
    UndoRedo,
    Dropcursor,
    Gapcursor,
    FindExtension,
    DialogueFocus,
    FocusMode,
    LinkedNames,
    Proofread,
  ];
}
