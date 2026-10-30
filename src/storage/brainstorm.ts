/**
 * Brainstorming cards for character and place pages in the Pantry. A card is
 * an ordinary heading with a blank line under it, so the page stays plain
 * Markdown; while the line is blank it shows what the card is asking for.
 * Every card is optional, and the writer adds them with the + on an empty line.
 */

export type BrainstormKind = 'character' | 'setting';

export interface BrainstormCard {
  id: string;
  title: string;
  /** Shown faintly on the blank line under the heading, to explain what goes there. */
  placeholder: string;
}

export interface BrainstormGroup {
  id: string;
  title: string;
  /** Adding the group puts in all of its cards, in order. */
  addsAll?: boolean;
  cards: Record<BrainstormKind, BrainstormCard[]>;
}

export const BRAINSTORM_GROUPS: BrainstormGroup[] = [
  {
    id: 'basics',
    title: 'Basics',
    cards: {
      character: [
        { id: 'who', title: 'Who they are', placeholder: 'What they do, how they carry themselves, and what people notice first.' },
        { id: 'from', title: 'Where they come from', placeholder: 'The home, family and past that made them who they are now.' },
      ],
      setting: [
        { id: 'what', title: 'What it is', placeholder: 'What stands here, how big it is, and what it feels like to arrive.' },
        { id: 'from', title: 'Where it comes from', placeholder: 'Who built or found it, and what happened here before the story begins.' },
      ],
    },
  },
  {
    id: 'drive',
    title: 'Drive',
    cards: {
      character: [
        { id: 'want', title: 'What they want', placeholder: 'The goal that pulls them through the story, and why it matters to them.' },
        { id: 'blocks', title: 'What stands in their way', placeholder: 'The people, flaws and circumstances keeping them from getting it.' },
      ],
      setting: [
        { id: 'offers', title: 'What it offers', placeholder: 'Why people come here, stay here, or fight over it.' },
        { id: 'blocks', title: 'What stands in the way', placeholder: 'What makes it hard to reach, hold or leave.' },
      ],
    },
  },
  {
    id: 'world-on-fire',
    title: 'World on Fire',
    addsAll: true,
    cards: {
      character: [
        { id: 'wildfire', title: 'The Wildfire', placeholder: 'The worst predicament this story could plunge them into.' },
        { id: 'inferno', title: 'The Inferno', placeholder: 'The complications that make things worse, one after another.' },
        { id: 'cinders', title: 'The Cinders', placeholder: 'Their most hopeless moment, when it looks like all is lost.' },
        { id: 'phoenix', title: 'The Phoenix', placeholder: 'What they learn from all this, and how it gives them what they need to win in the end.' },
      ],
      setting: [
        { id: 'wildfire', title: 'The Wildfire', placeholder: 'The worst thing this story could bring down on it: a flood, a siege, a sale, a secret let out.' },
        { id: 'inferno', title: 'The Inferno', placeholder: 'What else goes wrong here, each trouble feeding the last.' },
        { id: 'cinders', title: 'The Cinders', placeholder: 'What it looks like at its most hopeless, when little is left standing.' },
        { id: 'phoenix', title: 'The Phoenix', placeholder: 'What rises from the wreckage, and what it gives the people who fought for it.' },
      ],
    },
  },
];

export const isBrainstormKind = (kind: string | null | undefined): kind is BrainstormKind => kind === 'character' || kind === 'setting';

const key = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ');

/** The card a heading starts, if its words are one of the cards for this kind of page. */
export function brainstormCardFor(kind: BrainstormKind, heading: string): BrainstormCard | null {
  const k = key(heading);
  for (const g of BRAINSTORM_GROUPS) for (const c of g.cards[kind]) if (key(c.title) === k) return c;
  return null;
}

/**
 * Faint text in the preset fields at the top of a card, fitting each field's
 * name, so the writer sees what a field is for without a label repeated inside it.
 */
export const FIELD_PLACEHOLDERS: Record<BrainstormKind, Record<string, string>> = {
  character: {
    aka: 'Nicknames, titles, what others call them',
    role: 'Hero, rival, mentor, friend…',
    age: 'How old, or what stage of life',
    wants: 'What they are after in this story',
    fears: 'What they would do anything to avoid',
  },
  setting: {
    aka: 'Other names, local names, old names',
    role: 'Home, hideout, battleground, crossroads…',
    when: 'The era, season or time of day it belongs to',
    offers: 'What draws people here',
    threatens: 'What makes it dangerous or hard to leave',
  },
};

/** The placeholder for a field by its name, or the plain one for a field the writer made. */
export function fieldPlaceholder(kind: string, name: string): string {
  return (isBrainstormKind(kind) ? FIELD_PLACEHOLDERS[kind][key(name)] : undefined) ?? 'Field value';
}
