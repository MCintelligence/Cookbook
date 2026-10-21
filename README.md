# Cookbook

A warm, cozy writing app for novelists. It works fully offline, needs no account, and runs on desktop, mobile and in the browser.

- **Book:** write scenes on a quiet page, organised on the Bookshelf in nested folders.
- **Pantry:** character, setting and research cards that stay linked to the manuscript.
- **Seasonings:** an on-device proofreader for spelling, grammar, style and readability.

Cookbook is free and open source under the [Apache 2.0 licence](LICENSE).

## Your writing is plain files

Each book is an ordinary folder you can open in any text editor, back up, or keep in Git, Dropbox or iCloud:

```
My Book/
  book.json        title, format version and daily word goal
  order.json       the order of scenes and folders
  writing-history.csv  words written and deleted each day
  bookshelf/       scenes, in nested folders (parts, chapters)
  pantry/
    characters/
    settings/
    research/
  pictures/        portraits for Pantry cards
  .cookbook/       hidden: search index, undo history and trash (see below)
```

Every scene and card is a Markdown file with a small YAML header:

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

Inside a scene, styles are written so the file still reads well anywhere:

```markdown
The kitchen smelled of **cornbread** and *black pepper*.

::: letter
Dear June, the pie wants more nutmeg than you think.
:::

* * *

[She'll never let me read it,]{.thought} she thought.

The [church had burned]{.note #n1} that summer.^[Blessed Assurance.]

- [ ] find Lou's hymn
```

Plain paragraphs use the Body style. `::: name` blocks use a named paragraph style, `**strong**`, `*emphasis*` and `[text]{.name}` are character styles, `* * *` is a scene break, and `- [ ]` is a checklist item. The styles themselves live in `styles.json` in the book folder.

`^[text]` is a footnote, written where its number goes. `[text]{.note #n1}` marks the words a note to yourself is about; the note itself sits in the scene's header, under `notes:`, so it never ends up in the manuscript.

## Typing shortcuts

| Type | You get |
| --- | --- |
| `- ` at the start of a line | a list |
| `-TD ` at the start of a line | a checklist |
| `**text**`, `*text*`, `_text_` | Strong, Emphasis, Underline (also ⌘B, ⌘I, ⌘U) |
| `--` | an em dash |
| `"` and `'` | curly quotes |
| `* * *` on its own line | a scene break |
| ⌘⌥M (Ctrl+Alt+M) | a note to yourself on the selected words |
| ⌘⌥F (Ctrl+Alt+F) | a footnote at the cursor |

Pressing Backspace straight after a shortcut turns it back into exactly what you typed.

## The Bookshelf

Scenes sit on the Bookshelf as small recipe cards showing the title, a status dot (not started, simmering or done), the word count and the synopsis. Folders nest to any depth, show the total words inside, and open or close with a click. Double-click a folder to rename it; "New folder" adds one beside the chapter you're in.

Drag a card or folder to reorder it, or drop it onto a folder to move it inside. On a touch screen, press and hold first. With the keyboard, Alt+↑ and Alt+↓ move the focused card. Moving never renames a file unless the new folder already has one with the same name.

The open scene's status and synopsis are on the card above the page, so they never end up in the manuscript.

"Read the whole manuscript", under the Bookshelf, shows every scene in order as one document, under its chapter headings, with the total words and an estimated reading time. Click a scene's title to go back to writing in it.

## The Pantry

The Pantry holds characters, settings and research. Each section can hold your own folders, nested as deep as you like, and cards drag between them like scenes do. The Pantry has its own search, which also looks at nicknames and fields, plus filters for each section.

A card opens on the same page as a scene, so its free writing gets the same editor. Above the page are its portrait, the other names it goes by, its fields (role, age, wants, fears, or any you add) and its relationships. A relationship such as "Mother of June" links two cards and shows on both. In the file it looks like this:

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

Every character's and setting's name, and the other names it goes by, is linked wherever it appears in your writing. There is no special syntax, and nothing is added to the file. Names match whole words and their capital letters, so June the cook isn't the month of june, though "June's" still counts. Hover a name, or press and hold on a touch screen, to peek at the card. The card above each scene shows chips for the characters and settings it names, and each character or setting card lists the scenes it appears in, in Bookshelf order.

### The Pantry shelf and pins

Press ⌘J, click "Pantry shelf" in the footer, or type @ while writing to open the Pantry shelf: a quick search over every card, with the cards named in the open scene listed first. Its search covers names, nicknames and what's written inside cards. For the highlighted card you can:

- Insert its name (Enter). After @, the name replaces the @, and typing towards a nickname inserts that nickname.
- Pin it beside the draft (⌘Enter).
- Open it in the Pantry (⌘⇧Enter).

Pinned cards stay in the right-hand drawer, above Seasonings, until you unpin them. They're remembered for each book on this device. A name's peek can pin its card too.

## Starting points and goals

