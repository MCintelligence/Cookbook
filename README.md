# Cookbook

A warm, cozy writing app for novelists. It works fully offline, needs no account, and runs on desktop, mobile and in the browser.

- **Shelf:** write pages on a quiet page, organised into books that nest inside each other.
- **Pantry:** character, place and research cards that stay linked to the manuscript.
- **Seasonings:** four characters who proofread on the device: spelling, grammar and style, dialogue, and readability.

Cookbook is free and open source under the [Apache 2.0 licence](LICENSE).

## Your writing is plain files

Each book is an ordinary folder you can open in any text editor, back up, or keep in Git, Dropbox or iCloud:

```
My Book/
  book.json        title, format version and daily word goal
  order.json       the order of pages and books
  writing-history.csv  words written and deleted each day
  bookshelf/       pages, in nested books (parts, chapters)
  pantry/
    characters/
    settings/
    research/
  recipes/         sources and notes that guide a page
  pictures/        portraits for Pantry cards
  .cookbook/       hidden: search index, undo history and trash (see below)
```

Every page, card and recipe is a Markdown file with a small YAML header:

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

`order.json` lists what each folder holds, in order. Anything it doesn't list, such as a file you added in another app, comes after the listed ones in natural name order ("Chapter 2" before "Chapter 10"), so a lost or hand-edited `order.json` never hides anything.

Inside a page, styles are written so the file still reads well anywhere:

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

Plain paragraphs use the Body style. `::: name` blocks use a named paragraph style, `**strong**`, `*emphasis*` and `[text]{.name}` are character styles, `* * *` is a scene break, and `- [ ]` is a checklist item. The styles themselves live in `styles.json` in the book folder.

`^[text]` is a footnote, written where its number goes. Footnotes are edited at the foot of the page.

## Typing shortcuts

| Type | You get |
| --- | --- |
| `- ` at the start of a line | a list |
| `-TD ` at the start of a line | a checklist |
| `**text**`, `*text*`, `_text_` | Strong, Emphasis, Underline (also ⌘B, ⌘I, ⌘U) |
| `--` | an em dash |
| `"` and `'` | curly quotes |
| `* * *` on its own line | a scene break |
| ⌘⌥F (Ctrl+Alt+F) | a footnote at the cursor |

Pressing Backspace straight after a shortcut turns it back into exactly what you typed.

## The Shelf

Pages sit on the Shelf with a status dot (not started, simmering or done) and their word count. Books nest to any depth, show the total words inside, and open or close with a click. Double-click a book to rename it. Right-click the Shelf for New page, New book, New page from template, Import and Read book; right-click a page to add a recipe, group it into a new book, take a snapshot or set its status.

A recipe is a source or note that guides work on one page. Recipes nest under their page on the Shelf, in italics, and open beside it or in its place.

Drag a page or book to reorder it, or drop it onto a book to move it inside. On a touch screen, press and hold first. With the keyboard, Alt+↑ and Alt+↓ move the focused row. Moving never renames a file unless the new book already has one with the same name.

The open page's status and synopsis are on the card above the page, so they never end up in the manuscript.

Read book (⌘⇧R, or right-click the Shelf) shows every page in order as one document, under its chapter headings, with the total words and an estimated reading time. Double-click a section to go back to writing in it.

## The Pantry

The Pantry button in the top bar opens the Pantry beside the page: a search, which also looks at nicknames and fields, and a switch between Characters, Places and Research. Each group can hold your own folders, nested as deep as you like, and cards drag between them like pages do. The + button makes a new card.

A card opens on the same page as a page of writing, as one card with its name at the top, so its free writing gets the same editor. Above the page are its portrait, the other names it goes by, its fields (role, age, wants, fears, or any you add) and its relationships. A relationship such as "Mother of June" links two cards and shows on both. In the file it looks like this:

```yaml
aka: [Mama J]
role: Pastry cook
portrait: pictures/Ruth.jpg
relationships:
  - to: 7c1f0d2e-…   # June's id
    as: Mother of
```

Portraits are shrunk to at most 600 pixels and kept in `pictures/`, so moving a card never loses its picture.

### Linked names

Every character's and place's name, and the other names it goes by, is linked wherever it appears in your writing. There is no special syntax, and nothing is added to the file. Names match whole words and their capital letters, so June the cook isn't the month of june, though "June's" still counts. Hover a name, or press and hold on a touch screen, to peek at the card. The card above each page shows chips for the characters and places it names, and each character or place card lists the pages it appears in, in Shelf order.

### The Pantry shelf and pins

Press ⌘J (Name from the Pantry) or type @ while writing for a quick search over every card, with the cards named in the open page listed first. Its search covers names, nicknames and what's written inside cards. For the highlighted card you can:

- Insert its name (Enter). After @, the name replaces the @, and typing towards a nickname inserts that nickname.
- Pin it beside the page (⌘Enter).
- Open it in the Pantry (⌘⇧Enter).

Pinned cards stay in the right-hand drawer, above the Pantry or Seasonings, until you unpin them. They're remembered for each book on this device. A name's peek can pin its card too.

## Starting points and goals

A new work can start as a novel (chapters of pages, plus a main character and place in the Pantry), a short story, or nonfiction (chapters of sections, plus a note for sources). "New page from template" on the Shelf's right-click offers a blank page, a chapter opener or a letter.

