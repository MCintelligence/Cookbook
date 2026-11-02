# Cookbook

A warm, cozy writing app for novelists. It works fully offline, needs no account, and runs on desktop, mobile and in the browser.

- **Shelf:** write items on a quiet page, organised into groups that nest inside each other.
- **Pantry:** character, setting and material cards that stay linked to the manuscript.
- **Seasonings:** four characters who proofread on the device: spelling, grammar, dialogue, and style with a spice meter for how hard the page is to read.

Cookbook is free and open source under the [Apache 2.0 licence](LICENSE).

## Your writing is plain files

Each recipe is an ordinary folder you can open in any text editor, back up, or keep in Git, Dropbox or iCloud:

```
My Recipe/
  book.json        title, id, format version and daily word goal
  order.json       the order of items and groups
  writing-history.csv  words written and deleted each day
  bookshelf/       the Shelf: items, in nested groups
  pantry/
    characters/
    settings/      shown as Settings
    research/      shown as Materials
  pictures/        portraits for Pantry cards
  .cookbook/       hidden: search index, undo history, snapshots and trash (see below)
```

Every item and card is a Markdown file with a small YAML header:

```markdown
---
id: 7c1f0d2e-…
title: Sunday Dinner
kind: scene
status: simmering
synopsis: June burns the rice; nobody says a word.
---
The kitchen smelled of cornbread and black pepper before anyone was awake.
```

`order.json` lists what each group holds, in order. Anything it doesn't list, such as a file you added in another app, comes after the listed ones in natural name order ("Chapter 2" before "Chapter 10"), so a lost or hand-edited `order.json` never hides anything.

Inside an item, styles are written so the file still reads well anywhere:

```markdown
The kitchen smelled of **cornbread** and *black pepper*.

::: letter
Dear June, the pie wants more nutmeg than you think.
:::

* * *

[She'll never let me read it,]{.thought} she thought.

The church had burned that summer.^[Blessed Assurance.]

- [ ] find Lou's hymn
```

Plain paragraphs use the Body style. `::: name` blocks use a named paragraph style, `**strong**`, `*emphasis*` and `[text]{.name}` are character styles, `* * *` is a section break, and `- [ ]` is a checklist item. The styles themselves live in `styles.json` in the recipe's folder.

`^[text]` is a footnote, written where its number goes. Footnotes are edited at the foot of the page.

## Typing shortcuts

| Type | You get |
| --- | --- |
| `- ` at the start of a line | a list |
| `-TD ` at the start of a line | a checklist |
| `**text**`, `*text*`, `_text_` | Strong, Emphasis, Underline (also ⌘B, ⌘I, ⌘U) |
| `--` | an em dash |
| `"` and `'` | curly quotes |
| `* * *` on its own line | a section break |
| `!Word` | a drop cap on the word's first letter: two lines deep at the start of a paragraph, a raised initial anywhere else. The file keeps the `!` |
| ⌘⌥F (Ctrl+Alt+F) | a footnote at the cursor |

Pressing Backspace straight after a shortcut turns it back into exactly what you typed. App Settings › Writing › Markdown turns all the Markdown shortcuts off at once, or any one of them on its own; formatting already on the page stays, and with drop caps off `!Word` shows as written.

## The Shelf

Items sit on the Shelf with a status dot (not started, simmering or done) and their word count. Groups nest to any depth and open or close with the arrow beside their name; hover over a group to see the total words inside. Double-click a group to rename it. Right-click the Shelf for New item, New group, New item from template, Import, Expand all and Collapse all; right-click an item to put it in a new group, into a new group, take a snapshot or set its status.

Drag an item or group to reorder it, or drop it onto a group to move it inside. On a touch screen, press and hold first. With the keyboard, Alt+↑ and Alt+↓ move the focused row. Moving never renames a file unless the new group already has one with the same name.

The open item's status sits in the footer and on the Shelf, never on the page, so it never ends up in the manuscript.

