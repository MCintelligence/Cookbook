import { type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, PANTRY, type BookInfo, createBook, fileNameFor, saveBookInfo, writeDocument } from './book';
import { type DocumentKind, newId } from './document';
import { type BookLocation } from './platform';
import { saveOrder } from './order';
import { saveDictionary } from '../proofread/store';

/**
 * Learn to Cook: the recipe a new writer opens first. It is an ordinary
 * recipe, one Group for each part of Cookbook, so it can be read, changed and
 * deleted like any other, and Help makes a fresh one whenever it is wanted.
 * Only what Cookbook does today is in it; nothing here runs after it is made.
 */

export const LEARN_TO_COOK = 'Learn to Cook';

const KEY = 'cookbook.learnToCook';

/** Where the last Learn to Cook was made, if one ever was. Kept on this device, like the list of recipes. */
export function learnToCookLocation(storage: Pick<Storage, 'getItem'> = localStorage): BookLocation | null {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? 'null') as { location?: BookLocation } | null;
    return parsed?.location ?? null;
  } catch {
    return null;
  }
}

/** Whether Cookbook has made Learn to Cook on this device before, so it is only opened by itself once. */
export function learnedBefore(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function rememberLearnToCook(location: BookLocation, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify({ location }));
  } catch {
    // Private windows may refuse; Help then makes a new one next time.
  }
}

/** A shortcut as the writer reads it ("Ctrl+K", "⌘K"), or '' when it has none. */
export type KeyLabel = (id: string) => string;

interface Page {
  title: string;
  synopsis?: string;
  status?: 'simmering' | 'done';
  body: string;
}

interface Group {
  title: string;
  items: Page[];
}

interface Card {
  section: 'characters' | 'settings' | 'research';
  kind: DocumentKind;
  title: string;
  fields?: Record<string, unknown>;
  body: string;
}

/** "press Ctrl+K" or, when the writer has taken the shortcut off, the menu way there. */
const press = (k: KeyLabel, id: string, otherwise: string) => (k(id) ? `press ${k(id)}` : otherwise);

