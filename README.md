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
  book.json        title and format version
  bookshelf/       scenes, in nested folders (parts, chapters)
  pantry/
    characters/
    settings/
    research/
  .cookbook/       search index and undo history; safe to delete, Cookbook rebuilds it
```

Every scene and card is a Markdown file with a small YAML header:

```markdown
---
id: 7c1f0d2e-…
title: Sunday Dinner
kind: scene
---
The kitchen smelled of cornbread and black pepper before anyone was awake.
```

Folders and files sort by name in natural order ("Chapter 2" before "Chapter 10").

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

In the browser, books are kept in the browser's private storage. In the desktop app they live in the app's data folder for now; choosing any folder on disk comes in Phase 1.

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
