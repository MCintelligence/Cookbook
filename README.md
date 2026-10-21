# Cookbook

A warm, cozy writing app for novelists. It works fully offline, needs no account, and runs on desktop, mobile and in the browser.

- **Book:** write scenes on a quiet page, organised on the Bookshelf in nested folders.
- **Pantry:** character, setting and research cards that stay linked to the manuscript.
- **Seasonings:** an on-device proofreader for spelling, grammar and style (coming in Phase 3).

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

## Starting points and goals

A new book can start as a novel (chapters of scenes, plus a main character and setting in the Pantry), a short story, or nonfiction (chapters of sections, plus a note for sources). Under the Bookshelf, "New scene from template" offers a blank scene, a chapter opener or a letter. Under the Pantry, the same button makes character, setting and research cards.

The footer shows today's words against your daily goal, your streak, and the open scene's words against its own goal if it has one. History opens the last two weeks and the last four months, where you can set both goals and export the history as CSV. Splitting and merging scenes move words without counting them as written.

## Undo, splitting and merging

Undo reaches back past closing a scene or the app. Each scene's changes are logged in `.cookbook/undo/`, and opening the scene replays them, so ⌘Z picks up where you left off. If a scene's file was changed in another app, its undo history starts fresh; your text is never touched.

Click a scene break (`* * *`) to split the scene there, so everything after it becomes a new scene right after this one, or to merge the next scene into this one. A merged scene's file goes to `.cookbook/trash/` rather than being deleted. Its notes and footnotes come along.

Deleting `.cookbook/` is safe for your writing: the search index is rebuilt, and you only lose undo history and the trash.

## Seasonings

The Seasonings button in the top bar opens everything for reviewing a scene, in this order: the proofreader (coming in Phase 3), your notes and the scene's checklist, footnotes, and dialogue. Dialogue shows how much of the scene is spoken and can fade the narration so only the speech stands out.

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