export function shelfOf(k: KeyLabel): Group[] {
  return [
    {
      title: 'Start here',
      items: [
        {
          title: 'Welcome',
          synopsis: 'What Learn to Cook is, and how to put it away when you’re done.',
          status: 'done',
          body: `# Welcome to Cookbook

This is **Learn to Cook**, a recipe made for trying things out. Everything in it is yours to change: type anywhere, move things about, break it. Nothing here is precious.

A *Recipe* is one piece of writing: a novel, a story, a thesis. On the left is its **Shelf**, where the writing lives, in **Groups** (like folders or chapters) and **Items** (the pages you write on). Each Group on this Shelf shows one part of Cookbook. Read them in order, or jump to the one you need.

Try these as you go:

- [ ] Click the name of the next Group, **The Shelf**, to read all of it as one page.
- [ ] Open the **Pantry** from the View menu and find Mama Lou.
- [ ] Open **Seasonings** and let Salty Sam find a spelling mistake.
- [ ] Turn on **Oven Mode** to write without distractions.
- [ ] Start a recipe of your own from File › New Recipe.
- [ ] Look anything up in the **Manual**: ${press(k, 'manual', 'open it from Help › Manual')}.

Tick a box by clicking it. Cookbook saves as you type, so there is no Save button to remember.

When you’re finished, delete this recipe like any other. Open a recipe of your own first, then open **Your Recipes** from the File menu, right-click Learn to Cook and choose **Delete**. You can always have a fresh copy from **Help › Learn to Cook**.
`,
        },
      ],
    },
    {
      title: 'The Shelf',
      items: [
        {
          title: 'Groups and Items',
          synopsis: 'Making, moving and marking Groups and Items.',
          body: `# Groups and Items

Your writing is kept in **Items**, gathered into **Groups**. A Group can hold Items and other Groups, as deep as you like: Part One › Chapter 3 › the scene in the kitchen.

Click an Item on the Shelf to open it on its own page. Click a Group’s **name** to see every Item in it as one page (more on that two pages down), and click the **arrow** beside the name to open or close the Group.

To add one, use the buttons at the bottom of the Shelf, right-click the Shelf, or open the command palette and type **New item** or **New group**. A new Item goes beside the one you’re in.

- **Move** anything by dragging it up or down the Shelf, or into another Group.
- **Rename** with a double-click, or select it and press F2.
- **Right-click** an Item or a Group for everything else: a label, a status, duplicate, move, export, snapshots, and Move to trash.
- **Pick several** with Ctrl-click (⌘-click on a Mac) or Shift-click, then right-click to label, move or delete them together.

Each Item can carry a **status**: Not started, Simmering or Done. This page is Simmering; Welcome is Done.

Hover over a Group to see how many words it holds.
`,
          status: 'simmering',
        },
        {
          title: 'Split and merge',
          synopsis: 'Cutting one Item into two, and joining two into one.',
          body: `# Split and merge

A draft rarely falls into Items the first time. Below is a section break, the three stars you get by typing * * * on a line of its own and pressing Enter.

* * *

Right-click the break and choose **Split into a new item here**. Everything after it moves into a new Item, just below this one on the Shelf.

To join them again, open the first and right-click it on the Shelf: **Merge with next**. Cookbook takes a snapshot before splitting or merging, so you can always go back (App Settings › Saving and backups can turn this off).
`,
        },
        {
          title: 'Mise en Place',
          synopsis: 'A whole Group as one page.',
          body: `# Mise en Place

**Mise en Place** sets out a whole Group on one page. Click a Group’s name on the Shelf (or select it and press Enter) and every Item inside it appears in Shelf order, one after another, with a thin line between them. If you clicked **The Shelf** to get here, you are in it now: scroll up and the pages before this one are right there.

Write anywhere. Click into an Item’s text and the cursor lands where you clicked; the arrow keys at the start or end of an Item carry on into the one before or after. Each Item is still its own page on the Shelf, saved, proofread and undone on its own. The bar at the bottom shows the Group’s Items and words.

- ${k('mise') ? `**${k('mise')}** switches` : 'View › **Mise en Place** switches'} between the Item you’re in on its own page and its whole Group, with the cursor where it was.
- Right-click a Group and choose **Show as one page**, or find a Group by name: ${press(k, 'switcher', 'Edit › Go to an item or card')}.
- An empty Group opens as an empty page. Start typing and a new Item is made in it; Undo takes it away again.

To go back to one Item, click it on the Shelf.
`,
        },
      ],
    },
    {
      title: 'Writing',
      items: [
        {
          title: 'Typing and formatting',
          synopsis: 'Shortcuts that format as you type, and the insert menu.',
          body: `# Typing and formatting

Cookbook tidies as you type. "Straight quotes" turn curly, two hyphens -- make an em dash, and three dots make an ellipsis.

Markdown works too, if you know it. Try each on an empty line below:

- \`**bold**\`, \`*italic*\` and \`_underline_\`
- \`# \` at the start of a line for a chapter title, \`> \` for a quote
- \`- \` for a bulleted list, \`-1 \` for a numbered one, \`-TD \` for a checklist
- \`!\` before a word, as in \`!Sword\`, makes its first letter a drop cap, like the !Dragon here. At the start of a paragraph it drops two lines deep. Click into the word to see the ! again.

Don't want some of these? App Settings › Writing turns Markdown off, or any one rule on its own.

Type **/** at the start of a line for the **insert menu**: styles, lists, a table, a section break or a footnote. Or use the Insert and Format menus at the top.

Paste from Word, Scrivener or the web and the bold, italic, headings and tables come with it. Edit › **Paste as plain text** leaves them behind.

Type here:

`,
        },
        {
          title: 'Styles and footnotes',
          synopsis: 'Paragraph and character styles, and footnotes at the foot of the page.',
          body: `# Styles and footnotes

Every paragraph has a **style**. This one is Body text; the line above is a Chapter title. Change a paragraph’s style from the Format menu, or right-click it.

::: letter
Dear writer, this paragraph is in the Letter style. Change how Letter looks once, in App Settings › Styles, and every letter in the recipe follows.
:::

Character styles work the same way for words inside a paragraph: [Strong]{.strong} and [Emphasis]{.emphasis} are two. ${k('strong') ? `${k('strong')}, ${k('emphasis')} and ${k('underline')} apply them.` : ''}

Footnotes sit in the text like this one.^[Footnotes are edited at the foot of the page. Click the number to change this one.] Add one from Insert › **Footnote**${k('footnote') ? ` or with ${k('footnote')}` : ''}.

The page itself, its size, margins and indents, is set in **Recipe › Configure this recipe**.
`,
        },
        {
          title: 'Suggesting changes',
          synopsis: 'Track changes: edits marked to accept or reject later.',
          body: `# Suggesting changes

Turn on Edit › Track changes › **Suggest changes**${k('suggest') ? ` (${k('suggest')}${k('suggestAlt') ? ` or ${k('suggestAlt')}` : ''})` : ''} and every edit becomes a suggestion. New words are [underlined in colour]{.ins}, and words you delete stay on the page, [struck through]{.del}, until you decide.

Try it on this sentence: the soup was [very ]{.del}[gloriously ]{.ins}hot, and [*thick*]{.fmt}.

::: {change=ins}
Press Enter and the new paragraph gets a ¶ in the margin, like this one. Join two paragraphs with Backspace and they stay apart, with the ¶ struck through. Bold, italics and other formatting get a dotted line, and a new paragraph style a bar in the margin.
:::

Right-click a change to **Accept** or **Reject** it, or use Edit › Track changes to step through them one by one, or accept or reject every change on the page, or in the whole recipe, at once. The word **Suggesting** sits in the bottom bar while it is on; click it to stop.

Exporting as Word keeps your suggestions as Word’s own tracked changes, and a Word file with tracked changes comes in with them as suggestions.

Plate, Serve and exports show the text as if every change were accepted, and words waiting to be deleted don’t count towards your goals.
`,
        },
      ],
    },
    {
      title: 'The Pantry',
      items: [
        {
          title: 'Names on the page',
          synopsis: 'Characters, settings and materials, kept beside your writing.',
          body: `# Names on the page

The **Pantry** keeps everything that isn’t the writing itself: **Characters**, **Settings** and **Materials**. Open it from View › Pantry, or with the Pantry button in the bar at the top.

This recipe’s Pantry already has Mama Lou, her daughter June, and the Kitchen. Look:

Mama Lou wiped her hands on her apron and looked across the Kitchen at June.

Cookbook finds Pantry names in your writing by itself, so Mama Lou and June above are links. **Hover over a name** to peek at the card; click the peek to open it, or pin it beside the page to keep it in view while you write.

To type a name from the Pantry, type **@** after a space${k('shelf') ? ` or press ${k('shelf')}` : ''} and pick it from the list.

On a character or place card, click the **+** on an empty line to add brainstorming questions, like What do they want? and What are they hiding?

Right-click any words on the page and choose **Make it a Pantry card** to start a new card from them.
`,
        },
      ],
    },
    {
      title: 'Seasonings',
      items: [
        {
          title: 'Meet the seasonings',
          synopsis: 'Four seasonings check your writing, each tasting for something different.',
          body: `# Meet the seasonings

Cookbook checks your writing on this device, with no account and nothing sent anywhere, using four **Seasonings**. Each recipe picks its own. Open them from View › Seasonings${k('seasonings') ? ` or with ${k('seasonings')}` : ''}.

- **Salty Sam** checks spelling, and near misses of names in the Pantry.
- **Peppery Pete** checks grammar and punctuation.
- **Drunk Daniel** measures how much of the open page is dialogue.
- **Spicy Sally** tastes for style: adverbs, tired phrases, wordiness.

Salty Sam is already picked for this recipe. Click the **+** at the bottom of Seasonings to add the other three, then watch what they find below:

The soup was teh best in town, and Mamma Lou knew it.

She had a apple pie cooling on the sill.

"Don't touch that, June said.

The MOnster in the cellar was only the boiler.

She very quickly and really suddenly ran, and at the end of the day the end result was a free gift.

Each seasoning's card has a meter for this page, a Check that shows or hides its underlines (Daniel's dims the narration instead), and a **Report** button: try Sam's report on this page. Reports are kept in the Pantry, under Materials › Seasoning Reports.

A Check is one switch for the whole recipe: turn it on or off once and every Item follows, in Mise en Place too.

Close Seasonings and keep writing: the underlines stay, and every picked seasoning with its Check on keeps tasting the page. The number beside the **Seasonings** button says how many of them have something to say; close the panel now and watch it go down as you fix the slips above.

Click an underlined word for a suggestion. Right-click it to add a word to your dictionary or remove the mark for good. ${k('nextIssue') ? `${k('nextIssue')} jumps to the next issue.` : ''}

Which checks run, and American or British spelling, are in App Settings › Seasonings.
`,
        },
      ],
    },
    {
      title: 'Stove and Oven',
      items: [
        {
          title: 'Oven Mode and views',
          synopsis: 'Writing without distractions, and other ways to see the page.',
          body: `# Oven Mode and views

Cookbook has two modes. **Stove Mode** is the normal view, with the Shelf and panels around you. **Oven Mode** is for focus: it hides everything but the page and fades all but where you are writing. Turn it on from the View menu${k('focus') ? ` or with ${k('focus')}` : ''}, and the same way off again.

Nothing is gone in Oven Mode, only tucked away. Rest the pointer on the **left edge** of the window (or click it) and the Shelf slides in over the page; the **right edge** brings in the Pantry, or Seasonings if that was open. The Pantry and Seasonings buttons in the top bar work too${k('goShelf') ? `, and so do ${[k('goShelf'), k('goPantry'), k('goSeasonings')].filter(Boolean).join(', ')}` : ''}. Click the page or press Escape and it slides away again; a second Escape goes back to Stove Mode.

Also in the View menu:

- **Typewriter scrolling** keeps the line you’re typing in the middle of the window.
- **Paper** shows the page as a sheet; **Draft** is a plain column of text.
- **Zoom** and **Theme**: Light, Dark, Sepia, or follow your computer.
- **Mise en Place** shows a whole Group as one page; click **The Shelf** to read the whole thing from start to finish.

To read one Item while writing another, right-click it on the Shelf and choose **Open beside this one**.
`,
        },
      ],
    },
    {
      title: 'Goals',
      items: [
        {
          title: 'Goals and writing history',
          synopsis: 'A daily target, a whole-recipe target and a deadline.',
          body: `# Goals and writing history

The ring in the bar at the bottom of the window fills as you reach today’s goal, and your streak grows each day you do. Click it for **Goals**.

In Goals, set:

- **Words a day**, to fill the ring.
- **Whole recipe**: the words you’re aiming for in total.
- **Deadline**, and Cookbook works out the words a day you need.

**Writing history** shows what you wrote each day. Pasted text doesn’t count, unless you say so in App Settings › Goals.

You can also give an Item a goal of its own; the bottom bar then shows how close it is.
`,
        },
      ],
    },
    {
      title: 'Keeping it safe',
      items: [
        {
          title: 'Saving, snapshots and backups',
          synopsis: 'Where your words go, and how to get them back.',
          body: `# Saving, snapshots and backups

Cookbook saves as you type. A recipe is an ordinary folder of Markdown files, so it opens in any text editor and nothing is locked inside Cookbook.

- **Snapshots** keep earlier versions of one Item. Take one from Recipe › Snapshots of this item, then compare and roll back whenever you like.
- **Backups** are zips of the whole recipe, made every half hour while you write and when you close. Each one is opened again as it is made, to check it is whole. File › **Back up now** makes one at once. App Settings › Saving and backups says where they go; choosing a folder on another drive, or one that syncs to the cloud, keeps them safe if this computer is lost.
- **Trash** keeps whatever you delete until you empty it: File › Trash.
- **Undo** reaches back past closing the app.
`,
        },
        {
          title: 'Sharing your recipe',
          synopsis: 'Plate and serve, export, print and import.',
          body: `# Sharing your recipe

When it’s ready for readers, Recipe › **Plate and serve** sets it like a real book: pick a template and a trim size, add a title page, a dedication and contents, and watch the pages change. **Serve** then makes an EPUB e-book or a print-ready PDF.

For a plain copy, File › **Export** makes a Word document, an EPUB e-book or Markdown, and **Print or save as PDF** does what it says. One Group or Item can be exported alone from its right-click menu.

Leave an Item out of every export by right-clicking it and unticking **Include in export**.

To bring writing in, File › **Import files** takes Word, Markdown and plain text files and turns them into Items.

Coming from Scrivener? File › **Import Scrivener project** turns a whole project into a new recipe: the Draft goes on the Shelf, and Characters, Places and Research go to the Pantry. Comments stay on the words they were on (right-click to read one), document notes go to the Pantry, snapshots come with their Items, and pictures and PDFs become Materials cards. The Scrivener project itself is never changed.
`,
        },
      ],
    },
    {
      title: 'Finding your way',
      items: [
        {
          title: 'Search and shortcuts',
          synopsis: 'The command palette, search, and getting around by keyboard.',
          body: `# Search and shortcuts

The fastest way to anything is the **command palette**: ${press(k, 'palette', 'open it from Help › Command palette')} and type what you want, such as “oven” or “export”.

- **Go to an Item, a Group or a card**: ${press(k, 'switcher', 'Edit › Go to an item or card')} and type part of its name. A Group opens as one page.
- **Search** the whole recipe: ${press(k, 'find', 'Edit › Search')}. Replace is there too.
- **Find an Item on the Shelf** by typing in the search field under its heading.
- **Move between parts of the window** with F6 and Shift+F6.

Every shortcut is listed, and can be changed, in Help › Keyboard shortcuts.
`,
        },
      ],
    },
    {
      title: 'Your own recipe',
      items: [
        {
          title: 'Start cooking',
          synopsis: 'Making a recipe of your own.',
          body: `# Start cooking

When you’re ready to write, choose File › **New Recipe**. Pick a template, Novel, Short story, Nonfiction or Empty, give it a name, and it opens ready to write.

**Your Recipes**, in the File menu, lists them all. Star the ones you love, archive the finished ones, or keep a series together.

App Settings has everything else, from the theme to how your words are saved${k('settings') ? `: ${k('settings')}` : ''}.

When you no longer need Learn to Cook, open your own recipe, then right-click Learn to Cook in Your Recipes and choose **Delete**. **Help › Learn to Cook** brings back a fresh copy whenever you want one.

Happy cooking.
`,
        },
      ],
    },
  ];
}