The footer also has the zoom (click the percentage for a slider), whether the page is saved, and Settings. It shows today's words against your daily goal, your streak, and the open page's words against its own goal if it has one. History opens the last two weeks and the last four months, where you can set both goals and export the history as CSV. Splitting and merging pages move words without counting them as written.

## Undo, splitting and merging

Undo reaches back past closing a page or the app. Each page's changes are logged in `.cookbook/undo/`, and opening the page replays them, so ⌘Z picks up where you left off. If a page's file was changed in another app, its undo history starts fresh; your text is never touched.

Click a scene break (`* * *`) to split the page there, so everything after it becomes a new page right after this one, or to merge the next page into this one. A merged page's file goes to `.cookbook/trash/` rather than being deleted. Its footnotes come along.

Deleting `.cookbook/` is safe for your writing: the search index is rebuilt, and you only lose undo history and the trash.

## Seasonings

The Seasonings button in the top bar opens four characters who each read the page for one thing. Pick the ones you want; only their checks run, and you can reorder them or add more later. The choice is saved in `book.json`.

- **Salty Sam** checks spelling.
- **Peppery Pete** checks grammar: agreement, punctuation, quotes left open, and capitals in the wrong place (“MOnster”, “mONSTER”).
- **Drunk Daniel** watches dialogue: he can dim the narration so only the speech stands out, and tracks how much of any page or book you pick is spoken.
- **Spicy Sally** checks style and readability, and rates the page on a spice meter from Mild to Inferno. The meter follows the page's grade level (the Automated Readability Index, as Hemingway uses): most published fiction sits around grades 5 to 9, so grades 5 to 7 are Medium, 4 and under Mild, 8 to 9 Hot, 10 to 12 Extra hot, and 13 and up Inferno.

Each remark comes with the words around it, a Fix button for the suggested change and a Show button that finds it on the page. ✕ removes a remark for good; right-click it to remove it everywhere. Underlines follow the usual colours: red for spelling, blue for grammar, and a blue highlight for style.

Spelling is checked on the device, in a background worker, with the Hunspell word lists for American or British English (pick one in Settings; it is saved in `book.json`). A word is only underlined once you have moved past it.

- A real word with a common prefix or suffix counts too (un-, re-, non-, pre-, mis-, over-, under-, out-, anti-, semi-, multi-, sub-, super-, counter-, -less, -like, -ness), so “untextured” and “textureless” pass while “untexturred” doesn't. So do hyphenated words whose parts are real.
- Every character's and place's name and nickname counts as a word, so names are never flagged. Near misses are: “Mamma Lou” for Mama Lou is caught even though both words are real ones.
- Your dictionary is `dictionary.txt` in the book folder, one word a line, and can be edited by hand.
- Removed remarks are kept in `.cookbook/ignored.json`. Settings can bring them all back.

Grammar comes from [Harper](https://writewithharper.com) (Apache 2.0), running on the device as WebAssembly. It checks agreement, articles, repeated words, punctuation and word choice. Harper is about 20 MB (8 MB compressed), so it loads the first time it's needed, and the offline web app keeps a copy.

Sally's style checks are Cookbook's own (`src/proofread/style.ts`): adverbs, simpler words, passive voice, crutch words, echoes, clichés, redundancies, quotes left open, and sticky sentences. Adverbs and crutch words inside dialogue are left alone, since that's how people talk.

The word lists come from [wooorm/dictionaries](https://github.com/wooorm/dictionaries) (MIT and BSD); their licences are in `public/dictionaries/`.

## Running it

You need Node 22 or newer. For the desktop app you also need Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system.

```sh
npm install
npm run dev          # browser version at http://localhost:1420
npm run tauri dev    # desktop app
npm test             # storage, format and editor tests
npm run build        # production web build, including the offline service worker
```

Click the work's title in the top bar for Your works…, to start a new one or open a work's folder. In the desktop app a work can live in any folder. In the browser, works are kept in the browser's private storage, and Chrome and Edge can also open a real folder on your computer.

## Search

Search in the top bar finds and replaces in the open page, and lists every other page, recipe and Pantry card that matches. Words match from their start and by stem, so “corn” finds “cornbread” and “run” finds “running”. The index is SQLite with full-text search, kept in `.cookbook/index.sqlite`; opening a book only rereads the files that changed since last time.

## Project layout

```
src/
  storage/   the book folder format, platform adapters (Tauri, browser, memory) and the hidden index
  editor/    the Tiptap editor: styles, footnotes, dialogue, linked names
  proofread/ the proofreader's checks, the Seasonings characters' remarks, its background worker and the underlines
  ui/        React components
  App.tsx    the app shell: Shelf, page, Pantry and Seasonings panels
src-tauri/   the native shell for Windows, macOS, Linux, iOS and Android
```

## Roadmap

0. **Foundations** (this): app shell, plain-files storage, offline web build, CI.
1. Offline editor: rich text, named paragraph and character styles, notes, find and replace.
2. Shelf and Pantry: books and pages, character and place cards, linked names.
3. Seasonings v1: spelling, grammar and style checks on the device.
4. Mobile apps.
5. Signed updates for the desktop app (see [RELEASING.md](RELEASING.md)).
6. Optional on-device AI suggestions.
7. Release.
