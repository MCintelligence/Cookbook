import { InputRule, Mark, Node, mergeAttributes, wrappingInputRule, type Editor } from '@tiptap/core';
import { BulletList, ListItem, TaskItem, TaskList } from '@tiptap/extension-list';
import { Typography } from '@tiptap/extension-typography';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import { type Mark as PMMark, type MarkType } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { BODY_STYLE } from './markdown';
import { FindExtension } from './findPlugin';
import { DialogueFocus, Footnote, Note, type SeasoningsRequest } from './seasonings';

/** Where Enter goes next: each paragraph style names its follower. */
export type NextStyle = (style: string) => string;

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
        parseHTML: (el) => el.getAttribute('data-style') || BODY_STYLE,
        renderHTML: (attrs) => (attrs.style && attrs.style !== BODY_STYLE ? { 'data-style': attrs.style } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'p' }];
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
        const next = this.options.nextStyle($from.parent.attrs.style as string);
        return editor.chain().splitBlock().updateAttributes(this.name, { style: next }).run();
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
  addInputRules() {
    return [
      new InputRule({
        find: /^\* \* \*$/,
        handler: ({ state, range }) => {
          const $start = state.doc.resolve(range.from);
          if ($start.depth !== 1) return null;
          state.tr.replaceRangeWith($start.before(), $start.after(), this.type.create());
          const after = state.tr.mapping.map($start.after());
          if (after >= state.tr.doc.content.size) {
            state.tr.insert(state.tr.doc.content.size, state.schema.nodes.paragraph!.create());
          }
          state.tr.setSelection(TextSelection.near(state.tr.doc.resolve(Math.min(after + 1, state.tr.doc.content.size))));
        },
      }),
    ];
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
  addKeyboardShortcuts() {
    return {
      'Mod-b': ({ editor }) => toggleCharStyle(editor, 'strong'),
      'Mod-i': ({ editor }) => toggleCharStyle(editor, 'emphasis'),
      'Mod-u': ({ editor }) => toggleCharStyle(editor, 'underline'),
    };
  },
  addInputRules() {
    return [
      charStyleRule(/(?:^|[\s([{“‘"'])(\*\*([^*\s](?:[^*]*[^*\s])?)\*\*)$/, 'strong', this.type),
      charStyleRule(/(?:^|[\s([{“‘"'])(\*([^*\s](?:[^*]*[^*\s])?)\*)$/, 'emphasis', this.type),
      charStyleRule(/(?:^|[\s([{“‘"'])(_([^_\s](?:[^_]*[^_\s])?)_)$/, 'underline', this.type),
    ];
  },
});

function findStyle(marks: readonly PMMark[], style: string): PMMark | undefined {
  return marks.find((m) => m.type.name === 'charStyle' && m.attrs.style === style);
}

/**
 * Turns `**word**` into the Strong style (and so on). Unlike Tiptap's own
 * rule, the text keeps any other character styles it already had.
 */
function charStyleRule(find: RegExp, style: string, type: MarkType): InputRule {
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
      tr.addMark(delimStart, delimStart + inner.length, type.create({ style }));
      tr.setStoredMarks(before);
    },
  });
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

export function cookbookExtensions(nextStyle: NextStyle, onRequest: (r: SeasoningsRequest) => void = () => {}) {
  return [
    Document,
    Text,
    StyledParagraph.configure({ nextStyle }),
    SceneBreak,
    CharStyle,
    Note.configure({ onRequest }),
    Footnote.configure({ onRequest }),
    BulletList.extend({
      addInputRules() {
        return [wrappingInputRule({ find: /^\s*-\s$/, type: this.type })];
      },
    }),
    ListItem.extend({ content: 'paragraph' }),
    TaskList.extend({
      addInputRules() {
        return [wrappingInputRule({ find: /^\s*-TD\s$/i, type: this.type })];
      },
    }),
    TaskItem.extend({ content: 'paragraph' }).configure({ nested: false }),
    Typography.configure({
      // Only what a novelist expects; nothing turns (c) into © behind their back.
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
    }),
    UndoRedo,
    Dropcursor,
    Gapcursor,
    FindExtension,
    DialogueFocus,
  ];
}
