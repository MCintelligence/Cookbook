/// <reference lib="webworker" />
import nspell from 'nspell';
import { type Dialect, type Issue, checkSpelling, rankSuggestions } from './check';

/**
 * The proofreader's background worker: it holds the Hunspell dictionary so
 * loading it and checking text never stalls typing.
 */
export type Request =
  | { id: number; type: 'configure'; dialect: Dialect; words: string[]; names: string[] }
  | { id: number; type: 'check'; texts: string[] }
  | { id: number; type: 'suggest'; word: string };

export type Response = { id: number; result: unknown } | { id: number; error: string };

type Speller = ReturnType<typeof nspell>;

const loaded = new Map<Dialect, Promise<{ aff: string; dic: string }>>();
let ready: Promise<{ speller: Speller; names: string[] }> | null = null;

function files(dialect: Dialect) {
  let files = loaded.get(dialect);
  if (!files) {
    const url = (ext: string) => `${import.meta.env.BASE_URL}dictionaries/${dialect}.${ext}`;
    const text = (ext: string) =>
      fetch(url(ext)).then((r) => {
        if (!r.ok) throw new Error(`The ${dialect} dictionary is missing.`);
        return r.text();
      });
    files = Promise.all([text('aff'), text('dic')]).then(([aff, dic]) => ({ aff, dic }));
    files.catch(() => loaded.delete(dialect));
    loaded.set(dialect, files);
  }
  return files;
}

async function handle(req: Request): Promise<unknown> {
  if (req.type === 'configure') {
    ready = files(req.dialect).then(({ aff, dic }) => {
      const speller = nspell(aff, dic);
      // Every word of every story name is a word, so names are never misspelt.
      for (const word of [...req.words, ...req.names.flatMap((n) => n.split(/\s+/))]) if (word) speller.add(word);
      return { speller, names: req.names };
    });
    await ready;
    return null;
  }
  if (!ready) throw new Error('The proofreader is not set up yet.');
  const { speller, names } = await ready;
  if (req.type === 'check') return req.texts.map((t): Issue[] => checkSpelling(t, speller, names));
  const word = req.word.replace(/’/g, "'");
  return rankSuggestions(word, speller.suggest(word));
}

self.onmessage = (e: MessageEvent<Request>) => {
  handle(e.data).then(
    (result) => self.postMessage({ id: e.data.id, result } satisfies Response),
    (err: unknown) => self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) } satisfies Response),
  );
};
