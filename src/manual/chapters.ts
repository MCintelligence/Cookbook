/**
 * The manual, shipped inside Cookbook so it works offline. Each chapter is
 * written in a small Markdown: paragraphs, "## " headings, "- " lists,
 * "| a | b |" tables, **bold**, *italic* and `code`. {key:id} becomes the
 * writer's own shortcut for a command (see shortcuts.ts), and {key:id|words}
 * says the words instead when they have taken that shortcut off.
 *
 * Keep it to what Cookbook does today, in the names the app uses, and change
 * it in the same pull request as the feature it describes.
 */

export interface Chapter {
  id: string;
  title: string;
  /** One line under the title, and what the contents list shows on hover. */
  summary: string;
  body: string;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    summary: 'What Cookbook is, and where to start.',
    body: `Cookbook is a writing app that works offline, with no account. Your writing stays on this device, in ordinary files you can open anywhere, and the proofreader runs here too: nothing you write is sent anywhere.

## The words Cookbook uses

| Word | What it is |
| --- | --- |
| **Recipe** | One piece of writing: a novel, a story, a thesis, a journal. |
| **Shelf** | The list on the left where a recipe's writing lives. |
| **Group** | A folder on the Shelf, such as a part or a chapter. Groups hold Items and other Groups. |
| **Item** | One page you write on, such as a scene. |
| **Pantry** | Everything that isn't the writing itself: Characters, Settings (places) and Materials (research). |
| **Seasonings** | The proofreader: four characters who each read for one thing. |
| **Mise en Place** | A whole Group set out as one page. |
| **Stove Mode** and **Oven Mode** | The normal view, and focus mode. |
| **Plate** and **Serve** | Setting the finished book like a real one, and making the e-book or PDF. |

## Where to start

- **Learn to Cook** (Help › Learn to Cook) is a recipe made for trying things out, with a Group for each part of Cookbook. Change it or delete it; Help makes a fresh copy whenever you want one.
- **Set the Table** (Help › Set the Table…) asks the welcome questions again: your name, your English, what you write, the look, a daily goal and your Seasonings.
- This manual opens from Help › Manual, with {key:manual|Help › Manual} or from the command palette. The search at the top finds any word in it.`,
  },
  {
    id: 'recipes',
    title: 'Recipes',
    summary: 'Starting, opening and keeping recipes.',
    body: `Each piece of writing is a **recipe**. Click the recipe's title in the top bar, or choose File › Your Recipes…, to see them all.

## Your Recipes

Your Recipes lists every recipe on this device. Search them, sort them, star the ones you love, archive the finished ones and keep a series together. Right-click a recipe for everything you can do with it, including Delete. **Open a recipe's folder…** opens one kept somewhere else.

## A new recipe

File › **New Recipe…** offers a starting point down the left:

- **Novel**: a Group of Items, with a main character and a place in the Pantry.
- **Short story**: a single Item and a main character.
- **Nonfiction**: a Group of Items, with a note for your sources.
- **Empty**: one blank Item and an empty Pantry.

Your own templates sit below them, in groups you make. Any recipe can be saved as a template from New Recipe, with or without its text. Give the recipe a title, and if you like a series, its number in the series and a word goal.

A new recipe starts with the Seasonings you chose in Set the Table, and your name on its title page when you plate it. App Settings › General changes both.

## Where recipes are kept

In the desktop app a recipe can live in any folder: Dropbox, iCloud, a USB stick, a Git repository. In the browser, recipes are kept in the browser's own storage, and Chrome and Edge can also open a real folder on your computer. See **Your files** for what's inside.`,
  },
  {
    id: 'shelf',
    title: 'The Shelf',
    summary: 'Groups and Items: making, moving and marking them.',
    body: `The Shelf on the left holds the recipe's writing: **Items** you write on, gathered into **Groups** that nest as deep as you like (Part One › Chapter 3 › the kitchen scene).

- **Open** an Item by clicking it. Click a Group's **name** to see all of it as one page (see **Mise en Place**), and the arrow beside it to open or close it.
- **Add** with the buttons at the foot of the Shelf, its right-click menu, or New item ({key:newScene|no shortcut}) and New group in the command palette. Right-click the Shelf for New item from template: a blank Item, a chapter opener or a letter.
- **Move** by dragging up or down, or onto a Group to put it inside. On a touch screen, press and hold first. From the keyboard, Alt+↑ and Alt+↓ move the focused row.
- **Rename** with a double-click, or select it and press F2.
- **Pick several** with Ctrl-click (⌘-click on a Mac) or Shift-click, then right-click to label, move or delete them together.
- **Right-click** an Item or Group for everything else: status, label, duplicate, put it in a new Group, export, snapshots, open beside this one, and Move to trash.

Each Item has a **status**, Not started, Simmering or Done, shown as a dot on the Shelf and in the bottom bar, never on the page. Hover over a Group to see the words inside it.

Moving never renames a file unless the Group it lands in already has one of the same name.`,
  },
  {
    id: 'writing',
    title: 'Writing on the page',
    summary: 'Typing shortcuts, styles, footnotes, and splitting and merging.',
    body: `Cookbook saves as you type, so there is no Save button to remember ({key:save|nothing to press} saves anything still waiting at once).

## Typing shortcuts

| Type | You get |
| --- | --- |
| \`**bold**\`, \`*italic*\`, \`_underline_\` | Strong, Emphasis, Underline ({key:strong|Format menu}, {key:emphasis|Format menu}, {key:underline|Format menu}) |
| \`~~struck~~\`, or a word between backticks | Strikethrough, code |
| \`# \`, \`## \`, \`### \` at the start of a line | a heading |
| \`> \` at the start of a line | a quote |
| \`- \` at the start of a line | a bulleted list |
| \`-1 \` or \`1. \` at the start of a line | a numbered list |
| \`-TD \` at the start of a line | a checklist |
| \`* * *\` then Enter | a section break |
| \`!Word\` | a drop cap on the word's first letter |
| \`--\` | an em dash |
| \`"\` and \`'\` | curly quotes |
| **/** at the start of a line | the insert menu |
| **@** after a space | a name from the Pantry |

Backspace straight after a shortcut turns it back into exactly what you typed. App Settings › Writing › Markdown turns all of them off at once, or any one on its own.

## Drop caps

Put **!** before a word, as in \`!Dragon\`, and its first letter becomes a drop cap: two lines deep at the start of a paragraph, a raised initial anywhere else. Click into the word to see the ! again. The file keeps the !, and Plate sets it in the finished book.

## Styles

Every paragraph has a **paragraph style** (Body, Chapter title, Letter, and any you add), and words inside it can have a **character style** (Strong, Emphasis, Thought…). Pick one from the Format menu, the insert menu or the right-click menu. Change how a style looks once in Recipe Settings › Styles and everything in that style follows. Format › Clear formatting takes direct formatting off.

## Fonts

The Font menu lists Cookbook's own fonts, then the ones installed on your computer. A font you install while Cookbook is open shows up the next time you come back to Cookbook or open a font menu, with no restart. If one is still missing, pick **Refresh fonts** at the bottom of the menu.

## Footnotes

Insert › Footnote ({key:footnote|no shortcut}) puts a footnote number at the cursor. Footnotes are written at the foot of the page; click a number to change its note.

## Pasting

Paste from Word, Scrivener or the web and bold, italic, headings and tables come with it. Edit › **Paste as plain text** leaves them behind.

## Splitting and merging

Click a section break (\`* * *\`) to **split** the Item there: everything after it becomes a new Item just below. Right-click an Item on the Shelf for **Merge with next**. Cookbook takes a snapshot before either, and the words moved don't count towards today's goal.`,
  },
  {
    id: 'mise',
    title: 'Mise en Place',
    summary: 'A whole Group, or several, as one page.',
    body: `**Mise en Place** sets out a whole Group on one page. Click a Group's name on the Shelf, or select it and press Enter, and every Item inside it appears in Shelf order, one after another, with a thin line between them.

- **Write anywhere.** Click into an Item's text and the cursor lands where you clicked; the arrow keys at the start or end of an Item carry on into the next. Each Item is still its own file, saved, proofread and undone on its own.
- **Switch** between the Item you're in on its own page and its whole Group with {key:mise|View › Mise en Place}. The cursor stays where it was.
- **Several Groups**: Ctrl-click (⌘-click) or Shift-click Groups on the Shelf, or press ⌘A (Ctrl+A) there, and they show together in Shelf order. The page stays at the Group you were on, with the earlier Groups above and the later ones below.
- **An empty Group** opens as an empty page. Start typing and a new Item is made in it; Undo takes it away again.

Long Groups load as you scroll. The bottom bar shows the Group's Items and words. To go back to one Item, click it on the Shelf.`,
  },
  {
    id: 'changes',
    title: 'Track changes',
    summary: 'Suggest edits, then accept or reject them.',
    body: `Turn on **Suggest changes** with {key:suggest|Edit › Track changes › Suggest changes} (or {key:suggestAlt|the second key in App Settings › Keyboard}) and every edit becomes a suggestion instead of going straight in. Insert puts changes in without taking anything away; on a Mac, whose keyboard has no Insert key, ⌘⇧E does the same.

- **New words** are underlined in the accent colour.
- **Deleted words** stay on the page, struck through, until you decide. Backspace walks back over them, so you can keep deleting.
- **A new paragraph** (Enter) gets a ¶ in the margin. **Joining two** (Backspace at the start of one, or Delete at the end) keeps them apart, with the ¶ struck through.
- **Formatting** such as bold, italics, character styles, font, size and colour gives the words a dotted underline. Rejecting it puts the old look back.
- **A new paragraph style**, alignment or spacing puts a bar in the margin.
- Deleting words or paragraphs you suggested yourself just takes them out.

Suggest changes is set for the whole recipe, so every Item follows it, and the word **Suggesting** sits in the bottom bar while it is on. Click it to stop. Lists and tables are tracked word by word; their items and rows change straight away.

## Accepting and rejecting

Right-click a change for **Accept change** or **Reject change**. Edit › **Track changes** also has Next change and Previous change, Accept all or Reject all on this page, and **Accept all in the recipe** or **Reject all in the recipe**. With text selected, Accept and Reject work on every change inside it. Undo takes back any change on the page; settling the whole recipe takes a snapshot of every other Item it changes first.

## Word files

**Export as Word** keeps your suggestions as Word's own tracked changes, with your name from App Settings as their author, so an editor can accept or reject them in Word. Accept all first for a clean copy. Importing a Word file brings its tracked changes in as suggestions: inserted and deleted words, new and joined paragraphs, formatting and paragraph styles.

Plate, Serve and other exports show the text as if every change were accepted, and words waiting to be deleted don't count towards your goals or word counts.`,
  },
  {
    id: 'pantry',
    title: 'The Pantry',
    summary: 'Characters, Settings and Materials, linked to your writing.',
    body: `The **Pantry** keeps everything that isn't the writing itself. Open it with the Pantry button in the top bar or View › Pantry. It has three parts:

- **Characters**: the people in your story.
- **Settings**: the places.
- **Materials**: research, notes, sources, and the Seasonings' reports.

Each part holds **Items** (cards), in Groups of your own, nested as deep as you like. The search at the top looks at names, nicknames and fields. The + button makes a new card.

## A card

A card opens on the page like an Item. Above the writing are its portrait, the other names it goes by, its fields (role, age, wants and fears for a character; role, when, offers and threatens for a place; or any you add) and its relationships. A relationship such as "Mother of June" links two cards and shows on both.

On a character or place card, put the cursor on an empty line and click the **+** beside it for brainstorming questions: Basics, Drive, and World on Fire. Each one is an ordinary heading, and one Undo takes out what you just added.

Right-click words on the page and choose **Make it a Pantry card** to start a card from them.

## Linked names

Every character's and place's name, and its other names, is linked wherever it appears in your writing, with nothing added to the file. Names match whole words and their capitals, so June the cook isn't the month of june. Hover a name, or press and hold on a touch screen, to peek at its card. Each card lists the Items it appears in.

## Names while you write

Type **@** after a space, or press {key:shelf|Edit › Name from the Pantry}, to search every card. Enter inserts the name, ⌘Enter (Ctrl+Enter) pins the card beside the page, and ⌘⇧Enter (Ctrl+Shift+Enter) opens it in the Pantry. Pinned cards stay beside the page until you unpin them.`,
  },
  {
    id: 'seasonings',
    title: 'Seasonings',
    summary: 'The proofreader: Salty Sam, Peppery Pete, Drunk Daniel and Spicy Sally.',
    body: `The **Seasonings** proofread on this device, with nothing sent anywhere. Open them with the Seasonings button in the top bar or {key:seasonings|View › Seasonings}. Each recipe picks its own, and the + at the bottom adds more.

| Seasoning | Reads for | Meter |
| --- | --- | --- |
| **Salty Sam** | Spelling, and near misses of Pantry names | Unsalted to Seawater: slips per 1,000 words |
| **Peppery Pete** | Grammar, punctuation, quotes left open, stray capitals | Plain to Smoking: slips per 1,000 words |
| **Drunk Daniel** | How much of the page is dialogue | Sober to Drunk |
| **Spicy Sally** | Style: adverbs, clichés, passive voice, sticky sentences | Mild to Inferno: how hard the page is to read |

Each seasoning is one card: a remark in its own voice, its meter for the open page, a **Check** switch and a **Report** button.

- **Check** shows or hides its underlines. With Check off, its meter keeps counting. Drunk Daniel's Check dims the narration so only the speech stands out. A Check is one switch for the whole recipe: every Item, Mise en Place and split view follow it.
- Close Seasonings and the checks keep running: the underlines stay on the page, and the number beside the Seasonings button says how many seasonings have something to say.
- Spelling is a red wavy underline, grammar a blue one, and Sally marks style in chili red. A word is only checked once you've moved past it.
- **Fix** a slip by clicking its underline and picking a suggestion. {key:nextIssue|F7} steps to the next, {key:prevIssue|Shift+F7} to the one before.
- **Right-click** an underlined word to add it to your dictionary or remove the mark for good.
- **Report** opens a window with the seasoning's verdict, its numbers, a few things to try first, and everything it found. Each report is also kept as a card in Pantry › Materials › Seasoning Reports.

## Your English

Salty Sam spells in American, British, Canadian or Australian English. A recipe uses the English you chose in Set the Table (App Settings › General › Your English) until it picks its own in Recipe Settings › Seasonings. New Zealand English uses the Australian word list; Irish, Indian and South African English use the British one.

Every character's and place's name counts as a word. Your own words go in \`dictionary.txt\` in the recipe's folder, one a line; Recipe Settings › Seasonings shows them and can bring back every mark you removed.`,
  },
  {
    id: 'modes',
    title: 'Stove Mode and Oven Mode',
    summary: 'The normal view, focus mode, and other ways to see the page.',
    body: `**Stove Mode** is the normal view, with the Shelf, toolbar and panels around the page.

**Oven Mode** is for focus: the panels step aside and the page fades everything but the paragraph or sentence you're in (App Settings › Writing chooses which). The Shelf waits off the left edge and the Pantry or Seasonings off the right: rest the pointer on an edge, or click it, and the panel slides in over the page, then slides away again when you move off it. Turn it on with {key:focus|View › Oven Mode}, the page's right-click menu or the command palette. Press it again, press Escape, or click Oven Mode in the bottom bar to go back to Stove Mode.

Also in the View menu:

- **Typewriter scrolling** keeps the line you're typing in the middle of the window.
- **Paper** shows the page as a sheet; **Draft** is a plain column of text. The page's size, margins and indents are in Recipe Settings › Layout.
- **Zoom**: the percentage in the bottom bar opens a slider; ⌘= and ⌘− (Ctrl+= and Ctrl+−) zoom, ⌘0 (Ctrl+0) goes back to 100%.
- **Open beside this one** (right-click an Item) shows another Item next to the one you're writing.
- **Full screen**: the desktop app starts full screen. On Windows and Linux, F11 or View › Full screen switches it; on a Mac, use Window › Enter Full Screen.`,
  },
  {
    id: 'goals',
    title: 'Goals and history',
    summary: 'A daily goal, a whole-recipe target, a deadline and your streak.',
    body: `The ring in the bottom bar fills as you reach today's goal, and your streak grows each day you do. Click it for **Goals**:

- **Words a day**, to fill the ring. A recipe that hasn't set its own uses your daily goal from App Settings › General.
- **Whole recipe**: the words you're aiming for in total.
- **Deadline**, and Cookbook works out the words a day you need.

**Writing history** shows the words written and deleted each day, by day, week or month, and exports them as a CSV file. Pasted text doesn't count unless you turn that on in Recipe Settings › Goals, where you can also keep weekends off from breaking the streak. Splitting or merging Items never counts.

An Item can have a goal of its own; the bottom bar then shows how close it is.`,
  },
  {
    id: 'plate',
    title: 'Plate and Serve',
    summary: 'Setting the finished book, and making the e-book or PDF.',
    body: `Recipe › **Plate and serve…** shows your recipe as it will reach readers, set like a published book rather than a manuscript. Nothing here changes the Shelf.

- **Book** (left): the front matter (title page, copyright, dedication, contents), the chapters, one for each top-level Group or Item on the Shelf, and the back matter (acknowledgements, about the author). Tick or untick each one, drag to reorder (or Alt+↑ and Alt+↓), and click a front or back part to write its text.
- **The pages** (middle): a two-page print spread (← and → turn the pages) or an e-book reader.
- **Style** (right): a template (Classic, Modern, Literary, Cozy), the trim size (5 × 8, 5.5 × 8.5 or 6 × 9 inches), the font, size and line spacing, the chapter opener and the scene break, and switches for drop caps, running headers, page numbers and chapters starting on a right-hand page.

Plate settings are kept with the recipe and save as you change them. **Serve** makes an EPUB e-book, or a print-ready PDF through the print dialog's Save as PDF, page for page as the preview shows.

## Plain exports

File › **Export** makes a Word document, an EPUB or Markdown of the manuscript as it is, and **Print or save as PDF** prints it. Right-click a Group or Item to export it alone, or untick **Include in export** to leave an Item out. File › **Import files…** brings in Word, Markdown and plain text as new Items.

## Coming from Scrivener

File › **Import Scrivener project…** turns a whole Scrivener 2 or 3 project into a new recipe. Choose the project’s .scriv folder (or the folder it sits in); a zip of it, such as one of Scrivener’s backups, works through **Import files…** too. Your recipe is backed up first, and the Scrivener project is only read, never changed.

- The **Draft** (Manuscript) goes on the Shelf in Binder order: folders become Groups and documents become Items. A document with documents inside it becomes a Group whose first Item holds its own text.
- A **Characters** folder goes to the Pantry’s Characters, a **Places**, Locations or Settings folder to Settings, and **Research** and every other folder to Materials. The Trash is left behind.
- Titles, synopses, status, label colours and Include in Compile come with each document, and so do bold, italic, underline, strikethrough, links, footnotes, headings and scene breaks. Fonts and sizes take your recipe’s look.
- PDFs, pictures and web pages stay in Scrivener, and Cookbook says how many there were. Document notes, comments and snapshots aren’t brought in yet.`,
  },
  {
    id: 'safe',
    title: 'Keeping it safe',
    summary: 'Saving, undo, snapshots, the trash and backups.',
    body: `Your words are saved as you type. On top of that:

- **Undo** reaches back past closing an Item or the app. If an Item was changed in another app, its undo history starts again; your text is never touched.
- **Snapshots** keep earlier versions of one Item. Take one from Recipe › Snapshots of this item, then compare and roll back whenever you like. Cookbook takes one before a split, merge or Replace all.
- **Trash** keeps whatever you delete until you empty it: File › Trash.
- **Backups** zip the whole recipe every half hour while you write, when you close Cookbook or open another recipe, and after a crash. File › **Back up now** makes one straight away.

Each backup is opened again as soon as it's written and checked against the recipe. Cookbook keeps the newest 10 (or 25, or all), plus one a day for the last week and one a week for the last month. **Restore** opens a copy of the recipe as it was, beside your own; it never writes over it.

Backups go to Cookbook's own folder, on the same disk as your recipes, unless you choose another in App Settings › Saving and backups. A synced or external folder is the best protection against a lost or broken computer.`,
  },
  {
    id: 'finding',
    title: 'Finding your way',
    summary: 'Search, the command palette, and moving round by keyboard.',
    body: `- **Command palette**: {key:palette|Help › Command palette} and type what you want, such as "oven", "export" or "manual".
- **Go to an Item, Group or card**: {key:switcher|Edit › Go to an item or card} and type part of its name. A Group opens as one page.
- **Search**: {key:find|Edit › Search} finds and replaces in the open Item, and lists every other Item and Pantry card that matches. Words match from their start and by stem, so "corn" finds "cornbread" and "run" finds "running".
- **Search the Shelf**: the field under the Shelf's heading lists the Items whose name or text matches, like the Pantry's search does for cards. Escape empties it.
- **Parts of the window**: F6 and Shift+F6 go round the toolbar, Shelf, page and panels. {key:goPage|no shortcut} goes to the page, {key:goShelf|no shortcut} the Shelf, {key:goPantry|no shortcut} the Pantry, {key:goSeasonings|no shortcut} Seasonings and {key:goToolbar|no shortcut} the toolbar. Escape in the Shelf or a panel goes back to the page.

Every menu is in the top bar: File, Edit, View, Insert, Format, Recipe and Help. Right-click almost anything for what you can do with it.`,
  },
  {
    id: 'settings',
    title: 'Settings',
    summary: 'App Settings and Recipe Settings, and what each keeps.',
    body: `Open Settings from the gear in the bottom bar or with {key:settings|the gear in the bottom bar}. The search at the top finds any setting. Changes save as you make them.

**App Settings** stay on this device:

- **General**: About you (your name, your English, what you write, your daily goal and the Seasonings new recipes start with, and Set the Table again), starting up, and how shortcuts are shown.
- **Appearance**: theme (System, Light, Dark, Sepia), text size and motion. The page stays white paper in every theme, so text colours look the same in dark mode as they were picked.
- **Writing**: curly quotes and dashes, Markdown and each of its rules, @ and / menus, Oven Mode's fade, typewriter scrolling and pasting.
- **Saving and backups**: how soon a change is saved, backups and where they go, snapshots.
- **Keyboard shortcuts**: every shortcut, and changing it.
- **Updates and privacy**.

**Recipe Settings** are saved in the recipe's folder, so they travel with it:

- **Layout**: page size, margins and indents.
- **Styles**: paragraph and character styles.
- **Seasonings**: the recipe's spelling, your dictionary, and which checks run.
- **Goals**: words a day, the whole-recipe target, the deadline and what counts.`,
  },
  {
    id: 'files',
    title: 'Your files',
    summary: 'What is inside a recipe’s folder.',
    body: `A recipe is an ordinary folder. Open it in any text editor, back it up, or keep it in Git, Dropbox or iCloud.

| In the folder | What it holds |
| --- | --- |
| \`book.json\` | the title, goals, spelling, Seasonings and Plate settings |
| \`order.json\` | the order of Items and Groups |
| \`styles.json\` | the recipe's styles |
| \`writing-history.csv\` | words written and deleted each day |
| \`dictionary.txt\` | your own words, one a line |
| \`bookshelf/\` | the Shelf: Items in nested Groups |
| \`pantry/\` | Characters, Settings and Materials |
| \`pictures/\` | portraits for Pantry cards |
| \`.cookbook/\` | hidden: the search index, undo history, snapshots and the trash |

Every Item and card is a Markdown file with a short header for its title, status and fields. Anything \`order.json\` doesn't list, such as a file added in another app, comes after the listed ones in natural order, so nothing is ever hidden. Deleting \`.cookbook/\` is safe for your writing: the index is rebuilt, and only undo history and the trash are lost.`,
  },
];

/** The shortcuts chapter is made from the writer's own shortcuts each time it opens. */
export const SHORTCUTS_CHAPTER = { id: 'shortcuts', title: 'Keyboard shortcuts', summary: 'Every shortcut, as set on this device.' };
