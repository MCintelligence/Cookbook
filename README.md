# Cookbook

A warm, cozy writing app for novelists. It works fully offline, needs no account, and runs on desktop, mobile and in the browser.

- **Shelf:** write items on a quiet page, organised into groups that nest inside each other.
- **Pantry:** character, place and research cards that stay linked to the manuscript.
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
    settings/
    research/
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
| ⌘⌥F (Ctrl+Alt+F) | a footnote at the cursor |

Pressing Backspace straight after a shortcut turns it back into exactly what you typed.

## The Shelf

Items sit on the Shelf with a status dot (not started, simmering or done) and their word count. Groups nest to any depth and open or close with the arrow beside their name; hover over a group to see the total words inside. Double-click a group to rename it. Right-click the Shelf for New item, New group, New item from template, Import and Read the recipe; right-click an item to put it in a new group, into a new group, take a snapshot or set its status.

Drag an item or group to reorder it, or drop it onto a group to move it inside. On a touch screen, press and hold first. With the keyboard, Alt+↑ and Alt+↓ move the focused row. Moving never renames a file unless the new group already has one with the same name.

The open item's status and synopsis are on the card above the page, so they never end up in the manuscript.

Read the recipe (⌘⇧R, or right-click the Shelf) shows every item in order as one document, under its group headings, with the total words and an estimated reading time. Double-click a section to go back to writing in it.

### Mise en Place

Click a group's name (or press Enter on it) to see every item inside it as one page, in Shelf order, with the names of the groups inside it as dividers. Write anywhere: click into an item's text and the cursor lands where you clicked, and the arrow keys at the start or end of an item carry on into the one before or after. Each item is still its own file, saved, proofread and undone on its own. Long groups load as you scroll. The footer shows the group's items and words.

An empty group opens as an empty page. Start typing and a new item is made in it; Undo takes it away again. Clicking an item on the Shelf opens it on its own page.

## The Pantry

The Pantry button in the top bar opens the Pantry beside the page: a search, which also looks at nicknames and fields, and a switch between Characters, Places and Research. Each of these can hold your own groups, nested as deep as you like, and cards drag between them like items do. The + button makes a new card.

A card opens on the same page as an item, as one card with its name at the top, so its free writing gets the same editor. Above the page are its portrait, the other names it goes by, its fields (role, age, wants and fears for a character; role, when, offers and threatens for a place; or any you add, each with a hint of what goes in it) and its relationships. A relationship such as "Mother of June" links two cards and shows on both. In the file it looks like this:

```yaml
aka: [Mama J]
role: Pastry cook
portrait: pictures/Ruth.jpg
relationships:
  - to: 7c1f0d2e-…   # June's id
    as: Mother of
```

Portraits are shrunk to at most 600 pixels and kept in `pictures/`, so moving a card never loses its picture.

Character and place pages start empty. Put the cursor on an empty line and a + appears beside it with brainstorming cards to add, in three groups: Basics (Who they are, Where they come from), Drive (What they want, What stands in their way) and World on Fire (The Wildfire, The Inferno, The Cinders and The Phoenix, or all four at once). Each card is an ordinary `##` heading in the file, and until you write under it a faint line explains what it asks. Every card is optional, and one undo takes out what you just added.

### Linked names

Every character's and place's name, and the other names it goes by, is linked wherever it appears in your writing. There is no special syntax, and nothing is added to the file. Names match whole words and their capital letters, so June the cook isn't the month of june, though "June's" still counts. Hover a name, or press and hold on a touch screen, to peek at the card. The card above each item shows chips for the characters and places it names, and each character or place card lists the items it appears in, in Shelf order.

### The Pantry shelf and pins

Press ⌘J (Name from the Pantry) or type @ while writing for a quick search over every card, with the cards named in the open item listed first. Its search covers names, nicknames and what's written inside cards. For the highlighted card you can:

- Insert its name (Enter). After @, the name replaces the @, and typing towards a nickname inserts that nickname.
- Pin it beside the page (⌘Enter).
- Open it in the Pantry (⌘⇧Enter).

Pinned cards stay in the right-hand drawer, above the Pantry or Seasonings, until you unpin them. They're remembered for each recipe on this device. A name's peek can pin its card too.

## Starting points and goals

A new recipe can start as a novel (a group of items, plus a main character and place in the Pantry), a short story, or nonfiction (a group of items, plus a note for sources). "New item from template" on the Shelf's right-click offers a blank item, a chapter opener or a letter.

The footer also has the zoom (click the percentage for a slider), whether the item is saved, and Settings. It shows today's words against your daily goal, your streak, and the open item's words against its own goal if it has one. History opens the last two weeks and the last four months, where you can set both goals and export the history as CSV. Splitting and merging items move words without counting them as written.