export const PANTRY_CARDS: Card[] = [
  {
    section: 'characters',
    kind: 'character',
    title: 'Mama Lou',
    fields: { role: 'Runs the Kitchen', age: '62', wants: 'To hand the Kitchen to June', fears: 'That June doesn’t want it', aka: ['Lou'] },
    body: 'An example character. Change anything here, or click the + on an empty line below for brainstorming questions.\n\n',
  },
  {
    section: 'characters',
    kind: 'character',
    title: 'June',
    fields: { role: 'Mama Lou’s daughter', age: '29', wants: 'A kitchen of her own', fears: 'Turning into her mother' },
    body: '',
  },
  {
    section: 'settings',
    kind: 'setting',
    title: 'Kitchen',
    fields: { role: 'Where everything happens', when: 'Every evening since 1971', offers: 'Warmth, and an audience', threatens: 'The boiler in the cellar' },
    body: 'An example setting. Settings have their own fields: what the place offers and what it threatens.\n',
  },
  {
    section: 'research',
    kind: 'research',
    title: 'Materials',
    body: 'Materials hold anything you need to keep to hand: sources, links, pictures, timelines. Unlike characters and settings, they have no fields, just the page.\n',
  },
];

/** The Item Learn to Cook opens at. */
export const FIRST_ITEM = joinPath(BOOKSHELF, 'Start here', 'Welcome.md');
const SEASONINGS_ITEM = joinPath(BOOKSHELF, 'Seasonings', 'Meet the seasonings.md');