### Mise en Place

Click a group's name (or press Enter on it) to see every item inside it as one page, in Shelf order, with a thin line between items. Group names aren't repeated on the page, since the Shelf already shows them. Write anywhere: click into an item's text and the cursor lands where you clicked, and the arrow keys at the start or end of an item carry on into the one before or after. Each item is still its own file, saved, proofread and undone on its own. Long groups load as you scroll. The footer shows the group's items and words.

An empty group opens as an empty page. Start typing and a new item is made in it; Undo takes it away again. Clicking an item on the Shelf opens it on its own page.

Groups picked together show together. Ctrl-click (⌘-click on a Mac) or Shift-click groups on the Shelf, or press ⌘A (Ctrl+A) there or use Select all, and every group picked is shown as one page in Shelf order. The page stays at the group you were on (the one you clicked, or the open item's group): picking Select all from the middle of the story shows everything, with the earlier groups above and the later ones below, and the page stays still as they load. If every group picked is empty, typing makes the first item in the group picked first, or the top one after Select all. In the page itself, ⌘A selects text as usual.

⌘⇧G (Ctrl+Shift+G) switches between the open item on its own page and its whole group as one page, with the cursor where it was; it is also in the View menu and the command palette. Right-click a group for Show as one page, or find a group by name with ⌘O.

From the keyboard, Enter on a group shows it and leaves the keyboard on the Shelf, as opening an item does; ⌘1, F6 or Escape go to the page. Tab reaches each item and Enter writes in it. Each item has a heading a screen reader can jump between, and moving into another item says which one it is and where it is in the group.

## The Pantry

The Pantry button in the top bar opens the Pantry beside the page: a search, which also looks at nicknames and fields, and a switch between Characters, Settings and Materials. Each of these can hold your own groups, nested as deep as you like, and cards drag between them like items do. The + button makes a new card.

A card opens on the same page as an item, as one card with its name at the top, so its free writing gets the same editor. Above the page are its portrait, the other names it goes by, its fields (role, age, wants and fears for a character; role, when, offers and threatens for a setting; or any you add, each with a hint of what goes in it) and its relationships. A relationship such as "Mother of June" links two cards and shows on both. In the file it looks like this:

```yaml
aka: [Mama J]
role: Pastry cook
portrait: pictures/Ruth.jpg
relationships:
  - to: 7c1f0d2e-…   # June's id
    as: Mother of
```

Portraits are shrunk to at most 600 pixels and kept in `pictures/`, so moving a card never loses its picture.

Character and setting pages start empty. Put the cursor on an empty line and a + appears beside it with brainstorming cards to add, in three groups: Basics (Who they are, Where they come from), Drive (What they want, What stands in their way) and World on Fire (The Wildfire, The Inferno, The Cinders and The Phoenix, or all four at once). Each card is an ordinary `##` heading in the file, and until you write under it a faint line explains what it asks. Every card is optional, and one undo takes out what you just added.

### Linked names

Every character's and setting's name, and the other names it goes by, is linked wherever it appears in your writing. There is no special syntax, and nothing is added to the file. Names match whole words and their capital letters, so June the cook isn't the month of june, though "June's" still counts. Hover a name, or press and hold on a touch screen, to peek at the card. Each character or setting card lists the items it appears in, in Shelf order.

### The Pantry shelf and pins

Press ⌘J (Name from the Pantry) or type @ while writing for a quick search over every card, with the cards named in the open item listed first. Its search covers names, nicknames and what's written inside cards. For the highlighted card you can:

- Insert its name (Enter). After @, the name replaces the @, and typing towards a nickname inserts that nickname.
- Pin it beside the page (⌘Enter).
- Open it in the Pantry (⌘⇧Enter).

Pinned cards stay in the right-hand drawer, above the Pantry or Seasonings, until you unpin them. They're remembered for each recipe on this device. A name's peek can pin its card too.

## Set the Table

The very first time Cookbook starts, **Set the Table** asks a few questions before Learn to Cook: what to call you (it goes on the title page of the recipes you start), which English you write (American, British, Canadian, Australian, New Zealand, Irish, Indian or South African), what you mostly write, the theme and text size, a daily word goal, and which Seasonings new recipes start with. What you write sets sensible starting points: the template New Recipe offers first, a goal, the Seasonings, and Markdown rules that get in the way (poets lose the typed lists, nonfiction and scripts lose drop caps). Every question can be skipped, the answers stay on this device, and App Settings › General changes any of them, or runs Set the Table again (also Help › Set the Table…).

## The manual

Help › **Manual** (F1) opens the manual: a chapter for each part of Cookbook, a search over all of it, and the keyboard shortcuts as you have set them. It ships with the app, so it works offline. Its text is in `src/manual/chapters.ts`; change it in the same pull request as the feature it describes.

## Learn to Cook

After Set the Table, Cookbook opens **Learn to Cook**, a recipe made for trying things out: one group for each part of Cookbook (the Shelf, writing, the Pantry, Seasonings, Stove and Oven, goals, keeping it safe, finding your way), an example Pantry, and pages full of things to try. Its shortcuts are your own, so it says ⌘O on a Mac and Ctrl+O elsewhere, or the menu way if you've taken a shortcut off. It is an ordinary recipe: change it, or delete it from Your Recipes when you're done. Help › Learn to Cook opens it again, or makes a fresh copy if it was deleted.

## Starting points and goals

A new recipe can start as a novel (a group of items, plus a main character and setting in the Pantry), a short story, or nonfiction (a group of items, plus a note for sources). "New item from template" on the Shelf's right-click offers a blank item, a chapter opener or a letter.

The footer also has the zoom (click the percentage for a slider), whether the item is saved, and App Settings. It shows today's words against your daily goal, your streak, and the open item's words against its own goal if it has one. History opens the last two weeks and the last four months, where you can set both goals and export the history as CSV. Splitting and merging items move words without counting them as written.

## Oven Mode and Stove Mode

Stove Mode is the normal view, with the Shelf, toolbar and panels around the page. Oven Mode is focus mode: the panels step aside and the page fades everything but the paragraph or sentence you're in (App Settings › Writing chooses which). Turn it on with ⌘⇧F (Ctrl+Shift+F), the page's right-click menu or the command palette, and press ⌘⇧F or Escape, or click Oven Mode in the footer, to go back to Stove Mode.

The desktop app opens full screen. On Windows and Linux, F11 (or View › Full screen) leaves full screen and comes back; on a Mac use Window › Enter Full Screen or ⌃⌘F.

Nothing is out of reach in Oven Mode: the Shelf, the Pantry, Seasonings and pinned cards start tucked away and slide in over the page when you want them, without moving the text. Rest the pointer on the left edge of the window (or click it) for the Shelf, or the right edge for the Pantry (Seasonings, if that was the last one open). The Shelf button and the Pantry and Seasonings buttons in the top bar, View › Pantry and Seasonings, ⌘2 to ⌘4 (Ctrl+2 to Ctrl+4) and F6 slide them in too. Click the page, pick an item on the Shelf, or press Escape to tuck them away again; the next Escape leaves Oven Mode. Settings › Appearance › Reduce motion (or your computer's reduce-motion setting) shows them without the slide.

## Plate: the finished book

Recipe › **Plate and serve…** (or the command palette) shows the book as it will reach readers, set like a novel rather than a manuscript. On the left, the **Book** panel lists the front matter (title page, copyright, dedication, contents), the chapters, one for each top-level Group or Item on the Shelf, and the back matter (acknowledgements, about the author). Tick or untick each to put it in or leave it out, drag to reorder (or Alt+↑ and Alt+↓), and click a front or back matter part to write its text. None of this changes the Shelf.

In the middle are the pages, as a two-page spread for print (← and → turn them) or as an e-book reader. On the right, the **Style** panel picks a template (Classic, Modern, Literary, Cozy), the trim size (5 × 8, 5.5 × 8.5 or 6 × 9 inches), the font, size and line spacing, the chapter opener and the scene break, and switches drop caps, running headers, page numbers and right-hand chapter starts on or off. Plate settings are kept in the recipe's book.json and save as you change them; Cancel goes back to writing.

**Serve** makes an EPUB e-book, or a print-ready PDF through the print dialog's Save as PDF, page for page as the preview shows. Word is coming later.

## Track changes

Edit › Track changes › **Suggest changes** (⌘⇧E, Ctrl+Shift+E) turns every edit into a suggestion: new words are underlined in the accent colour and deleted words stay on the page, struck through. Right-click a change to accept or reject it, or use Edit › Track changes to step through them or settle the whole page at once. It is a setting of the recipe (`suggest` in `book.json`), and a **Suggesting** chip in the bottom bar turns it off.

In the file a change is a span like any other: `[new words]{.ins}` and `[old words]{.del}`. Plate, Serve, exports and word counts read the text as if every change were accepted. Only words are tracked so far; splitting and joining paragraphs, formatting and styles go straight in.

## Coming from Scrivener

File › **Import Scrivener project…** (also in the Recipe menu and the command palette) makes a new recipe from a Scrivener 2 or 3 project, from macOS or Windows. Pick the `.scriv` folder or the folder it is in; a zip of a project, such as a Scrivener backup, goes through **Import files…**. The open recipe is backed up first, and the project is only read.

The Draft goes on the Shelf in Binder order (folders become Groups, documents Items; a document with children becomes a Group whose first Item holds its text). A top-level Characters folder goes to the Pantry's Characters, Places, Locations or Settings to Settings, and Research and other folders to Materials; the Trash is skipped. Titles, synopses, status, label colours, Include in Compile, and the text's bold, italic, underline, strikethrough, links, footnotes, headings and scene breaks come through. Comments and inline annotations become notes to self on the words they were on, linked and inline footnotes become footnotes, and right-clicking the highlighted words shows the note. Each document's Inspector notes end its Pantry card, or, for a Shelf Item or folder, become a card in Materials › Notes from Scrivener, so they never print with the book. Snapshots come with their Items. Pictures are copied to `pictures/` and shown on a Materials card, or used as the portrait in Characters and Settings; PDFs, web pages and other files are copied to `files/` with a Materials card naming them (a saved HTML page brings its text, a web archive the address it came from). Cookbook can't show a PDF inside the app yet. Tracked changes in the RTF stay suggestions. Keywords, custom metadata, collections and project notes are left behind. The reader is `src/storage/rtf.ts` and `src/storage/scrivener.ts`.

## Undo, splitting and merging

Undo reaches back past closing an item or the app. Each item's changes are logged in `.cookbook/undo/`, and opening the item replays them, so ⌘Z picks up where you left off. If an item's file was changed in another app, its undo history starts fresh; your text is never touched.

Click a section break (`* * *`) to split the item there, so everything after it becomes a new item right after this one, or to merge the next item into this one. A merged item's file goes to `.cookbook/trash/` rather than being deleted. Its footnotes come along.

Deleting `.cookbook/` is safe for your writing: the search index is rebuilt, and you only lose undo history and the trash.

## Backups

Your text is saved as you type. On top of that, Cookbook zips the whole recipe into a backups folder outside it: every half hour while you write, when you close Cookbook or open another recipe, and when a recipe opens after Cookbook stopped without closing it (a crash or a power cut). Back up now, on the recipe menu or in App Settings › Saving and backups, makes one straight away.

A backup holds every item and card, the pictures, the settings, the snapshots and the trash. The search index and undo history are left out, since Cookbook rebuilds them. Each recipe has its own folder, named after its title and the start of its id (`My Recipe 1a2b3c4d/2026-10-30 14.05.09.zip`), so two recipes with the same title never share one, and the folder follows a renamed recipe. Cookbook keeps the newest 10 (or 25, or all, in App Settings), plus one a day for the last week and one a week for the last month. Restore opens a copy of the recipe as it was, beside your own, and never writes over it.

The backups folder is in Cookbook's app data on the same disk as your recipes unless you choose another one in App Settings, such as a synced or external folder. Choosing one is the best protection against a lost or broken computer.

Each backup is opened again as soon as it is written and checked file by file against the recipe. One that doesn't open whole is removed, never counted among the backups kept, and Cookbook says so. If automatic backups stop working, Cookbook tells you once and App Settings shows why until one works again. In the desktop app, saves and backups are forced onto the disk before they replace the old file, App Settings marks a backup folder that is on the same disk as the recipe, and Cookbook suggests choosing another drive or a cloud-synced folder the first time it finds them together.

## Seasonings

The Seasonings button in the top bar opens four characters who each read the page for one thing. Pick the ones you want; only their checks run, and you can reorder them or add more later. The choice is saved in `book.json`.

- **Salty Sam** checks spelling.
- **Peppery Pete** checks grammar: agreement, punctuation, quotes left open, and capitals in the wrong place (“MOnster”, “mONSTER”).
- **Drunk Daniel** watches dialogue: his meter runs from Sober to Drunk with how much of the open page is spoken, and his Drunk Check dims the narration so only the speech stands out.
- **Spicy Sally** checks style, and rates the page on a spice meter from Mild to Inferno. The meter follows the page's grade level (the Automated Readability Index, as Hemingway uses): most published fiction sits around grades 5 to 9, so grades 5 to 7 are Medium, 4 and under Mild, 8 to 9 Hot, 10 to 12 Extra hot, and 13 and up Inferno.

Each seasoning is one card: a remark in the character's voice, a five-step meter, its own Check and a Report button. Sam's meter (Unsalted to Seawater) and Pete's (Plain to Smoking) count slips per 1,000 words on the open page. Turning a seasoning's Check off takes its underlines off the page while its meter keeps counting; which Checks are on is saved in `book.json`, once for the whole Recipe, so every Item, Mise en Place and split view follow the same switches. Daniel's Drunk Check starts off; the others start on. The checks keep running when Seasonings is closed: the underlines of every picked seasoning whose Check is on stay on the page while you write. Only the open page is checked, a paragraph at a time as it changes, and Pete's and Sally's grammar engine stays asleep while neither of them is picked with their Check on. A slip is fixed from its underline, or with F7 to step through them.

A number beside the Seasonings button says how many picked seasonings with their Check on have something to say about the open page, so you know to look without opening the panel. A seasoning has something to say when its meter is off the step it's happy at: any slip for Sam or Pete, anything but Medium for Sally, anything but Tipsy for Daniel. The number goes away when they're all happy or when Seasonings are turned off, and it stays in Oven Mode, in the dimmed top bar. Screen readers hear it as part of the button, for example "Seasonings, 2 seasonings have something to say".

**Report** opens a window over the page with the seasoning's verdict, its numbers, up to three things to try first, and everything it found; click anything found to select it on the page. Each report is also saved as a card in Pantry › Materials › Seasoning Reports, named after the seasoning and the time (for example `Salty Sam · 31 Oct ’26 · 15.11`). Reports read only the open Item.

Spelling has a red wavy underline and grammar a blue one; Sally marks style in chili red, with 『 』 around a single word and 「 」 around a longer passage.

Spelling is checked on the device, in a background worker, with the Hunspell word lists for American, British, Canadian or Australian English. A recipe uses your English from App Settings › General until it picks its own in Recipe Settings › Seasonings (saved in `book.json`); New Zealand English uses the Australian list, and Irish, Indian and South African English the British one. A word is only underlined once you have moved past it.

- A real word with a common prefix or suffix counts too (un-, re-, non-, pre-, mis-, over-, under-, out-, anti-, semi-, multi-, sub-, super-, counter-, -less, -like, -ness), so “untextured” and “textureless” pass while “untexturred” doesn't. So do hyphenated words whose parts are real.
- Every character's and setting's name and nickname counts as a word, so names are never flagged. Near misses are: “Mamma Lou” for Mama Lou is caught even though both words are real ones.
- Suggestions come in the order that fits the words around the misspelling, so in “she sat on the bech by the river”, Sam offers *bench* before *beech*. He knows which words follow which from the counts of word pairs in English fiction, and words and pairs from your own book count for more, so a word you use often comes first.
- Your dictionary is `dictionary.txt` in the book folder, one word a line, and can be edited by hand.
- Removed remarks are kept in `.cookbook/ignored.json`. App Settings can bring them all back.

Grammar comes from [Harper](https://writewithharper.com) (Apache 2.0), running on the device as WebAssembly. It checks agreement, articles, repeated words, punctuation and word choice. Harper is about 20 MB (8 MB compressed), so it loads the first time it's needed, and the offline web app keeps a copy.

Sally's style checks are Cookbook's own (`src/proofread/style.ts`): adverbs, simpler words, passive voice, crutch words, echoes, clichés, redundancies, quotes left open, and sticky sentences. Adverbs and crutch words inside dialogue are left alone, since that's how people talk.

The word lists come from [wooorm/dictionaries](https://github.com/wooorm/dictionaries) (MIT and BSD); their licences are in `public/dictionaries/`. The word-pair counts (`public/dictionaries/word-pairs.txt`, 3 MB, or 1.2 MB as downloaded) are from the [Google Books Ngram Viewer](https://books.google.com/ngrams/info)'s English Fiction 2-grams, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); `scripts/build-word-pairs.mjs` makes them.

## Running it

You need Node 22 or newer. For the desktop app you also need Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system.

```sh
npm install
npm run dev          # browser version at http://localhost:1420
npm run tauri dev    # desktop app
npm test             # storage, format and editor tests
npm run build        # production web build, including the offline service worker
```

Click the recipe's title in the top bar for Your recipes…, to start a new one or open a recipe's folder. In the desktop app a recipe can live in any folder. In the browser, recipes are kept in the browser's private storage, and Chrome and Edge can also open a real folder on your computer.

## Search

Search in the top bar finds and replaces in the open item, and lists every other item and Pantry card that matches. Words match from their start and by stem, so “corn” finds “cornbread” and “run” finds “running”. The index is SQLite with full-text search, kept in `.cookbook/index.sqlite`; opening a recipe only rereads the files that changed since last time.

The Shelf has a search field under its heading, like the Pantry's: it lists the Shelf's Items whose name or text matches, and the Pantry's search does the same for cards.

## Project layout

```
src/
  storage/   the recipe's folder format, platform adapters (Tauri, browser, memory) and the hidden index
  editor/    the Tiptap editor: styles, footnotes, dialogue, linked names
  proofread/ the proofreader's checks, the Seasonings characters' remarks, its background worker and the underlines
  ui/        React components
  App.tsx    the app shell: Shelf, page, Pantry and Seasonings panels
src-tauri/   the native shell for Windows, macOS, Linux, iOS and Android
```

## Roadmap

0. **Foundations** (this): app shell, plain-files storage, offline web build, CI.
1. Offline editor: rich text, named paragraph and character styles, notes, find and replace.
2. Shelf and Pantry: groups and items, character and setting cards, linked names.
3. Seasonings v1: spelling, grammar and style checks on the device.
4. Mobile apps.
5. Signed updates for the desktop app (see [RELEASING.md](RELEASING.md)).
6. Optional on-device AI suggestions.
7. Release.
