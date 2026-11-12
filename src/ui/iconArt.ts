/**
 * The app's own icons, drawn in the same cut-line style as the Seasoning
 * characters: bold strokes, outlines left open at one corner, one part filled
 * solid, and thin slivers cut out of solid shapes for gloss. Every part takes
 * the current colour, so an icon follows the theme and its button's state.
 *
 * Each icon is a list of parts on its own square grid: `s` is a stroke of the
 * given width, `f` a solid fill (even-odd, so a shape drawn inside another
 * is cut out of it).
 */
export type IconPart = { s: string; w: number } | { f: string };
export interface IconArt {
  grid: number;
  parts: IconPart[];
}

const s = (d: string, w = 2.4): IconPart => ({ s: d, w });
const f = (d: string): IconPart => ({ f: d });
const art = (grid: number, ...parts: IconPart[]): IconArt => ({ grid, parts });

const EGG =
  'M24 5C33 5 39.4 18 39.4 28.2 39.4 37.2 32.4 43.4 24 43.4 15.6 43.4 8.6 37.2 8.6 28.2 8.6 18 15 5 24 5ZM23.2 9.6C29.8 9.6 34.4 19.6 34.4 27.6 34.4 34.4 29.6 38.8 23.6 38.8 17.4 38.8 12.4 34.4 12.4 27.6 12.4 19.6 16.6 9.6 23.2 9.6Z';

const GEAR =
  'M18.59 9.96 21.46 10.38 21.46 13.62 18.59 14.04 18.1 15.22 19.84 17.54 17.54 19.84 15.22 18.1 14.04 18.59 13.62 21.46 10.38 21.46 9.96 18.59 8.78 18.1 6.46 19.84 4.16 17.54 5.9 15.22 5.41 14.04 2.54 13.62 2.54 10.38 5.41 9.96 5.9 8.78 4.16 6.46 6.46 4.16 8.78 5.9 9.96 5.41 10.38 2.54 13.62 2.54 14.04 5.41 15.22 5.9 17.54 4.16 19.84 6.46 18.1 8.78Z';

const STAR = 'M12 2.8 14.8 8.6 21.1 9.4 16.5 13.8 17.7 20.1 12 17.1 6.3 20.1 7.5 13.8 2.9 9.4 9.2 8.6Z';

