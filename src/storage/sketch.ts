import { type CookbookDocument, type DocumentKind } from './document';

/**
 * The Pantry Sketch: one template for every Pantry Item. A character, a
 * setting and a material answer the same questions, under the same headings,
 * in the same order. Only the faint hint in each blank box changes with the
 * kind, so the writer knows what the question means for the thing in front
 * of them.
 *
 * The short facts (Role in story, Where, When, Work) are ordinary card fields.
 * Everything else is kept in the front matter under `sketch`, one key per box:
 *
 *   sketch:
 *     line: A lighthouse keeper's daughter who lies to keep the light burning.
 *     want: To be named keeper before spring.
 */

/** The three Pantry kinds, as the Sketch's hints know them. */
export type SketchKind = 'character' | 'setting' | 'research';

export const isSketchKind = (kind: DocumentKind | string | null | undefined): kind is SketchKind => kind === 'character' || kind === 'setting' || kind === 'research';

type Hints = Record<SketchKind, string>;

export interface SketchSlot {
  key: string;
  /** Shown above the box. Left out when the section has only this one box. */
  label?: string;
  hint: Hints;
}

export interface SketchSection {
  id: string;
  title: string;
  /** The question the section asks, shown small beside its title: "they" for a character, "it" for the rest. */
  question: Hints;
  /** How the boxes sit: two side by side, the five senses in a row, or one across. */
  layout: 'pair' | 'senses' | 'single';
  slots: SketchSlot[];
}

/** The one line under the Item's name: who or what this is to the story. */
export const LINE_HINT: Hints = {
  character: 'In a line: who they are to this story',
  setting: 'In a line: what this place is to the story',
  research: 'In a line: what this is, and why it matters',
};

export const SKETCH: SketchSection[] = [
  {
    id: 'purpose',
    title: 'Purpose',
    question: {
      character: 'What do they pull toward?',
      setting: 'What does it pull toward?',
      research: 'What does it pull toward?',
    },
    layout: 'pair',
    slots: [
      {
        key: 'want',
        label: 'Want',
        hint: {
          character: 'The goal that pulls them through the story, and why it matters.',
          setting: 'What it offers: why people come here, stay, or fight over it.',
          research: 'Why people want it, and what it could do for them.',
        },
      },
      {
        key: 'need',
        label: 'Need',
        hint: {
          character: 'What they truly need, which may not be what they want.',
          setting: 'What it needs to survive: a keeper, repairs, a secret kept.',
          research: 'What it needs to work: a key, a reader, the right hands.',
        },
      },
    ],
  },
  {
    id: 'look',
    title: 'Look',
    question: {
      character: 'How does the reader first see them?',
      setting: 'How does the reader first see it?',
      research: 'How does the reader first see it?',
    },
    layout: 'single',
    slots: [
      {
        key: 'look',
        hint: {
          character: 'Build, face, clothes, and what people notice first.',
          setting: 'What stands here, how big it is, what you see as you arrive.',
          research: 'Size, shape, what it is made of, its wear and markings.',
        },
      },
    ],
  },
  {
    id: 'senses',
    title: 'Senses',
    question: {
      character: 'What do people sense near them?',
      setting: 'What does it feel like to be near it?',
      research: 'What does it feel like to be near it?',
    },
    layout: 'senses',
    slots: [
      {
        key: 'sight',
        label: 'Sight',
        hint: {
          character: 'Colours, posture, how they move',
          setting: 'Light, colour, what catches the eye',
          research: 'Colour, shine, how it catches light',
        },
      },
      {
        key: 'sound',
        label: 'Sound',
        hint: {
          character: 'Voice, laugh, footsteps',
          setting: 'Background noise, silence, echoes',
          research: 'Does it creak, chime, rustle?',
        },
      },
      {
        key: 'smell',
        label: 'Smell',
        hint: {
          character: 'Soap, smoke, perfume',
          setting: 'Salt, rot, bread, paraffin',
          research: 'Old paper, oil, metal, dust',
        },
      },
      {
        key: 'touch',
        label: 'Touch',
        hint: {
          character: 'Handshake, skin, their coat',
          setting: 'Cold, damp, what is underfoot',
          research: 'Weight, texture, warmth in the hand',
        },
      },
      {
        key: 'taste',
        label: 'Taste',
        hint: {
          character: 'What they eat and drink',
          setting: 'The food, the air',
          research: 'Only if it is eaten or drunk',
        },
      },
    ],
  },
  {
    id: 'nature',
    title: 'Nature',
    question: {
      character: 'How do they behave?',
      setting: 'How does it behave?',
      research: 'How does it behave?',
    },
    layout: 'pair',
    slots: [
      {
        key: 'temperament',
        label: 'Temperament',
        hint: {
          character: 'Personality: how they think, feel and treat people.',
          setting: 'The mood of the place, and how it treats people who come.',
          research: 'How it behaves: steady, fragile, cursed, unreliable.',
        },
      },
      {
        key: 'quirks',
        label: 'Quirks',
        hint: {
          character: 'Habits, mannerisms, sayings, tics.',
          setting: 'Unique features no other place has.',
          research: 'Oddities and marks that make it unlike any copy.',
        },
      },
    ],
  },
  {
    id: 'past',
    title: 'Past',
    question: {
      character: 'What made them who they are?',
      setting: 'What made it what it is?',
      research: 'What made it what it is?',
    },
    layout: 'single',
    slots: [
      {
        key: 'past',
        hint: {
          character: 'Background: the family, home and wounds that made them.',
          setting: 'History: who built it, what happened here before the story.',
          research: 'Origin: who made it, how it changed hands, how it got here.',
        },
      },
    ],
  },
  {
    id: 'tension',
    title: 'Tension',
    question: {
      character: 'What could break them?',
      setting: 'What could break it?',
      research: 'What could break it?',
    },
    layout: 'pair',
    slots: [
      {
        key: 'within',
        label: 'Within',
        hint: {
          character: 'Internal conflict: what they fight inside themselves.',
          setting: 'What is wrong inside it: rot, secrets, a divided house.',
          research: 'Its flaw: what it costs to use, what it cannot do.',
        },
      },
      {
        key: 'without',
        label: 'Without',
        hint: {
          character: 'External conflict: who or what stands against them.',
          setting: 'What threatens it from outside: storms, a sale, a siege.',
          research: 'Who else wants it, and what they would do to get it.',
        },
      },
    ],
  },
  {
    id: 'notes',
    title: 'Notes',
    question: {
      character: 'What else should you remember?',
      setting: 'What else should you remember?',
      research: 'What else should you remember?',
    },
    layout: 'pair',
    slots: [
      {
        key: 'notes',
        label: 'Notes',
        hint: {
          character: 'Anything else worth keeping.',
          setting: 'Anything else worth keeping.',
          research: 'Anything else worth keeping.',
        },
      },
      {
        key: 'sources',
        label: 'Sources',
        hint: {
          character: 'Real people, photos, books you drew on.',
          setting: 'Photos, maps, places you visited.',
          research: 'Links, books, archives: where the facts came from.',
        },
      },
    ],
  },
];