## Oven Mode and Stove Mode

Stove Mode is the normal view, with the Shelf, toolbar and panels around the page. Oven Mode is focus mode: the panels step aside and the page fades everything but the paragraph or sentence you're in (Settings › Writing chooses which). Turn it on with ⌘⇧F (Ctrl+Shift+F), the page's right-click menu or the command palette, and press ⌘⇧F or Escape, or click Oven Mode in the footer, to go back to Stove Mode.

## Undo, splitting and merging

Undo reaches back past closing an item or the app. Each item's changes are logged in `.cookbook/undo/`, and opening the item replays them, so ⌘Z picks up where you left off. If an item's file was changed in another app, its undo history starts fresh; your text is never touched.

Click a section break (`* * *`) to split the item there, so everything after it becomes a new item right after this one, or to merge the next item into this one. A merged item's file goes to `.cookbook/trash/` rather than being deleted. Its footnotes come along.

Deleting `.cookbook/` is safe for your writing: the search index is rebuilt, and you only lose undo history and the trash.

## Backups

Your text is saved as you type. On top of that, Cookbook zips the whole recipe into a backups folder outside it: every half hour while you write, when you close Cookbook or open another recipe, and when a recipe opens after Cookbook stopped without closing it (a crash or a power cut). Back up now, on the recipe menu or in Settings › Saving and backups, makes one straight away.

A backup holds every item and card, the pictures, the settings, the snapshots and the trash. The search index and undo history are left out, since Cookbook rebuilds them. Each recipe has its own folder, named after its title and the start of its id (`My Recipe 1a2b3c4d/2026-10-30 14.05.09.zip`), so two recipes with the same title never share one, and the folder follows a renamed recipe. Cookbook keeps the newest 10 (or 25, or all, in Settings), plus one a day for the last week and one a week for the last month. Restore opens a copy of the recipe as it was, beside your own, and never writes over it.

The backups folder is in Cookbook's app data on the same disk as your recipes unless you choose another one in Settings, such as a synced or external folder. Choosing one is the best protection against a lost or broken computer.

## Seasonings

The Seasonings button in the top bar opens four characters who each read the page for one thing. Pick the ones you want; only their checks run, and you can reorder them or add more later. The choice is saved in `book.json`.

- **Salty Sam** checks spelling.
- **Peppery Pete** checks grammar: agreement, punctuation, quotes left open, and capitals in the wrong place (“MOnster”, “mONSTER”).
- **Drunk Daniel** watches dialogue: he can dim the narration so only the speech stands out, and tracks how much of any page or book you pick is spoken.
- **Spicy Sally** checks style, and rates the page on a spice meter from Mild to Inferno. The meter follows the page's grade level (the Automated Readability Index, as Hemingway uses): most published fiction sits around grades 5 to 9, so grades 5 to 7 are Medium, 4 and under Mild, 8 to 9 Hot, 10 to 12 Extra hot, and 13 and up Inferno.

Each remark comes with the words around it, a Fix button for the suggested change and a Show button that finds it on the page. ✕ removes a remark for good; right-click it to remove it everywhere. Spelling has a red wavy underline and grammar a blue one; Sally marks style in chili red, with 『 』 around a single word and 「 」 around a longer passage.

Spelling is checked on the device, in a background worker, with the Hunspell word lists for American or British English (pick one in Settings; it is saved in `book.json`). A word is only underlined once you have moved past it.

- A real word with a common prefix or suffix counts too (un-, re-, non-, pre-, mis-, over-, under-, out-, anti-, semi-, multi-, sub-, super-, counter-, -less, -like, -ness), so “untextured” and “textureless” pass while “untexturred” doesn't. So do hyphenated words whose parts are real.
- Every character's and place's name and nickname counts as a word, so names are never flagged. Near misses are: “Mamma Lou” for Mama Lou is caught even though both words are real ones.
- Suggestions come in the order that fits the words around the misspelling, so in “she sat on the bech by the river”, Sam offers *bench* before *beech*. He knows which words follow which from the counts of word pairs in English fiction, and words and pairs from your own book count for more, so a word you use often comes first.
- Your dictionary is `dictionary.txt` in the book folder, one word a line, and can be edited by hand.
- Removed remarks are kept in `.cookbook/ignored.json`. Settings can bring them all back.

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
2. Shelf and Pantry: groups and items, character and place cards, linked names.
3. Seasonings v1: spelling, grammar and style checks on the device.
4. Mobile apps.
5. Signed updates for the desktop app (see [RELEASING.md](RELEASING.md)).
6. Optional on-device AI suggestions.
7. Release.