export const ICONS = {
  /** The Pantry: an egg with a gloss and a shadow. */
  pantry: art(
    48,
    f(EGG),
    f('M14.6 27.5c-.4-6.6 3-13.2 7.4-15.6-2.4 3.6-4.2 8.8-4.6 14.2z'),
    f('M38 31c-1 7-7.4 10.6-14 10.6-5 0-9.6-1.8-12-5.4 9.4 3 20.4.6 26-5.2z'),
  ),
  /** Seasonings: a sprig of herbs, its leaves cut through with a vein. */
  seasonings: art(
    48,
    f('M9.4 42.2C14.6 31.4 21.4 22 32.6 13.4l1.4 1.8C23.4 24 17.4 33 12.6 43.4z'),
    f('M32.6 14.2c-2-5.6.8-10 8.8-11.4.6 7.6-3 11.8-8.8 11.4zM37.6 6.4c-.9 2.4-2.3 4.6-4.1 6.6 1.4-2.2 2.6-4.4 3.3-6.8z'),
    f('M21.6 27.2C15.2 26 10.6 19.6 11.6 10.4c8.8 1.8 13.2 8.6 10 16.8zM14.8 13.6c2.6 3.4 4.4 7.4 5.6 11.4-1.6-3.6-3.6-7.6-6.4-10.8z'),
    f('M25.6 22.4c3.2 5.6 10.6 9.2 18.4 6.2-4.8-7.6-12.2-9.8-18.4-6.2zM40.4 26.2c-4 .2-8-.8-11.6-2.6 3.8 1.2 7.6 1.8 11.4 1.6z'),
    f('M17.6 33c-3.8 2-9.8 1.2-13.2-3.8 5-3.2 10.4-2 13.2 3.8zM8.4 30.2c2.8 0 5.6.8 8 2.2-2.6-.8-5.4-1.4-8-1.4z'),
  ),
  /** A magnifying glass, its rim open at the top and a solid handle. */
  search: art(
    24,
    s('M16.4 8.3A6.3 6.3 0 1 1 13.6 5', 2.6),
    s('M7.4 10.2a3.3 3.3 0 0 1 2.6-2.9', 1.6),
    f('M14.4 16.2l1.8-1.8 5.2 5.2a1.3 1.3 0 0 1-1.8 1.8z'),
  ),
  /** A solid cog with a hole and a gloss cut. */
  gear: art(
    24,
    f(`${GEAR}M15.2 12a3.2 3.2 0 1 0-6.4 0 3.2 3.2 0 1 0 6.4 0ZM6.5 10.6c.5-2 1.9-3.5 3.8-4.2l-.2 1c-1.4.7-2.4 1.8-2.8 3.4z`),
  ),
  /** Three bars, the middle one cut short. */
  menu: art(24, s('M4 6h16M4 12h10M4 18h16', 2.6)),
  /** A box left open at the corner, with a tick breaking out of it. */
  selectAll: art(24, s('M14.5 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5'), s('m8.5 11.5 3 3 8.5-9.5', 2.6)),
  /** Rows with a heavy plus: a Group. */
  newGroup: art(24, s('M4 7h9M4 12h6M4 17h6'), s('M17 11v9M12.5 15.5h9', 2.8)),
  /** A page with a solid folded corner and a plus: an Item. */
  newItem: art(24, s('M12.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8'), f('M14.5 2.5v5a1.5 1.5 0 0 0 1.5 1.5h5z'), s('M12 12.5v6M9 15.5h6')),
  /** A bin with a solid lid. */
  trash: art(24, f('M4.6 5.2h14.8a1.4 1.4 0 0 1 0 2.8H4.6a1.4 1.4 0 0 1 0-2.8z'), s('M9.5 5V3.4h5V5', 2), s('M6.2 10.5l.9 8.6a2 2 0 0 0 2 1.9h5.8a2 2 0 0 0 2-1.9l.9-8.6M10 12.5v5M14 12.5v5')),
  /** On and off. */
  power: art(24, s('M12 2.8v8.4', 2.8), s('M6.3 6.6a8 8 0 1 0 11.4 0', 2.6)),
  add: art(24, s('M12 4.5v15M4.5 12h15', 3)),
  remove: art(24, s('M4.5 12h15', 3)),
  /** A clock, its rim open at the top. */
  recent: art(24, s('M14.5 3.4A8.8 8.8 0 1 1 9.2 3.5'), s('M12 7.5V12l3.2 2.2', 2.6)),
  /** An open book, one page solid. */
  book: art(24, f('M2.8 4.6h6a3.2 3.2 0 0 1 3.2 3.2v12.4a2.6 2.6 0 0 0-2.6-2.6H2.8z'), s('M21.2 10V5.8h-5.6a3 3 0 0 0-3 3v11.4a2.6 2.6 0 0 1 2.6-2.6h6v-4.2', 2.2)),
  star: art(24, s(STAR, 2.2)),
  starFull: art(24, f(`${STAR}M8.4 10.6l3-.4-.3.8-2.2.3z`)),
  /** A box with a solid lid. */
  archive: art(24, f('M3.6 4h16.8a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'), s('M4.6 11.5V20h14.8v-8.5M10 13.5h4')),
  /** Research: a page with a solid magnifying glass over its corner. */
  research: art(24, s('M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21H10'), f('M15.5 9.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 1 1 0-9.6zM15.5 11.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6z'), s('m19.3 17.6 2.6 2.6', 2.8)),
  /** A picture: a frame with a solid hill and sun. */
  picture: art(24, s('M20.5 12V18.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4h10'), f('M3.6 17.6l5.2-6 3.8 4.2 2.4-2.6 5.4 5.6v.5H3.6zM17.8 5.2a2 2 0 1 1 0 4 2 2 0 1 1 0-4z')),
  /** A web page: a globe, one half solid. */
  web: art(24, s('M12 3a9 9 0 1 1-8.6 6.3'), f('M12 3a9 9 0 0 0 0 18c-2.2-2.4-3.4-5.6-3.4-9S9.8 5.4 12 3z'), s('M3.4 12h17.2', 2)),
  /** Sound: a solid note. */
  sound: art(24, f('M9 6.2 19.5 3.5v12.2a3 3 0 1 1-2-2.8V7.6L11 9.3v8.4a3 3 0 1 1-2-2.8z')),
  /** A film: a strip with its holes cut out. */
  film: art(24, f('M4.5 3.5h15a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM5.5 5.5v2h2v-2zM5.5 11v2h2v-2zM5.5 16.5v2h2v-2zM16.5 5.5v2h2v-2zM16.5 11v2h2v-2zM16.5 16.5v2h2v-2zM9.5 6v12h5V6z')),
  /** Books on a shelf, one leaning. */
  shelf: art(24, f('M3 3.5h4.2v17H3z'), s('M10.6 4.6v15.4', 3.6), s('m15.4 4.8 4-1 3.6 15.6-4 1z', 2)),
  more: art(24, f('M5 10a2 2 0 1 1 0 4 2 2 0 1 1 0-4zM12 10a2 2 0 1 1 0 4 2 2 0 1 1 0-4zM19 10a2 2 0 1 1 0 4 2 2 0 1 1 0-4z')),
  /** A solid triangle with the warning cut out of it. */
  warning: art(24, f('M10.3 3.3a2 2 0 0 1 3.4 0l8.4 14.6a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3zM10.9 8.4h2.2l-.4 6.4h-1.4zM12 16.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 1 1 0-2.6z')),
  /** A page with a solid fold. */
  page: art(24, s('M13 3H6.5a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11'), f('M15 2.6v5.2a1.2 1.2 0 0 0 1.2 1.2h5.2z')),
  /** A solid bookmark with a gloss cut. */
  bookmark: art(24, f('M6.5 2.5h11a1 1 0 0 1 1 1v18L12 17l-6.5 4.5v-18a1 1 0 0 1 1-1zM8.4 5.4h1.6v8.4l-1.6 1.1z')),
  /** An empty pot, steaming: Your Recipes with nothing in it yet. */
  pot: art(
    48,
    s('M18 9c0 3-2 3-2 6M24 6c0 3-2 3-2 6M30 9c0 3-2 3-2 6', 2.6),
    f('M8 21h32v13a9 9 0 0 1-9 9H17a9 9 0 0 1-9-9zM12.5 26.5v6.5a5.5 5.5 0 0 0 3.2 5c-1.6-1.6-2.2-3.4-2.2-5.4v-6.1z'),
    s('M8 26H3.5M40 26h4.5', 3),
    f('M5.5 18.5h37a1.5 1.5 0 0 1 0 3h-37a1.5 1.5 0 0 1 0-3z'),
  ),
  /** Board tools: the shapes a card can take. */
  shapeBox: art(24, s('M4 6h16v12H4z', 2.2)),
  shapeRounded: art(24, s('M8 6h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z', 2.2)),
  shapeOval: art(24, s('M12 6c4.6 0 8.5 2.7 8.5 6s-3.9 6-8.5 6-8.5-2.7-8.5-6 3.9-6 8.5-6z', 2.2)),
  shapeDiamond: art(24, s('M12 3.5 20.5 12 12 20.5 3.5 12z', 2.2)),
  /** Board tools: the ways a line runs between cards, each ending in an arrowhead. */
  lineStraight: art(24, s('M4.5 19.5 16 8', 2.2), f('M20 4l-2.2 8.2-6-6z')),
  lineElbow: art(24, s('M3.5 19h8V7.5H15', 2.2), f('M21 7.5l-6.5 4v-8z')),
  lineCurved: art(24, s('M3.5 19.5c7.5 0 6-12 11.5-12', 2.2), f('M21 7.5l-6.5 4v-8z')),
  /** Board tools: a new card joined on after the chosen one, or below it beside its fellows. */
  addChild: art(24, f('M2.5 8h8.5v8H2.5z'), s('M11 12h3.5', 2), s('M18.5 8.5v7M15 12h7', 2.6)),
  addSibling: art(24, f('M6 2.5h12v7.5H6z'), s('M12 10v3', 2), s('M12 15.5v7M8.5 19h7', 2.6)),
  /** Board tools: laying the cards out along their lines. */
  arrange: art(24, f('M2.5 9.5h6v5h-6z'), s('M8.5 12h3M11.5 6v12M11.5 6h3M11.5 18h3', 2), s('M15.5 3.8h6v4.4h-6zM15.5 15.8h6v4.4h-6z', 2)),
  /** Board tools: cards settle on the board's dots. */
  snap: art(24, f('M5 3.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 1 1 0-2.8zM12 3.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 1 1 0-2.8zM19 3.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 1 1 0-2.8zM5 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 1 1 0-2.8zM5 17.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 1 1 0-2.8z'), s('M10.5 10.5h9v9h-9z', 2.2)),
} satisfies Record<string, IconArt>;

export type IconName = keyof typeof ICONS;
