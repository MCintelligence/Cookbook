import { type ReactNode } from 'react';
import { type TreeNode } from '../storage/book';
import { type CardSummary, type Link, type SceneMention } from '../storage/index';
import { type PantrySection } from '../storage/pantry';
import { type MenuItem } from '../ui/Menu';
import { type Side } from './prefs';

/**
 * Sent to the element under the pointer when a Shelf or Pantry row is let go over Prep or Plan,
 * with a ShelfDrop as its detail. The mode brings the Item back if it was removed, and a view
 * may do more with it: the calendar and timeline date it to the day it landed on.
 */
export const SHELF_DROP = 'cookbook:shelf-drop';
export interface ShelfDrop {
  path: string;
  card: CardSummary | undefined;
  x: number;
  y: number;
}

/** What the Prep and Plan views ask of the app. They read the index and the Shelf, never the pages themselves. */
export interface ModeHost {
  tree: TreeNode[];
  pantryTree: TreeNode[];
  /** What the index knows of every file, by path. */
  cards: Map<string, CardSummary>;
  /** The open file. */
  path: string | null;
  /** Changes whenever the index does. */
  indexVersion: number;
  links(): Link[];
  /** The Shelf Items that name a Pantry Item, with how often. */
  mentions(card: CardSummary): SceneMention[];
  /** Picks a file, as a click on the Shelf does, staying in this mode. */
  select(path: string): void;
  /** Opens a file on the page, in Cook. */
  open(path: string): void;
  setField(path: string, key: string, value: unknown): Promise<void>;
  /** Moves a Shelf Item to `at` among what `folder` holds. */
  move(from: string, folder: string, at: number): Promise<string | undefined>;
  /** A new Shelf Item at the end of `folder`, with these fields. Settles with its id. */
  newItem(folder: string, fields?: Record<string, unknown>): Promise<string | null>;
  newCard(section: PantrySection, fields?: Record<string, unknown>): Promise<string | null>;
  newGroup(): void;
  rename(path: string): void;
  /** Takes an Item out of the mode showing (Prep or Plan), leaving the Item itself alone. Set by the mode, not the app. */
  remove(path: string): void;
  /** Shows a menu; given the button that opens it, a second press of the button closes it. */
  menu(label: string, x: number, y: number, items: MenuItem[], opener?: HTMLElement): void;
  loadPicture(path: string): Promise<string>;
  /** A notice at the foot of the window, with an Undo button when `undo` is given. */
  say(text: string, undo?: () => void): void;
}

export interface ViewProps {
  host: ModeHost;
  side: Side;
  /** Where the view puts its own controls in the toolbar. */
  tools: HTMLElement | null;
  /** Asks for a few words or a date in a small box. */
  ask(form: Form): void;
}

export interface FormField {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  wide?: boolean;
}

export interface Form {
  title: string;
  note?: ReactNode;
  fields: FormField[];
  /** A complaint about what was typed, or null when it will do. */
  check?(values: Record<string, string>): string | null;
  save(values: Record<string, string>): void;
  /** A second way out, such as Clear date. */
  other?: { label: string; pick(): void };
}