/** The short facts at the top of every Sketch, as card fields, in order. */
export const SKETCH_FIELDS = ['role in story', 'where', 'when', 'work'] as const;

/** Faint text in the short fields and the other names box, by kind. */
export const SKETCH_FIELD_HINTS: Record<string, Hints> = {
  'role in story': {
    character: 'Hero, rival, mentor, friend…',
    setting: 'Home, refuge, battleground, crossroads…',
    research: 'Clue, prize, weapon, proof, key…',
  },
  where: {
    character: 'Where they live or can be found',
    setting: 'Where it sits, and how you get there',
    research: 'Where it is now, and who holds it',
  },
  when: {
    character: 'Age, or stage of life',
    setting: 'Era, season, time of day',
    research: 'When it was made, found or written',
  },
  work: {
    character: 'What they do with their days',
    setting: 'What it is used for: inn, prison, port',
    research: 'What it does, or is used for',
  },
  aka: {
    character: 'Nicknames, titles, what others call them',
    setting: 'Other names, local names, old names',
    research: 'Other names, titles, labels',
  },
};

export type Sketch = Record<string, string>;

/** The Item's Sketch, or null when it was made before the Sketch and hasn't taken one on. */
export function sketchOf(fields: Record<string, unknown>): Sketch | null {
  const raw = fields.sketch;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
}

/** Sets one box of the Sketch. An emptied box is dropped from the file, but the Sketch stays. */
export function withSketchValue(doc: CookbookDocument, key: string, value: string): CookbookDocument {
  const { [key]: _old, ...rest } = sketchOf(doc.fields) ?? {};
  const sketch = value === '' ? rest : { ...rest, [key]: value };
  return { ...doc, fields: { ...doc.fields, sketch } };
}

/**
 * Gives an older Item the Sketch: an empty one, plus any of the short facts it
 * doesn't have yet. The writer's own fields and page stay as they are.
 */
export function withSketch(doc: CookbookDocument): CookbookDocument {
  if (sketchOf(doc.fields)) return doc;
  const lower = new Set(Object.keys(doc.fields).map((k) => k.toLowerCase()));
  const missing = SKETCH_FIELDS.filter((k) => !lower.has(k));
  const fields: Record<string, unknown> = { ...doc.fields };
  for (const k of missing) fields[k] = '';
  fields.sketch = {};
  const order = doc.order?.length ? [...doc.order, ...missing.filter((k) => !doc.order!.includes(k)), 'sketch'] : doc.order;
  return { ...doc, fields, order };
}

/** Everything typed into the Sketch, for search. */
export function sketchText(fields: Record<string, unknown>): string[] {
  return Object.values(sketchOf(fields) ?? {}).filter((v) => v.trim());
}