A new book can start as a novel (chapters of scenes, plus a main character and setting in the Pantry), a short story, or nonfiction (chapters of sections, plus a note for sources). Under the Bookshelf, "New scene from template" offers a blank scene, a chapter opener or a letter. Under the Pantry, the same button makes character, setting and research cards.

The footer shows today's words against your daily goal, your streak, and the open scene's words against its own goal if it has one. History opens the last two weeks and the last four months, where you can set both goals and export the history as CSV. Splitting and merging scenes move words without counting them as written.

## Undo, splitting and merging

Undo reaches back past closing a scene or the app. Each scene's changes are logged in `.cookbook/undo/`, and opening the scene replays them, so ⌘Z picks up where you left off. If a scene's file was changed in another app, its undo history starts fresh; your text is never touched.

Click a scene break (`* * *`) to split the scene there, so everything after it becomes a new scene right after this one, or to merge the next scene into this one. A merged scene's file goes to `.cookbook/trash/` rather than being deleted. Its notes and footnotes come along.

Deleting `.cookbook/` is safe for your writing: the search index is rebuilt, and you only lose undo history and the trash.

## Seasonings

The Seasonings button in the top bar opens everything for reviewing a scene, in this order: the proofreader, your notes and the scene's checklist, footnotes, and dialogue. Dialogue shows how much of the scene is spoken and can fade the narration so only the speech stands out.

### Proofreader

Spelling is checked on the device, in a background worker, with the Hunspell word lists for American or British English (pick one in the Proofread tab; it is saved in `book.json`). A word is only underlined once you have moved past it. Click an underline for suggestions, to add the word to your dictionary, or to ignore it in this scene.

- Every character's and setting's name and nickname counts as a word, so names are never flagged. Near misses are: “Mamma Lou” for Mama Lou is caught even though both words are real ones.
- Your dictionary is `dictionary.txt` in the book folder, one word a line, and can be edited by hand.
- Words ignored in a scene are kept in `.cookbook/ignored.json`.

Grammar comes from [Harper](https://writewithharper.com) (Apache 2.0), running on the device as WebAssembly. It checks agreement, articles, repeated words, punctuation and word choice, underlined in blue, and its cards have a Why? button that explains the rule. Grammar is only checked while Seasonings is open, so drafting stays quiet. Harper is about 20 MB (8 MB compressed), so it loads the first time you open Seasonings, and the offline web app keeps a copy.

Style notes are purple and also appear only while reviewing. They are Cookbook's own checks (`src/proofread/style.ts`): adverbs, simpler words, passive voice, crutch words, echoes, clichés and redundancies are underlined, and hard, very hard and sticky sentences are tinted. Adverbs and crutch words inside dialogue are left alone, since that's how people talk. The Proofread tab shows the scene's grade level (the Automated Readability Index, as Hemingway uses).

You're in charge of all of it. Every check can be switched off for the book, from the Proofread tab or with “Stop checking…” on a card, and the choice is saved in `book.json`. Ignore leaves one issue alone where it is; Ignore everywhere leaves that rule on those words alone in the whole book. The Proofread tab counts the scene's spelling, grammar and style issues, can show one kind at a time, and can bring back everything you ignored.

The word lists come from [wooorm/dictionaries](https://github.com/wooorm/dictionaries) (MIT and BSD); their licences are in `public/dictionaries/`.

## Running it

You need Node 22. For the desktop app you also need Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system.

```sh
npm install
npm run dev          # browser version at http://localhost:1420
npm run tauri dev    # desktop app
npm test             # storage, format and editor tests
npm run build        # production web build, including the offline service worker
```

Click the book's title in the top bar to see your books, start a new one or open a book folder. In the desktop app a book can live in any folder. In the browser, books are kept in the browser's private storage, and Chrome and Edge can also open a real folder on your computer.

## Search

The search box in the top bar finds and replaces in the open scene, and lists every other scene and Pantry card that matches. Words match from their start and by stem, so “corn” finds “cornbread” and “run” finds “running”. The index is SQLite with full-text search, kept in `.cookbook/index.sqlite`; opening a book only rereads the files that changed since last time.

## Project layout

```
src/
  storage/   the book folder format, platform adapters (Tauri, browser, memory) and the hidden index
  editor/    the Tiptap editor: styles, notes, footnotes, linked names
  proofread/ the proofreader's checks, its background worker and the editor underlines
  ui/        React components
  App.tsx    the app shell: Book and Pantry tabs, Bookshelf, page
src-tauri/   the native shell for Windows, macOS, Linux, iOS and Android
```

## Roadmap

0. **Foundations** (this): app shell, plain-files storage, offline web build, CI.
1. Offline editor: rich text, named paragraph and character styles, notes, find and replace.
2. Bookshelf and Pantry: chapters and scenes, character and setting cards, linked names.
3. Seasonings v1: spelling, grammar and style checks on the device.
4. Mobile apps.
5. Signed updates for the app and the proofreader's word lists.
6. Optional on-device AI suggestions.
7. Release.