/** Lays out Learn to Cook in an empty folder. Run inside makeBookOrUndo. */
export async function makeLearnToCook(fs: StorageAdapter, k: KeyLabel): Promise<BookInfo> {
  const info: BookInfo = {
    ...(await createBook(fs, LEARN_TO_COOK)),
    // Sam is picked, so a misspelling shows at once; the writer adds the others on the Seasonings page.
    seasonings: { chosen: ['sam'], tracked: [SEASONINGS_ITEM], gone: [] },
  };
  const order: Record<string, string[]> = { [BOOKSHELF]: [] };
  for (const group of shelfOf(k)) {
    const folder = joinPath(BOOKSHELF, fileNameFor(group.title));
    await fs.makeFolder(folder);
    order[BOOKSHELF]!.push(fileNameFor(group.title));
    order[folder] = [];
    for (const item of group.items) {
      const name = `${fileNameFor(item.title)}.md`;
      order[folder]!.push(name);
      const fields = { ...(item.status && { status: item.status }), ...(item.synopsis && { synopsis: item.synopsis }) };
      await writeDocument(fs, joinPath(folder, name), { id: newId(), title: item.title, kind: 'scene', fields, body: item.body });
    }
  }
  const byId = new Map<string, string>();
  for (const card of PANTRY_CARDS) byId.set(card.title, newId());
  for (const card of PANTRY_CARDS) {
    const fields = { ...card.fields };
    // The two characters are linked, to show relationships.
    if (card.title === 'June') fields.relationships = [{ to: byId.get('Mama Lou'), as: 'Daughter of' }];
    if (card.title === 'Mama Lou') fields.relationships = [{ to: byId.get('June'), as: 'Mother of' }];
    await writeDocument(fs, joinPath(PANTRY, card.section, `${fileNameFor(card.title)}.md`), { id: byId.get(card.title)!, title: card.title, kind: card.kind, fields, body: card.body });
  }
  await saveOrder(fs, order);
  // Key names in the shortcuts, and Mise en Place, aren't spelling mistakes; the writer's own recipes start without them.
  await saveDictionary(fs, ['Ctrl', 'Alt', 'Mise']);
  await saveBookInfo(fs, info);
  return info;
}
